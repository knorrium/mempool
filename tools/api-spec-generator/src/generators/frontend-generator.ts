import * as path from 'path';
import * as fs from 'fs/promises';
import { ParsedRoute } from '../parsers/ast-utils.js';
import { RouteFile } from '../parsers/route-parser.js';
import { WebSocketChannel, WebSocketSubscription } from '../parsers/websocket-parser.js';
import { ModuleCondition } from '../parsers/condition-parser.js';
import {
  NetworkId,
  BITCOIN_NETWORKS,
  LIQUID_NETWORKS,
  LIGHTNING_NETWORKS,
  ALL_NETWORKS,
  conditionToFlags,
  flagsToNetworks,
} from '../config/feature-flags.js';

export interface FrontendEndpoint {
  type: 'endpoint' | 'category';
  category: string;
  fragment: string;
  title: string;
  description?: { default: string } | Record<string, string>;
  httpRequestMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  urlString?: string;
  showConditions: string[];
  showJsExamples?: boolean | Record<string, boolean>;
  payload?: string;
  tags?: string[];
  codeExample?: {
    default: {
      codeTemplate: Record<string, unknown>;
      codeSampleMainnet?: CodeSample;
      codeSampleTestnet?: CodeSample;
      codeSampleSignet?: CodeSample;
      codeSampleLiquid?: CodeSample;
    };
  };
}

export interface CodeSample {
  esModule: string[];
  commonJS: string[];
  curl: string[];
  response: string;
}

// Route path to category mapping
// Category order to match original docs
const CATEGORY_ORDER = [
  'general',
  'addresses',
  'assets',
  'blocks',
  'mining',
  'fees',
  'mempool',
  'transactions',
  'lightning',
  'accelerator-public',
  'accelerator-private',
  'statistics',
];

const PATH_TO_CATEGORY: Record<string, string> = {
  '/api/v1/fees': 'fees',
  '/api/v1/mempool': 'mempool',
  '/api/v1/block': 'blocks',
  '/api/v1/blocks': 'blocks',
  '/api/v1/tx': 'transactions',
  '/api/v1/address': 'addresses',
  '/api/v1/scripthash': 'addresses',
  '/api/v1/mining': 'mining',
  '/api/v1/difficulty': 'general',
  '/api/v1/lightning': 'lightning',
  '/api/v1/asset': 'assets',
  '/api/v1/liquid': 'assets',
  '/api/v1/prices': 'general',
  '/api/v1/acceleration': 'accelerator-public',
  '/api/v1/cpfp': 'transactions',
  '/api/v1/rbf': 'transactions',
  '/api/v1/validate': 'addresses',
  '/api/v1/backend': 'general',
  '/api/v1/init': 'general',
};

// URL-specific category mappings (takes precedence over PATH_TO_CATEGORY)
const URL_TO_CATEGORY: Record<string, string> = {
  // Accelerator (Public) - no authentication required
  '/v1/services/accelerator/estimate': 'accelerator-public',
  '/v1/services/payments/bitcoin': 'accelerator-public',
  '/v1/services/accelerator/accelerations': 'accelerator-public',
  '/v1/services/accelerator/accelerations/history': 'accelerator-public',

  // Accelerator (Authenticated) - requires X-Mempool-Auth header
  '/v1/services/accelerator/top-up-history': 'accelerator-private',
  '/v1/services/accelerator/balance': 'accelerator-private',
  '/v1/services/accelerator/accelerate': 'accelerator-private',
  '/v1/services/accelerator/history': 'accelerator-private',
  '/v1/services/accelerator/cancel': 'accelerator-private',
  '/v1/services/accelerator/auto-accelerate': 'accelerator-private',
  '/v1/services/accelerator/auto-accelerate/history': 'accelerator-private',
  '/v1/services/accelerator/auto-accelerate/cancel': 'accelerator-private',
};

