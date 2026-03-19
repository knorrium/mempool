import { ParsedInterface, ParsedProperty, ParsedTypeAlias } from '../parsers/interface-parser.js';

export interface JSONSchema {
  type?: string | string[];
  $ref?: string;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  additionalProperties?: boolean | JSONSchema;
  enum?: (string | number | boolean)[];
  const?: string | number | boolean;
  description?: string;
  format?: string;
  nullable?: boolean;
  oneOf?: JSONSchema[];
  allOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  default?: unknown;
  example?: unknown;
}

export interface SchemaConversionResult {
  schemas: Record<string, JSONSchema>;
  refs: Set<string>;
}

export class SchemaConverter {
  private schemas: Map<string, JSONSchema> = new Map();
  private interfaces: Map<string, ParsedInterface> = new Map();
  private typeAliases: Map<string, ParsedTypeAlias> = new Map();
  private conversionDepth: number = 0;
  private maxConversionDepth: number = 10;

  constructor(interfaces: ParsedInterface[], typeAliases: ParsedTypeAlias[]) {
    for (const iface of interfaces) {
      this.interfaces.set(iface.name, iface);
    }
    for (const alias of typeAliases) {
      this.typeAliases.set(alias.name, alias);
    }
  }

  convertAll(): Record<string, JSONSchema> {
    for (const iface of this.interfaces.values()) {
      this.convertInterface(iface);
    }

    return Object.fromEntries(this.schemas);
  }

  convertInterface(iface: ParsedInterface): JSONSchema {
    const schemaName = this.normalizeSchemaName(iface.name);

    // Check if already converted
    if (this.schemas.has(schemaName)) {
      return this.schemas.get(schemaName)!;
    }

    const schema: JSONSchema = {
      type: 'object',
      properties: {},
      required: [],
    };

    if (iface.description) {
      schema.description = iface.description;
    }

    // Handle extends - use allOf
    if (iface.extends && iface.extends.length > 0) {
      const allOf: JSONSchema[] = [];

      for (const extName of iface.extends) {
        const normalizedExtName = this.normalizeSchemaName(extName);
        allOf.push({ $ref: `#/components/schemas/${normalizedExtName}` });
      }

      // Add the current interface's properties
      if (Object.keys(iface.properties).length > 0) {
        const ownProps: JSONSchema = {
          type: 'object',
          properties: {},
          required: [],
        };

        for (const prop of iface.properties) {
          ownProps.properties![prop.name] = this.convertProperty(prop);
          if (!prop.optional) {
            (ownProps.required as string[]).push(prop.name);
          }
        }

        if ((ownProps.required as string[]).length === 0) {
          delete ownProps.required;
        }

        allOf.push(ownProps);
      }

      const extendedSchema: JSONSchema = { allOf };
      this.schemas.set(schemaName, extendedSchema);
      return extendedSchema;
    }

    // Convert properties
    for (const prop of iface.properties) {
      schema.properties![prop.name] = this.convertProperty(prop);
      if (!prop.optional) {
        (schema.required as string[]).push(prop.name);
      }
    }

    // Remove empty required array
    if ((schema.required as string[]).length === 0) {
      delete schema.required;
    }

    this.schemas.set(schemaName, schema);
    return schema;
  }

  convertProperty(prop: ParsedProperty): JSONSchema {
    return this.convertType(prop.type, prop.description);
  }

