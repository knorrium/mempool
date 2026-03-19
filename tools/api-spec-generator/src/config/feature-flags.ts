// Feature flag definitions and network mappings

export type NetworkId = '' | 'testnet' | 'testnet4' | 'signet' | 'liquid' | 'liquidtestnet';

export const BITCOIN_NETWORKS: NetworkId[] = ['', 'testnet', 'testnet4', 'signet'];
export const LIQUID_NETWORKS: NetworkId[] = ['liquid', 'liquidtestnet'];
export const LIGHTNING_NETWORKS: NetworkId[] = ['', 'testnet', 'signet'];
export const ALL_NETWORKS: NetworkId[] = [...BITCOIN_NETWORKS, ...LIQUID_NETWORKS];

export interface FeatureFlag {
  name: string;
  configPath: string;
  description: string;
  networks: NetworkId[];
  official?: boolean; // Only available on mempool.space
}

export const FEATURE_FLAGS: Record<string, FeatureFlag> = {
  // Network-specific flags
  IS_LIQUID: {
    name: 'IS_LIQUID',
    configPath: 'Common.isLiquid()',
    description: 'Liquid network specific endpoints',
    networks: LIQUID_NETWORKS,
  },
  IS_BITCOIN: {
    name: 'IS_BITCOIN',
    configPath: '!Common.isLiquid()',
    description: 'Bitcoin network specific endpoints',
    networks: BITCOIN_NETWORKS,
  },

  // Feature flags
  LIGHTNING_ENABLED: {
    name: 'LIGHTNING_ENABLED',
    configPath: 'config.LIGHTNING.ENABLED',
    description: 'Lightning network endpoints',
    networks: LIGHTNING_NETWORKS,
  },
  STATISTICS_ENABLED: {
    name: 'STATISTICS_ENABLED',
    configPath: 'config.STATISTICS.ENABLED && config.DATABASE.ENABLED && config.MEMPOOL.ENABLED',
    description: 'Statistics endpoints (requires database)',
    networks: BITCOIN_NETWORKS,
  },
  MINING_ENABLED: {
    name: 'MINING_ENABLED',
    configPath: 'Common.indexingEnabled() && config.MEMPOOL.ENABLED',
    description: 'Mining statistics endpoints',
    networks: BITCOIN_NETWORKS,
  },
  ACCELERATIONS_ENABLED: {
    name: 'ACCELERATIONS_ENABLED',
    configPath: 'config.MEMPOOL_SERVICES.ACCELERATIONS',
    description: 'Transaction acceleration endpoints',
    networks: [''],
    official: true,
  },
  WALLETS_ENABLED: {
    name: 'WALLETS_ENABLED',
    configPath: 'config.WALLETS.ENABLED',
    description: 'Wallet tracking endpoints',
    networks: ALL_NETWORKS,
  },
  MEMPOOL_OFFICIAL: {
    name: 'MEMPOOL_OFFICIAL',
    configPath: 'config.MEMPOOL.OFFICIAL',
    description: 'Official mempool.space instance only',
    networks: [''],
    official: true,
  },
  STRATUM_ENABLED: {
    name: 'STRATUM_ENABLED',
    configPath: 'config.STRATUM.ENABLED',
    description: 'Stratum mining endpoints',
    networks: [''],
    official: true,
  },

  // Backend type flags
  BACKEND_NOT_ESPLORA: {
    name: 'BACKEND_NOT_ESPLORA',
    configPath: "config.MEMPOOL.BACKEND !== 'esplora'",
    description: 'Endpoints available with non-esplora backend',
    networks: ALL_NETWORKS,
  },
  BACKEND_ESPLORA: {
    name: 'BACKEND_ESPLORA',
    configPath: "config.MEMPOOL.BACKEND === 'esplora'",
    description: 'Endpoints specific to esplora backend',
    networks: ALL_NETWORKS,
  },
};

