import { Project, SourceFile, Node, SyntaxKind, IfStatement, CallExpression } from 'ts-morph';
import * as path from 'path';

export interface ModuleCondition {
  moduleName: string;
  condition: string;
  configFlags: string[];
}

export interface FeatureFlag {
  name: string;
  configPath: string;
  description: string;
  networks: string[];
}

// Known module conditions from index.ts setUpHttpApiRoutes()
export const MODULE_CONDITIONS: ModuleCondition[] = [
  {
    moduleName: 'bitcoinRoutes',
    condition: 'always',
    configFlags: [],
  },
  {
    moduleName: 'bitcoinCoreRoutes',
    condition: 'config.MEMPOOL.OFFICIAL',
    configFlags: ['MEMPOOL.OFFICIAL'],
  },
  {
    moduleName: 'pricesRoutes',
    condition: 'always',
    configFlags: [],
  },
  {
    moduleName: 'statisticsRoutes',
    condition: 'config.STATISTICS.ENABLED && config.DATABASE.ENABLED && config.MEMPOOL.ENABLED',
    configFlags: ['STATISTICS.ENABLED', 'DATABASE.ENABLED', 'MEMPOOL.ENABLED'],
  },
  {
    moduleName: 'miningRoutes',
    condition: 'Common.indexingEnabled() && config.MEMPOOL.ENABLED',
    configFlags: ['indexingEnabled', 'MEMPOOL.ENABLED'],
  },
  {
    moduleName: 'liquidRoutes',
    condition: 'Common.isLiquid()',
    configFlags: ['isLiquid'],
  },
  {
    moduleName: 'generalLightningRoutes',
    condition: 'config.LIGHTNING.ENABLED',
    configFlags: ['LIGHTNING.ENABLED'],
  },
  {
    moduleName: 'nodesRoutes',
    condition: 'config.LIGHTNING.ENABLED',
    configFlags: ['LIGHTNING.ENABLED'],
  },
  {
    moduleName: 'channelsRoutes',
    condition: 'config.LIGHTNING.ENABLED',
    configFlags: ['LIGHTNING.ENABLED'],
  },
  {
    moduleName: 'accelerationRoutes',
    condition: 'config.MEMPOOL_SERVICES.ACCELERATIONS',
    configFlags: ['MEMPOOL_SERVICES.ACCELERATIONS'],
  },
  {
    moduleName: 'servicesRoutes',
    condition: 'config.WALLETS.ENABLED',
    configFlags: ['WALLETS.ENABLED'],
  },
  {
    moduleName: 'aboutRoutes',
    condition: '!config.MEMPOOL.OFFICIAL',
    configFlags: ['!MEMPOOL.OFFICIAL'],
  },
];

// In-file conditions (within route files)
export const IN_FILE_CONDITIONS: Record<string, string> = {
  "config.MEMPOOL.BACKEND !== 'esplora'": 'BACKEND_NOT_ESPLORA',
  "config.MEMPOOL.BACKEND === 'esplora'": 'BACKEND_ESPLORA',
  'config.MEMPOOL.ENABLED': 'MEMPOOL_ENABLED',
  'config.DATABASE.ENABLED': 'DATABASE_ENABLED',
  'Common.indexingEnabled()': 'INDEXING_ENABLED',
  'Common.isLiquid()': 'IS_LIQUID',
};

// Feature flag definitions with network mappings
export const FEATURE_FLAGS: FeatureFlag[] = [
  {
    name: 'IS_LIQUID',
    configPath: 'Common.isLiquid()',
    description: 'Liquid network specific endpoints',
    networks: ['liquid', 'liquidtestnet'],
  },
  {
    name: 'LIGHTNING_ENABLED',
    configPath: 'config.LIGHTNING.ENABLED',
    description: 'Lightning network endpoints',
    networks: ['', 'testnet', 'signet'],
  },
  {
    name: 'MEMPOOL_OFFICIAL',
    configPath: 'config.MEMPOOL.OFFICIAL',
    description: 'Official mempool.space instance endpoints',
    networks: [''],
  },
  {
    name: 'STATISTICS_ENABLED',
    configPath: 'config.STATISTICS.ENABLED',
    description: 'Statistics endpoints',
    networks: ['', 'testnet', 'testnet4', 'signet'],
  },
  {
    name: 'MINING_ENABLED',
    configPath: 'Common.indexingEnabled() && config.MEMPOOL.ENABLED',
    description: 'Mining statistics endpoints',
    networks: ['', 'testnet', 'testnet4', 'signet'],
  },
  {
    name: 'ACCELERATIONS_ENABLED',
    configPath: 'config.MEMPOOL_SERVICES.ACCELERATIONS',
    description: 'Transaction acceleration endpoints',
    networks: [''],
  },
  {
    name: 'BACKEND_NOT_ESPLORA',
    configPath: "config.MEMPOOL.BACKEND !== 'esplora'",
    description: 'Endpoints available when not using esplora backend',
    networks: ['', 'testnet', 'testnet4', 'signet', 'liquid', 'liquidtestnet'],
  },
];

export class ConditionParser {
  private project: Project;
  private backendPath: string;
  private parsedConditions: Map<string, ModuleCondition> = new Map();

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

