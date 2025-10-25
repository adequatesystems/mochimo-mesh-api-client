import {
  BalanceResponse,
  Block,
  BlockIdentifier,
  MempoolResponse,
  MempoolTransactionResponse,
  MetadataResponse,
  NETWORK_IDENTIFIER,
  NetworkIdentifier,
  NetworkStatus,
  Operation,
  PayloadsResponse,
  PreprocessOptions,
  PreprocessResponse,
  PublicKey,
  ResolveTagResponse,
  TransactionSubmitResponse
} from './types';
import { logger } from './utils/logger';

/**
 * Interface representing a Rosetta API error response
 */
interface RosettaError {
  code: number;
  message: string;
  retriable: boolean;
}

/**
 * Mochimo API Client for interacting with the Mochimo blockchain network
 * 
 * This client provides methods for:
 * - Construction API (transaction building and submission)
 * - Account operations (balance queries)
 * - Block operations (block and transaction queries)
 * - Network operations (status and options)
 * - Search operations (transaction and block searches)
 * - Mempool operations (pending transaction monitoring)
 * - Statistics operations (richlist, events)
 */
export class MochimoApiClient {
  public baseUrl: string;
  private networkIdentifier: NetworkIdentifier;

  /**
   * Initialize the Mochimo API client
   * @param baseUrl - The base URL of the Mochimo API server
   */
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.networkIdentifier = NETWORK_IDENTIFIER;
    logger.debug('MochimoApiClient initialized', { 
      baseUrl, 
      networkIdentifier: this.networkIdentifier 
    });
  }

  // ============================================================================
  // PRIVATE UTILITY METHODS
  // ============================================================================

  /**
   * Convert Headers object to a plain object for logging
   * @param headers - The Headers object to convert
   * @returns A plain object with header key-value pairs
   */
  private headersToObject(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * Handle API response and check for errors
   * @param response - The fetch Response object
   * @returns The parsed response data
   * @throws Error if the response contains a Rosetta API error
   */
  private async handleResponse(response: Response) {
    const data = await response.json();
    logger.debug('API Response received', { 
      status: response.status, 
      url: response.url,
      data,
      headers: this.headersToObject(response.headers)
    });
    
    // Check for Rosetta API error format
    if ('code' in data) {
      logger.error('Rosetta API Error received', {
        endpoint: response.url,
        status: response.status,
        error: data
      });
      throw new Error(`Rosetta API Error: ${data.message}`);
    }
    
    return data;
  }

  /**
   * Make a POST request to the API endpoint
   * @param endpoint - The API endpoint path
   * @param body - The request body to send
   * @returns The parsed response data
   * @throws Error if the request fails
   */
  private async makeRequest(endpoint: string, body: any) {
    const url = `${this.baseUrl}${endpoint}`;
    logger.debug(`Making API request to ${endpoint}`, {
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      return this.handleResponse(response);
    } catch (error) {
      logger.error(`API request failed for ${endpoint}`, {
        url,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  // ============================================================================
  // CONSTRUCTION API METHODS
  // ============================================================================

  /**
   * Derive an address from a public key and tag
   * @param publicKey - The public key in hex format
   * @param tag - The tag to use for address derivation
   * @returns The derived address information
   */
  async derive(publicKey: string, tag: string) {
    logger.debug('Deriving address from public key and tag', { publicKey, tag });
    return this.makeRequest('/construction/derive', {
      network_identifier: this.networkIdentifier,
      public_key: {
        hex_bytes: publicKey,
        curve_type: 'wotsp'
      },
      metadata: { tag }
    });
  }

  /**
   * Preprocess a transaction to get required metadata
   * @param operations - Array of operations to include in the transaction
   * @param metadata - Additional metadata for the transaction
   * @returns Preprocessing response with required metadata
   */
  async preprocess(operations: Operation[], metadata: any): Promise<PreprocessResponse> {
    logger.debug('Preprocessing transaction operations', { operations, metadata });
    return this.makeRequest('/construction/preprocess', {
      network_identifier: this.networkIdentifier,
      operations,
      metadata
    });
  }

  /**
   * Fetch metadata required for transaction construction
   * @param options - Preprocessing options from the preprocess step
   * @param publicKeys - Array of public keys involved in the transaction
   * @returns Metadata response with construction requirements
   */
  async metadata(options: PreprocessOptions, publicKeys: PublicKey[]): Promise<MetadataResponse> {
    logger.debug('Fetching construction metadata', { options, publicKeys });
    return this.makeRequest('/construction/metadata', {
      network_identifier: this.networkIdentifier,
      options,
      public_keys: publicKeys
    });
  }

  /**
   * Get unsigned transaction payloads for signing
   * @param operations - Array of operations to include in the transaction
   * @param metadata - Metadata from the metadata step
   * @param publicKeys - Array of public keys involved in the transaction
   * @returns Payloads response with unsigned transaction data
   */
  async payloads(
    operations: Operation[], 
    metadata: any, 
    publicKeys: PublicKey[]
  ): Promise<PayloadsResponse> {
    logger.debug('Fetching transaction payloads for signing', { operations, metadata, publicKeys });
    return this.makeRequest('/construction/payloads', {
      network_identifier: this.networkIdentifier,
      operations,
      metadata,
      public_keys: publicKeys
    });
  }

  /**
   * Combine unsigned transaction with signatures
   * @param unsignedTransaction - The unsigned transaction from payloads step
   * @param signatures - Array of signatures to combine
   * @returns The signed transaction ready for submission
   */
  async combine(unsignedTransaction: string, signatures: any[]) {
    logger.debug('Combining unsigned transaction with signatures', { 
      unsignedTransaction, 
      signatures 
    });
    return this.makeRequest('/construction/combine', {
      network_identifier: this.networkIdentifier,
      unsigned_transaction: unsignedTransaction,
      signatures
    });
  }

  /**
   * Submit a signed transaction to the network
   * @param signedTransaction - The signed transaction to submit
   * @returns Transaction submission response with transaction identifier
   */
  async submit(signedTransaction: string): Promise<TransactionSubmitResponse> {
    logger.debug('Submitting signed transaction to network', { signedTransaction });
    return this.makeRequest('/construction/submit', {
      network_identifier: this.networkIdentifier,
      signed_transaction: signedTransaction
    });
  }

  /**
   * Parse a transaction to extract its operations and metadata
   * @param transaction - The transaction to parse (hex encoded)
   * @param signed - Whether the transaction is signed or unsigned
   * @returns Parsed transaction information
   */
  async parse(transaction: string, signed: boolean) {
    logger.debug('Parsing transaction', { transaction, signed });
    return this.makeRequest('/construction/parse', {
      network_identifier: this.networkIdentifier,
      transaction,
      signed
    });
  }

  // ============================================================================
  // ACCOUNT API METHODS
  // ============================================================================

  /**
   * Get the balance of an account
   * @param address - The account address to query
   * @returns Account balance information
   */
  async getAccountBalance(address: string): Promise<BalanceResponse> {
    logger.debug('Fetching account balance', { address });
    return this.makeRequest('/account/balance', {
      network_identifier: this.networkIdentifier,
      account_identifier: { address }
    });
  }

  // ============================================================================
  // BLOCK API METHODS
  // ============================================================================

  /**
   * Get a block by its identifier
   * @param identifier - The block identifier (hash or index)
   * @returns Block information
   */
  async getBlock(identifier: BlockIdentifier): Promise<{ block: Block }> {
    logger.debug('Fetching block', { identifier });
    return this.makeRequest('/block', {
      network_identifier: this.networkIdentifier,
      block_identifier: identifier
    });
  }

  /**
   * Get a specific transaction within a block
   * @param blockIdentifier - The block containing the transaction
   * @param transactionHash - The hash of the transaction to fetch
   * @returns Transaction information within the block
   */
  async getBlockTransaction(blockIdentifier: BlockIdentifier, transactionHash: string): Promise<any> {
    logger.debug('Fetching transaction from block', { blockIdentifier, transactionHash });
    return this.makeRequest('/block/transaction', {
      network_identifier: this.networkIdentifier,
      block_identifier: blockIdentifier,
      transaction_identifier: { hash: transactionHash }
    });
  }

  // ============================================================================
  // NETWORK API METHODS
  // ============================================================================

  /**
   * Get the current network status
   * @returns Network status information including current block and sync status
   */
  async getNetworkStatus(): Promise<NetworkStatus> {
    logger.debug('Fetching network status');
    return this.makeRequest('/network/status', {
      network_identifier: this.networkIdentifier
    });
  }

  /**
   * Get network options including supported operation types, statuses, and errors
   * @returns Network options and capabilities
   */
  async getNetworkOptions(): Promise<any> {
    logger.debug('Fetching network options');
    return this.makeRequest('/network/options', {
      network_identifier: this.networkIdentifier
    });
  }

  // ============================================================================
  // SEARCH API METHODS
  // ============================================================================

  /**
   * Search for transactions by account address
   * @param address - The account address to search transactions for
   * @param options - Optional search parameters
   * @param options.limit - Maximum number of transactions to return
   * @param options.offset - Number of transactions to skip
   * @param options.max_block - Maximum block number to search up to
   * @param options.status - Filter by transaction status
   * @returns Array of transactions for the account
   */
  async searchTransactionsByAddress(address: string, options?: {
    limit?: number;
    offset?: number;
    max_block?: number;
    status?: string;
  }): Promise<any> {
    logger.debug('Searching transactions by address', { address, options });
    const body: any = {
      network_identifier: this.networkIdentifier,
      account_identifier: { address }
    };
    
    if (options) {
      if (options.limit !== undefined) body.limit = options.limit;
      if (options.offset !== undefined) body.offset = options.offset;
      if (options.max_block !== undefined) body.max_block = options.max_block;
      if (options.status !== undefined) body.status = options.status;
    }
    
    return this.makeRequest('/search/transactions', body);
  }

  /**
   * Search for transactions within a specific block
   * @param blockIdentifier - The block to search transactions in
   * @param options - Optional search parameters
   * @param options.limit - Maximum number of transactions to return
   * @param options.offset - Number of transactions to skip
   * @param options.status - Filter by transaction status
   * @returns Array of transactions in the block
   */
  async searchTransactionsByBlock(blockIdentifier: BlockIdentifier, options?: {
    limit?: number;
    offset?: number;
    status?: string;
  }): Promise<any> {
    logger.debug('Searching transactions by block', { blockIdentifier, options });
    const body: any = {
      network_identifier: this.networkIdentifier,
      block_identifier: blockIdentifier
    };
    
    if (options) {
      if (options.limit !== undefined) body.limit = options.limit;
      if (options.offset !== undefined) body.offset = options.offset;
      if (options.status !== undefined) body.status = options.status;
    }
    
    return this.makeRequest('/search/transactions', body);
  }

  /**
   * Search for a specific transaction by its hash
   * @param transactionHash - The hash of the transaction to find
   * @param options - Optional search parameters
   * @param options.max_block - Maximum block number to search up to
   * @param options.status - Filter by transaction status
   * @returns Transaction information if found
   */
  async searchTransactionsByTxId(transactionHash: string, options?: {
    max_block?: number;
    status?: string;
  }): Promise<any> {
    logger.debug('Searching transaction by hash', { transactionHash, options });
    const body: any = {
      network_identifier: this.networkIdentifier,
      transaction_identifier: { hash: transactionHash }
    };
    
    if (options) {
      if (options.max_block !== undefined) body.max_block = options.max_block;
      if (options.status !== undefined) body.status = options.status;
    }
    
    return this.makeRequest('/search/transactions', body);
  }

  // ============================================================================
  // MEMPOOL API METHODS
  // ============================================================================

  /**
   * Get all transaction identifiers currently in the mempool
   * @returns List of pending transaction identifiers
   */
  async getMempoolTransactions(): Promise<MempoolResponse> {
    logger.debug('Fetching all mempool transactions');
    return this.makeRequest('/mempool', {
      network_identifier: this.networkIdentifier
    });
  }

  /**
   * Get a specific transaction from the mempool
   * @param transactionHash - The hash of the transaction to fetch
   * @returns Mempool transaction information
   */
  async getMempoolTransaction(transactionHash: string): Promise<MempoolTransactionResponse> {
    logger.debug('Fetching mempool transaction', { transactionHash });
    return this.makeRequest('/mempool/transaction', {
      network_identifier: this.networkIdentifier,
      transaction_identifier: {
        hash: transactionHash
      }
    });
  }

  /**
   * Monitor the mempool for a specific transaction to appear
   * @param transactionHash - The hash of the transaction to monitor
   * @param timeout - Maximum time to wait in milliseconds (default: 60000)
   * @param interval - Check interval in milliseconds (default: 1000)
   * @returns The mempool transaction when found
   * @throws Error if transaction is not found within the timeout period
   */
  async waitForTransaction(
    transactionHash: string, 
    timeout: number = 60000, 
    interval: number = 1000
  ): Promise<MempoolTransactionResponse> {
    logger.debug('Monitoring mempool for transaction', { 
      transactionHash,
      timeout,
      interval 
    });

    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const response = await this.getMempoolTransaction(transactionHash);
        logger.debug('Transaction found in mempool', { transactionHash });
        return response;
      } catch (error) {
        if (Date.now() - startTime >= timeout) {
          throw new Error(`Transaction ${transactionHash} not found in mempool after ${timeout}ms`);
        }
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }

    throw new Error(`Timeout waiting for transaction ${transactionHash}`);
  }

  // ============================================================================
  // EVENTS AND STATISTICS API METHODS
  // ============================================================================

  /**
   * Get block events (additions/removals) with optional pagination
   * @param options - Optional pagination parameters
   * @param options.limit - Maximum number of events to return
   * @param options.offset - Number of events to skip
   * @returns Block events information
   */
  async getEventsBlocks(options?: {
    limit?: number;
    offset?: number;
  }): Promise<any> {
    logger.debug('Fetching block events', { options });
    const body: any = {
      network_identifier: this.networkIdentifier
    };
    
    if (options) {
      if (options.limit !== undefined) body.limit = options.limit;
      if (options.offset !== undefined) body.offset = options.offset;
    }
    
    return this.makeRequest('/events/blocks', body);
  }

  /**
   * Get the richlist (accounts with highest balances)
   * @param options - Optional sorting and pagination parameters
   * @param options.ascending - Sort in ascending order (default: false)
   * @param options.offset - Number of accounts to skip
   * @param options.limit - Maximum number of accounts to return
   * @returns Richlist information
   */
  async getStatsRichlist(options?: {
    ascending?: boolean;
    offset?: number;
    limit?: number;
  }): Promise<any> {
    logger.debug('Fetching richlist statistics', { options });
    const body: any = {
      network_identifier: this.networkIdentifier
    };
    
    if (options) {
      if (options.ascending !== undefined) body.ascending = options.ascending;
      if (options.offset !== undefined) body.offset = options.offset;
      if (options.limit !== undefined) body.limit = options.limit;
    }
    
    return this.makeRequest('/stats/richlist', body);
  }

  // ============================================================================
  // CUSTOM CALL METHODS
  // ============================================================================

  /**
   * Resolve a tag to get associated information
   * @param tag - The tag to resolve
   * @returns Tag resolution information
   */
  async resolveTag(tag: string): Promise<ResolveTagResponse> {
    logger.debug('Resolving tag', { tag });
    return this.makeRequest('/call', {
      network_identifier: this.networkIdentifier,
      parameters: {
        tag: tag
      },
      method: "tag_resolve"
    });
  }
} 
