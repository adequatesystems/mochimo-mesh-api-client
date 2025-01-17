import { MochimoApiClient } from './api';
import { MCM_CURRENCY, NETWORK_IDENTIFIER } from './types';
import { logger } from './utils/logger';
import { WOTSWallet, MochimoHasher } from 'mochimo-wots';
import CryptoJS from 'crypto-js';

export interface TransactionParams {
  sourceTag: string;
  sourceAddress: string;
  destinationTag: string;
  amount: bigint;
  fee: bigint;
  publicKey: string;
  changePk: string;
  memo?: string;
  blockToLive: number;
  sourceBalance: bigint;
}

export class TransactionBuilder {
  public construction: MochimoApiClient;

  constructor(baseUrl: string) {
    this.construction = new MochimoApiClient(baseUrl);
    logger.debug('TransactionBuilder initialized', { baseUrl });
  }

  private createTransactionBytes(params: {
    sourceAddress: string;
    destinationTag: string;
    amount: bigint;
    fee: bigint;
    changePk: string;
    memo?: string;
    blockToLive: number;
  }): Buffer {
    // Remove '0x' prefix if present
    const sourceAddr = params.sourceAddress.startsWith('0x') ?
      params.sourceAddress.slice(2) : params.sourceAddress;
    const destAddr = params.destinationTag.startsWith('0x') ?
      params.destinationTag.slice(2) : params.destinationTag;
    const changePk = params.changePk.startsWith('0x') ?
      params.changePk.slice(2) : params.changePk;

    // Create buffer for transaction
    const txBuffer = Buffer.alloc(2304); // Standard Mochimo transaction size

    // Write header values
    txBuffer.writeUInt32LE(0, 0); // version
    Buffer.from(sourceAddr, 'hex').copy(txBuffer, 4); // source address
    Buffer.from(changePk, 'hex').copy(txBuffer, 44); // change address
    Buffer.from(destAddr, 'hex').copy(txBuffer, 84); // destination address

    // Write amounts
    txBuffer.writeBigUInt64LE(params.amount, 124);
    txBuffer.writeBigUInt64LE(params.fee, 132);

    // Write block to live
    txBuffer.writeUInt32LE(params.blockToLive, 140);

    // Write memo if present
    if (params.memo) {
      const memoBuffer = Buffer.from(params.memo);
      memoBuffer.copy(txBuffer, 144, 0, Math.min(memoBuffer.length, 32));
    }

    return txBuffer;
  }

  async buildTransaction(params: {
    sourceTag: string;
    sourceAddress: string;
    destinationTag: string;
    amount: bigint;
    fee: bigint;
    publicKey: string;
    changePk: string;
    memo?: string;
    blockToLive: number;
    sourceBalance?: bigint;
  }) {
    try {
      const logParams = {
        ...params,
        amount: params.amount.toString(),
        fee: params.fee.toString(),
        sourceBalance: params.sourceBalance?.toString()
      };
      logger.info('Building transaction', logParams);

      const txBytes = this.createTransactionBytes(params);
      logger.debug('Created transaction bytes', {
        length: txBytes.length,
        hex: txBytes.toString('hex')
      });

      const operations = [
        {
          operation_identifier: { index: 0 },
          type: "SOURCE_TRANSFER",
          status: "SUCCESS",
          account: { address: params.sourceTag },
          amount: {
            value: (-params.amount).toString(),
            currency: MCM_CURRENCY
          }
        },
        {
          operation_identifier: { index: 1 },
          type: "DESTINATION_TRANSFER",
          status: "SUCCESS",
          account: { address: params.destinationTag },
          amount: {
            value: params.amount.toString(),
            currency: MCM_CURRENCY
          },
          metadata: { memo: params.memo || "" }
        },
        {
          operation_identifier: { index: 2 },
          type: "FEE",
          status: "SUCCESS",
          account: { address: params.sourceTag },
          amount: {
            value: (params.fee).toString(),
            currency: MCM_CURRENCY
          }
        }
      ];
      logger.debug('Created operations', operations);

      const preprocessResponse = await this.construction.preprocess(operations, {
        block_to_live: params.blockToLive.toString(),
        change_pk: params.changePk,
        change_addr: params.changePk,
        source_balance: params.sourceBalance ? (params.sourceBalance.toString()) : '179999501'
      });
      logger.debug('Preprocess response', preprocessResponse);
      const metadataResponse = await this.construction.metadata(
        preprocessResponse.options,
        [{ hex_bytes: params.publicKey, curve_type: 'wotsp' }]
      );
      logger.debug('Metadata response', metadataResponse);
      const results = await this.construction.payloads(
        operations,
        metadataResponse.metadata,
        [{ hex_bytes: params.publicKey, curve_type: 'wotsp' }]
      );
      return results;

    } catch (error) {
      logger.error('Error building transaction', error);
      throw error instanceof Error ? error : new Error('Unknown error occurred');
    }
  }

