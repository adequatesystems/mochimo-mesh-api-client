# Mochimo Mesh API Client

A TypeScript client library for interacting with the Mochimo blockchain API. This library provides a simple interface for building and signing transactions, managing wallets, and interacting with the Mochimo blockchain.

## Installation

```bash
npm install mochimo-mesh-api-client crypto-js mochimo-wots
```

## Features

- Build and sign transactions
- Manage WOTS wallets
- Handle transaction memos
- Full TypeScript support
- Comprehensive blockchain API interaction

## Quick Start

```typescript
import { TransactionBuilder, MochimoApiClient } from 'mochimo-mesh-api-client';
import { WOTSWallet } from 'mochimo-wots';
import CryptoJS from 'crypto-js';

async function sendTransaction() {
    // Initialize the builder with your node's API URL
    const builder = new TransactionBuilder('http://node.example.com:8081');

    // For direct API access
    const client = new MochimoApiClient('http://node.example.com:8081');

    // Create parent wallet (optional)
    const firstWotsSeed = CryptoJS.SHA256('mysourceseeddds' + 2).toString();
    const firstWotsWallet = WOTSWallet.create('first', Buffer.from(firstWotsSeed, 'hex'), undefined);

    // Create source and change wallets
    const sourceWotsSeed = CryptoJS.SHA256('mysourceseeddds' + 6).toString();
    const changeWotsSeed = CryptoJS.SHA256('mysourceseeddds' + 7).toString();
    
    const sourceWallet = WOTSWallet.create(
        'source',
        Buffer.from(sourceWotsSeed, 'hex'),
        firstWotsWallet.getAddrHash()
    );

    const changeWallet = WOTSWallet.create(
        'change',
        Buffer.from(changeWotsSeed, 'hex'),
        firstWotsWallet.getAddrHash()
    );

    // Build and sign a transaction
    const result = await builder.buildAndSignTransaction(
        sourceWallet,
        changeWallet,
        "0x" + Buffer.from(destWallet.getAddrTag()!).toString('hex'),
        BigInt(10000), // amount
        BigInt(500),   // fee
        'AB-00-EF'     // optional memo
    );

    console.log('Transaction submitted:', result.signedTransaction);
}
```

## API Reference

### TransactionBuilder

The main class for building and signing transactions.

```typescript
class TransactionBuilder {
    constructor(baseUrl: string);

    // Build and sign a complete transaction
    buildAndSignTransaction(
        sourceWallet: WOTSWallet,
        changeWallet: WOTSWallet,
        destinationTag: string,
        amount: bigint,
        fee: bigint,
        memo?: string,
        blockToLive?: number
    ): Promise<{
        buildResult: any;
        submitResult: any;
        signedTransaction: string;
    }>;
}
```

### MochimoApiClient

Low-level API client for direct interaction with the Mochimo blockchain.

```typescript
class MochimoApiClient {
    constructor(baseUrl: string);

    // Get account balance
    getAccountBalance(address: string): Promise<BalanceResponse>;

    // Resolve tag to address
    resolveTag(tag: string): Promise<ResolveTagResponse>;

    // Get mempool transactions
    getMempoolTransactions(): Promise<MempoolResponse>;

    // Get specific mempool transaction
    getMempoolTransaction(txHash: string): Promise<MempoolTransactionResponse>;

    // Wait for transaction to appear in mempool
    waitForTransaction(
        transactionHash: string,
        timeout?: number,
        interval?: number
    ): Promise<MempoolTransactionResponse>;
}
```

## Memo Format Rules

Memos must follow these rules:
- Contains only uppercase [A-Z], digits [0-9], dash [-]
- Groups can be multiple uppercase OR digits (not both)
- Dashes must separate different group types
- Cannot have consecutive groups of the same type
- Cannot start or end with a dash

Valid examples:
- "AB-00-EF"
- "123-CDE-789"
- "ABC"
- "123"

Invalid examples:
- "AB-CD-EF" (consecutive letter groups)
- "123-456-789" (consecutive number groups)
- "ABC-" (ends with dash)
- "-123" (starts with dash)

## Development

### Building
```bash
npm run build
```

### Testing
The tests in this library are integration tests that require a running Mochimo node.

```bash
# Run integration tests (requires running node)
npm run test:integration
```

## Error Handling

The library throws errors in these cases:
- Invalid API responses
- Network errors
- Invalid memo format
- Invalid transaction parameters
- Timeout waiting for mempool transaction

Example error handling:
```typescript
try {
    const result = await builder.buildAndSignTransaction(...);
} catch (error) {
    if (error instanceof Error) {
        console.error('Transaction failed:', error.message);
    }
}
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT

## Support

For support, please open an issue in the GitHub repository.