// Manual endpoints not in the open-source backend (e.g., mempool.space services)
const MANUAL_ENDPOINTS: FrontendEndpoint[] = [
  // Accelerator (Authenticated) endpoints
  {
    type: 'endpoint',
    category: 'accelerator-private',
    fragment: 'accelerator-top-up-history',
    title: 'GET Top Up History',
    description: {
      default: '<p>Returns the top up history for the authenticated account.</p><p>Requires <code>X-Mempool-Auth</code> header with a valid authentication token.</p>',
    },
    httpRequestMethod: 'GET',
    urlString: '/v1/services/accelerator/top-up-history',
    showConditions: [''],
    showJsExamples: { '': false },
    codeExample: {
      default: {
        codeTemplate: {
          curl: '/api/v1/services/accelerator/top-up-history',
          commonJS: '',
          esModule: '',
        },
        codeSampleMainnet: { esModule: [], commonJS: [], curl: [], response: '' },
        codeSampleTestnet: { esModule: [], commonJS: [], curl: [], response: '' },
        codeSampleSignet: { esModule: [], commonJS: [], curl: [], response: '' },
        codeSampleLiquid: { esModule: [], commonJS: [], curl: [], response: '' },
      },
    },
  },
  {
    type: 'endpoint',
    category: 'accelerator-private',
    fragment: 'accelerator-balance',
    title: 'GET Available Balance',
    description: {
      default: '<p>Returns the available balance for the authenticated account.</p><p>Requires <code>X-Mempool-Auth</code> header with a valid authentication token.</p>',
    },
    httpRequestMethod: 'GET',
    urlString: '/v1/services/accelerator/balance',
    showConditions: [''],
    showJsExamples: { '': false },
    codeExample: {
      default: {
        codeTemplate: {
          curl: '/api/v1/services/accelerator/balance',
          commonJS: '',
          esModule: '',
        },
        codeSampleMainnet: { esModule: [], commonJS: [], curl: [], response: '' },
        codeSampleTestnet: { esModule: [], commonJS: [], curl: [], response: '' },
        codeSampleSignet: { esModule: [], commonJS: [], curl: [], response: '' },
        codeSampleLiquid: { esModule: [], commonJS: [], curl: [], response: '' },
      },
    },
  },
  {
    type: 'endpoint',
    category: 'accelerator-private',
    fragment: 'accelerator-accelerate',
    title: 'POST Accelerate A Transaction (Pro)',
    description: {
      default: '<p>Accelerate a transaction using the authenticated account balance.</p><p>Requires <code>X-Mempool-Auth</code> header with a valid authentication token.</p>',
    },
    httpRequestMethod: 'POST',
    urlString: '/v1/services/accelerator/accelerate',
    showConditions: [''],
    showJsExamples: { '': false },
    codeExample: {
      default: {
        codeTemplate: {
          curl: '/api/v1/services/accelerator/accelerate',
          commonJS: '',
          esModule: '',
        },
        codeSampleMainnet: { esModule: [], commonJS: [], curl: [], response: '' },
        codeSampleTestnet: { esModule: [], commonJS: [], curl: [], response: '' },
        codeSampleSignet: { esModule: [], commonJS: [], curl: [], response: '' },
        codeSampleLiquid: { esModule: [], commonJS: [], curl: [], response: '' },
      },
    },
  },
  {
    type: 'endpoint',
    category: 'accelerator-private',
    fragment: 'accelerator-history',
    title: 'GET Acceleration History',
    description: {
      default: '<p>Returns the acceleration history for the authenticated account.</p><p>Requires <code>X-Mempool-Auth</code> header with a valid authentication token.</p><p>Query parameters:</p><ul><li><code>status</code>: <code>all</code>, <code>requested</code>, <code>accelerating</code>, <code>mined</code>, <code>completed</code>, <code>failed</code></li><li><code>details</code>: <code>true</code> or <code>false</code></li></ul>',
    },
    httpRequestMethod: 'GET',
    urlString: '/v1/services/accelerator/history',
    showConditions: [''],
    showJsExamples: { '': false },
    codeExample: {
      default: {
        codeTemplate: {
          curl: '/api/v1/services/accelerator/history?status=all&details=true',
          commonJS: '',
          esModule: '',
        },
        codeSampleMainnet: { esModule: [], commonJS: [], curl: [], response: '' },
        codeSampleTestnet: { esModule: [], commonJS: [], curl: [], response: '' },
        codeSampleSignet: { esModule: [], commonJS: [], curl: [], response: '' },
        codeSampleLiquid: { esModule: [], commonJS: [], curl: [], response: '' },
      },
    },
  },
  {
    type: 'endpoint',
    category: 'accelerator-private',
    fragment: 'accelerator-cancel',
    title: 'POST Cancel Acceleration (Pro)',
    description: {
      default: '<p>Cancel a pending acceleration.</p><p>Requires <code>X-Mempool-Auth</code> header with a valid authentication token.</p>',
    },
    httpRequestMethod: 'POST',
    urlString: '/v1/services/accelerator/cancel',
    showConditions: [''],
    showJsExamples: { '': false },
    codeExample: {
      default: {
        codeTemplate: {
          curl: '/api/v1/services/accelerator/cancel',
          commonJS: '',
          esModule: '',
        },
        codeSampleMainnet: { esModule: [], commonJS: [], curl: [], response: '' },
        codeSampleTestnet: { esModule: [], commonJS: [], curl: [], response: '' },
        codeSampleSignet: { esModule: [], commonJS: [], curl: [], response: '' },
        codeSampleLiquid: { esModule: [], commonJS: [], curl: [], response: '' },
      },
    },
  },
  {
    type: 'endpoint',
    category: 'accelerator-private',
    fragment: 'accelerator-auto-accelerate',
    title: 'POST Auto-Accelerate A Transaction (Pro)',
    description: {
      default: '<p>Set up automatic acceleration for a transaction.</p><p>Requires <code>X-Mempool-Auth</code> header with a valid authentication token.</p>',
    },
    httpRequestMethod: 'POST',
    urlString: '/v1/services/accelerator/auto-accelerate',
    showConditions: [''],
    showJsExamples: { '': false },
    codeExample: {
      default: {
        codeTemplate: {
          curl: '/api/v1/services/accelerator/auto-accelerate',
          commonJS: '',
          esModule: '',
        },
        codeSampleMainnet: { esModule: [], commonJS: [], curl: [], response: '' },
        codeSampleTestnet: { esModule: [], commonJS: [], curl: [], response: '' },
        codeSampleSignet: { esModule: [], commonJS: [], curl: [], response: '' },
        codeSampleLiquid: { esModule: [], commonJS: [], curl: [], response: '' },
      },
    },
  },
  {
    type: 'endpoint',
    category: 'accelerator-private',
    fragment: 'accelerator-auto-accelerate-history',
    title: 'GET Auto-Acceleration History',
    description: {
      default: '<p>Returns the auto-acceleration history for the authenticated account.</p><p>Requires <code>X-Mempool-Auth</code> header with a valid authentication token.</p>',
    },
    httpRequestMethod: 'GET',
    urlString: '/v1/services/accelerator/auto-accelerate/history',
    showConditions: [''],
    showJsExamples: { '': false },
    codeExample: {
      default: {
        codeTemplate: {
          curl: '/api/v1/services/accelerator/auto-accelerate/history',
          commonJS: '',
          esModule: '',
        },
        codeSampleMainnet: { esModule: [], commonJS: [], curl: [], response: '' },
        codeSampleTestnet: { esModule: [], commonJS: [], curl: [], response: '' },
        codeSampleSignet: { esModule: [], commonJS: [], curl: [], response: '' },
        codeSampleLiquid: { esModule: [], commonJS: [], curl: [], response: '' },
      },
    },
  },
  {
    type: 'endpoint',
    category: 'accelerator-private',
    fragment: 'accelerator-auto-accelerate-cancel',
    title: 'POST Cancel Auto-Acceleration (Pro)',
    description: {
      default: '<p>Cancel a pending auto-acceleration.</p><p>Requires <code>X-Mempool-Auth</code> header with a valid authentication token.</p>',
    },
    httpRequestMethod: 'POST',
    urlString: '/v1/services/accelerator/auto-accelerate/cancel',
    showConditions: [''],
    showJsExamples: { '': false },
    codeExample: {
      default: {
        codeTemplate: {
          curl: '/api/v1/services/accelerator/auto-accelerate/cancel',
          commonJS: '',
          esModule: '',
        },
        codeSampleMainnet: { esModule: [], commonJS: [], curl: [], response: '' },
        codeSampleTestnet: { esModule: [], commonJS: [], curl: [], response: '' },
        codeSampleSignet: { esModule: [], commonJS: [], curl: [], response: '' },
        codeSampleLiquid: { esModule: [], commonJS: [], curl: [], response: '' },
      },
    },
  },
];

