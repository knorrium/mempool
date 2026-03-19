import * as YAML from 'yaml';
import * as path from 'path';
import * as fs from 'fs/promises';
import { WebSocketChannel, WebSocketSubscription, WebSocketMessage } from '../parsers/websocket-parser.js';
import { ParsedInterface, ParsedTypeAlias } from '../parsers/interface-parser.js';
import { JSONSchema, convertInterfaces, COMMON_SCHEMAS } from './schema-converter.js';
import { NetworkId, ALL_NETWORKS, getServerUrls } from '../config/feature-flags.js';

export interface AsyncAPISpec {
  asyncapi: string;
  info: {
    title: string;
    description: string;
    version: string;
    contact?: { name: string; url: string };
    license?: { name: string; url: string };
  };
  servers: Record<string, AsyncAPIServer>;
  defaultContentType: string;
  channels: Record<string, AsyncAPIChannel>;
  components: {
    schemas: Record<string, JSONSchema>;
    messages: Record<string, AsyncAPIMessage>;
  };
  operations?: Record<string, AsyncAPIOperation>;
}

export interface AsyncAPIServer {
  host: string;
  pathname: string;
  protocol: string;
  description: string;
}

export interface AsyncAPIChannel {
  address: string;
  messages: Record<string, { $ref: string }>;
  description?: string;
  bindings?: {
    ws?: {
      method?: string;
      query?: JSONSchema;
      headers?: JSONSchema;
    };
  };
}

export interface AsyncAPIMessage {
  name: string;
  title: string;
  summary?: string;
  description?: string;
  contentType: string;
  payload: JSONSchema;
  examples?: Array<{ payload: unknown }>;
}

export interface AsyncAPIOperation {
  action: 'send' | 'receive';
  channel: { $ref: string };
  messages: Array<{ $ref: string }>;
  summary?: string;
  description?: string;
}

export class AsyncAPIGenerator {
  private wsChannel: WebSocketChannel;
  private interfaces: ParsedInterface[];
  private typeAliases: ParsedTypeAlias[];
  private schemas: Record<string, JSONSchema>;

  constructor(
    wsChannel: WebSocketChannel,
    interfaces: ParsedInterface[],
    typeAliases: ParsedTypeAlias[]
  ) {
    this.wsChannel = wsChannel;
    this.interfaces = interfaces;
    this.typeAliases = typeAliases;
    this.schemas = convertInterfaces(interfaces, typeAliases);
  }

  generate(): AsyncAPISpec {
    return {
      asyncapi: '2.6.0',
      info: {
        title: 'Mempool WebSocket API',
        description: 'Real-time WebSocket API for the Mempool open-source block explorer. Subscribe to live blockchain data, mempool updates, and transaction tracking.',
        version: '1.0.0',
        contact: {
          name: 'Mempool',
          url: 'https://mempool.space',
        },
        license: {
          name: 'GNU Affero General Public License v3.0',
          url: 'https://github.com/mempool/mempool/blob/master/LICENSE',
        },
      },
      servers: this.generateServers(),
      defaultContentType: 'application/json',
      channels: this.generateChannels(),
      components: {
        schemas: this.schemas,
        messages: this.generateMessages(),
      },
      operations: this.generateOperations(),
    };
  }

  private generateServers(): Record<string, AsyncAPIServer> {
    return {
      mainnet: {
        host: 'mempool.space',
        pathname: '/api/v1/ws',
        protocol: 'wss',
        description: 'Bitcoin Mainnet WebSocket endpoint',
      },
      testnet: {
        host: 'mempool.space',
        pathname: '/testnet/api/v1/ws',
        protocol: 'wss',
        description: 'Bitcoin Testnet3 WebSocket endpoint',
      },
      testnet4: {
        host: 'mempool.space',
        pathname: '/testnet4/api/v1/ws',
        protocol: 'wss',
        description: 'Bitcoin Testnet4 WebSocket endpoint',
      },
      signet: {
        host: 'mempool.space',
        pathname: '/signet/api/v1/ws',
        protocol: 'wss',
        description: 'Bitcoin Signet WebSocket endpoint',
      },
      liquid: {
        host: 'liquid.network',
        pathname: '/api/v1/ws',
        protocol: 'wss',
        description: 'Liquid Network WebSocket endpoint',
      },
      liquidtestnet: {
        host: 'liquid.network',
        pathname: '/liquidtestnet/api/v1/ws',
        protocol: 'wss',
        description: 'Liquid Testnet WebSocket endpoint',
      },
    };
  }

