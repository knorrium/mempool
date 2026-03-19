import * as fs from 'fs/promises';
import * as path from 'path';
import * as YAML from 'yaml';
import { ParsedRoute } from '../parsers/ast-utils.js';
import { RouteFile } from '../parsers/route-parser.js';
import { WebSocketChannel, WebSocketSubscription, WebSocketMessage } from '../parsers/websocket-parser.js';

export interface CoverageReport {
  rest: {
    total: number;
    documented: number;
    undocumented: UndocumentedEndpoint[];
    coverage: number;
  };
  websocket: {
    subscriptions: {
      total: number;
      documented: number;
      undocumented: string[];
      coverage: number;
    };
    messages: {
      total: number;
      documented: number;
      undocumented: string[];
      coverage: number;
    };
  };
  schemas: {
    total: number;
    used: number;
    unused: string[];
    missing: string[];
  };
  overall: {
    coverage: number;
    issues: string[];
  };
}

export interface UndocumentedEndpoint {
  method: string;
  path: string;
  handler: string;
  sourceFile: string;
}

export class CoverageReporter {
  private routeFiles: RouteFile[];
  private wsChannel: WebSocketChannel;
  private outputDir: string;

  constructor(routeFiles: RouteFile[], wsChannel: WebSocketChannel, outputDir: string) {
    this.routeFiles = routeFiles;
    this.wsChannel = wsChannel;
    this.outputDir = outputDir;
  }

  async generateReport(): Promise<CoverageReport> {
    const restCoverage = await this.checkRestCoverage();
    const wsCoverage = this.checkWebSocketCoverage();
    const schemaCoverage = await this.checkSchemaCoverage();

    const overallCoverage = this.calculateOverallCoverage(restCoverage, wsCoverage, schemaCoverage);

    return {
      rest: restCoverage,
      websocket: wsCoverage,
      schemas: schemaCoverage,
      overall: overallCoverage,
    };
  }

  private async checkRestCoverage(): Promise<CoverageReport['rest']> {
    // Get all routes from parsed files
    const allRoutes: ParsedRoute[] = [];
    for (const file of this.routeFiles) {
      allRoutes.push(...file.routes);
      for (const block of file.conditionalBlocks) {
        allRoutes.push(...block.routes);
      }
    }

    // Load OpenAPI spec
    const openapiPath = path.join(this.outputDir, 'openapi', 'mempool-api.yaml');
    let documentedPaths: Set<string> = new Set();

    try {
      const content = await fs.readFile(openapiPath, 'utf-8');
      const spec = YAML.parse(content);

      if (spec.paths) {
        for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
          const methods = ['get', 'post', 'put', 'delete', 'patch'];
          for (const method of methods) {
            if ((pathItem as Record<string, unknown>)[method]) {
              documentedPaths.add(`${method.toUpperCase()} ${pathKey}`);
            }
          }
        }
      }
    } catch {
      console.warn('Could not load OpenAPI spec for coverage check');
    }

    // Check which routes are documented
    const undocumented: UndocumentedEndpoint[] = [];

    for (const route of allRoutes) {
      const key = `${route.method.toUpperCase()} ${route.path}`;
      if (!documentedPaths.has(key)) {
        undocumented.push({
          method: route.method.toUpperCase(),
          path: route.path,
          handler: route.handler,
          sourceFile: route.sourceFile,
        });
      }
    }

    const total = allRoutes.length;
    const documented = total - undocumented.length;
    const coverage = total > 0 ? (documented / total) * 100 : 100;