// Sample values for curl placeholders
const SAMPLE_VALUES: Record<string, Record<string, string[]>> = {
  // Addresses
  '/v1/address/:address': {
    mainnet: ['1wiz18xYmhRX6xStj2b9t1rwWX4GKUgpv'],
    testnet: ['tb1qp0we5epypgj4acd2c4au58045ruud2pd6heuee'],
    signet: ['tb1qp0we5epypgj4acd2c4au58045ruud2pd6heuee'],
    liquid: ['GuzUPgbPpYfLnSckh9dBZGJJwABEmQoC1Q'],
  },
  '/v1/address/:address/txs': {
    mainnet: ['1wiz18xYmhRX6xStj2b9t1rwWX4GKUgpv'],
    testnet: ['tb1qp0we5epypgj4acd2c4au58045ruud2pd6heuee'],
    signet: ['tb1qp0we5epypgj4acd2c4au58045ruud2pd6heuee'],
    liquid: ['GuzUPgbPpYfLnSckh9dBZGJJwABEmQoC1Q'],
  },
  '/v1/address/:address/txs/chain/:lastSeenTxId': {
    mainnet: ['1wiz18xYmhRX6xStj2b9t1rwWX4GKUgpv', 'foobar'],
    testnet: ['tb1qp0we5epypgj4acd2c4au58045ruud2pd6heuee', 'foobar'],
    signet: ['tb1qp0we5epypgj4acd2c4au58045ruud2pd6heuee', 'foobar'],
    liquid: ['GuzUPgbPpYfLnSckh9dBZGJJwABEmQoC1Q', 'foobar'],
  },
  '/v1/address/:address/utxo': {
    mainnet: ['1wiz18xYmhRX6xStj2b9t1rwWX4GKUgpv'],
    testnet: ['tb1qp0we5epypgj4acd2c4au58045ruud2pd6heuee'],
    signet: ['tb1qp0we5epypgj4acd2c4au58045ruud2pd6heuee'],
    liquid: ['GuzUPgbPpYfLnSckh9dBZGJJwABEmQoC1Q'],
  },
  // Transactions
  '/v1/tx/:txId': {
    mainnet: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521'],
    testnet: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521'],
    signet: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521'],
    liquid: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521'],
  },
  '/v1/tx/:txId/status': {
    mainnet: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521'],
    testnet: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521'],
    signet: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521'],
    liquid: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521'],
  },
  '/v1/tx/:txId/hex': {
    mainnet: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521'],
    testnet: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521'],
    signet: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521'],
    liquid: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521'],
  },
  '/v1/tx/:txId/merkleblock-proof': {
    mainnet: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521'],
    testnet: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521'],
    signet: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521'],
    liquid: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521'],
  },
  '/v1/tx/:txId/merkle-proof': {
    mainnet: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521'],
    testnet: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521'],
    signet: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521'],
    liquid: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521'],
  },
  '/v1/tx/:txId/outspends': {
    mainnet: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521'],
    testnet: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521'],
    signet: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521'],
    liquid: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521'],
  },
  '/v1/tx/:txId/outspend/:vout': {
    mainnet: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521', '0'],
    testnet: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521', '0'],
    signet: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521', '0'],
    liquid: ['15e10745f15593a899cef391191bdd3d7c12412cc4696b7bcb669d0feadc8521', '0'],
  },
  // Blocks
  '/v1/block/:hash': {
    mainnet: ['000000000000000015dc777b3ff2611091336355d3f0ee9766a2cf3be8e4b1ce'],
    testnet: ['000000000000004a3ff1faff12c926c117a34bc22712623cd03a7c9d1866ef83'],
    signet: ['000000ca66fab45e4560de653f1b519562ee8f5a5a5b5a5a5a5a5a5a5a5a5a5a'],
    liquid: ['86aefdd3cf7be8e5781f783fe5d80513e8b3f52f2f1ef61e8e056b7faffc4b78'],
  },
  '/v1/block/:hash/header': {
    mainnet: ['000000000000000015dc777b3ff2611091336355d3f0ee9766a2cf3be8e4b1ce'],
    testnet: ['000000000000004a3ff1faff12c926c117a34bc22712623cd03a7c9d1866ef83'],
    signet: ['000000ca66fab45e4560de653f1b519562ee8f5a5a5b5a5a5a5a5a5a5a5a5a5a'],
    liquid: ['86aefdd3cf7be8e5781f783fe5d80513e8b3f52f2f1ef61e8e056b7faffc4b78'],
  },
  '/v1/block/:hash/txids': {
    mainnet: ['000000000000000015dc777b3ff2611091336355d3f0ee9766a2cf3be8e4b1ce'],
    testnet: ['000000000000004a3ff1faff12c926c117a34bc22712623cd03a7c9d1866ef83'],
    signet: ['000000ca66fab45e4560de653f1b519562ee8f5a5a5b5a5a5a5a5a5a5a5a5a5a'],
    liquid: ['86aefdd3cf7be8e5781f783fe5d80513e8b3f52f2f1ef61e8e056b7faffc4b78'],
  },
  '/v1/block/:hash/txs': {
    mainnet: ['000000000000000015dc777b3ff2611091336355d3f0ee9766a2cf3be8e4b1ce'],
    testnet: ['000000000000004a3ff1faff12c926c117a34bc22712623cd03a7c9d1866ef83'],
    signet: ['000000ca66fab45e4560de653f1b519562ee8f5a5a5b5a5a5a5a5a5a5a5a5a5a'],
    liquid: ['86aefdd3cf7be8e5781f783fe5d80513e8b3f52f2f1ef61e8e056b7faffc4b78'],
  },
  '/v1/block/:hash/txs/:index': {
    mainnet: ['000000000000000015dc777b3ff2611091336355d3f0ee9766a2cf3be8e4b1ce', '0'],
    testnet: ['000000000000004a3ff1faff12c926c117a34bc22712623cd03a7c9d1866ef83', '0'],
    signet: ['000000ca66fab45e4560de653f1b519562ee8f5a5a5b5a5a5a5a5a5a5a5a5a5a', '0'],
    liquid: ['86aefdd3cf7be8e5781f783fe5d80513e8b3f52f2f1ef61e8e056b7faffc4b78', '0'],
  },
  '/v1/block/:hash/raw': {
    mainnet: ['000000000000000015dc777b3ff2611091336355d3f0ee9766a2cf3be8e4b1ce'],
    testnet: ['000000000000004a3ff1faff12c926c117a34bc22712623cd03a7c9d1866ef83'],
    signet: ['000000ca66fab45e4560de653f1b519562ee8f5a5a5b5a5a5a5a5a5a5a5a5a5a'],
    liquid: ['86aefdd3cf7be8e5781f783fe5d80513e8b3f52f2f1ef61e8e056b7faffc4b78'],
  },
  '/v1/block-height/:height': {
    mainnet: ['730000'],
    testnet: ['2000000'],
    signet: ['150000'],
    liquid: ['1500000'],
  },
  '/v1/blocks/:height': {
    mainnet: ['730000'],
    testnet: ['2000000'],
    signet: ['150000'],
    liquid: ['1500000'],
  },
  '/v1/blocks': {
    mainnet: [],
    testnet: [],
    signet: [],
    liquid: [],
  },
  // Mining
  '/v1/mining/pool/:slug': {
    mainnet: ['foundryusa'],
    testnet: ['foundryusa'],
    signet: ['foundryusa'],
    liquid: [],
  },
  '/v1/mining/pool/:slug/blocks': {
    mainnet: ['foundryusa'],
    testnet: ['foundryusa'],
    signet: ['foundryusa'],
    liquid: [],
  },
  '/v1/mining/pool/:slug/blocks/:height': {
    mainnet: ['foundryusa', '730000'],
    testnet: ['foundryusa', '2000000'],
    signet: ['foundryusa', '150000'],
    liquid: [],
  },
  // Lightning
  '/v1/lightning/nodes/:pubKey': {
    mainnet: ['03864ef025fde8fb587d989186ce6a4a186895ee44a926bfc370e2c366597a3f8f'],
    testnet: ['03864ef025fde8fb587d989186ce6a4a186895ee44a926bfc370e2c366597a3f8f'],
    signet: ['03864ef025fde8fb587d989186ce6a4a186895ee44a926bfc370e2c366597a3f8f'],
    liquid: [],
  },
  '/v1/lightning/channels/:channelId': {
    mainnet: ['768457472831193088'],
    testnet: ['768457472831193088'],
    signet: ['768457472831193088'],
    liquid: [],
  },
};

