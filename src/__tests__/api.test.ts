import { fail } from 'assert';
import { MochimoApiClient } from '../api';
import { describe, expect, it, beforeAll } from '@jest/globals';
import { logger } from '../utils/logger';
import CryptoJS from 'crypto-js';
import { WOTSWallet } from 'mochimo-wots';
import { formatMemo } from '../utils/memo';
import { PreprocessOptions } from '../types';

const apiURL = process.env.API_URL || 'http://46.250.241.212:8081';

describe('MochimoConstruction Integration', () => {
    let construction: MochimoApiClient;
    let firstWotsWallet: WOTSWallet;
    let sourceWallet: WOTSWallet;
    let changeWallet: WOTSWallet;
    let destWallet: WOTSWallet;

    beforeAll(() => {
        logger.enableDebug();
        construction = new MochimoApiClient(apiURL);

        // Create parent wallet
        const firstWotsSeed = CryptoJS.SHA256('mysourceseeddds' + 2).toString();
        firstWotsWallet = WOTSWallet.create('first', Buffer.from(firstWotsSeed, 'hex'), undefined);

        // Create source and change wallets
        const sourceWotsSeed = CryptoJS.SHA256('mysourceseeddds' + 8).toString();
        const changeWotsSeed = CryptoJS.SHA256('mysourceseeddds' + 9).toString();

        sourceWallet = WOTSWallet.create(
            'source',
            Buffer.from(sourceWotsSeed, 'hex'),
            firstWotsWallet.getAddrHash()!
        );

        changeWallet = WOTSWallet.create(
            'change',
            Buffer.from(changeWotsSeed, 'hex'),
            firstWotsWallet.getAddrHash()!
        );

        // Create destination wallet
        const destWotsSeed = CryptoJS.SHA256('mydestseeddds').toString();
        destWallet = WOTSWallet.create('dest', Buffer.from(destWotsSeed, 'hex'), undefined);
    });

    describe('Tag Resolution', () => {
        it('should resolve a valid tag', async () => {
            const tag = "0x" + Buffer.from(sourceWallet.getAddrTag()!).toString('hex');
            const result = await construction.resolveTag(tag);


            expect(result.result).toHaveProperty('address');
            expect(result.result.address).toBe("0x" + Buffer.from(sourceWallet.getAddress()!).toString('hex'));
            expect(result.result.amount).toBeDefined();
        });

        it('should handle invalid tag format', async () => {
            await expect(construction.resolveTag('invalid-tag')).rejects.toThrow();
        });
    });

    describe('Account Balance', () => {
        it('should get account balance for source wallet', async () => {
            const result = await construction.getAccountBalance(
                "0x" + Buffer.from(sourceWallet.getAddress()!).toString('hex')
            );

            // Check response structure
            expect(result).toHaveProperty('balances');
            expect(Array.isArray(result.balances)).toBe(true);
            expect(result.balances[0]).toMatchObject({
                currency: {
                    decimals: 9,
                    symbol: 'MCM'
                }
            });
            expect(typeof result.balances[0].value).toBe('string');
            expect(BigInt(result.balances[0].value)).toBeGreaterThanOrEqual(BigInt(0));

            // Check block identifier
            expect(result).toHaveProperty('block_identifier');
            expect(result.block_identifier).toMatchObject({
                hash: expect.stringMatching(/^0x[a-fA-F0-9]{64}$/),
                index: expect.any(Number)
            });
            expect(result.block_identifier.index).toBeGreaterThan(0);
        });

        it('should throw error for change wallet that does not exist', async () => {
            await expect(construction.getAccountBalance(
                "0x" + Buffer.from(changeWallet.getAddress()!).toString('hex')
            )).rejects.toThrow();
        });

        it('should handle invalid address format', async () => {
            await expect(construction.getAccountBalance('invalid-address'))
                .rejects.toThrow();
        });

        it('should handle address without 0x prefix', async () => {
            const addressWithoutPrefix = Buffer.from(sourceWallet.getAddress()!).toString('hex');
            await expect(construction.getAccountBalance(addressWithoutPrefix))
                .rejects.toThrow();
        });

        it('should handle empty address', async () => {
            await expect(construction.getAccountBalance(''))
                .rejects.toThrow();
        });

        it('should handle malformed hex address', async () => {
            await expect(construction.getAccountBalance('0x123')) // too short
                .rejects.toThrow();
        });
    });

    describe('Transaction Construction', () => {
        it('should preprocess transaction operations', async () => {
            const operations = [
                {
                    operation_identifier: { index: 0 },
                    type: "SOURCE_TRANSFER",
                    status: "SUCCESS",
                    account: {
                        address: "0x" + Buffer.from(sourceWallet.getAddress()!).toString('hex')
                    },
                    amount: {
                        value: "-10000",
                        currency: { symbol: "MCM", decimals: 8 }
                    }
                },
                {
                    operation_identifier: { index: 1 },
                    type: "DESTINATION_TRANSFER",
                    status: "SUCCESS",
                    account: {
                        address: "0x" + Buffer.from(destWallet.getAddrTag()!).toString('hex')
                    },
                    amount: {
                        value: "10000",
                        currency: { symbol: "MCM", decimals: 8 }
                    },
                    metadata: {
                        memo: Buffer.from(formatMemo('TEST-123')).toString('hex')
                    }
                },
                {
                    operation_identifier: { index: 2 },
                    type: "FEE",
                    status: "SUCCESS",
                    account: {
                        address: "0x" + Buffer.from(sourceWallet.getAddrTag()!).toString('hex')
                    },
                    amount: {
                        value: "500",
                        currency: { symbol: "MCM", decimals: 8 }
                    }
                }
            ];

            const result = await construction.preprocess(operations, {
                block_to_live: 0,
                change_pk: "0x" + Buffer.from(changeWallet.getAddrHash()!).toString('hex'),
                change_addr: "0x" + Buffer.from(changeWallet.getAddrHash()!).toString('hex'),
                source_balance: 179999501
            });

            // Verify response structure
            expect(result).toHaveProperty('options');
            expect(result.options).toMatchObject({
                block_to_live: expect.any(Number),
                change_pk: expect.stringMatching(/^0x[a-fA-F0-9]+$/),
                source_addr: expect.stringMatching(/^0x[a-fA-F0-9]+$/)
            });

            expect(Array.isArray(result.required_public_keys)).toBe(true);
            expect(result.required_public_keys[0]).toMatchObject({
                address: expect.stringMatching(/^0x[a-fA-F0-9]+$/)
            });

            // Verify the values match our input
            expect(result.options.block_to_live).toBe(0);
            expect(result.options.change_pk).toBe(
                "0x" + Buffer.from(changeWallet.getAddrHash()!).toString('hex')
            );
            expect(result.options.source_addr).toBe(
                "0x" + Buffer.from(sourceWallet.getAddress()!).toString('hex')
            );
            expect(result.required_public_keys[0].address).toBe(
                "0x" + Buffer.from(sourceWallet.getAddress()!).toString('hex')
            );
        });

        it('should get metadata for transaction', async () => {
            const options: PreprocessOptions = {
                source_addr: "0x" + Buffer.from(sourceWallet.getAddress()!).toString('hex'),
                change_pk: "0x" + Buffer.from(changeWallet.getAddrHash()!).toString('hex'),
                block_to_live: 0
            };

            const publicKeys = [{
                hex_bytes: Buffer.from(sourceWallet.getWots()!.slice(0)).toString('hex'),
                curve_type: "wotsp"
            }];

            const result = await construction.metadata(options, publicKeys);
            
            // Verify response structure
            expect(result).toHaveProperty('metadata');
            expect(result.metadata).toMatchObject({
                block_to_live: expect.any(Number),
                change_pk: expect.stringMatching(/^0x[a-fA-F0-9]+$/),
                source_balance: expect.any(Number)
            });

            // Verify suggested fee
            expect(result).toHaveProperty('suggested_fee');
            expect(Array.isArray(result.suggested_fee)).toBe(true);
            expect(result.suggested_fee[0]).toMatchObject({
                value: expect.any(String),
                currency: {
                    symbol: 'MCM',
                    decimals: expect.any(Number)
                }
            });

            // Verify specific values
            expect(result.metadata.block_to_live).toBe(0);
            expect(result.metadata.change_pk).toBe(
                "0x" + Buffer.from(changeWallet.getAddrHash()!).toString('hex')
            );
            expect(result.metadata.source_balance).toBeGreaterThan(0);
            expect(result.suggested_fee[0].value).toBe('500');
        });

        it('should create transaction payloads', async () => {
            const operations = [
                {
                    operation_identifier: { index: 0 },
                    type: "SOURCE_TRANSFER",
                    status: "SUCCESS",
                    account: {
                        address: "0x" + Buffer.from(sourceWallet.getAddress()!).toString('hex')
                    },
                    amount: {
                        value: "-10000",
                        currency: { symbol: "MCM", decimals: 9 }
                    }
                },
                {
                    operation_identifier: { index: 1 },
                    type: "DESTINATION_TRANSFER",
                    status: "SUCCESS",
                    account: {
                        address: "0x" + Buffer.from(destWallet.getAddrTag()!).toString('hex')
                    },
                    amount: {
                        value: "10000",
                        currency: { symbol: "MCM", decimals: 9 }
                    },
                    metadata: { memo: "TEST-123" }
                },
                {
                    operation_identifier: { index: 2 },
                    type: "FEE",
                    status: "SUCCESS",
                    account: {
                        address: "0x" + Buffer.from(sourceWallet.getAddrTag()!).toString('hex')
                    },
                    amount: {
                        value: "500",
                        currency: { symbol: "MCM", decimals: 9 }
                    }
                }
            ];

            const metadata = {
                source_balance: 179999501,
                change_pk: "0x" + Buffer.from(changeWallet.getAddrHash()!).toString('hex'),
                block_to_live: 0
            };

            const publicKeys = [{
                hex_bytes: Buffer.from(sourceWallet.getWots()!.slice(0)).toString('hex'),
                curve_type: "wotsp"
            }];

            const result = await construction.payloads(operations, metadata, publicKeys);
            
            // Verify response structure
            expect(result).toHaveProperty('unsigned_transaction');
            expect(typeof result.unsigned_transaction).toBe('string');
            expect(result.unsigned_transaction).toMatch(/^[a-fA-F0-9]+$/);

            expect(result).toHaveProperty('payloads');
            expect(Array.isArray(result.payloads)).toBe(true);
            expect(result.payloads).toHaveLength(1);

            // Verify payload structure
            expect(result.payloads[0]).toMatchObject({
                account_identifier: {
                    address: expect.stringMatching(/^0x[a-fA-F0-9]+$/)
                },
                hex_bytes: expect.stringMatching(/^[a-fA-F0-9]+$/),
                signature_type: 'wotsp'
            });

            // Verify the address matches our source wallet
            expect(result.payloads[0].account_identifier.address).toBe(
                "0x" + Buffer.from(sourceWallet.getAddress()!).toString('hex')
            );
        });
    });

    describe('Mempool Operations', () => {
        it('should get mempool transactions', async () => {
            const result = await construction.getMempoolTransactions();
            expect(Array.isArray(result.transaction_identifiers)).toBe(true);
        });

        it('should get specific mempool transaction if it exists', async () => {
            const mempool = await construction.getMempoolTransactions();
            if (mempool.transaction_identifiers.length > 0) {
                const txHash = mempool.transaction_identifiers[0].hash;
                const result = await construction.getMempoolTransaction(txHash);
                expect(result).toHaveProperty('transaction');
            }
        });
    });
}); 