import { describe, it, expect } from 'vitest';
import { normalizeRoutePath } from '../src/parsers/ast-utils.js';

describe('Route Parser', () => {
  describe('normalizeRoutePath', () => {
    it('should convert :param to {param}', () => {
      expect(normalizeRoutePath('/api/v1/tx/:txId')).toBe('/api/v1/tx/{txId}');
    });

    it('should handle multiple parameters', () => {
      expect(normalizeRoutePath('/api/v1/block/:hash/tx/:txid')).toBe('/api/v1/block/{hash}/tx/{txid}');
    });

    it('should ensure leading slash', () => {
      expect(normalizeRoutePath('api/v1/test')).toBe('/api/v1/test');
    });

    it('should remove trailing slash except for root', () => {
      expect(normalizeRoutePath('/api/v1/test/')).toBe('/api/v1/test');
      expect(normalizeRoutePath('/')).toBe('/');
    });

    it('should handle paths with no parameters', () => {
      expect(normalizeRoutePath('/api/v1/fees/recommended')).toBe('/api/v1/fees/recommended');
    });

    it('should handle underscore in parameter names', () => {
      expect(normalizeRoutePath('/api/v1/block/:block_hash')).toBe('/api/v1/block/{block_hash}');
    });
  });
});