// URL path to title mapping (takes precedence over handler mapping for specific paths)
const URL_TO_TITLE: Record<string, string> = {
  // Statistics endpoints with time periods
  '/v1/statistics/all': 'Get Statistics (All Time)',
  '/v1/statistics/4y': 'Get Statistics (4 Years)',
  '/v1/statistics/3y': 'Get Statistics (3 Years)',
  '/v1/statistics/2y': 'Get Statistics (2 Years)',
  '/v1/statistics/1y': 'Get Statistics (1 Year)',
  '/v1/statistics/6m': 'Get Statistics (6 Months)',
  '/v1/statistics/3m': 'Get Statistics (3 Months)',
  '/v1/statistics/1m': 'Get Statistics (1 Month)',
  '/v1/statistics/1w': 'Get Statistics (1 Week)',
  '/v1/statistics/24h': 'Get Statistics (24 Hours)',
  '/v1/statistics/2h': 'Get Statistics (2 Hours)',
  // Blocks endpoints with optional parameters
  '/v1/blocks': 'Get Blocks',
  '/v1/blocks/:height': 'Get Blocks (From Height)',
  '/v1/block/:hash/txs': 'Get Block Transactions',
  '/v1/block/:hash/txs/:index': 'Get Block Transactions (Paginated)',
  '/v1/blocks-bulk/:from': 'Get Blocks Bulk (From Height)',
  '/v1/blocks-bulk/:from/:to': 'Get Blocks Bulk (Range)',
  // Mining endpoints with optional parameters
  '/v1/mining/blocks/audit/scores': 'Get Block Audit Scores',
  '/v1/mining/blocks/audit/scores/:height': 'Get Block Audit Scores (From Height)',
  '/v1/mining/difficulty-adjustments': 'Get Difficulty Adjustments',
  '/v1/mining/difficulty-adjustments/:interval': 'Get Difficulty Adjustments (Interval)',
  '/v1/mining/pool/:slug/blocks': 'Get Pool Blocks',
  '/v1/mining/pool/:slug/blocks/:height': 'Get Pool Blocks (From Height)',
  // Lightning endpoints with optional parameters
  '/v1/lightning/channels-geo': 'Get All Channels Geo',
  '/v1/lightning/channels-geo/:publicKey': 'Get Node Channels Geo',
  // Price endpoint (shown in different categories for different networks)
  '/v1/historical-price': 'Get Historical Price',
  // Services/About endpoints
  '/v1/services/account/images/:username/:md5': 'Get Account Image',
  '/v1/services/sponsors': 'Get Sponsors',
  '/v1/translators': 'Get Translators',
  '/v1/translators/images/:id': 'Get Translator Image',
  '/v1/contributors': 'Get Contributors',
  '/v1/contributors/images/:id': 'Get Contributor Image',
  '/v1/donations': 'Get Donations',
  '/v1/donations/images/:id': 'Get Donation Image',
  // Bitcoin Core internal endpoints
  '/v1/internal/bitcoin-core/get-block-count': 'Get Block Count (Bitcoin Core)',
  '/v1/internal/bitcoin-core/get-block-hash': 'Get Block Hash (Bitcoin Core)',
  '/v1/internal/bitcoin-core/get-block': 'Get Block (Bitcoin Core)',
  '/v1/internal/bitcoin-core/get-raw-transaction': 'Get Raw Transaction (Bitcoin Core)',
  '/v1/internal/bitcoin-core/decode-raw-transaction': 'Decode Raw Transaction (Bitcoin Core)',
  '/v1/internal/bitcoin-core/get-mempool-entry': 'Get Mempool Entry (Bitcoin Core)',
  '/v1/internal/bitcoin-core/get-mempool-ancestors': 'Get Mempool Ancestors (Bitcoin Core)',
  '/v1/internal/bitcoin-core/send-raw-transaction': 'Send Raw Transaction (Bitcoin Core)',
  '/v1/internal/bitcoin-core/test-mempool-accept': 'Test Mempool Accept (Bitcoin Core)',
};

