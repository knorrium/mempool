import * as YAML from 'yaml';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ParsedRoute } from '../parsers/ast-utils.js';
import { RouteFile } from '../parsers/route-parser.js';
import { ParsedInterface, ParsedTypeAlias } from '../parsers/interface-parser.js';
import { ModuleCondition } from '../parsers/condition-parser.js';
import { JSONSchema, convertInterfaces, COMMON_SCHEMAS } from './schema-converter.js';
import {
  NetworkId,
  FEATURE_FLAGS,
  conditionToFlags,
  flagsToNetworks,
  getServerUrls,
  ALL_NETWORKS,
  BITCOIN_NETWORKS,
  LIQUID_NETWORKS,
} from '../config/feature-flags.js';

export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    description: string;
    version: string;
    contact?: { name: string; url: string };
    license?: { name: string; url: string };
  };
  servers: { url: string; description: string }[];
  tags: { name: string; description: string }[];
  paths: Record<string, PathItem>;
  components: {
    schemas: Record<string, JSONSchema>;
    parameters?: Record<string, ParameterObject>;
    responses?: Record<string, ResponseObject>;
  };
}

export interface PathItem {
  get?: OperationObject;
  post?: OperationObject;
  put?: OperationObject;
  delete?: OperationObject;
  patch?: OperationObject;
}

export interface OperationObject {
  operationId: string;
  summary: string;
  description?: string;
  tags: string[];
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses: Record<string, ResponseObject>;
  servers?: { url: string; description: string }[];
  'x-feature-requirements'?: string[];
  'x-networks'?: string[];
}

export interface ParameterObject {
  name: string;
  in: 'path' | 'query' | 'header';
  required: boolean;
  description?: string;
  schema: JSONSchema;
}

export interface RequestBodyObject {
  required: boolean;
  content: {
    'application/json'?: { schema: JSONSchema };
    'text/plain'?: { schema: JSONSchema };
  };
}

export interface ResponseObject {
  description: string;
  content?: {
    'application/json'?: { schema: JSONSchema };
    'text/plain'?: { schema: JSONSchema };
  };
}

// Route categorization for tags
const ROUTE_CATEGORIES: Record<string, { tag: string; description: string }> = {
  'transaction': { tag: 'Transactions', description: 'Transaction-related endpoints' },
  'tx': { tag: 'Transactions', description: 'Transaction-related endpoints' },
  'address': { tag: 'Addresses', description: 'Address-related endpoints' },
  'scripthash': { tag: 'Addresses', description: 'Address-related endpoints' },
  'block': { tag: 'Blocks', description: 'Block-related endpoints' },
  'mempool': { tag: 'Mempool', description: 'Mempool-related endpoints' },
  'fees': { tag: 'Fees', description: 'Fee estimation endpoints' },
  'mining': { tag: 'Mining', description: 'Mining statistics endpoints' },
  'pool': { tag: 'Mining', description: 'Mining pool endpoints' },
  'difficulty': { tag: 'Mining', description: 'Difficulty adjustment endpoints' },
  'lightning': { tag: 'Lightning', description: 'Lightning network endpoints' },
  'node': { tag: 'Lightning', description: 'Lightning node endpoints' },
  'channel': { tag: 'Lightning', description: 'Lightning channel endpoints' },
  'liquid': { tag: 'Liquid', description: 'Liquid network endpoints' },
  'asset': { tag: 'Liquid', description: 'Liquid asset endpoints' },
  'price': { tag: 'Prices', description: 'Price and conversion endpoints' },
  'statistic': { tag: 'Statistics', description: 'Statistics endpoints' },
  'acceleration': { tag: 'Accelerations', description: 'Transaction acceleration endpoints' },
  'cpfp': { tag: 'Transactions', description: 'CPFP-related endpoints' },
  'rbf': { tag: 'Transactions', description: 'RBF-related endpoints' },
  'psbt': { tag: 'Transactions', description: 'PSBT-related endpoints' },
  'backend': { tag: 'General', description: 'General API endpoints' },
  'init': { tag: 'General', description: 'General API endpoints' },
  'validate': { tag: 'Addresses', description: 'Address validation endpoints' },
};

