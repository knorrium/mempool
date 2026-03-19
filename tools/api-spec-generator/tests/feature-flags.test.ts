import { describe, it, expect } from 'vitest';
import {
  conditionToFlags,
  flagsToNetworks,
  getServerUrls,
  BITCOIN_NETWORKS,
  LIQUID_NETWORKS,
  LIGHTNING_NETWORKS,
  ALL_NETWORKS,
} from '../src/config/feature-flags.js';

describe('Feature Flags', () => {
  describe('conditionToFlags', () => {
    it('should extract IS_LIQUID flag', () => {
      const flags = conditionToFlags('Common.isLiquid()');
      expect(flags).toContain('IS_LIQUID');
    });

    it('should extract LIGHTNING_ENABLED flag', () => {
      const flags = conditionToFlags('config.LIGHTNING.ENABLED');
      expect(flags).toContain('LIGHTNING_ENABLED');
    });

    it('should extract BACKEND_NOT_ESPLORA flag', () => {
      const flags = conditionToFlags("config.MEMPOOL.BACKEND !== 'esplora'");
      expect(flags).toContain('BACKEND_NOT_ESPLORA');
    });

    it('should extract multiple flags', () => {
      const flags = conditionToFlags('config.STATISTICS.ENABLED && config.DATABASE.ENABLED');
      expect(flags).toContain('STATISTICS_ENABLED');
    });

    it('should extract ACCELERATIONS_ENABLED flag', () => {
      const flags = conditionToFlags('config.MEMPOOL_SERVICES.ACCELERATIONS');
      expect(flags).toContain('ACCELERATIONS_ENABLED');
    });
  });

  describe('flagsToNetworks', () => {
    it('should return all networks for empty flags', () => {
      const networks = flagsToNetworks([]);
      expect(networks).toEqual(ALL_NETWORKS);
    });

    it('should return liquid networks for IS_LIQUID', () => {
      const networks = flagsToNetworks(['IS_LIQUID']);
      expect(networks).toEqual(LIQUID_NETWORKS);
    });

    it('should return lightning networks for LIGHTNING_ENABLED', () => {
      const networks = flagsToNetworks(['LIGHTNING_ENABLED']);
      expect(networks).toEqual(LIGHTNING_NETWORKS);
    });

    it('should return mainnet only for ACCELERATIONS_ENABLED', () => {
      const networks = flagsToNetworks(['ACCELERATIONS_ENABLED']);
      expect(networks).toEqual(['']);
    });
  });

  describe('getServerUrls', () => {
    it('should return mainnet server for empty string', () => {
      const servers = getServerUrls(['']);
      expect(servers).toHaveLength(1);
      expect(servers[0].url).toBe('https://mempool.space/api');
    });

    it('should return multiple servers for multiple networks', () => {
      const servers = getServerUrls(['', 'testnet']);
      expect(servers).toHaveLength(2);
    });

    it('should return liquid server for liquid network', () => {
      const servers = getServerUrls(['liquid']);
      expect(servers).toHaveLength(1);
      expect(servers[0].url).toBe('https://liquid.network/api');
    });
  });

  describe('Network constants', () => {
    it('BITCOIN_NETWORKS should contain mainnet and testnets', () => {
      expect(BITCOIN_NETWORKS).toContain('');
      expect(BITCOIN_NETWORKS).toContain('testnet');
      expect(BITCOIN_NETWORKS).toContain('testnet4');
      expect(BITCOIN_NETWORKS).toContain('signet');
    });

    it('LIQUID_NETWORKS should contain liquid networks', () => {
      expect(LIQUID_NETWORKS).toContain('liquid');
      expect(LIQUID_NETWORKS).toContain('liquidtestnet');
    });

    it('LIGHTNING_NETWORKS should contain supported networks', () => {
      expect(LIGHTNING_NETWORKS).toContain('');
      expect(LIGHTNING_NETWORKS).toContain('testnet');
      expect(LIGHTNING_NETWORKS).toContain('signet');
      expect(LIGHTNING_NETWORKS).not.toContain('liquid');
    });
  });
});