// URL path to description mapping (for routes with specific paths)
const URL_TO_DESCRIPTION: Record<string, string> = {
  // Statistics endpoints with time periods
  '/v1/statistics/all': 'Returns mempool statistics for all available time.',
  '/v1/statistics/4y': 'Returns mempool statistics for the last 4 years.',
  '/v1/statistics/3y': 'Returns mempool statistics for the last 3 years.',
  '/v1/statistics/2y': 'Returns mempool statistics for the last 2 years.',
  '/v1/statistics/1y': 'Returns mempool statistics for the last year.',
  '/v1/statistics/6m': 'Returns mempool statistics for the last 6 months.',
  '/v1/statistics/3m': 'Returns mempool statistics for the last 3 months.',
  '/v1/statistics/1m': 'Returns mempool statistics for the last month.',
  '/v1/statistics/1w': 'Returns mempool statistics for the last week.',
  '/v1/statistics/24h': 'Returns mempool statistics for the last 24 hours.',
  '/v1/statistics/2h': 'Returns mempool statistics for the last 2 hours.',
  // Blocks endpoints with optional parameters
  '/v1/blocks': 'Returns the 15 most recent blocks.',
  '/v1/blocks/:height': 'Returns 15 blocks starting from the specified height.',
  '/v1/block/:hash/txs': 'Returns the first 25 transactions in a block.',
  '/v1/block/:hash/txs/:index': 'Returns 25 transactions in a block starting from the specified index.',
  '/v1/blocks-bulk/:from': 'Returns blocks in bulk starting from the specified height.',
  '/v1/blocks-bulk/:from/:to': 'Returns blocks in bulk for the specified height range.',
  // Mining endpoints with optional parameters
  '/v1/mining/blocks/audit/scores': 'Returns recent block audit scores.',
  '/v1/mining/blocks/audit/scores/:height': 'Returns block audit scores starting from the specified height.',
  '/v1/mining/difficulty-adjustments': 'Returns all difficulty adjustments.',
  '/v1/mining/difficulty-adjustments/:interval': 'Returns difficulty adjustments for the specified interval.',
  '/v1/mining/pool/:slug/blocks': 'Returns recent blocks mined by a specific pool.',
  '/v1/mining/pool/:slug/blocks/:height': 'Returns blocks mined by a specific pool starting from the specified height.',
  // Lightning endpoints with optional parameters
  '/v1/lightning/channels-geo': 'Returns geographic data for all Lightning channels.',
  '/v1/lightning/channels-geo/:publicKey': 'Returns geographic data for channels of a specific node.',
  // Price endpoint
  '/v1/historical-price': 'Returns historical price data for the specified currency and timestamp.',
  // Services/About endpoints
  '/v1/services/account/images/:username/:md5': 'Returns the profile image for a specific user account.',
  '/v1/services/sponsors': 'Returns a list of project sponsors.',
  '/v1/translators': 'Returns a list of translators who have contributed to the project.',
  '/v1/translators/images/:id': 'Returns the profile image for a specific translator.',
  '/v1/contributors': 'Returns a list of contributors to the project.',
  '/v1/contributors/images/:id': 'Returns the profile image for a specific contributor.',
  '/v1/donations': 'Returns donation information.',
  '/v1/donations/images/:id': 'Returns the image for a specific donation.',
  // Bitcoin Core internal endpoints
  '/v1/internal/bitcoin-core/get-block-count': 'Returns the current block count from Bitcoin Core. Internal endpoint for direct RPC access.',
  '/v1/internal/bitcoin-core/get-block-hash': 'Returns the block hash at a given height from Bitcoin Core. Internal endpoint for direct RPC access.',
  '/v1/internal/bitcoin-core/get-block': 'Returns detailed block data from Bitcoin Core. Internal endpoint for direct RPC access.',
  '/v1/internal/bitcoin-core/get-raw-transaction': 'Returns the raw transaction data from Bitcoin Core. Internal endpoint for direct RPC access.',
  '/v1/internal/bitcoin-core/decode-raw-transaction': 'Decodes a raw transaction hex string using Bitcoin Core. Internal endpoint for direct RPC access.',
  '/v1/internal/bitcoin-core/get-mempool-entry': 'Returns mempool entry data for a transaction from Bitcoin Core. Internal endpoint for direct RPC access.',
  '/v1/internal/bitcoin-core/get-mempool-ancestors': 'Returns mempool ancestor transactions from Bitcoin Core. Internal endpoint for direct RPC access.',
  '/v1/internal/bitcoin-core/send-raw-transaction': 'Broadcasts a raw transaction to the network via Bitcoin Core. Internal endpoint for direct RPC access.',
  '/v1/internal/bitcoin-core/test-mempool-accept': 'Tests if a transaction would be accepted to the mempool without broadcasting. Internal endpoint for direct RPC access.',
};

// Handler to title mapping
const HANDLER_TO_TITLE: Record<string, string> = {
  getRecommendedFees: 'Get Recommended Fees',
  getPreciseRecommendedFees: 'Get Precise Recommended Fees',
  getMempoolBlocks: 'Get Mempool Blocks',
  getMempool: 'Get Mempool',
  getMempoolTxIds: 'Get Mempool Transaction IDs',
  getRecentMempoolTransactions: 'Get Recent Mempool Transactions',
  getTransaction: 'Get Transaction',
  getRawTransaction: 'Get Raw Transaction Hex',
  getTransactionStatus: 'Get Transaction Status',
  getTransactionOutspends: 'Get Transaction Outspends',
  getTransactionMerkleProof: 'Get Transaction Merkle Proof',
  getBlock: 'Get Block',
  getBlockHeader: 'Get Block Header',
  getBlockTipHeight: 'Get Block Tip Height',
  getBlockTipHash: 'Get Block Tip Hash',
  getRawBlock: 'Get Raw Block',
  getTxIdsForBlock: 'Get Block Transaction IDs',
  getBlockTransactions: 'Get Block Transactions',
  getBlockHeight: 'Get Block at Height',
  getBlocks: 'Get Blocks',
  getAddress: 'Get Address',
  getAddressTransactions: 'Get Address Transactions',
  getAddressTransactionSummary: 'Get Address Transaction Summary',
  getAddressUtxo: 'Get Address UTXOs',
  getScriptHash: 'Get Script Hash',
  getScriptHashTransactions: 'Get Script Hash Transactions',
  getScriptHashUtxo: 'Get Script Hash UTXOs',
  validateAddress: 'Validate Address',
  getDifficultyChange: 'Get Difficulty Adjustment',
  getBackendInfo: 'Get Backend Info',
  getInitData: 'Get Init Data',
  getCpfpInfo: 'Get CPFP Info',
  getRbfHistory: 'Get RBF History',
  getRbfReplacements: 'Get RBF Replacements',
  getFullRbfReplacements: 'Get Full RBF Replacements',
  postTransaction: 'Broadcast Transaction',
  postTransactionForm: 'Broadcast Transaction (Form)',
  postPsbtCompletion: 'Complete PSBT',
  getStrippedBlockTransactions: 'Get Block Summary',
  getBlockAuditSummary: 'Get Block Audit Summary',
  getTransactionTimes: 'Get Transaction Times',
  getCachedTx: 'Get Cached Transaction',
  getBlocksByBulk: 'Get Blocks Bulk',
  getChainTips: 'Get Chain Tips',
  getStaleTips: 'Get Stale Tips',
  getPrevouts: 'Get Prevouts',
  getCpfpLocalTxs: 'Get CPFP Local Transactions',
  submitPackage: 'Submit Transaction Package',
};

export class FrontendGenerator {
  private routes: ParsedRoute[] = [];
  private routeFiles: RouteFile[] = [];
  private wsChannel: WebSocketChannel;
  private moduleConditions: ModuleCondition[] = [];

  constructor(
    routeFiles: RouteFile[],
    wsChannel: WebSocketChannel,
    moduleConditions: ModuleCondition[]
  ) {
    this.routeFiles = routeFiles;
    this.wsChannel = wsChannel;
    this.moduleConditions = moduleConditions;

    // Flatten routes
    for (const file of routeFiles) {
      this.routes.push(...file.routes);
      for (const block of file.conditionalBlocks) {
        this.routes.push(...block.routes);
      }
    }
  }

