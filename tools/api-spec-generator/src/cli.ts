#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs/promises';

import { RouteParser, RouteFile } from './parsers/route-parser.js';
import { ConditionParser, ModuleCondition } from './parsers/condition-parser.js';
import { InterfaceParser, ParsedInterface, ParsedTypeAlias } from './parsers/interface-parser.js';
import { WebSocketParser, WebSocketChannel } from './parsers/websocket-parser.js';

import { OpenAPIGenerator, generateOpenAPI } from './generators/openapi-generator.js';
import { AsyncAPIGenerator, generateAsyncAPI } from './generators/asyncapi-generator.js';
import { FrontendGenerator, generateFrontendData } from './generators/frontend-generator.js';

import { validateSpecs } from './validators/spec-validator.js';
import { generateCoverageReport } from './validators/coverage-reporter.js';

import { startSwaggerServer } from './server/swagger-server.js';

interface GenerateOptions {
  openapi: boolean;
  asyncapi: boolean;
  frontend: boolean;
  all: boolean;
  output: string;
  backend: string;
}

interface ServeOptions {
  port: number;
  host: string;
  output: string;
  watch: boolean;
  open: boolean;
}

interface ParsedData {
  routeFiles: RouteFile[];
  interfaces: ParsedInterface[];
  typeAliases: ParsedTypeAlias[];
  moduleConditions: ModuleCondition[];
  wsChannel: WebSocketChannel;
}

async function parseBackend(backendPath: string): Promise<ParsedData> {
  console.log('Parsing backend code...');

  // Parse routes
  const routeParser = new RouteParser({ backendPath });
  const routeFiles = await routeParser.parseAllRoutes();
  console.log(`  Found ${routeFiles.length} route files`);

  let totalRoutes = 0;
  for (const file of routeFiles) {
    const fileRoutes = file.routes.length + file.conditionalBlocks.reduce((sum, b) => sum + b.routes.length, 0);
    totalRoutes += fileRoutes;
    console.log(`    ${path.basename(file.filePath)}: ${fileRoutes} routes`);
  }
  console.log(`  Total routes: ${totalRoutes}`);

  // Parse conditions
  const conditionParser = new ConditionParser(backendPath);
  const moduleConditions = await conditionParser.parseIndexFile();
  console.log(`  Found ${moduleConditions.length} module conditions`);

  // Parse interfaces
  const interfaceParser = new InterfaceParser({ backendPath });
  const { interfaces, typeAliases } = await interfaceParser.parseAllInterfaces();
  console.log(`  Found ${interfaces.length} interfaces, ${typeAliases.length} type aliases`);

  // Parse WebSocket
  const wsParser = new WebSocketParser(backendPath);
  const wsChannel = await wsParser.parseWebSocketHandler();
  console.log(`  Found ${wsChannel.subscriptions.length} WebSocket subscriptions`);

  return {
    routeFiles,
    interfaces,
    typeAliases,
    moduleConditions,
    wsChannel,
  };
}

async function generate(options: GenerateOptions): Promise<void> {
  const backendPath = path.resolve(options.backend);
  const outputDir = path.resolve(options.output);

  // Check if backend exists
  try {
    await fs.access(backendPath);
  } catch {
    console.error(`Backend path not found: ${backendPath}`);
    process.exit(1);
  }

  // Ensure output directories exist
  await fs.mkdir(path.join(outputDir, 'openapi', 'variants'), { recursive: true });
  await fs.mkdir(path.join(outputDir, 'asyncapi'), { recursive: true });
  await fs.mkdir(path.join(outputDir, 'frontend'), { recursive: true });

  // Parse backend
  const data = await parseBackend(backendPath);

  const generateAll = options.all || (!options.openapi && !options.asyncapi && !options.frontend);

  // Generate specs
  if (generateAll || options.openapi) {
    console.log('\nGenerating OpenAPI spec...');
    await generateOpenAPI(
      data.routeFiles,
      data.interfaces,
      data.typeAliases,
      data.moduleConditions,
      path.join(outputDir, 'openapi')
    );
  }

  if (generateAll || options.asyncapi) {
    console.log('\nGenerating AsyncAPI spec...');
    await generateAsyncAPI(
      data.wsChannel,
      data.interfaces,
      data.typeAliases,
      path.join(outputDir, 'asyncapi')
    );
  }

  if (generateAll || options.frontend) {
    console.log('\nGenerating frontend data...');
    await generateFrontendData(
      data.routeFiles,
      data.wsChannel,
      data.moduleConditions,
      path.join(outputDir, 'frontend')
    );
  }

  console.log('\nGeneration complete!');
  console.log(`Output directory: ${outputDir}`);
}

async function validate(options: { output: string }): Promise<void> {
  const outputDir = path.resolve(options.output);

  console.log('Validating generated specs...\n');
  const valid = await validateSpecs(outputDir);

  if (!valid) {
    process.exit(1);
  }
}

async function coverage(options: { output: string; backend: string }): Promise<void> {
  const backendPath = path.resolve(options.backend);
  const outputDir = path.resolve(options.output);

  // Parse backend
  const data = await parseBackend(backendPath);

  // Generate coverage report
  await generateCoverageReport(data.routeFiles, data.wsChannel, outputDir);
}

async function serve(options: ServeOptions): Promise<void> {
  const outputDir = path.resolve(options.output);

  // Check if output directory exists
  try {
    await fs.access(path.join(outputDir, 'openapi'));
  } catch {
    console.error(`OpenAPI specs not found at: ${outputDir}/openapi`);
    console.error('Run "npm run generate" first to generate the specs.');
    process.exit(1);
  }

  const server = await startSwaggerServer({
    port: options.port,
    host: options.host,
    outputDir,
    watch: options.watch,
    open: options.open,
  });

  // Handle graceful shutdown
  const shutdown = async () => {
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// CLI setup
const program = new Command();

program
  .name('api-spec-generator')
  .description('Generate API specifications from Mempool backend code')
  .version('1.0.0');

program
  .command('generate')
  .description('Generate API specifications')
  .option('--openapi', 'Generate only OpenAPI spec')
  .option('--asyncapi', 'Generate only AsyncAPI spec')
  .option('--frontend', 'Generate only frontend data')
  .option('--all', 'Generate all specs (default)')
  .option('-o, --output <path>', 'Output directory', './output')
  .option('-b, --backend <path>', 'Backend source directory', '../../backend')
  .action(generate);

program
  .command('validate')
  .description('Validate generated specifications')
  .option('-o, --output <path>', 'Output directory to validate', './output')
  .action(validate);

program
  .command('coverage')
  .description('Generate coverage report')
  .option('-o, --output <path>', 'Output directory', './output')
  .option('-b, --backend <path>', 'Backend source directory', '../../backend')
  .action(coverage);

program
  .command('serve')
  .description('Start Swagger UI server to view API documentation')
  .option('-p, --port <number>', 'Server port', (value) => parseInt(value, 10), 8080)
  .option('--host <host>', 'Host to bind', 'localhost')
  .option('-o, --output <path>', 'Output directory containing specs', './output')
  .option('-w, --watch', 'Watch for spec changes and auto-reload', false)
  .option('--open', 'Open browser automatically', false)
  .action(serve);

// Parse arguments
program.parse();
