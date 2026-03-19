import { Project, SourceFile, Node, SyntaxKind, CallExpression, IfStatement, Block } from 'ts-morph';
import * as path from 'path';
import {
  ParsedRoute,
  ConditionalBlock,
  createProject,
  addSourceFile,
  extractRouteFromCall,
  findIfStatements,
  extractConditionText,
  findCallExpressionsInBlock,
  isAppMethodChain,
  normalizeRoutePath,
} from './ast-utils.js';

export interface RouteFile {
  filePath: string;
  moduleName: string;
  routes: ParsedRoute[];
  conditionalBlocks: ConditionalBlock[];
}

export interface RouteParserOptions {
  backendPath: string;
}

const ROUTE_FILES = [
  'api/bitcoin/bitcoin.routes.ts',
  'api/mining/mining-routes.ts',
  'api/liquid/liquid.routes.ts',
  'api/statistics/statistics.routes.ts',
  'api/prices/prices.routes.ts',
  'api/acceleration/acceleration.routes.ts',
  'api/services/services-routes.ts',
  'api/about.routes.ts',
  'api/bitcoin/bitcoin-core.routes.ts',
  'api/explorer/nodes.routes.ts',
  'api/explorer/channels.routes.ts',
  'api/explorer/general.routes.ts',
];

export class RouteParser {
  private project: Project;
  private backendPath: string;
  private parsedFiles: Map<string, RouteFile> = new Map();

