import { Project, SourceFile, Node, SyntaxKind, InterfaceDeclaration, TypeAliasDeclaration, PropertySignature, TypeNode } from 'ts-morph';
import * as path from 'path';

export interface ParsedProperty {
  name: string;
  type: string;
  optional: boolean;
  description?: string;
}

export interface ParsedInterface {
  name: string;
  namespace?: string;
  properties: ParsedProperty[];
  extends?: string[];
  description?: string;
  sourceFile: string;
}

export interface ParsedTypeAlias {
  name: string;
  namespace?: string;
  type: string;
  sourceFile: string;
}

export interface InterfaceParserOptions {
  backendPath: string;
}

const INTERFACE_FILES = [
  'mempool.interfaces.ts',
  'api/bitcoin/esplora-api.interface.ts',
];

const KEY_INTERFACES = [
  // From mempool.interfaces.ts
  'TransactionExtended',
  'MempoolTransactionExtended',
  'BlockExtended',
  'MempoolBlock',
  'MempoolBlockWithTransactions',
  'CpfpInfo',
  'TransactionStripped',
  'TransactionClassified',
  'Ancestor',
  'PoolInfo',
  'PoolStats',
  'BlockAudit',
  'WebsocketResponse',
  'IDifficultyAdjustment',
  'RecommendedFees',
  // From esplora-api.interface.ts
  'IEsploraApi.Transaction',
  'IEsploraApi.Block',
  'IEsploraApi.Address',
  'IEsploraApi.Vin',
  'IEsploraApi.Vout',
  'IEsploraApi.Status',
  'IEsploraApi.Outspend',
  'IEsploraApi.UTXO',
  'IEsploraApi.MerkleProof',
];

export class InterfaceParser {
  private project: Project;
  private backendPath: string;
  private parsedInterfaces: Map<string, ParsedInterface> = new Map();
  private parsedTypeAliases: Map<string, ParsedTypeAlias> = new Map();

  constructor(options: InterfaceParserOptions) {
    this.backendPath = options.backendPath;
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

  async parseAllInterfaces(): Promise<{ interfaces: ParsedInterface[]; typeAliases: ParsedTypeAlias[] }> {
    for (const relPath of INTERFACE_FILES) {
      const fullPath = path.join(this.backendPath, 'src', relPath);
      try {
        await this.parseFile(fullPath);
      } catch (error) {
        console.warn(`Warning: Could not parse ${relPath}:`, error);
      }
    }

    return {
      interfaces: Array.from(this.parsedInterfaces.values()),
      typeAliases: Array.from(this.parsedTypeAliases.values()),
    };
  }

  async parseFile(filePath: string): Promise<void> {
    let sourceFile: SourceFile;
    try {
      sourceFile = this.project.addSourceFileAtPath(filePath);
    } catch {
      console.warn(`Could not read file: ${filePath}`);
      return;
    }

    // Parse top-level interfaces
    const interfaces = sourceFile.getInterfaces();
    for (const iface of interfaces) {
      try {
        const parsed = this.parseInterface(iface, undefined, filePath);
        this.parsedInterfaces.set(parsed.name, parsed);
      } catch (e) {
        // Skip problematic interfaces
      }
    }

    // Parse top-level type aliases
    const typeAliases = sourceFile.getTypeAliases();
    for (const alias of typeAliases) {
      try {
        const parsed = this.parseTypeAlias(alias, undefined, filePath);
        this.parsedTypeAliases.set(parsed.name, parsed);
      } catch (e) {
        // Skip problematic type aliases
      }
    }

    // Parse namespaced interfaces (like IEsploraApi)
    try {
      const namespaces = sourceFile.getModules ? sourceFile.getModules() : [];
      for (const ns of namespaces) {
        const nsName = ns.getName();

        try {
          const nsInterfaces = ns.getInterfaces();
          for (const iface of nsInterfaces) {
            try {
              const parsed = this.parseInterface(iface, nsName, filePath);
              const fullName = `${nsName}.${parsed.name}`;
              this.parsedInterfaces.set(fullName, { ...parsed, name: fullName });
            } catch (e) {
              // Skip problematic interfaces
            }
          }

          const nsTypeAliases = ns.getTypeAliases();
          for (const alias of nsTypeAliases) {
            try {
              const parsed = this.parseTypeAlias(alias, nsName, filePath);
              const fullName = `${nsName}.${parsed.name}`;
              this.parsedTypeAliases.set(fullName, { ...parsed, name: fullName });
            } catch (e) {
              // Skip problematic type aliases
            }
          }
        } catch (e) {
          // Skip problematic namespace
        }
      }
    } catch (e) {
      // No namespace support or error - skip
    }
  }

  private parseInterface(iface: InterfaceDeclaration, namespace: string | undefined, filePath: string): ParsedInterface {
    const name = iface.getName();
    const properties: ParsedProperty[] = [];

    // Get extended interfaces
    const extendsNames: string[] = [];
    const extendsClause = iface.getExtends();
    for (const ext of extendsClause) {
      extendsNames.push(ext.getText());
    }

    // Parse properties
    const props = iface.getProperties();
    for (const prop of props) {
      properties.push(this.parseProperty(prop));
    }

    // Extract JSDoc comment if available
    const jsDocs = iface.getJsDocs();
    let description: string | undefined;
    if (jsDocs.length > 0) {
      description = jsDocs[0].getDescription().trim();
    }

    return {
      name,
      namespace,
      properties,
      extends: extendsNames.length > 0 ? extendsNames : undefined,
      description,
      sourceFile: filePath,
    };
  }

  private parseProperty(prop: PropertySignature): ParsedProperty {
    const name = prop.getName();
    const typeNode = prop.getTypeNode();
    const type = typeNode ? this.typeNodeToString(typeNode) : 'any';
    const optional = prop.hasQuestionToken();

    // Extract JSDoc comment
    const jsDocs = prop.getJsDocs();
    let description: string | undefined;
    if (jsDocs.length > 0) {
      description = jsDocs[0].getDescription().trim();
    }

    return { name, type, optional, description };
  }

  private parseTypeAlias(alias: TypeAliasDeclaration, namespace: string | undefined, filePath: string): ParsedTypeAlias {
    const name = alias.getName();
    const typeNode = alias.getTypeNode();
    const type = typeNode ? typeNode.getText() : 'any';

    return {
      name,
      namespace,
      type,
      sourceFile: filePath,
    };
  }

  private typeNodeToString(typeNode: TypeNode): string {
    return typeNode.getText();
  }

  getInterface(name: string): ParsedInterface | undefined {
    return this.parsedInterfaces.get(name);
  }

  getTypeAlias(name: string): ParsedTypeAlias | undefined {
    return this.parsedTypeAliases.get(name);
  }

  getAllInterfaces(): ParsedInterface[] {
    return Array.from(this.parsedInterfaces.values());
  }

  getAllTypeAliases(): ParsedTypeAlias[] {
    return Array.from(this.parsedTypeAliases.values());
  }

  getKeyInterfaces(): ParsedInterface[] {
    return KEY_INTERFACES
      .map(name => this.parsedInterfaces.get(name))
      .filter((iface): iface is ParsedInterface => iface !== undefined);
  }
}

export async function parseInterfaces(backendPath: string): Promise<{ interfaces: ParsedInterface[]; typeAliases: ParsedTypeAlias[] }> {
  const parser = new InterfaceParser({ backendPath });
  return parser.parseAllInterfaces();
}