  async submitSignedTransaction(signedTransaction: string) {
    return await this.construction.submit(signedTransaction);
  }

  public createSignature(publicKey: Uint8Array, unsignedTx: string, signatureBytes: Uint8Array) {
    //get all the components of the public key
    return {
      signing_payload: {
        hex_bytes: unsignedTx,
        signature_type: "wotsp"
      },
      public_key: {
        hex_bytes: Buffer.from(publicKey).toString('hex'),
        curve_type: "wotsp"
      },
      signature_type: "wotsp",
      hex_bytes: Buffer.from(signatureBytes).toString('hex')
    };
  }

  /**
   * Submit a transaction and wait for it to appear in the mempool
   * @param signedTransaction - The signed transaction to submit
   * @param timeout - Maximum time to wait for mempool appearance
   */
  async submitAndMonitor(
    signedTransaction: string,
    timeout: number = 60000
  ) {
    const submitResult = await this.submitSignedTransaction(signedTransaction);
    logger.debug('Transaction submitted', submitResult);

    if (!submitResult.transaction_identifier?.hash) {
      throw new Error('No transaction hash in submit response');
    }

    // Wait for the transaction to appear in mempool
    return await this.construction.waitForTransaction(
      submitResult.transaction_identifier.hash,
      timeout
    );
  }

  /**
   * Get all transactions currently in the mempool
   */
  async getMempoolTransactions() {
    return this.construction.getMempoolTransactions();
  }

  /**
   * Get a specific transaction from the mempool
   */
  async getMempoolTransaction(transactionHash: string) {
    return this.construction.getMempoolTransaction(transactionHash);
  }

  public async buildAndSignTransaction(
    sourceWallet: WOTSWallet,
    changeWallet: WOTSWallet,
    destinationTag: string,
    amount: bigint,
    fee: bigint,
    memo?: string,
    blockToLive: number = 0
  ) {
    const params: TransactionParams = {
      sourceTag: "0x" + Buffer.from(sourceWallet.getAddrTag()!).toString('hex'),
      sourceAddress: "0x" + Buffer.from(sourceWallet.getAddress()!).toString('hex'),
      destinationTag: destinationTag,
      amount,
      fee,
      publicKey: Buffer.from(sourceWallet.getWots()!.slice(0, 2144)).toString('hex'),
      changePk: "0x" + Buffer.from(changeWallet.getAddrHash()!).toString('hex'),
      memo,
      blockToLive,
      sourceBalance: amount + fee, // This should be fetched from network in production
    };

    // Build the transaction
    const buildResult = await this.buildTransaction(params);

    // Sign the transaction
    const unsignedTransaction = buildResult.unsigned_transaction;
    const signedTransaction = sourceWallet.sign(
      MochimoHasher.hash(new Uint8Array(Buffer.from(unsignedTransaction, 'hex')))
    );

    // Get pub and rnd from wallet
    const pub = sourceWallet.getWots()!.slice(2144, 2144 + 32);
    const rnd = sourceWallet.getWots()!.slice(2144 + 32, 2144 + 32 + 32);

    // Combine signature components
    const combinedSig = new Uint8Array([
      ...signedTransaction,
      ...pub,
      ...rnd
    ]);

    // Create and combine signature
    const sig = this.createSignature(
      sourceWallet.getAddress()!,
      unsignedTransaction,
      combinedSig
    );

    const combined = await this.construction.combine(unsignedTransaction, [sig]);

    // Submit the transaction
    const submitResult = await this.submitSignedTransaction(combined.signed_transaction);

    return {
      buildResult,
      submitResult,
      signedTransaction: combined.signed_transaction
    };
  }

  // used for testing;  gives out two wots wallet instances from a seed and index
  public static createWallets(seed: string, index: number, parentWallet?: WOTSWallet) {
    const sourceWotsSeed = CryptoJS.SHA256(seed + index).toString();
    const changeWotsSeed = CryptoJS.SHA256(seed + (index + 1)).toString();

    const sourceWallet = WOTSWallet.create(
      'source',
      Buffer.from(sourceWotsSeed, 'hex'),
      parentWallet?.getAddrHash()!
    );

    const changeWallet = WOTSWallet.create(
      'change',
      Buffer.from(changeWotsSeed, 'hex'),
      parentWallet?.getAddrHash()!
    );

    return { sourceWallet, changeWallet };
  }
} 