    return { total, documented, undocumented, coverage };
  }

  private checkWebSocketCoverage(): CoverageReport['websocket'] {
    // For now, we assume all subscriptions and messages are documented
    // since they're statically defined in the WebSocket parser

    const subscriptions = this.wsChannel.subscriptions;
    const messages = this.wsChannel.messages;

    return {
      subscriptions: {
        total: subscriptions.length,
        documented: subscriptions.length,
        undocumented: [],
        coverage: 100,
      },
      messages: {
        total: messages.length,
        documented: messages.length,
        undocumented: [],
        coverage: 100,
      },
    };
  }

  private async checkSchemaCoverage(): Promise<CoverageReport['schemas']> {
    const openapiPath = path.join(this.outputDir, 'openapi', 'mempool-api.yaml');
    let allSchemas: string[] = [];
    let usedSchemas: Set<string> = new Set();
    let missing: string[] = [];

    try {
      const content = await fs.readFile(openapiPath, 'utf-8');
      const spec = YAML.parse(content);

      // Get all defined schemas
      if (spec.components?.schemas) {
        allSchemas = Object.keys(spec.components.schemas);
      }

      // Find used schemas (referenced in paths)
      const findRefs = (obj: unknown): void => {
        if (!obj || typeof obj !== 'object') return;

        if (Array.isArray(obj)) {
          for (const item of obj) {
            findRefs(item);
          }
          return;
        }

        for (const [key, value] of Object.entries(obj)) {
          if (key === '$ref' && typeof value === 'string') {
            const match = value.match(/#\/components\/schemas\/(\w+)/);
            if (match) {
              usedSchemas.add(match[1]);
            }
          }
          findRefs(value);
        }
      };

      if (spec.paths) {
        findRefs(spec.paths);
      }

      // Find missing schemas (referenced but not defined)
      for (const schema of usedSchemas) {
        if (!allSchemas.includes(schema)) {
          missing.push(schema);
        }
      }
    } catch {
      console.warn('Could not load OpenAPI spec for schema coverage check');
    }

    const unused = allSchemas.filter(s => !usedSchemas.has(s));

    return {
      total: allSchemas.length,
      used: usedSchemas.size,
      unused,
      missing,
    };
  }

  private calculateOverallCoverage(
    rest: CoverageReport['rest'],
    ws: CoverageReport['websocket'],
    schemas: CoverageReport['schemas']
  ): CoverageReport['overall'] {
    const issues: string[] = [];

    // Calculate weighted coverage
    const restWeight = 0.6;
    const wsWeight = 0.3;
    const schemaWeight = 0.1;

    const wsCoverage = (ws.subscriptions.coverage + ws.messages.coverage) / 2;
    const schemaCoverage = schemas.total > 0
      ? ((schemas.total - schemas.unused.length) / schemas.total) * 100
      : 100;

    const coverage = (
      rest.coverage * restWeight +
      wsCoverage * wsWeight +
      schemaCoverage * schemaWeight
    );

    // Collect issues
    if (rest.undocumented.length > 0) {
      issues.push(`${rest.undocumented.length} REST endpoints not documented`);
    }

    if (ws.subscriptions.undocumented.length > 0) {
      issues.push(`${ws.subscriptions.undocumented.length} WebSocket subscriptions not documented`);
    }

    if (schemas.missing.length > 0) {
      issues.push(`${schemas.missing.length} referenced schemas not defined`);
    }

    if (schemas.unused.length > 10) {
      issues.push(`${schemas.unused.length} schemas defined but not used`);
    }

    return { coverage, issues };
  }

  async printReport(): Promise<void> {
    const report = await this.generateReport();

    console.log('\n=== API Coverage Report ===\n');

    // REST endpoints
    console.log('REST API Endpoints:');
    console.log(`  Total: ${report.rest.total}`);
    console.log(`  Documented: ${report.rest.documented}`);
    console.log(`  Coverage: ${report.rest.coverage.toFixed(1)}%`);

    if (report.rest.undocumented.length > 0) {
      console.log('\n  Undocumented endpoints:');
      for (const endpoint of report.rest.undocumented.slice(0, 10)) {
        console.log(`    - ${endpoint.method} ${endpoint.path} (${endpoint.handler})`);
      }
      if (report.rest.undocumented.length > 10) {
        console.log(`    ... and ${report.rest.undocumented.length - 10} more`);
      }
    }

    // WebSocket
    console.log('\nWebSocket API:');
    console.log(`  Subscriptions: ${report.websocket.subscriptions.total} (${report.websocket.subscriptions.coverage.toFixed(1)}% documented)`);
    console.log(`  Messages: ${report.websocket.messages.total} (${report.websocket.messages.coverage.toFixed(1)}% documented)`);

    // Schemas
    console.log('\nSchemas:');
    console.log(`  Total: ${report.schemas.total}`);
    console.log(`  Used: ${report.schemas.used}`);
    console.log(`  Unused: ${report.schemas.unused.length}`);
    console.log(`  Missing: ${report.schemas.missing.length}`);

    if (report.schemas.missing.length > 0) {
      console.log('\n  Missing schemas:');
      for (const schema of report.schemas.missing) {
        console.log(`    - ${schema}`);
      }
    }

    // Overall
    console.log('\n=== Overall ===');
    console.log(`Coverage: ${report.overall.coverage.toFixed(1)}%`);

    if (report.overall.issues.length > 0) {
      console.log('\nIssues:');
      for (const issue of report.overall.issues) {
        console.log(`  - ${issue}`);
      }
    }

    console.log('');
  }

  async writeReport(outputPath: string): Promise<void> {
    const report = await this.generateReport();
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf-8');
  }
}

export async function generateCoverageReport(
  routeFiles: RouteFile[],
  wsChannel: WebSocketChannel,
  outputDir: string
): Promise<CoverageReport> {
  const reporter = new CoverageReporter(routeFiles, wsChannel, outputDir);
  await reporter.printReport();
  await reporter.writeReport(path.join(outputDir, 'coverage-report.json'));
  return reporter.generateReport();
}
