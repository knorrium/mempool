import { Project, SourceFile, Node, SyntaxKind } from 'ts-morph';
import * as path from 'path';

export interface WebSocketSubscription {
  name: string;
  type: 'want' | 'track';
  description: string;
  payload: Record<string, string>;
  responseType?: string;
  condition?: string;
  exampleResponse?: string;
}

export interface WebSocketMessage {
  name: string;
  direction: 'publish' | 'subscribe'; // publish = client -> server, subscribe = server -> client
  description: string;
  schema?: Record<string, unknown>;
  example?: unknown;
}

export interface WebSocketChannel {
  name: string;
  description: string;
  subscriptions: WebSocketSubscription[];
  messages: WebSocketMessage[];
}

// Known "want" subscriptions from websocket-handler.ts
const WANT_SUBSCRIPTIONS: WebSocketSubscription[] = [
  {
    name: 'blocks',
    type: 'want',
    description: 'Subscribe to new block notifications',
    payload: { action: 'want', data: '["blocks"]' },
    responseType: 'block',
    exampleResponse: `{
  "block": {
    "id": "0000000000000000000020eceb0622de739a56d395e5c264cfca2cdac99531f8",
    "height": 941181,
    "version": 712114176,
    "timestamp": 1773851872,
    "bits": 386003148,
    "nonce": 128848115,
    "difficulty": 145042165424853.3,
    "merkle_root": "af544a7640a34f52f950d49e2f28355d5a0343fd7b2819ae0a54e7f0594f8cec",
    "tx_count": 3669,
    "size": 1899987,
    "weight": 3993714,
    "previousblockhash": "00000000000000000001a310b7cdfed92eaaed68c26c97e864528c8de78e96d9",
    "extras": {
      "reward": 314059912,
      "medianFee": 1.085,
      "totalFees": 1559912,
      "pool": { "id": 73, "name": "SpiderPool", "slug": "spiderpool" }
    }
  }
}`,
  },
  {
    name: 'mempool-blocks',
    type: 'want',
    description: 'Subscribe to projected mempool blocks updates',
    payload: { action: 'want', data: '["mempool-blocks"]' },
    responseType: 'mempool-blocks',
    exampleResponse: `{
  "mempool-blocks": [
    {
      "blockSize": 1495855,
      "blockVSize": 997972.75,
      "nTx": 3932,
      "totalFees": 8027655,
      "medianFee": 5.98,
      "feeRange": [4.56, 4.85, 5.03, 6.01, 7.04, 10.05, 703.20]
    },
    {
      "blockSize": 1777358,
      "blockVSize": 997905.5,
      "nTx": 3995,
      "totalFees": 3488376,
      "medianFee": 3.36,
      "feeRange": [2.96, 3.01, 3.02, 3.52, 4.02, 4.29, 4.58]
    }
  ]
}`,
  },
  {
    name: 'live-2h-chart',
    type: 'want',
    description: 'Subscribe to live 2-hour mempool chart data',
    payload: { action: 'want', data: '["live-2h-chart"]' },
    responseType: 'live-2h-chart',
    exampleResponse: `{
  "live-2h-chart": {
    "added": 1773861300,
    "count": 157,
    "vbytes_per_second": 745
  }
}`,
  },
  {
    name: 'stats',
    type: 'want',
    description: 'Subscribe to mempool statistics updates',
    payload: { action: 'want', data: '["stats"]' },
    responseType: 'vBytesPerSecond',
    exampleResponse: `{
  "mempoolInfo": {
    "loaded": true,
    "size": 51236,
    "bytes": 29761238,
    "usage": 166952464,
    "total_fee": 0.17779962,
    "maxmempool": 300000000,
    "mempoolminfee": 0.000001,
    "minrelaytxfee": 0.000001
  },
  "vBytesPerSecond": 745,
  "fees": {
    "fastestFee": 6.481,
    "halfHourFee": 4.923,
    "hourFee": 3.343,
    "economyFee": 0.2,
    "minimumFee": 0.1
  },
  "da": {
    "progressPercent": 85.91,
    "difficultyChange": -7.95,
    "estimatedRetargetDate": 1774046502280,
    "remainingBlocks": 284,
    "remainingTime": 185216280,
    "previousRetarget": 0.446,
    "nextRetargetHeight": 941472
  }
}`,
  },
  {
    name: 'tomahawk',
    type: 'want',
    description: 'Subscribe to tomahawk data (stratum mining)',
    payload: { action: 'want', data: '["tomahawk"]' },
    responseType: 'tomahawk',
    condition: 'STRATUM.ENABLED',
  },
];