// Route module to feature flag mapping
export const MODULE_TO_FLAG: Record<string, string[]> = {
  bitcoinRoutes: [],
  bitcoinCoreRoutes: ['MEMPOOL_OFFICIAL'],
  pricesRoutes: [],
  statisticsRoutes: ['STATISTICS_ENABLED'],
  miningRoutes: ['MINING_ENABLED'],
  liquidRoutes: ['IS_LIQUID'],
  generalLightningRoutes: ['LIGHTNING_ENABLED'],
  nodesRoutes: ['LIGHTNING_ENABLED'],
  channelsRoutes: ['LIGHTNING_ENABLED'],
  accelerationRoutes: ['ACCELERATIONS_ENABLED'],
  servicesRoutes: ['WALLETS_ENABLED'],
  aboutRoutes: [], // Available on non-official instances
};

// Map condition strings to feature flag names
export function conditionToFlags(condition: string): string[] {
  const flags: string[] = [];

  for (const [flagName, flag] of Object.entries(FEATURE_FLAGS)) {
    if (condition.includes(flag.configPath) || condition.includes(flagName)) {
      flags.push(flagName);
    }
  }

  // Handle specific patterns
  if (condition.includes('isLiquid')) {
    flags.push('IS_LIQUID');
  }
  if (condition.includes('LIGHTNING.ENABLED')) {
    flags.push('LIGHTNING_ENABLED');
  }
  if (condition.includes("BACKEND !== 'esplora'") || condition.includes('BACKEND !== "esplora"')) {
    flags.push('BACKEND_NOT_ESPLORA');
  }
  if (condition.includes('MEMPOOL_SERVICES.ACCELERATIONS')) {
    flags.push('ACCELERATIONS_ENABLED');
  }
  if (condition.includes('STATISTICS.ENABLED')) {
    flags.push('STATISTICS_ENABLED');
  }
  if (condition.includes('indexingEnabled')) {
    flags.push('MINING_ENABLED');
  }
  if (condition.includes('WALLETS.ENABLED')) {
    flags.push('WALLETS_ENABLED');
  }
  if (condition.includes('MEMPOOL.OFFICIAL') && !condition.includes('!')) {
    flags.push('MEMPOOL_OFFICIAL');
  }

  return [...new Set(flags)];
}

// Map feature flags to networks
export function flagsToNetworks(flags: string[]): NetworkId[] {
  if (flags.length === 0) {
    return ALL_NETWORKS;
  }

  let networks = new Set<NetworkId>(ALL_NETWORKS);

  for (const flagName of flags) {
    const flag = FEATURE_FLAGS[flagName];
    if (flag) {
      // Intersect with flag's networks
      const flagNetworks = new Set(flag.networks);
      networks = new Set([...networks].filter(n => flagNetworks.has(n)));
    }
  }

  return [...networks];
}

// Get OpenAPI server URLs for networks
export function getServerUrls(networks: NetworkId[]): { url: string; description: string }[] {
  const servers: { url: string; description: string }[] = [];

  if (networks.includes('')) {
    servers.push({ url: 'https://mempool.space/api', description: 'Mainnet' });
  }
  if (networks.includes('testnet')) {
    servers.push({ url: 'https://mempool.space/testnet/api', description: 'Testnet3' });
  }
  if (networks.includes('testnet4')) {
    servers.push({ url: 'https://mempool.space/testnet4/api', description: 'Testnet4' });
  }
  if (networks.includes('signet')) {
    servers.push({ url: 'https://mempool.space/signet/api', description: 'Signet' });
  }
  if (networks.includes('liquid')) {
    servers.push({ url: 'https://liquid.network/api', description: 'Liquid' });
  }
  if (networks.includes('liquidtestnet')) {
    servers.push({ url: 'https://liquid.network/liquidtestnet/api', description: 'Liquid Testnet' });
  }

  return servers;
}

// Map networks to frontend showConditions format
export function networksToShowConditions(networks: NetworkId[]): string[] {
  return networks as string[];
}
