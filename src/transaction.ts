import { MochimoConstruction } from './construction';
import { MCM_CURRENCY, NETWORK_IDENTIFIER } from './types';
import { logger } from './utils/logger';

export class TransactionBuilder {
  public construction: MochimoConstruction;

  constructor(baseUrl: string) {
    this.construction = new MochimoConstruction(baseUrl);
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
          account: { address: params.sourceAddress },
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
      console.log('sending blk to live :: ', params.blockToLive)
      const preprocessResponse = await this.construction.preprocess(operations, {
        block_to_live: params.blockToLive,
        change_pk: params.changePk,
        change_addr: params.changePk,
        source_balance: params.sourceBalance ? Number(params.sourceBalance) : 179999501
      });
      logger.debug('Preprocess response', preprocessResponse);
      // this.construction.baseUrl = 'http://35.208.202.76:8080'
      const metadataResponse = await this.construction.metadata(
        preprocessResponse.options,
        [{ hex_bytes: params.publicKey, curve_type: 'wotsp' }]
      );
      logger.debug('Metadata response', metadataResponse);
      // this.construction.baseUrl = 'http://localhost:8081'
      const results = await this.construction.payloads(
        operations,
        metadataResponse.metadata,
        [{ hex_bytes: params.publicKey, curve_type: 'wotsp' }]
      );
      // this.construction.baseUrl = 'http://46.250.241.212:8081'
      return results;

    } catch (error) {
      logger.error('Error building transaction', error);
      throw error instanceof Error ? error : new Error('Unknown error occurred');
    }
  }

  async submitSignedTransaction(signedTransaction: string) {
    // this.construction.baseUrl = 'http://46.250.241.212:8081'
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
} 