// Known parameter schemas
const PARAMETER_SCHEMAS: Record<string, { description: string; schema: JSONSchema }> = {
  txId: { description: 'Transaction ID (64 hex characters)', schema: { type: 'string', pattern: '^[a-fA-F0-9]{64}$' } },
  txid: { description: 'Transaction ID (64 hex characters)', schema: { type: 'string', pattern: '^[a-fA-F0-9]{64}$' } },
  hash: { description: 'Block hash (64 hex characters)', schema: { type: 'string', pattern: '^[a-fA-F0-9]{64}$' } },
  height: { description: 'Block height', schema: { type: 'integer', minimum: 0 } },
  address: { description: 'Bitcoin address', schema: { type: 'string' } },
  scripthash: { description: 'Script hash (hex)', schema: { type: 'string', pattern: '^[a-fA-F0-9]+$' } },
  prefix: { description: 'Address prefix for search', schema: { type: 'string' } },
  index: { description: 'Index (pagination)', schema: { type: 'integer', minimum: 0 } },
  from: { description: 'Start block height', schema: { type: 'integer', minimum: 0 } },
  to: { description: 'End block height', schema: { type: 'integer', minimum: 0 } },
  interval: { description: 'Time interval', schema: { type: 'string', enum: ['24h', '3d', '1w', '1m', '3m', '6m', '1y', '2y', '3y'] } },
  slug: { description: 'Mining pool slug', schema: { type: 'string' } },
  pubkey: { description: 'Lightning node public key', schema: { type: 'string', pattern: '^[a-fA-F0-9]{66}$' } },
  channelId: { description: 'Lightning channel ID', schema: { type: 'string' } },
  definitionHash: { description: 'Block definition hash', schema: { type: 'string' } },
};

export class OpenAPIGenerator {
  private routes: ParsedRoute[] = [];
  private routeFiles: RouteFile[] = [];
  private interfaces: ParsedInterface[] = [];
  private typeAliases: ParsedTypeAlias[] = [];
  private moduleConditions: ModuleCondition[] = [];
  private schemas: Record<string, JSONSchema> = {};

  constructor(
    routeFiles: RouteFile[],
    interfaces: ParsedInterface[],
    typeAliases: ParsedTypeAlias[],
    moduleConditions: ModuleCondition[]
  ) {
    this.routeFiles = routeFiles;
    this.interfaces = interfaces;
    this.typeAliases = typeAliases;
    this.moduleConditions = moduleConditions;

    // Flatten all routes
    for (const file of routeFiles) {
      this.routes.push(...file.routes);
      for (const block of file.conditionalBlocks) {
        this.routes.push(...block.routes);
      }
    }

    // Convert interfaces to schemas
    this.schemas = convertInterfaces(interfaces, typeAliases);
  }