  convertType(typeStr: string, description?: string): JSONSchema {
    // Guard against infinite recursion
    this.conversionDepth++;
    if (this.conversionDepth > this.maxConversionDepth) {
      this.conversionDepth--;
      return { type: 'object', description: 'Complex nested type' };
    }

    try {
      const trimmed = typeStr.trim();
      let schema: JSONSchema = {};

      // Handle primitive types
      if (trimmed === 'string') {
        schema = { type: 'string' };
      } else if (trimmed === 'number' || trimmed === 'bigint') {
        schema = { type: 'number' };
      } else if (trimmed === 'boolean') {
        schema = { type: 'boolean' };
      } else if (trimmed === 'any' || trimmed === 'unknown' || trimmed === 'void' || trimmed === 'never') {
        schema = {};
      } else if (trimmed === 'null') {
        schema = { type: 'string', nullable: true };
      } else if (trimmed === 'undefined') {
        schema = {};
      }
      // Handle array types
      else if (trimmed.endsWith('[]') && !trimmed.includes('|') && !trimmed.includes('(')) {
        const itemType = trimmed.slice(0, -2);
        schema = {
          type: 'array',
          items: this.convertType(itemType),
        };
      }
      // Handle Array<T> syntax
      else if (trimmed.startsWith('Array<') && trimmed.endsWith('>')) {
        const itemType = trimmed.slice(6, -1);
        schema = {
          type: 'array',
          items: this.convertType(itemType),
        };
      }
      // Handle Record<K, V> / { [key: string]: V }
      else if (trimmed.startsWith('Record<') && trimmed.endsWith('>')) {
        const inner = trimmed.slice(7, -1);
        const parts = this.splitGenericArgs(inner);
        if (parts.length === 2) {
          schema = {
            type: 'object',
            additionalProperties: this.convertType(parts[1]),
          };
        } else {
          schema = { type: 'object', additionalProperties: true };
        }
      }
      // Handle Map<K, V>
      else if (trimmed.startsWith('Map<') && trimmed.endsWith('>')) {
        schema = { type: 'object', additionalProperties: true };
      }
      // Handle Set<T>
      else if (trimmed.startsWith('Set<') && trimmed.endsWith('>')) {
        const itemType = trimmed.slice(4, -1);
        schema = {
          type: 'array',
          items: this.convertType(itemType),
        };
      }
      // Handle function types - simplified to object
      else if (trimmed.includes('=>') || trimmed.startsWith('(')) {
        schema = { type: 'object', description: 'Function type' };
      }
      // Handle union types (A | B | C)
      else if (trimmed.includes(' | ')) {
        const parts = this.splitUnionType(trimmed);

        // Check if it's a simple nullable type (T | null or T | undefined)
        const nonNull = parts.filter(p => p !== 'null' && p !== 'undefined');
        const hasNull = parts.includes('null') || parts.includes('undefined');

        if (nonNull.length === 1 && hasNull) {
          schema = this.convertType(nonNull[0]);
          schema.nullable = true;
        } else if (parts.every(p => p.startsWith("'") || p.startsWith('"'))) {
          // String literal union
          schema = {
            type: 'string',
            enum: parts.map(p => p.replace(/^['"]|['"]$/g, '')),
          };
        } else if (parts.length <= 4) {
          // Complex union - use oneOf (limit to 4 variants to avoid explosion)
          schema = {
            oneOf: parts.map(p => this.convertType(p)),
          };
        } else {
          // Too many variants - simplify
          schema = { type: 'object', description: 'Union type' };
        }
      }
      // Handle tuple types [T1, T2, ...]
      else if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        // Convert tuple to array (simplified)
        schema = { type: 'array' };
      }
      // Handle object literal types
      else if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        schema = this.convertObjectLiteral(trimmed);
      }
      // Handle generic types like HeapNode<T>
      else if (trimmed.includes('<') && trimmed.endsWith('>')) {
        // Simplify generic types to object
        schema = { type: 'object', description: `Generic type: ${trimmed.split('<')[0]}` };
      }
      // Handle interface/type references
      else {
        const normalizedName = this.normalizeSchemaName(trimmed);
        schema = { $ref: `#/components/schemas/${normalizedName}` };
      }

      if (description) {
        schema.description = description;
      }

      return schema;
    } finally {
      this.conversionDepth--;
    }
  }

  private convertObjectLiteral(typeStr: string): JSONSchema {
    // Basic parsing of object literals like { foo: string; bar: number }
    const inner = typeStr.slice(1, -1).trim();

    if (!inner || inner.includes('[') || inner.includes('(')) {
      // Complex object literal, just return generic object
      return { type: 'object', additionalProperties: true };
    }

    const schema: JSONSchema = {
      type: 'object',
      properties: {},
    };

    // Split by semicolons or commas
    const parts = inner.split(/[;,]/).filter(p => p.trim());

    for (const part of parts) {
      const colonIdx = part.indexOf(':');
      if (colonIdx === -1) continue;

      let propName = part.slice(0, colonIdx).trim();
      const propType = part.slice(colonIdx + 1).trim();

      // Handle optional properties
      const optional = propName.endsWith('?');
      if (optional) {
        propName = propName.slice(0, -1);
      }

      schema.properties![propName] = this.convertType(propType);
    }

    return schema;
  }

  private splitUnionType(typeStr: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = '';

    for (const char of typeStr) {
      if (char === '<' || char === '(' || char === '[' || char === '{') {
        depth++;
        current += char;
      } else if (char === '>' || char === ')' || char === ']' || char === '}') {
        depth--;
        current += char;
      } else if (char === '|' && depth === 0) {
        if (current.trim()) {
          parts.push(current.trim());
        }
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      parts.push(current.trim());
    }

    return parts;
  }

  private splitGenericArgs(typeStr: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = '';

    for (const char of typeStr) {
      if (char === '<' || char === '(' || char === '[' || char === '{') {
        depth++;
        current += char;
      } else if (char === '>' || char === ')' || char === ']' || char === '}') {
        depth--;
        current += char;
      } else if (char === ',' && depth === 0) {
        if (current.trim()) {
          parts.push(current.trim());
        }
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      parts.push(current.trim());
    }

    return parts;
  }

  private normalizeSchemaName(name: string): string {
    // Remove namespace prefix for cleaner schema names
    // e.g., IEsploraApi.Transaction -> EsploraTransaction
    if (name.startsWith('IEsploraApi.')) {
      return 'Esplora' + name.slice(12);
    }

    // Remove 'I' prefix from interface names
    if (name.startsWith('I') && name.length > 1 && name[1] === name[1].toUpperCase()) {
      return name.slice(1);
    }

    return name;
  }

  getSchema(name: string): JSONSchema | undefined {
    return this.schemas.get(this.normalizeSchemaName(name));
  }

  getAllSchemas(): Record<string, JSONSchema> {
    return Object.fromEntries(this.schemas);
  }
}

// Common schemas for API responses
export const COMMON_SCHEMAS: Record<string, JSONSchema> = {
  MempoolInfo: {
    type: 'object',
    properties: {
      loaded: { type: 'boolean' },
      size: { type: 'integer', description: 'Number of transactions in mempool' },
      bytes: { type: 'integer', description: 'Total size of mempool in bytes' },
      usage: { type: 'integer', description: 'Memory usage of mempool' },
      total_fee: { type: 'number', description: 'Total fees in mempool (BTC)' },
      maxmempool: { type: 'integer', description: 'Maximum mempool size in bytes' },
      mempoolminfee: { type: 'number', description: 'Minimum fee rate for mempool inclusion' },
      minrelaytxfee: { type: 'number', description: 'Minimum relay fee rate' },
      incrementalrelayfee: { type: 'number', description: 'Incremental relay fee rate' },
      unbroadcastcount: { type: 'integer', description: 'Number of unbroadcast transactions' },
      fullrbf: { type: 'boolean', description: 'Full RBF enabled' },
    },
  },
  RecommendedFees: {
    type: 'object',
    properties: {
      fastestFee: { type: 'integer', description: 'Fee rate for fastest confirmation (sat/vB)' },
      halfHourFee: { type: 'integer', description: 'Fee rate for ~30 min confirmation (sat/vB)' },
      hourFee: { type: 'integer', description: 'Fee rate for ~1 hour confirmation (sat/vB)' },
      economyFee: { type: 'integer', description: 'Economy fee rate (sat/vB)' },
      minimumFee: { type: 'integer', description: 'Minimum fee rate (sat/vB)' },
    },
    required: ['fastestFee', 'halfHourFee', 'hourFee', 'economyFee', 'minimumFee'],
  },
  DifficultyAdjustment: {
    type: 'object',
    properties: {
      progressPercent: { type: 'number', description: 'Progress through current difficulty epoch (%)' },
      difficultyChange: { type: 'number', description: 'Estimated difficulty change (%)' },
      estimatedRetargetDate: { type: 'integer', description: 'Estimated retarget timestamp (ms)' },
      remainingBlocks: { type: 'integer', description: 'Blocks until retarget' },
      remainingTime: { type: 'integer', description: 'Estimated time until retarget (ms)' },
      previousRetarget: { type: 'number', description: 'Previous difficulty change (%)' },
      previousTime: { type: 'integer', description: 'Previous retarget timestamp' },
      nextRetargetHeight: { type: 'integer', description: 'Height of next retarget block' },
      timeAvg: { type: 'integer', description: 'Average block time in current epoch (ms)' },
      adjustedTimeAvg: { type: 'integer', description: 'Adjusted average block time (ms)' },
      timeOffset: { type: 'integer', description: 'Time offset (ms)' },
      expectedBlocks: { type: 'number', description: 'Expected blocks by now' },
    },
  },
  BackendInfo: {
    type: 'object',
    properties: {
      hostname: { type: 'string' },
      version: { type: 'string' },
      gitCommit: { type: 'string' },
      lightning: { type: 'boolean' },
    },
  },
  Conversions: {
    type: 'object',
    additionalProperties: { type: 'number' },
    description: 'Currency conversion rates (USD, EUR, etc.)',
  },
};

export function convertInterfaces(
  interfaces: ParsedInterface[],
  typeAliases: ParsedTypeAlias[]
): Record<string, JSONSchema> {
  const converter = new SchemaConverter(interfaces, typeAliases);
  const schemas = converter.convertAll();

  // Add common schemas
  return { ...COMMON_SCHEMAS, ...schemas };
}
