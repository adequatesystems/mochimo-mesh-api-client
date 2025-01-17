import { fail } from 'assert';
import { TransactionBuilder } from '../transaction';
import { describe, expect, it, beforeAll } from '@jest/globals';
import { logger } from '../utils/logger';
import CryptoJS from 'crypto-js';
import { WOTSWallet } from 'mochimo-wots';

const apiURL = process.env.API_URL || 'http://35.208.202.76:8080'

describe('TransactionBuilder Integration', () => {
  let builder: TransactionBuilder;

  beforeAll(() => {
    logger.enableDebug();
    builder = new TransactionBuilder(apiURL);
  });

  it('should build and submit a transaction', async () => {
    try {
      // Create parent wallet
      const firstWotsSeed = CryptoJS.SHA256('mysourceseeddds' + 2).toString();
      const firstWotsWallet = WOTSWallet.create('first', Buffer.from(firstWotsSeed, 'hex'), undefined);

      // Create source and change wallets
      const { sourceWallet, changeWallet } = TransactionBuilder.createWallets(
        'mysourceseeddds',
        12,
        firstWotsWallet
      );
      console.log("SOURCE TAG:: ", firstWotsWallet.getAddrTag());

      // Create destination wallet
      const destWotsSeed = CryptoJS.SHA256('mydestseeddds').toString();
      const destWallet = WOTSWallet.create('dest', Buffer.from(destWotsSeed, 'hex'), undefined);

      // Verify tag resolution
      const resolveTag = await builder.construction.resolveTag(
        "0x" + Buffer.from(sourceWallet.getAddrTag()!).toString('hex')
      );
      console.log("resolveTag", resolveTag);

      // Build and submit transaction
      const result = await builder.buildAndSignTransaction(
        sourceWallet,
        changeWallet,
        "0x" + Buffer.from(destWallet.getAddrTag()!).toString('hex'),
        // "0x"+"65f4fc7f96456dbbdeabf514cd5a32318a2edf59",
        BigInt(10000),
        BigInt(500),
        'AB-00-EF'
      );

      expect(result.buildResult).toHaveProperty('unsigned_transaction');
      expect(result.buildResult).toHaveProperty('payloads');
      expect(result.buildResult.payloads).toHaveLength(1);
      
      // Verify transaction in mempool
      const mempool = await builder.construction.getMempoolTransactions();
      console.log("mempool", mempool);

    } catch (error) {
      logger.error('Test failed', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
      fail(`Should not have thrown error: ${error}`);
    }
  }, 30000);

  it('should handle invalid parameters', async () => {
    const invalidParams = {
      sourceTag: 'invalid',
      destinationTag: 'invalid',
      amount: BigInt(0),
      fee: BigInt(0),
      publicKey: 'invalid',
      changePk: 'invalid',
      blockToLive: 0
    };

    await expect(builder.buildTransaction(invalidParams as any)).rejects.toThrow();
  });
}); 