  private generateChannels(): Record<string, AsyncAPIChannel> {
    const channels: Record<string, AsyncAPIChannel> = {};

    // Main WebSocket channel
    channels['/'] = {
      address: '/',
      description: 'Main WebSocket connection for all subscriptions and messages',
      messages: {
        // Client messages (publish)
        init: { $ref: '#/components/messages/init' },
        ping: { $ref: '#/components/messages/ping' },
        want: { $ref: '#/components/messages/want' },

        // Tracking subscriptions
        'track-tx': { $ref: '#/components/messages/track-tx' },
        'track-txs': { $ref: '#/components/messages/track-txs' },
        'track-address': { $ref: '#/components/messages/track-address' },
        'track-addresses': { $ref: '#/components/messages/track-addresses' },
        'track-mempool-block': { $ref: '#/components/messages/track-mempool-block' },
        'track-rbf': { $ref: '#/components/messages/track-rbf' },
        'track-accelerations': { $ref: '#/components/messages/track-accelerations' },

        // Server messages (subscribe)
        block: { $ref: '#/components/messages/block' },
        'mempool-blocks': { $ref: '#/components/messages/mempool-blocks' },
        mempoolInfo: { $ref: '#/components/messages/mempoolInfo' },
        fees: { $ref: '#/components/messages/fees' },
        da: { $ref: '#/components/messages/da' },
        conversions: { $ref: '#/components/messages/conversions' },
        vBytesPerSecond: { $ref: '#/components/messages/vBytesPerSecond' },
        txPosition: { $ref: '#/components/messages/txPosition' },
        txReplaced: { $ref: '#/components/messages/txReplaced' },
        accelerations: { $ref: '#/components/messages/accelerations' },
        pong: { $ref: '#/components/messages/pong' },
      },
      bindings: {
        ws: {
          method: 'GET',
        },
      },
    };

    return channels;
  }