  generate(): OpenAPISpec {
    const paths = this.generatePaths();
    const tags = this.generateTags();

    return {
      openapi: '3.1.0',
      info: {
        title: 'Mempool API',
        description: 'API for the Mempool open-source block explorer. Provides access to Bitcoin blockchain data, mempool information, and network statistics.',
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
      servers: getServerUrls(ALL_NETWORKS),
      tags,
      paths,
      components: {
        schemas: this.schemas,
        parameters: this.generateCommonParameters(),
      },
    };
  }

  generateVariant(networkFilter: NetworkId[]): OpenAPISpec {
    const spec = this.generate();

    // Filter paths based on network
    const filteredPaths: Record<string, PathItem> = {};

    for (const [path, pathItem] of Object.entries(spec.paths)) {
      const filteredPathItem: PathItem = {};
      let hasOperations = false;

      for (const [method, operation] of Object.entries(pathItem)) {
        const op = operation as OperationObject;
        const opNetworks = op['x-networks'] || ALL_NETWORKS;

        // Check if operation is available on any of the filtered networks
        const available = networkFilter.some(n => opNetworks.includes(n));
        if (available) {
          (filteredPathItem as Record<string, OperationObject>)[method] = op;
          hasOperations = true;
        }
      }

      if (hasOperations) {
        filteredPaths[path] = filteredPathItem;
      }
    }

    return {
      ...spec,
      servers: getServerUrls(networkFilter),
      paths: filteredPaths,
    };
  }

  private generatePaths(): Record<string, PathItem> {
    const paths: Record<string, PathItem> = {};

    for (const route of this.routes) {
      // Strip /api prefix since server URLs already include it
      let pathKey = route.path;
      if (pathKey.startsWith('/api/')) {
        pathKey = pathKey.slice(4); // Remove '/api' prefix, keep the rest starting with '/'
      }

      if (!paths[pathKey]) {
        paths[pathKey] = {};
      }

      const operation = this.generateOperation(route);
      (paths[pathKey] as Record<string, OperationObject>)[route.method] = operation;
    }

    return paths;
  }

  private generateOperation(route: ParsedRoute): OperationObject {
    const operationId = this.generateOperationId(route);
    const summary = this.generateSummary(route);
    const tags = this.determineTags(route);
    const parameters = this.extractParameters(route);
    const featureFlags = this.determineFeatureFlags(route);
    const networks = flagsToNetworks(featureFlags);

    const operation: OperationObject = {
      operationId,
      summary,
      tags,
      responses: this.generateResponses(route),
    };

    if (parameters.length > 0) {
      operation.parameters = parameters;
    }

    if (route.method === 'post') {
      operation.requestBody = this.generateRequestBody(route);
    }

    if (featureFlags.length > 0) {
      operation['x-feature-requirements'] = featureFlags;
    }

    operation['x-networks'] = networks;

    // Add operation-level servers to ensure correct server URLs per operation
    operation.servers = getServerUrls(networks);

    return operation;
  }

  private generateOperationId(route: ParsedRoute): string {
    // Convert handler name to operationId
    let id = route.handler;

    // Remove common prefixes
    if (id.startsWith('$')) {
      id = id.slice(1);
    }
    if (id.startsWith('get') || id.startsWith('post')) {
      id = id.charAt(0).toLowerCase() + id.slice(1);
    }

    return id;
  }

  private generateSummary(route: ParsedRoute): string {
    // Generate human-readable summary from handler name and path
    const method = route.method.toUpperCase();
    let name = route.handler;

    // Remove prefixes
    if (name.startsWith('$')) name = name.slice(1);
    if (name.startsWith('get')) name = name.slice(3);
    if (name.startsWith('post')) name = name.slice(4);

    // Convert camelCase to Title Case
    name = name.replace(/([A-Z])/g, ' $1').trim();
    name = name.charAt(0).toUpperCase() + name.slice(1);

    return `${method} ${name}`;
  }

  private determineTags(route: ParsedRoute): string[] {
    const routePath = route.path.toLowerCase();
    const tags: string[] = [];

    for (const [keyword, category] of Object.entries(ROUTE_CATEGORIES)) {
      if (routePath.includes(keyword)) {
        if (!tags.includes(category.tag)) {
          tags.push(category.tag);
        }
      }
    }

    // Determine from source file
    const sourceFile = path.basename(route.sourceFile);
    if (sourceFile.includes('liquid')) tags.push('Liquid');
    if (sourceFile.includes('lightning') || sourceFile.includes('nodes') || sourceFile.includes('channels')) {
      if (!tags.includes('Lightning')) tags.push('Lightning');
    }
    if (sourceFile.includes('mining')) {
      if (!tags.includes('Mining')) tags.push('Mining');
    }
    if (sourceFile.includes('acceleration')) {
      if (!tags.includes('Accelerations')) tags.push('Accelerations');
    }

    if (tags.length === 0) {
      tags.push('General');
    }

    return tags;
  }

  private extractParameters(route: ParsedRoute): ParameterObject[] {
    const params: ParameterObject[] = [];

    // Extract path parameters from {param} syntax
    const pathParamRegex = /\{([^}]+)\}/g;
    let match;
    while ((match = pathParamRegex.exec(route.path)) !== null) {
      const paramName = match[1];
      const paramInfo = PARAMETER_SCHEMAS[paramName] || {
        description: `The ${paramName} parameter`,
        schema: { type: 'string' },
      };

      params.push({
        name: paramName,
        in: 'path',
        required: true,
        description: paramInfo.description,
        schema: paramInfo.schema,
      });
    }

    return params;
  }