    // Initialize with known conditions
    for (const condition of MODULE_CONDITIONS) {
      this.parsedConditions.set(condition.moduleName, condition);
    }
  }

  async parseIndexFile(): Promise<ModuleCondition[]> {
    const indexPath = path.join(this.backendPath, 'src', 'index.ts');

    let sourceFile: SourceFile;
    try {
      sourceFile = this.project.addSourceFileAtPath(indexPath);
    } catch (error) {
      console.warn('Could not parse index.ts, using default conditions');
      return MODULE_CONDITIONS;
    }

    // Find the setUpHttpApiRoutes method
    const classes = sourceFile.getClasses();
    for (const cls of classes) {
      const method = cls.getMethod('setUpHttpApiRoutes');
      if (!method) continue;

      const body = method.getBody();
      if (!body || !Node.isBlock(body)) continue;

      // Parse if statements to find conditional route registrations
      const ifStatements = body.getDescendantsOfKind(SyntaxKind.IfStatement);

      for (const ifStmt of ifStatements) {
        const condition = ifStmt.getExpression().getText();
        const thenBlock = ifStmt.getThenStatement();

        if (!Node.isBlock(thenBlock)) continue;

        // Find initRoutes calls within this if block
        const calls = thenBlock.getDescendantsOfKind(SyntaxKind.CallExpression);
        for (const call of calls) {
          const expr = call.getExpression();
          if (!Node.isPropertyAccessExpression(expr)) continue;

          if (expr.getName() !== 'initRoutes') continue;

          const moduleExpr = expr.getExpression();
          if (!Node.isIdentifier(moduleExpr)) continue;

          const moduleName = moduleExpr.getText();
          const configFlags = this.extractConfigFlags(condition);

          this.parsedConditions.set(moduleName, {
            moduleName,
            condition,
            configFlags,
          });
        }
      }
    }

    return Array.from(this.parsedConditions.values());
  }

  private extractConfigFlags(condition: string): string[] {
    const flags: string[] = [];

    // Extract config.X.Y patterns
    const configPattern = /config\.([A-Z_]+(?:\.[A-Z_]+)*)/g;
    let match;
    while ((match = configPattern.exec(condition)) !== null) {
      flags.push(match[1]);
    }

    // Extract Common.xxx() calls
    const commonPattern = /Common\.([a-zA-Z]+)\(\)/g;
    while ((match = commonPattern.exec(condition)) !== null) {
      flags.push(match[1]);
    }

    return flags;
  }

  getModuleCondition(moduleName: string): ModuleCondition | undefined {
    return this.parsedConditions.get(moduleName);
  }

  getConditionForFile(filePath: string): ModuleCondition | undefined {
    // Map file paths to module names
    const fileToModule: Record<string, string> = {
      'bitcoin.routes.ts': 'bitcoinRoutes',
      'bitcoin-core.routes.ts': 'bitcoinCoreRoutes',
      'mining-routes.ts': 'miningRoutes',
      'liquid.routes.ts': 'liquidRoutes',
      'statistics.routes.ts': 'statisticsRoutes',
      'prices.routes.ts': 'pricesRoutes',
      'acceleration.routes.ts': 'accelerationRoutes',
      'services-routes.ts': 'servicesRoutes',
      'about.routes.ts': 'aboutRoutes',
      'nodes.routes.ts': 'nodesRoutes',
      'channels.routes.ts': 'channelsRoutes',
      'general.routes.ts': 'generalLightningRoutes',
    };

    const fileName = path.basename(filePath);
    const moduleName = fileToModule[fileName];

    if (!moduleName) return undefined;

    return this.parsedConditions.get(moduleName);
  }

  conditionToNetworks(condition: string): string[] {
    const allNetworks = ['', 'testnet', 'testnet4', 'signet', 'liquid', 'liquidtestnet'];
    const bitcoinNetworks = ['', 'testnet', 'testnet4', 'signet'];
    const liquidNetworks = ['liquid', 'liquidtestnet'];
    const lightningNetworks = ['', 'testnet', 'signet'];

    if (condition === 'always' || !condition) {
      return allNetworks;
    }

    // Check for specific conditions
    if (condition.includes('isLiquid')) {
      return liquidNetworks;
    }

    if (condition.includes('LIGHTNING.ENABLED')) {
      return lightningNetworks;
    }

    if (condition.includes('!config.MEMPOOL.OFFICIAL') || condition.includes('!MEMPOOL.OFFICIAL')) {
      // Available on non-official instances (self-hosted)
      return allNetworks;
    }

    if (condition.includes('config.MEMPOOL.OFFICIAL') || condition.includes('MEMPOOL.OFFICIAL')) {
      // Official only
      return [''];
    }

    if (condition.includes('MEMPOOL_SERVICES.ACCELERATIONS')) {
      // Accelerations only on mainnet
      return [''];
    }

    // Default to bitcoin networks for most conditions
    return bitcoinNetworks;
  }

  normalizeCondition(condition: string): string {
    // Map verbose conditions to simplified flag names
    for (const [pattern, flag] of Object.entries(IN_FILE_CONDITIONS)) {
      if (condition.includes(pattern)) {
        return flag;
      }
    }

    return condition;
  }
}

export function parseConditions(backendPath: string): Promise<ModuleCondition[]> {
  const parser = new ConditionParser(backendPath);
  return parser.parseIndexFile();
}