  private generateMessages(): Record<string, AsyncAPIMessage> {
    const messages: Record<string, AsyncAPIMessage> = {};

    // Client messages
    messages['init'] = {
      name: 'init',
      title: 'Initialize Connection',
      summary: 'Request initial state data from the server',
      contentType: 'application/json',
      payload: {
        type: 'object',
        properties: {
          action: { type: 'string', const: 'init' },
        },
        required: ['action'],
      },
      examples: [{ payload: { action: 'init' } }],
    };

    messages['ping'] = {
      name: 'ping',
      title: 'Ping',
      summary: 'Send ping to keep connection alive',
      contentType: 'application/json',
      payload: {
        type: 'object',
        properties: {
          action: { type: 'string', const: 'ping' },
        },
        required: ['action'],
      },
      examples: [{ payload: { action: 'ping' } }],
    };

    messages['want'] = {
      name: 'want',
      title: 'Subscribe to Data',
      summary: 'Subscribe to one or more data channels',
      description: 'Available channels: blocks, mempool-blocks, live-2h-chart, stats, tomahawk',
      contentType: 'application/json',
      payload: {
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
        required: ['action', 'data'],
      },
      examples: [
        { payload: { action: 'want', data: ['blocks', 'mempool-blocks'] } },
        { payload: { action: 'want', data: ['stats'] } },
      ],
    };

    messages['track-tx'] = {
      name: 'track-tx',
      title: 'Track Transaction',
      summary: 'Track a specific transaction by txid',
      contentType: 'application/json',
      payload: {
        type: 'object',
        properties: {
          'track-tx': {
            type: 'string',
            pattern: '^[a-fA-F0-9]{64}$',
            description: 'Transaction ID to track',
          },
        },
        required: ['track-tx'],
      },
      examples: [
        { payload: { 'track-tx': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' } },
      ],
    };

    messages['track-txs'] = {
      name: 'track-txs',
      title: 'Track Multiple Transactions',
      summary: 'Track multiple transactions by txids',
      contentType: 'application/json',
      payload: {
        type: 'object',
        properties: {
          'track-txs': {
            type: 'array',
            items: {
              type: 'string',
              pattern: '^[a-fA-F0-9]{64}$',
            },
            description: 'Array of transaction IDs to track',
          },
        },
        required: ['track-txs'],
      },
    };

    messages['track-address'] = {
      name: 'track-address',
      title: 'Track Address',
      summary: 'Track a Bitcoin address for new transactions',
      contentType: 'application/json',
      payload: {
        type: 'object',
        properties: {
          'track-address': {
            type: 'string',
            description: 'Bitcoin address to track',
          },
        },
        required: ['track-address'],
      },
    };

    messages['track-addresses'] = {
      name: 'track-addresses',
      title: 'Track Multiple Addresses',
      summary: 'Track multiple Bitcoin addresses',
      contentType: 'application/json',
      payload: {
        type: 'object',
        properties: {
          'track-addresses': {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of Bitcoin addresses to track',
          },
        },
        required: ['track-addresses'],
      },
    };

    messages['track-mempool-block'] = {
      name: 'track-mempool-block',
      title: 'Track Mempool Block',
      summary: 'Track transactions in a specific projected mempool block',
      contentType: 'application/json',
      payload: {
        type: 'object',
        properties: {
          'track-mempool-block': {
            type: 'integer',
            minimum: 0,
            description: 'Index of the mempool block to track (0 = next block)',
          },
        },
        required: ['track-mempool-block'],
      },
    };

    messages['track-rbf'] = {
      name: 'track-rbf',
      title: 'Track RBF',
      summary: 'Track Replace-By-Fee transactions',
      contentType: 'application/json',
      payload: {
        type: 'object',
        properties: {
          'track-rbf': {
            type: 'string',
            enum: ['all', 'fullRbf'],
            description: 'RBF tracking mode',
          },
        },
        required: ['track-rbf'],
      },
    };

    messages['track-accelerations'] = {
      name: 'track-accelerations',
      title: 'Track Accelerations',
      summary: 'Track transaction accelerations',
      contentType: 'application/json',
      payload: {
        type: 'object',
        properties: {
          'track-accelerations': { type: 'boolean' },
        },
        required: ['track-accelerations'],
      },
    };

    // Server messages
    messages['block'] = {
      name: 'block',
      title: 'New Block',
      summary: 'Notification of a new block',
      contentType: 'application/json',
      payload: {
        type: 'object',
        properties: {
          block: { $ref: '#/components/schemas/BlockExtended' },
          txConfirmed: {
            type: 'array',
            items: { type: 'string' },
            description: 'Transaction IDs confirmed in this block',
          },
          mempoolInfo: { $ref: '#/components/schemas/MempoolInfo' },
        },
      },
    };

    messages['mempool-blocks'] = {
      name: 'mempool-blocks',
      title: 'Mempool Blocks Update',
      summary: 'Projected mempool blocks update',
      contentType: 'application/json',
      payload: {
        type: 'array',
        items: { $ref: '#/components/schemas/MempoolBlock' },
      },
    };

    messages['mempoolInfo'] = {
      name: 'mempoolInfo',
      title: 'Mempool Info',
      summary: 'Mempool statistics update',
      contentType: 'application/json',
      payload: { $ref: '#/components/schemas/MempoolInfo' },
    };

    messages['fees'] = {
      name: 'fees',
      title: 'Fee Rates',
      summary: 'Recommended fee rates update',
      contentType: 'application/json',
      payload: { $ref: '#/components/schemas/RecommendedFees' },
    };

    messages['da'] = {
      name: 'da',
      title: 'Difficulty Adjustment',
      summary: 'Difficulty adjustment data update',
      contentType: 'application/json',
      payload: { $ref: '#/components/schemas/DifficultyAdjustment' },
    };

    messages['conversions'] = {
      name: 'conversions',
      title: 'Price Conversions',
      summary: 'Currency conversion rates update',
      contentType: 'application/json',
      payload: { $ref: '#/components/schemas/Conversions' },
    };

    messages['vBytesPerSecond'] = {
      name: 'vBytesPerSecond',
      title: 'Mempool Inflow Rate',
      summary: 'Current mempool inflow rate in vBytes per second',
      contentType: 'application/json',
      payload: { type: 'number' },
    };

    messages['txPosition'] = {
      name: 'txPosition',
      title: 'Transaction Position',
      summary: 'Position of a tracked transaction in mempool',
      contentType: 'application/json',
      payload: {
        type: 'object',
        properties: {
          txid: { type: 'string' },
          position: {
            type: 'object',
            properties: {
              block: { type: 'integer', description: 'Projected block index' },
              vsize: { type: 'number', description: 'Position in vBytes within block' },
              accelerated: { type: 'boolean' },
            },
          },
          accelerationPositions: {
            type: 'object',
            additionalProperties: { type: 'number' },
          },
        },
      },
    };

    messages['txReplaced'] = {
      name: 'txReplaced',
      title: 'Transaction Replaced',
      summary: 'Notification that a tracked transaction was replaced via RBF',
      contentType: 'application/json',
      payload: {
        type: 'object',
        properties: {
          txid: { type: 'string', description: 'Original transaction ID' },
          tx: { $ref: '#/components/schemas/TransactionExtended', description: 'Replacement transaction' },
        },
      },
    };

    messages['accelerations'] = {
      name: 'accelerations',
      title: 'Accelerations Update',
      summary: 'Active transaction accelerations update',
      contentType: 'application/json',
      payload: {
        type: 'object',
        properties: {
          accelerations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                txid: { type: 'string' },
                added: { type: 'number' },
                effectiveFee: { type: 'number' },
                effectiveVsize: { type: 'number' },
                feeDelta: { type: 'number' },
              },
            },
          },
        },
      },
    };

