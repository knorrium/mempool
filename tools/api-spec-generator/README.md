# Mempool API Specification Generator

Generates OpenAPI 3.1 and AsyncAPI 2.6 specifications from the Mempool backend TypeScript code.

## Features

- **Route Parsing**: Extracts REST endpoints from Express route files
- **WebSocket Parsing**: Extracts WebSocket subscriptions and messages
- **Interface Parsing**: Converts TypeScript interfaces to JSON Schema
- **Condition Detection**: Handles conditional endpoints based on configuration
- **OpenAPI Generation**: Generates OpenAPI 3.1 specs with feature tags
- **AsyncAPI Generation**: Generates AsyncAPI 2.6 specs for WebSocket API
- **Frontend Data**: Generates data compatible with `api-docs-data.ts`
- **Validation**: Validates generated specs against standards
- **Coverage Reports**: Reports undocumented endpoints

## Installation

```bash
npm install
```

## Usage

### Generate All Specs

```bash
npm run generate
```

### Generate Specific Specs

```bash
npm run generate:openapi   # OpenAPI only
npm run generate:asyncapi  # AsyncAPI only
npm run generate:frontend  # Frontend data only
```

### Validate Specs

```bash
npm run validate
```

### Coverage Report

```bash
npm run coverage
```

### CLI Options

```bash
# Generate with custom paths
npx tsx src/cli.ts generate --backend ../../backend --output ./output

# Generate specific specs
npx tsx src/cli.ts generate --openapi --output ./output

# Validate
npx tsx src/cli.ts validate --output ./output

# Coverage
npx tsx src/cli.ts coverage --backend ../../backend --output ./output
```

## Output Structure

```
output/
├── openapi/
│   ├── mempool-api.yaml          # Full OpenAPI spec
│   └── variants/
│       ├── mainnet-full.yaml     # Mainnet-only endpoints
│       ├── bitcoin-networks.yaml # Bitcoin networks
│       └── liquid.yaml           # Liquid network
├── asyncapi/
│   └── mempool-websocket.yaml    # WebSocket API spec
├── frontend/
│   └── api-docs-data.generated.ts # Frontend-compatible data
└── coverage-report.json          # Coverage report
```

## Architecture

### Parsers

- **route-parser.ts**: Parses Express route definitions from `*.routes.ts` files
- **websocket-parser.ts**: Extracts WebSocket subscriptions and messages
- **interface-parser.ts**: Parses TypeScript interfaces for schema generation
- **condition-parser.ts**: Extracts conditional registration logic from `index.ts`

### Generators

- **openapi-generator.ts**: Generates OpenAPI 3.1 specification
- **asyncapi-generator.ts**: Generates AsyncAPI 2.6 specification
- **frontend-generator.ts**: Generates frontend-compatible data structure
- **schema-converter.ts**: Converts TypeScript types to JSON Schema

### Validators

- **spec-validator.ts**: Validates OpenAPI and AsyncAPI specs
- **coverage-reporter.ts**: Reports endpoint coverage

## Feature Flags

The generator handles conditional endpoints based on configuration:

| Flag | Condition | Networks |
|------|-----------|----------|
| IS_LIQUID | `Common.isLiquid()` | liquid, liquidtestnet |
| LIGHTNING_ENABLED | `config.LIGHTNING.ENABLED` | mainnet, testnet, signet |
| STATISTICS_ENABLED | `config.STATISTICS.ENABLED` | Bitcoin networks |
| MINING_ENABLED | `Common.indexingEnabled()` | Bitcoin networks |
| ACCELERATIONS_ENABLED | `config.MEMPOOL_SERVICES.ACCELERATIONS` | mainnet only |
| BACKEND_NOT_ESPLORA | `BACKEND !== 'esplora'` | All networks |

## Route Files Parsed

- `api/bitcoin/bitcoin.routes.ts` - Core Bitcoin endpoints
- `api/mining/mining-routes.ts` - Mining statistics
- `api/liquid/liquid.routes.ts` - Liquid network
- `api/statistics/statistics.routes.ts` - Historical statistics
- `api/prices/prices.routes.ts` - Price data
- `api/acceleration/acceleration.routes.ts` - TX acceleration
- `api/services/services-routes.ts` - Wallet services
- `api/about.routes.ts` - About endpoints
- `api/bitcoin/bitcoin-core.routes.ts` - Bitcoin Core endpoints
- `api/explorer/nodes.routes.ts` - Lightning nodes
- `api/explorer/channels.routes.ts` - Lightning channels
- `api/explorer/general.routes.ts` - Lightning general

## Development

### Run Tests

```bash
npm test
```

### Build

```bash
npm run build
```

### Development Mode

```bash
npm run dev generate
```