  private generateResponses(route: ParsedRoute): Record<string, ResponseObject> {
    return {
      '200': {
        description: 'Successful response',
        content: {
          'application/json': {
            schema: this.inferResponseSchema(route),
          },
        },
      },
      '400': {
        description: 'Bad request',
      },
      '404': {
        description: 'Resource not found',
      },
      '503': {
        description: 'Service unavailable (syncing)',
      },
    };
  }

  private inferResponseSchema(route: ParsedRoute): JSONSchema {
    const handler = route.handler.toLowerCase();
    const pathLower = route.path.toLowerCase();

    // Match handler patterns to response schemas
    if (handler.includes('transaction') || handler.includes('tx')) {
      if (pathLower.includes('/txs') || handler.includes('transactions')) {
        return { type: 'array', items: { $ref: '#/components/schemas/TransactionExtended' } };
      }
      return { $ref: '#/components/schemas/TransactionExtended' };
    }

    if (handler.includes('block') && !handler.includes('mempool')) {
      if (pathLower.includes('/blocks') && !pathLower.includes('{')) {
        return { type: 'array', items: { $ref: '#/components/schemas/BlockExtended' } };
      }
      return { $ref: '#/components/schemas/BlockExtended' };
    }

    if (handler.includes('mempoolblock') || pathLower.includes('mempool-blocks')) {
      return { type: 'array', items: { $ref: '#/components/schemas/MempoolBlock' } };
    }

    if (handler.includes('address') || pathLower.includes('/address/')) {
      if (handler.includes('utxo')) {
        return { type: 'array', items: { $ref: '#/components/schemas/EsploraUTXO' } };
      }
      if (handler.includes('transactions') || pathLower.includes('/txs')) {
        return { type: 'array', items: { $ref: '#/components/schemas/TransactionExtended' } };
      }
      return { $ref: '#/components/schemas/EsploraAddress' };
    }

    if (handler.includes('fee') || pathLower.includes('/fees/')) {
      return { $ref: '#/components/schemas/RecommendedFees' };
    }

    if (handler.includes('difficulty') || pathLower.includes('difficulty-adjustment')) {
      return { $ref: '#/components/schemas/DifficultyAdjustment' };
    }

    if (handler.includes('mempool') && handler.includes('info')) {
      return { $ref: '#/components/schemas/MempoolInfo' };
    }

    if (handler.includes('cpfp')) {
      return { $ref: '#/components/schemas/CpfpInfo' };
    }

    if (handler.includes('backendinfo') || pathLower.includes('backend-info')) {
      return { $ref: '#/components/schemas/BackendInfo' };
    }

    if (handler.includes('height') && pathLower.includes('tip')) {
      return { type: 'integer' };
    }

    if (handler.includes('hash') && pathLower.includes('tip')) {
      return { type: 'string' };
    }

    // Default to generic object
    return { type: 'object' };
  }