  generate(): { wsApiDocsData: FrontendEndpoint[]; restApiDocsData: FrontendEndpoint[] } {
    const wsApiDocsData = this.generateWebSocketEndpoints();
    const restApiDocsData: FrontendEndpoint[] = [];

    // Generate REST endpoints grouped by category
    const categorizedRoutes = this.categorizeRoutes();

    // Iterate in defined category order
    for (const category of CATEGORY_ORDER) {
      const routes = categorizedRoutes[category];
      const manualEndpoints = MANUAL_ENDPOINTS.filter(e => e.category === category);

      // Skip category if no routes and no manual endpoints
      if ((!routes || routes.length === 0) && manualEndpoints.length === 0) continue;

      // Add category header
      const categoryNetworks = routes && routes.length > 0
        ? this.getCategoryNetworks(routes)
        : [''];  // Default to mainnet only for manual endpoints

      restApiDocsData.push({
        type: 'category',
        category,
        fragment: category,
        title: this.categoryToTitle(category),
        showConditions: categoryNetworks,
      });

      // Convert routes to endpoints
      const endpoints: FrontendEndpoint[] = [];
      if (routes) {
        for (const route of routes) {
          const endpoint = this.routeToEndpoint(route, category);
          if (endpoint) {
            endpoints.push(endpoint);
          }
        }
      }

      // Add manual endpoints for this category
      endpoints.push(...manualEndpoints);

      // Sort endpoints: non-internal first, then internal at the bottom
      endpoints.sort((a, b) => {
        const aIsInternal = a.tags?.includes('INTERNAL') ?? false;
        const bIsInternal = b.tags?.includes('INTERNAL') ?? false;
        if (aIsInternal && !bIsInternal) return 1;
        if (!aIsInternal && bIsInternal) return -1;
        return 0;
      });

      restApiDocsData.push(...endpoints);
    }

    // Add any categories not in CATEGORY_ORDER at the end
    for (const [category, routes] of Object.entries(categorizedRoutes)) {
      if (CATEGORY_ORDER.includes(category)) continue;
      if (!routes || routes.length === 0) continue;

      restApiDocsData.push({
        type: 'category',
        category,
        fragment: category,
        title: this.categoryToTitle(category),
        showConditions: this.getCategoryNetworks(routes),
      });

      const endpoints: FrontendEndpoint[] = [];
      for (const route of routes) {
        const endpoint = this.routeToEndpoint(route, category);
        if (endpoint) {
          endpoints.push(endpoint);
        }
      }

      endpoints.sort((a, b) => {
        const aIsInternal = a.tags?.includes('INTERNAL') ?? false;
        const bIsInternal = b.tags?.includes('INTERNAL') ?? false;
        if (aIsInternal && !bIsInternal) return 1;
        if (!aIsInternal && bIsInternal) return -1;
        return 0;
      });

      restApiDocsData.push(...endpoints);
    }

    return { wsApiDocsData, restApiDocsData };
  }

  private generateWebSocketEndpoints(): FrontendEndpoint[] {
    const endpoints: FrontendEndpoint[] = [];

    // General category for WebSocket
    endpoints.push({
      type: 'category',
      category: 'general',
      fragment: 'general',
      title: 'General',
      showConditions: [...BITCOIN_NETWORKS, ...LIQUID_NETWORKS] as string[],
    });

    // Find the stats subscription to get its example response for live-data
    const statsSub = this.wsChannel.subscriptions.find(s => s.name === 'stats');
    const liveDataResponse = statsSub?.exampleResponse || '';

    // Live data subscription
    endpoints.push({
      type: 'endpoint',
      category: 'general',
      fragment: 'live-data',
      title: 'Live Data',
      description: {
        default: 'Subscribe to live data. Available: <code>blocks</code>, <code>mempool-blocks</code>, <code>live-2h-chart</code>, and <code>stats</code>.',
      },
      payload: '{ "action": "want", "data": ["mempool-blocks", "stats"] }',
      showConditions: [...BITCOIN_NETWORKS, ...LIQUID_NETWORKS] as string[],
      showJsExamples: false,
      codeExample: this.generateWSCodeExample(liveDataResponse),
    });

    // Want subscriptions (blocks, mempool-blocks, etc.)
    for (const sub of this.wsChannel.subscriptions.filter(s => s.type === 'want')) {
      const networks = this.subscriptionToNetworks(sub);
      if (networks.length === 0) continue;

      endpoints.push({
        type: 'endpoint',
        category: 'general',
        fragment: sub.name,
        title: this.formatTitle(sub.name),
        description: { default: sub.description },
        payload: this.formatPayload(sub.payload),
        showConditions: networks as string[],
        showJsExamples: false,
        codeExample: this.generateWSCodeExample(sub.exampleResponse || ''),
      });
    }

    // Track subscriptions
    for (const sub of this.wsChannel.subscriptions.filter(s => s.type === 'track')) {
      const networks = this.subscriptionToNetworks(sub);
      if (networks.length === 0) continue;

      endpoints.push({
        type: 'endpoint',
        category: 'general',
        fragment: sub.name,
        title: this.formatTitle(sub.name),
        description: { default: sub.description },
        payload: this.formatPayload(sub.payload),
        showConditions: networks as string[],
        showJsExamples: false,
        codeExample: this.generateWSCodeExample(sub.exampleResponse || ''),
      });
    }

    return endpoints;
  }

  private generateWSCodeExample(response: string): FrontendEndpoint['codeExample'] {
    const emptySample: CodeSample = {
      esModule: [],
      commonJS: [],
      curl: [],
      response: response,
    };

    return {
      default: {
        codeTemplate: {},
        codeSampleMainnet: { ...emptySample },
        codeSampleTestnet: { ...emptySample },
        codeSampleSignet: { ...emptySample },
        codeSampleLiquid: { ...emptySample },
      },
    };
  }

  private formatPayload(payload: Record<string, string>): string {
    // Format payload as a clean JSON-like string
    const entries = Object.entries(payload);
    if (entries.length === 0) return '{}';

    const parts = entries.map(([key, value]) => {
      // Check if value looks like an array (e.g., '["item1", "item2"]')
      if (value.startsWith('[') && value.endsWith(']')) {
        // Parse and re-format as proper array
        return `"${key}": ${value}`;
      }
      return `"${key}": "${value}"`;
    });
    return `{ ${parts.join(', ')} }`;
  }

  private generateEmptyCodeExample(): FrontendEndpoint['codeExample'] {
    const emptySample: CodeSample = {
      esModule: [],
      commonJS: [],
      curl: [],
      response: '',
    };

    return {
      default: {
        codeTemplate: {},
        codeSampleMainnet: { ...emptySample },
        codeSampleTestnet: { ...emptySample },
        codeSampleSignet: { ...emptySample },
        codeSampleLiquid: { ...emptySample },
      },
    };
  }

  private categorizeRoutes(): Record<string, ParsedRoute[]> {
    const categorized: Record<string, ParsedRoute[]> = {};

    for (const route of this.routes) {
      const category = this.determineCategory(route);

      if (!categorized[category]) {
        categorized[category] = [];
      }

      categorized[category].push(route);
    }

    return categorized;
  }