// Known "track" subscriptions
const TRACK_SUBSCRIPTIONS: WebSocketSubscription[] = [
  {
    name: 'track-tx',
    type: 'track',
    description: 'Track a specific transaction by txid',
    payload: { 'track-tx': '<txid>' },
    responseType: 'txPosition',
  },
  {
    name: 'track-txs',
    type: 'track',
    description: 'Track multiple transactions by txids',
    payload: { 'track-txs': '["<txid1>", "<txid2>"]' },
    responseType: 'tracked-txs',
  },
  {
    name: 'track-address',
    type: 'track',
    description: 'Track a Bitcoin address for new transactions',
    payload: { 'track-address': '<address>' },
    responseType: 'address-transactions',
  },
  {
    name: 'track-addresses',
    type: 'track',
    description: 'Track multiple Bitcoin addresses',
    payload: { 'track-addresses': '["<address1>", "<address2>"]' },
    responseType: 'multi-address-transactions',
  },
  {
    name: 'track-scriptpubkeys',
    type: 'track',
    description: 'Track scriptpubkeys for transactions',
    payload: { 'track-scriptpubkeys': '["<spk1>", "<spk2>"]' },
    responseType: 'scriptpubkey-transactions',
  },
  {
    name: 'track-wallet',
    type: 'track',
    description: 'Track a wallet descriptor',
    payload: { 'track-wallet': '<descriptor>' },
    responseType: 'wallet-transactions',
    condition: 'WALLETS.ENABLED',
  },
  {
    name: 'track-asset',
    type: 'track',
    description: 'Track a Liquid asset by asset ID',
    payload: { 'track-asset': '<asset_id>' },
    responseType: 'asset-transactions',
    condition: 'isLiquid',
  },
  {
    name: 'track-mempool-block',
    type: 'track',
    description: 'Track transactions in a specific projected mempool block',
    payload: { 'track-mempool-block': '<index>' },
    responseType: 'projected-block-transactions',
  },
  {
    name: 'track-rbf',
    type: 'track',
    description: 'Track RBF (Replace-By-Fee) transactions. Use "all" for all RBF or "fullRbf" for full RBF only.',
    payload: { 'track-rbf': 'all' },
    responseType: 'rbfLatest',
  },
  {
    name: 'track-rbf-summary',
    type: 'track',
    description: 'Track RBF summary updates',
    payload: { 'track-rbf-summary': 'true' },
    responseType: 'rbfLatestSummary',
  },
  {
    name: 'track-accelerations',
    type: 'track',
    description: 'Track transaction accelerations',
    payload: { 'track-accelerations': 'true' },
    responseType: 'accelerations',
    condition: 'MEMPOOL_SERVICES.ACCELERATIONS',
  },
  {
    name: 'track-donation',
    type: 'track',
    description: 'Track donation status',
    payload: { 'track-donation': '<donation_id>' },
    responseType: 'donation-confirmed',
  },
  {
    name: 'track-mempool-txids',
    type: 'track',
    description: 'Track mempool transaction IDs (delta updates)',
    payload: { 'track-mempool-txids': 'true' },
    responseType: 'mempool-txids',
  },
  {
    name: 'track-mempool',
    type: 'track',
    description: 'Track full mempool transactions (delta updates)',
    payload: { 'track-mempool': 'true' },
    responseType: 'mempool-transactions',
  },
];