  private generateRequestBody(route: ParsedRoute): RequestBodyObject {
    const handler = route.handler.toLowerCase();

    if (handler.includes('transaction') || route.path.includes('/tx')) {
      return {
        required: true,
        content: {
          'text/plain': {
            schema: { type: 'string', description: 'Raw transaction hex' },
          },
        },
      };
    }

    if (handler.includes('psbt')) {
      return {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                psbt: { type: 'string', description: 'Base64-encoded PSBT' },
              },
              required: ['psbt'],
            },
          },
        },
      };
    }

    return {
      required: true,
      content: {
        'application/json': {
          schema: { type: 'object' },
        },
      },
    };
  }

  private determineFeatureFlags(route: ParsedRoute): string[] {
    const flags: string[] = [];

    // Check route-level condition
    if (route.condition) {
      flags.push(...conditionToFlags(route.condition));
    }

    // Check module-level condition based on source file
    const sourceFile = path.basename(route.sourceFile);
    for (const moduleCond of this.moduleConditions) {
      // Map module name to file name
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

      const expectedFile = moduleToFile[moduleCond.moduleName];
      if (expectedFile && sourceFile === expectedFile && moduleCond.condition !== 'always') {
        flags.push(...conditionToFlags(moduleCond.condition));
      }
    }

    return [...new Set(flags)];
  }

  private generateTags(): { name: string; description: string }[] {
    const tagSet = new Set<string>();

    for (const route of this.routes) {
      const tags = this.determineTags(route);
      for (const tag of tags) {
        tagSet.add(tag);
      }
    }

    const tagDescriptions: Record<string, string> = {
      'General': 'General API endpoints',
      'Transactions': 'Transaction-related endpoints',
      'Addresses': 'Address-related endpoints',
      'Blocks': 'Block-related endpoints',
      'Mempool': 'Mempool-related endpoints',
      'Fees': 'Fee estimation endpoints',
      'Mining': 'Mining statistics and pool endpoints',
      'Lightning': 'Lightning network endpoints',
      'Liquid': 'Liquid network endpoints',
      'Prices': 'Price and conversion endpoints',
      'Statistics': 'Historical statistics endpoints',
      'Accelerations': 'Transaction acceleration endpoints',
    };

    return Array.from(tagSet).sort().map(name => ({
      name,
      description: tagDescriptions[name] || `${name} endpoints`,
    }));
  }

  private generateCommonParameters(): Record<string, ParameterObject> {
    const params: Record<string, ParameterObject> = {};

    for (const [name, info] of Object.entries(PARAMETER_SCHEMAS)) {
      params[name] = {
        name,
        in: 'path',
        required: true,
        description: info.description,
        schema: info.schema,
      };
    }

    return params;
  }

  async writeSpec(outputPath: string, format: 'yaml' | 'json' = 'yaml'): Promise<void> {
    const spec = this.generate();
    const content = format === 'yaml' ? YAML.stringify(spec) : JSON.stringify(spec, null, 2);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, content, 'utf-8');
  }

  async writeVariant(
    outputPath: string,
    networks: NetworkId[],
    format: 'yaml' | 'json' = 'yaml'
  ): Promise<void> {
    const spec = this.generateVariant(networks);
    const content = format === 'yaml' ? YAML.stringify(spec) : JSON.stringify(spec, null, 2);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, content, 'utf-8');
  }
}

export async function generateOpenAPI(
  routeFiles: RouteFile[],
  interfaces: ParsedInterface[],
  typeAliases: ParsedTypeAlias[],
  moduleConditions: ModuleCondition[],
  outputDir: string
): Promise<void> {
  const generator = new OpenAPIGenerator(routeFiles, interfaces, typeAliases, moduleConditions);

  // Write main spec
  await generator.writeSpec(path.join(outputDir, 'mempool-api.yaml'));

  // Write variants
  await generator.writeVariant(
    path.join(outputDir, 'variants', 'mainnet-full.yaml'),
    ['']
  );
  await generator.writeVariant(
    path.join(outputDir, 'variants', 'bitcoin-networks.yaml'),
    BITCOIN_NETWORKS
  );
  await generator.writeVariant(
    path.join(outputDir, 'variants', 'liquid.yaml'),
    LIQUID_NETWORKS
  );

  console.log('OpenAPI specs generated successfully');
}