  private determineCategory(route: ParsedRoute): string {
    const pathLower = route.path.toLowerCase();

    // First check URL_TO_CATEGORY for exact URL match (strip /api prefix)
    const urlWithoutApi = route.path.replace(/^\/api/, '');
    if (URL_TO_CATEGORY[urlWithoutApi]) {
      return URL_TO_CATEGORY[urlWithoutApi];
    }

    // Check path prefixes
    for (const [prefix, category] of Object.entries(PATH_TO_CATEGORY)) {
      if (pathLower.startsWith(prefix.toLowerCase())) {
        return category;
      }
    }

    // Determine from source file
    const sourceFile = path.basename(route.sourceFile).toLowerCase();
    if (sourceFile.includes('liquid')) return 'assets';
    if (sourceFile.includes('lightning') || sourceFile.includes('nodes') || sourceFile.includes('channels')) return 'lightning';
    if (sourceFile.includes('mining')) return 'mining';
    if (sourceFile.includes('acceleration')) return 'accelerator-public';
    if (sourceFile.includes('statistics')) return 'statistics';

    return 'general';
  }

  private routeToEndpoint(route: ParsedRoute, category: string): FrontendEndpoint | null {
    const flags = this.getRouteFeatureFlags(route);
    const networks = flagsToNetworks(flags);

    if (networks.length === 0) {
      return null;
    }

    const fragment = this.generateFragment(route);
    const title = this.generateTitle(route);
    const urlString = this.convertPathToDisplay(route.path);
    const description = this.generateDescription(route);
    const codeExample = this.generateCodeExample(route, urlString, networks);
    const tags = this.generateTags(route);

    const endpoint: FrontendEndpoint = {
      type: 'endpoint',
      category,
      fragment,
      title,
      description: { default: description },
      httpRequestMethod: route.method.toUpperCase() as 'GET' | 'POST',
      urlString,
      showConditions: networks as string[],
      showJsExamples: this.getShowJsExamples(networks),
      codeExample,
    };

    // Add tags only if there are any
    if (tags.length > 0) {
      endpoint.tags = tags;
    }

    return endpoint;
  }

  private generateTags(route: ParsedRoute): string[] {
    const tags: string[] = [];

    // Check if the route path contains /internal/
    if (route.path.includes('/internal/')) {
      tags.push('INTERNAL');
    }

    return tags;
  }

  private generateDescription(route: ParsedRoute): string {
    // Check URL mapping first (takes precedence for specific paths like statistics)
    const displayPath = this.convertPathToDisplay(route.path);
    if (URL_TO_DESCRIPTION[displayPath]) {
      return URL_TO_DESCRIPTION[displayPath];
    }

    // For unknown handlers or middleware names, generate from URL path
    const badHandlers = ['unknown', 'disableCache', 'disableCacheAndLog', 'logAccess'];
    if (badHandlers.includes(route.handler)) {
      // Generate description from URL path as fallback
      return this.generateDescriptionFromPath(route.path, route.method);
    }

    // Generate description from handler name
    const handler = route.handler.startsWith('$') ? route.handler.slice(1) : route.handler;

    // Convert camelCase to readable text
    const readable = handler
      .replace(/^(get|post|put|delete)/i, '')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .toLowerCase();

    const method = route.method.toUpperCase();
    if (method === 'GET') {
      return `Returns ${readable}.`;
    } else if (method === 'POST') {
      return `${readable.charAt(0).toUpperCase() + readable.slice(1)}.`;
    }

    return `${method} ${readable}.`;
  }

  private generateDescriptionFromPath(routePath: string, method: string): string {
    // Extract meaningful parts from the URL path
    const parts = routePath.split('/').filter(p => p && !p.startsWith(':') && !p.startsWith('{') && p !== 'api' && p !== 'v1');

    if (parts.length === 0) {
      return 'API endpoint.';
    }

    // Convert path parts to readable description
    const lastPart = parts[parts.length - 1];
    const words = lastPart.split('-').map(word => word.toLowerCase()).join(' ');

    const verb = method.toUpperCase() === 'GET' ? 'Returns' :
                 method.toUpperCase() === 'POST' ? 'Submits' :
                 method.toUpperCase() === 'PUT' ? 'Updates' :
                 method.toUpperCase() === 'DELETE' ? 'Deletes' : 'Handles';

    return `${verb} ${words} data.`;
  }

  private generateCodeExample(route: ParsedRoute, urlString: string, networks: NetworkId[]): FrontendEndpoint['codeExample'] {
    // urlString has /api stripped for display, but curl links need /api prefix
    const curlPath = `/api${urlString}`;
    const method = route.method.toUpperCase();

    // Get sample values for this endpoint
    const sampleValues = SAMPLE_VALUES[urlString] || {};
    const hasSampleValues = Object.keys(sampleValues).length > 0 &&
      Object.values(sampleValues).some(arr => arr.length > 0);

    // Only convert URL parameters to placeholders if we have sample values
    let finalCurlTemplate: string;

    if (hasSampleValues) {
      // Convert URL parameters (:param) to placeholders (%{1}, %{2}, etc.)
      let placeholderIndex = 0;
      const curlTemplate = curlPath.replace(/:([a-zA-Z0-9_]+)/g, () => {
        placeholderIndex++;
        return `%{${placeholderIndex}}`;
      });

      if (method === 'POST') {
        // POST format: data first, then URL with hostname placeholder
        finalCurlTemplate = `%{1}" "[[hostname]][[baseNetworkUrl]]${curlTemplate.replace('%{1}', '').replace(/\/$/, '')}`;
      } else {
        finalCurlTemplate = curlTemplate;
      }
    } else {
      // No sample values - keep original path format (no placeholders)
      finalCurlTemplate = curlPath;
    }

    // Helper to create code sample with curl values
    const createCodeSample = (network: string): CodeSample => {
      const values = sampleValues[network] || [];
      return {
        esModule: values,
        commonJS: values,
        curl: values,
        response: '',
      };
    };

    return {
      default: {
        codeTemplate: {
          curl: finalCurlTemplate,
          commonJS: '',
          esModule: '',
        },
        codeSampleMainnet: createCodeSample('mainnet'),
        codeSampleTestnet: createCodeSample('testnet'),
        codeSampleSignet: createCodeSample('signet'),
        codeSampleLiquid: createCodeSample('liquid'),
      },
    };
  }

  private getRouteFeatureFlags(route: ParsedRoute): string[] {
    const flags: string[] = [];

    // Check route-level condition
    if (route.condition) {
      flags.push(...conditionToFlags(route.condition));
    }

    // Check module-level condition
    const sourceFile = path.basename(route.sourceFile);
    const moduleToFile: Record<string, string> = {
      liquidRoutes: 'liquid.routes.ts',
      miningRoutes: 'mining-routes.ts',
      statisticsRoutes: 'statistics.routes.ts',
      accelerationRoutes: 'acceleration.routes.ts',
      servicesRoutes: 'services-routes.ts',
      bitcoinCoreRoutes: 'bitcoin-core.routes.ts',
      nodesRoutes: 'nodes.routes.ts',
      channelsRoutes: 'channels.routes.ts',
      generalLightningRoutes: 'general.routes.ts',
    };

    for (const moduleCond of this.moduleConditions) {
      const expectedFile = moduleToFile[moduleCond.moduleName];
      if (expectedFile && sourceFile === expectedFile && moduleCond.condition !== 'always') {
        flags.push(...conditionToFlags(moduleCond.condition));
      }
    }

    return [...new Set(flags)];
  }

