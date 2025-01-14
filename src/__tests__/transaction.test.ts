import { fail } from 'assert';
import { TransactionBuilder } from '../transaction';
import { describe, expect, it, beforeAll } from '@jest/globals';
import { logger } from '../utils/logger';
import CryptoJS from 'crypto-js';
import { MochimoHasher, WOTSWallet, WotsAddress } from 'mochimo-wots-v2';

describe('TransactionBuilder Integration', () => {
  let builder: TransactionBuilder;

  beforeAll(() => {
    logger.enableDebug();
    builder = new TransactionBuilder('http://46.250.241.212:8081');
  });

  it.only('should build and submit a transaction', async () => {
    try {

      const firstWotsSeed = CryptoJS.SHA256('mysourceseeddds' + 2).toString();

      const sourceWotsSeed = CryptoJS.SHA256('mysourceseeddds' + 4).toString();
      const changeWotsSeed = CryptoJS.SHA256('mysourceseeddds' + 5).toString();
      const destWotsSeed = CryptoJS.SHA256('mydestseeddds').toString();


      const firstWotsWallet = WOTSWallet.create('first', Buffer.from(firstWotsSeed, 'hex'), Buffer.from('125989d23edfb582db3e730b', 'hex'));
      const firstAddress = WotsAddress.addrFromWots(firstWotsWallet.address!.slice(0, 2144));
      const sourceTag = firstAddress?.slice(0, 20);

      const sourceWotsWallet = WOTSWallet.create('source', Buffer.from(sourceWotsSeed, 'hex'), Buffer.from('125989d23edfb582db3e730b', 'hex'));
      const changeWotsWallet = WOTSWallet.create('change', Buffer.from(changeWotsSeed, 'hex'), Buffer.from('125989d23edfb582db3e730b', 'hex'));

      const destWallet = WOTSWallet.create('dest', Buffer.from(destWotsSeed, 'hex'), Buffer.from('125dfa821c48b8b1ff6802ca', 'hex'));
      const destAddress = WotsAddress.addrFromWots(destWallet.address!.slice(0, 2144));
      const destTag = destAddress?.slice(0, 20);

      //new stuff for v3
      const sourceWotsAddress = WotsAddress.addrFromWots(sourceWotsWallet.address!.slice(0, 2144));
      const changeWotsAddress = WotsAddress.addrFromWots(changeWotsWallet.address!.slice(0, 2144));

      //tag the addresses
      const taggedSourceWotsAddress = new Uint8Array([...sourceTag!, ...sourceWotsAddress!.slice(20, 40)]);
      const taggedChangeWotsAddress = new Uint8Array([...sourceTag!, ...changeWotsAddress!.slice(20, 40)]);


      const destWotsAddress = WotsAddress.addrFromWots(destWallet.address!.slice(0, 2144));

      //balance of the source wallet







      // Test data
      const testParams = {
        sourceTag: "0x" + Buffer.from(sourceTag!).toString('hex'),
        sourceAddress: "0x" + Buffer.from(taggedSourceWotsAddress).toString('hex'),
        destinationTag: "0x" + Buffer.from(destTag!).toString('hex'),
        amount: BigInt(10000),
        fee: BigInt(500),
        // Full WOTS public key (2144 bytes)
        publicKey: Buffer.from(sourceWotsWallet.address!.slice(0)).toString('hex'),
        // 20-byte address (40 characters + "0x")
        changePk: "0x" + Buffer.from(changeWotsAddress!.slice(20, 40)).toString('hex'),
        memo: 'AB-00-EF',
        blockToLive: 0,
        sourceBalance: BigInt(179999501),
      };

      logger.info('Starting transaction build with params', testParams);

      const buildResult = await builder.buildTransaction(testParams);

      logger.info('Build result received', buildResult);

      expect(buildResult).toHaveProperty('unsigned_transaction');
      expect(buildResult).toHaveProperty('payloads');
      expect(buildResult.payloads).toHaveLength(1);
      expect(buildResult.payloads[0]).toHaveProperty('hex_bytes');
      expect(buildResult.payloads[0]).toHaveProperty('signature_type', 'wotsp');

      // Add detailed logging of transaction bytes
      const unsignedTransaction = buildResult.unsigned_transaction;
      logger.debug('Unsigned Transaction Details', {
        length: unsignedTransaction.length,
        bytes: Buffer.from(unsignedTransaction, 'hex').length,
        hex: unsignedTransaction
      });



      // Sign and try parsing again
      const signedTransaction = sourceWotsWallet.sign(MochimoHasher.hash(new Uint8Array(Buffer.from(unsignedTransaction, 'hex'))));
      const signature = Buffer.from(signedTransaction).toString('hex');

      logger.debug('Signed Transaction Details', {
        length: signature.length,
        bytes: Buffer.from(signature, 'hex').length,
        hex: signature
      });

      try {
        const pub = sourceWotsWallet.getAddress()!.slice(2144, 2144+32)
        const rnd = sourceWotsWallet.getAddress()!.slice(2144+32, 2144+32+32)

        const resolveTag = await builder.construction.resolveTag(testParams.sourceTag)
        expect(resolveTag.result.address).toBe(testParams.sourceAddress)
        console.log("resolveTag", resolveTag)

        console.log("signed transactino length", signedTransaction.length)
        console.log("pub length", pub.length)
        console.log("rnd length", rnd.length, Buffer.from(rnd).toString('hex'))
        const components = WOTSWallet.componentsGenerator(Buffer.from(sourceWotsSeed, 'hex'))

        const untaggedrnd = new Uint8Array([...rnd.slice(0, 32-12), ...new Uint8Array(Buffer.from("420000000e00000001000000", 'hex'))]);
        
        //combine with signature
        const combinedSig = new Uint8Array([...signedTransaction, ...pub.slice(0, 32), ...untaggedrnd])
        const sig = builder.createSignature(testParams.publicKey, unsignedTransaction, combinedSig);

        const combined = await builder.construction.combine(unsignedTransaction, [sig]);
        logger.debug('Combined Result', combined);

        const parseResultSigned = await builder.construction.parse(combined.signed_transaction, true);
        logger.debug('Parse Result (signed)', parseResultSigned);

        const submitResult = await builder.submitSignedTransaction(combined.signed_transaction);
        console.log("submitResult", submitResult);
        const mempool = await builder.construction.getMempoolTransactions()
        console.log("mempool", mempool)
        //
      } catch (error) {
        logger.error('Parse failed (signed)', {
          error,
          transactionLength: signature.length,
          transactionHex: signature
        });
      }


     
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