  constructor(options: RouteParserOptions) {
    this.backendPath = options.backendPath;
    this.project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: {
        target: 99, // ESNext
        module: 99, // ESNext
        strict: true,
        esModuleInterop: true,
      },
    });
  }

  async parseAllRoutes(): Promise<RouteFile[]> {
    const results: RouteFile[] = [];

    for (const relPath of ROUTE_FILES) {
      const fullPath = path.join(this.backendPath, 'src', relPath);

      try {
        const routeFile = await this.parseRouteFile(fullPath, relPath);
        if (routeFile) {
          results.push(routeFile);
          this.parsedFiles.set(relPath, routeFile);
        }
      } catch (error) {
        console.warn(`Warning: Could not parse ${relPath}:`, error);
      }
    }

    return results;
  }

  async parseRouteFile(filePath: string, moduleName: string): Promise<RouteFile | null> {
    let sourceFile: SourceFile;

    try {
      sourceFile = this.project.addSourceFileAtPath(filePath);
    } catch (error) {
      console.warn(`Could not read file: ${filePath}`);
      return null;
    }

    const routes: ParsedRoute[] = [];
    const conditionalBlocks: ConditionalBlock[] = [];

    // Find the initRoutes method
    const classes = sourceFile.getClasses();
    for (const cls of classes) {
      const initMethod = cls.getMethod('initRoutes');
      if (!initMethod) continue;

      const body = initMethod.getBody();
      if (!body || !Node.isBlock(body)) continue;

      // Parse routes at the top level of initRoutes
      this.parseRoutesInBlock(body, routes, null, filePath);

      // Find conditional blocks (if statements)
      const ifStatements = body.getDescendantsOfKind(SyntaxKind.IfStatement);
      for (const ifStmt of ifStatements) {
        const condition = extractConditionText(ifStmt);
        const thenBlock = ifStmt.getThenStatement();

        if (Node.isBlock(thenBlock)) {
          const conditionalRoutes: ParsedRoute[] = [];
          this.parseRoutesInBlock(thenBlock, conditionalRoutes, condition, filePath);

          if (conditionalRoutes.length > 0) {
            conditionalBlocks.push({
              condition,
              routes: conditionalRoutes,
            });
          }
        }
      }
    }

    return {
      filePath,
      moduleName,
      routes,
      conditionalBlocks,
    };
  }

  private parseRoutesInBlock(
    block: Block,
    routes: ParsedRoute[],
    condition: string | null,
    sourceFile: string
  ): void {
    // Find all call expressions in the block
    const statements = block.getStatements();

    for (const statement of statements) {
      // Skip if statements - they're handled separately for conditional blocks
      if (Node.isIfStatement(statement)) {
        continue;
      }

      // Find call chains like app.get(...).post(...)
      this.extractRoutesFromChain(statement, routes, condition, sourceFile);
    }
  }

  private extractRoutesFromChain(
    node: Node,
    routes: ParsedRoute[],
    condition: string | null,
    sourceFile: string
  ): void {
    // Find all call expressions
    const callExpressions = node.getDescendantsOfKind(SyntaxKind.CallExpression);

    for (const call of callExpressions) {
      const expr = call.getExpression();

      if (!Node.isPropertyAccessExpression(expr)) continue;

      const methodName = expr.getName().toLowerCase();
      if (!['get', 'post', 'put', 'delete', 'patch'].includes(methodName)) continue;

      // Check if this is an app.method() or chained method
      const isAppChain = this.isAppChain(call);
      if (!isAppChain) continue;

      const args = call.getArguments();
      if (args.length < 2) continue;

      const pathStr = this.extractPath(args[0]);
      if (!pathStr) continue;

      const handler = this.extractHandler(args[1]);
      const line = call.getStartLineNumber();

      routes.push({
        method: methodName as ParsedRoute['method'],
        path: normalizeRoutePath(pathStr),
        handler,
        condition: condition || undefined,
        sourceFile,
        line,
      });
    }
  }

  private isAppChain(call: CallExpression): boolean {
    let current: Node = call;

    while (current) {
      if (Node.isPropertyAccessExpression(current)) {
        const expr = current.getExpression();

        if (Node.isIdentifier(expr)) {
          const name = expr.getText();
          return name === 'app';
        }

        if (Node.isCallExpression(expr)) {
          current = expr;
          continue;
        }

        current = expr;
      } else if (Node.isCallExpression(current)) {
        current = current.getExpression();
      } else {
        break;
      }
    }

    return false;
  }

  private extractPath(node: Node): string | null {
    // Handle string literal
    if (Node.isStringLiteral(node)) {
      return node.getLiteralValue();
    }

    // Handle binary expression (concatenation with config.MEMPOOL.API_URL_PREFIX)
    if (Node.isBinaryExpression(node)) {
      const parts: string[] = [];

      const extractParts = (n: Node): void => {
        if (Node.isStringLiteral(n)) {
          parts.push(n.getLiteralValue());
        } else if (Node.isBinaryExpression(n)) {
          extractParts(n.getLeft());
          extractParts(n.getRight());
        } else if (Node.isPropertyAccessExpression(n)) {
          const text = n.getText();
          if (text.includes('API_URL_PREFIX')) {
            parts.push('/api/v1/');
          }
        }
      };

      extractParts(node);

      if (parts.length === 0) return null;

      let result = parts.join('');
      result = result.replace(/\/+/g, '/');
      if (!result.startsWith('/')) {
        result = '/' + result;
      }

      return result;
    }

    return null;
  }

  private extractHandler(node: Node): string {
    if (Node.isPropertyAccessExpression(node)) {
      return node.getName();
    }

    if (Node.isIdentifier(node)) {
      return node.getText();
    }

    // Handle .bind(this) pattern
    if (Node.isCallExpression(node)) {
      const expr = node.getExpression();
      if (Node.isPropertyAccessExpression(expr)) {
        const methodName = expr.getName();
        if (methodName === 'bind') {
          const target = expr.getExpression();
          if (Node.isPropertyAccessExpression(target)) {
            return target.getName();
          }
        }
      }
    }

    return 'unknown';
  }

  getRouteFiles(): Map<string, RouteFile> {
    return this.parsedFiles;
  }

  getAllRoutes(): ParsedRoute[] {
    const allRoutes: ParsedRoute[] = [];

    for (const routeFile of this.parsedFiles.values()) {
      allRoutes.push(...routeFile.routes);
      for (const block of routeFile.conditionalBlocks) {
        allRoutes.push(...block.routes);
      }
    }

    return allRoutes;
  }
}

export async function parseRoutes(backendPath: string): Promise<RouteFile[]> {
  const parser = new RouteParser({ backendPath });
  return parser.parseAllRoutes();
}