// Known server -> client messages
const SERVER_MESSAGES: WebSocketMessage[] = [
  {
    name: 'block',
    direction: 'subscribe',
    description: 'New block notification',
    schema: {
      type: 'object',
      properties: {
        block: { $ref: '#/components/schemas/BlockExtended' },
        txConfirmed: { type: 'array', items: { type: 'string' } },
        mempoolInfo: { $ref: '#/components/schemas/MempoolInfo' },
      },
    },
  },
  {
    name: 'mempool-blocks',
    direction: 'subscribe',
    description: 'Projected mempool blocks update',
    schema: {
      type: 'array',
      items: { $ref: '#/components/schemas/MempoolBlock' },
    },
  },
  {
    name: 'mempoolInfo',
    direction: 'subscribe',
    description: 'Mempool info update',
    schema: { $ref: '#/components/schemas/MempoolInfo' },
  },
  {
    name: 'fees',
    direction: 'subscribe',
    description: 'Recommended fee rates update',
    schema: { $ref: '#/components/schemas/RecommendedFees' },
  },
  {
    name: 'da',
    direction: 'subscribe',
    description: 'Difficulty adjustment data',
    schema: { $ref: '#/components/schemas/DifficultyAdjustment' },
  },
  {
    name: 'txPosition',
    direction: 'subscribe',
    description: 'Tracked transaction position in mempool',
    schema: {
      type: 'object',
      properties: {
        txid: { type: 'string' },
        position: {
          type: 'object',
          properties: {
            block: { type: 'integer' },
            vsize: { type: 'number' },
            accelerated: { type: 'boolean' },
          },
        },
      },
    },
  },
  {
    name: 'txReplaced',
    direction: 'subscribe',
    description: 'Transaction replaced via RBF',
    schema: {
      type: 'object',
      properties: {
        txid: { type: 'string' },
        tx: { $ref: '#/components/schemas/TransactionExtended' },
      },
    },
  },
  {
    name: 'rbfLatest',
    direction: 'subscribe',
    description: 'Latest RBF transactions',
    schema: {
      type: 'array',
      items: { $ref: '#/components/schemas/RbfTree' },
    },
  },
  {
    name: 'accelerations',
    direction: 'subscribe',
    description: 'Active accelerations update',
    schema: {
      type: 'object',
      properties: {
        accelerations: {
          type: 'array',
          items: { $ref: '#/components/schemas/Acceleration' },
        },
      },
    },
  },
  {
    name: 'vBytesPerSecond',
    direction: 'subscribe',
    description: 'Current mempool inflow rate',
    schema: { type: 'number' },
  },
  {
    name: 'conversions',
    direction: 'subscribe',
    description: 'Price conversion rates',
    schema: { $ref: '#/components/schemas/Conversions' },
  },
  {
    name: 'live-2h-chart',
    direction: 'subscribe',
    description: 'Live 2-hour mempool chart data point',
    schema: {
      type: 'object',
      properties: {
        added: { type: 'number' },
        count: { type: 'integer' },
        vbytes_per_second: { type: 'number' },
      },
    },
  },
  {
    name: 'projected-block-transactions',
    direction: 'subscribe',
    description: 'Transactions in a projected mempool block',
    schema: {
      type: 'object',
      properties: {
        index: { type: 'integer' },
        sequence: { type: 'integer' },
        blockTransactions: {
          type: 'array',
          items: { $ref: '#/components/schemas/TransactionCompressed' },
        },
      },
    },
  },
];

// Client -> server messages
const CLIENT_MESSAGES: WebSocketMessage[] = [
  {
    name: 'init',
    direction: 'publish',
    description: 'Request initial state data',
    schema: {
      type: 'object',
      properties: {
        action: { type: 'string', const: 'init' },
      },
    },
  },
  {
    name: 'ping',
    direction: 'publish',
    description: 'Ping the server (keepalive)',
    schema: {
      type: 'object',
      properties: {
        action: { type: 'string', const: 'ping' },
      },
    },
  },
  {
    name: 'want',
    direction: 'publish',
    description: 'Subscribe to data channels',
    schema: {
      type: 'object',
      properties: {
        action: { type: 'string', const: 'want' },
        data: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['blocks', 'mempool-blocks', 'live-2h-chart', 'stats', 'tomahawk'],
          },
        },
      },
    },
  },
];

export class WebSocketParser {
  private project: Project;
  private backendPath: string;

  constructor(backendPath: string) {
    this.backendPath = backendPath;
    this.project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: {
        target: 99,
        module: 99,
        strict: true,
        esModuleInterop: true,
      },
    });
  }

  async parseWebSocketHandler(): Promise<WebSocketChannel> {
    // For now, return the statically defined subscriptions and messages
    // In a more advanced implementation, we could parse the actual file
    return {
      name: 'mempool',
      description: 'Mempool WebSocket API for real-time updates',
      subscriptions: [...WANT_SUBSCRIPTIONS, ...TRACK_SUBSCRIPTIONS],
      messages: [...SERVER_MESSAGES, ...CLIENT_MESSAGES],
    };
  }

  getWantSubscriptions(): WebSocketSubscription[] {
    return WANT_SUBSCRIPTIONS;
  }

  getTrackSubscriptions(): WebSocketSubscription[] {
    return TRACK_SUBSCRIPTIONS;
  }

  getServerMessages(): WebSocketMessage[] {
    return SERVER_MESSAGES;
  }

  getClientMessages(): WebSocketMessage[] {
    return CLIENT_MESSAGES;
  }

  getAllSubscriptions(): WebSocketSubscription[] {
    return [...WANT_SUBSCRIPTIONS, ...TRACK_SUBSCRIPTIONS];
  }

  getAllMessages(): WebSocketMessage[] {
    return [...SERVER_MESSAGES, ...CLIENT_MESSAGES];
  }
}

export async function parseWebSocket(backendPath: string): Promise<WebSocketChannel> {
  const parser = new WebSocketParser(backendPath);
  return parser.parseWebSocketHandler();
}