  private generateFragment(route: ParsedRoute): string {
    // Convert handler name to fragment
    let fragment = route.handler;

    // Remove prefixes
    if (fragment.startsWith('$')) fragment = fragment.slice(1);
    if (fragment.startsWith('get')) fragment = fragment.slice(3);
    if (fragment.startsWith('post')) fragment = fragment.slice(4);

    // Convert camelCase to kebab-case
    fragment = fragment.replace(/([A-Z])/g, '-$1').toLowerCase();
    if (fragment.startsWith('-')) fragment = fragment.slice(1);

    return fragment;
  }

  private generateTitle(route: ParsedRoute): string {
    // Check URL mapping first (takes precedence for specific paths like statistics)
    const displayPath = this.convertPathToDisplay(route.path);
    if (URL_TO_TITLE[displayPath]) {
      return URL_TO_TITLE[displayPath];
    }

    // Check handler mapping
    if (HANDLER_TO_TITLE[route.handler]) {
      return HANDLER_TO_TITLE[route.handler];
    }

    // For unknown handlers or middleware names, generate from URL path
    const badHandlers = ['unknown', 'disableCache', 'disableCacheAndLog', 'logAccess'];
    if (badHandlers.includes(route.handler)) {
      // Generate title from URL path as fallback
      return this.generateTitleFromPath(route.path, route.method);
    }

    // Generate from handler name
    let title = route.handler;
    if (title.startsWith('$')) title = title.slice(1);

    // Convert camelCase to Title Case
    title = title.replace(/([A-Z])/g, ' $1').trim();
    title = title.charAt(0).toUpperCase() + title.slice(1);

    // Prepend HTTP method
    const method = route.method.toUpperCase();
    return `${method} ${title}`;
  }

  private generateTitleFromPath(routePath: string, method: string): string {
    // Extract meaningful parts from the URL path
    // e.g., /api/v1/services/sponsors -> "Get Sponsors"
    const parts = routePath.split('/').filter(p => p && !p.startsWith(':') && !p.startsWith('{') && p !== 'api' && p !== 'v1');

    if (parts.length === 0) {
      return `${method.toUpperCase()} Endpoint`;
    }

    // Convert last meaningful segment to title
    const lastPart = parts[parts.length - 1];

    // Convert kebab-case to Title Case
    const words = lastPart.split('-').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    );

    const title = words.join(' ');

    // Add appropriate verb based on method
    const verb = method.toUpperCase() === 'GET' ? 'Get' :
                 method.toUpperCase() === 'POST' ? 'Submit' :
                 method.toUpperCase() === 'PUT' ? 'Update' :
                 method.toUpperCase() === 'DELETE' ? 'Delete' : method.toUpperCase();

    return `${verb} ${title}`;
  }

  private convertPathToDisplay(routePath: string): string {
    // Convert {param} to :param format for display
    let path = routePath.replace(/\{([^}]+)\}/g, ':$1');
    // Strip /api prefix since the template adds it
    if (path.startsWith('/api/')) {
      path = path.slice(4); // Remove '/api' prefix, keeping the rest
    }
    return path;
  }

  private categoryToTitle(category: string): string {
    const titles: Record<string, string> = {
      general: 'General',
      transactions: 'Transactions',
      addresses: 'Addresses',
      blocks: 'Blocks',
      mempool: 'Mempool',
      fees: 'Fees',
      mining: 'Mining',
      lightning: 'Lightning',
      assets: 'Assets',
      statistics: 'Statistics',
      'accelerator-public': 'Accelerator (Public)',
      'accelerator-private': 'Accelerator (Authenticated)',
    };

    return titles[category] || category.charAt(0).toUpperCase() + category.slice(1);
  }

  private getCategoryNetworks(routes: ParsedRoute[]): string[] {
    const allNetworks = new Set<string>();

    for (const route of routes) {
      const flags = this.getRouteFeatureFlags(route);
      const networks = flagsToNetworks(flags);
      for (const network of networks) {
        allNetworks.add(network);
      }
    }

    return Array.from(allNetworks);
  }

  private subscriptionToNetworks(sub: WebSocketSubscription): NetworkId[] {
    if (!sub.condition) {
      return ALL_NETWORKS;
    }

    const flags = conditionToFlags(sub.condition);
    return flagsToNetworks(flags);
  }

  private formatTitle(name: string): string {
    // Convert track-tx to Track Transaction
    return name
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private getShowJsExamples(networks: NetworkId[]): Record<string, boolean> {
    const result: Record<string, boolean> = {
      '': networks.includes(''),
      'testnet': networks.includes('testnet'),
      'signet': networks.includes('signet'),
      'liquid': networks.includes('liquid'),
      'liquidtestnet': false, // Usually false in the original
    };

    return result;
  }

  async writeOutput(outputPath: string): Promise<void> {
    const { wsApiDocsData, restApiDocsData } = this.generate();

    const content = `// AUTO-GENERATED FILE - DO NOT EDIT
// Generated by api-spec-generator
// Run 'npm run generate:frontend' in tools/api-spec-generator to regenerate

const bitcoinNetworks = ['', 'testnet', 'testnet4', 'signet'];
const liquidNetworks = ['liquid', 'liquidtestnet'];
const lightningNetworks = ['', 'testnet', 'signet'];

const showJsExamplesDefault = { '': true, 'testnet': true, 'signet': true, 'liquid': true, 'liquidtestnet': false };
const showJsExamplesDefaultFalse = { '': false, 'testnet': false, 'signet': false, 'liquid': false, 'liquidtestnet': false };

export const wsApiDocsData = ${JSON.stringify(wsApiDocsData, null, 2)};

export const restApiDocsData = ${JSON.stringify(restApiDocsData, null, 2)};

// FAQ and Electrum data are manually maintained
// Import them from the original api-docs-data.ts if needed
export const faqData: any[] = [];
export const electrumApiDocsData: any[] = [];
`;

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, content, 'utf-8');
  }
}

export async function generateFrontendData(
  routeFiles: RouteFile[],
  wsChannel: WebSocketChannel,
  moduleConditions: ModuleCondition[],
  outputDir: string
): Promise<void> {
  const generator = new FrontendGenerator(routeFiles, wsChannel, moduleConditions);
  await generator.writeOutput(path.join(outputDir, 'api-docs-data.generated.ts'));
  console.log('Frontend data generated successfully');
}