    messages['pong'] = {
      name: 'pong',
      title: 'Pong',
      summary: 'Response to ping message',
      contentType: 'application/json',
      payload: { type: 'boolean', const: true },
    };

    return messages;
  }

  private generateOperations(): Record<string, AsyncAPIOperation> {
    const operations: Record<string, AsyncAPIOperation> = {};

    // Client operations (send)
    operations['sendInit'] = {
      action: 'send',
      channel: { $ref: '#/channels/~1' },
      messages: [{ $ref: '#/components/messages/init' }],
      summary: 'Initialize connection and get initial state',
    };

    operations['sendPing'] = {
      action: 'send',
      channel: { $ref: '#/channels/~1' },
      messages: [{ $ref: '#/components/messages/ping' }],
      summary: 'Send keepalive ping',
    };

    operations['subscribe'] = {
      action: 'send',
      channel: { $ref: '#/channels/~1' },
      messages: [{ $ref: '#/components/messages/want' }],
      summary: 'Subscribe to data channels',
    };

    operations['trackTransaction'] = {
      action: 'send',
      channel: { $ref: '#/channels/~1' },
      messages: [
        { $ref: '#/components/messages/track-tx' },
        { $ref: '#/components/messages/track-txs' },
      ],
      summary: 'Track transactions',
    };

    operations['trackAddress'] = {
      action: 'send',
      channel: { $ref: '#/channels/~1' },
      messages: [
        { $ref: '#/components/messages/track-address' },
        { $ref: '#/components/messages/track-addresses' },
      ],
      summary: 'Track addresses',
    };

    // Server operations (receive)
    operations['receiveBlocks'] = {
      action: 'receive',
      channel: { $ref: '#/channels/~1' },
      messages: [{ $ref: '#/components/messages/block' }],
      summary: 'Receive new block notifications',
    };

    operations['receiveMempoolBlocks'] = {
      action: 'receive',
      channel: { $ref: '#/channels/~1' },
      messages: [{ $ref: '#/components/messages/mempool-blocks' }],
      summary: 'Receive mempool block updates',
    };

    operations['receiveStats'] = {
      action: 'receive',
      channel: { $ref: '#/channels/~1' },
      messages: [
        { $ref: '#/components/messages/mempoolInfo' },
        { $ref: '#/components/messages/fees' },
        { $ref: '#/components/messages/da' },
        { $ref: '#/components/messages/vBytesPerSecond' },
      ],
      summary: 'Receive mempool statistics updates',
    };

    operations['receiveTransactionUpdates'] = {
      action: 'receive',
      channel: { $ref: '#/channels/~1' },
      messages: [
        { $ref: '#/components/messages/txPosition' },
        { $ref: '#/components/messages/txReplaced' },
      ],
      summary: 'Receive tracked transaction updates',
    };

    return operations;
  }

  async writeSpec(outputPath: string, format: 'yaml' | 'json' = 'yaml'): Promise<void> {
    const spec = this.generate();
    const content = format === 'yaml' ? YAML.stringify(spec) : JSON.stringify(spec, null, 2);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, content, 'utf-8');
  }
}

export async function generateAsyncAPI(
  wsChannel: WebSocketChannel,
  interfaces: ParsedInterface[],
  typeAliases: ParsedTypeAlias[],
  outputDir: string
): Promise<void> {
  const generator = new AsyncAPIGenerator(wsChannel, interfaces, typeAliases);
  await generator.writeSpec(path.join(outputDir, 'mempool-websocket.yaml'));
  console.log('AsyncAPI spec generated successfully');
}
