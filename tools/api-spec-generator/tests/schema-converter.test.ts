import { describe, it, expect } from 'vitest';
import { SchemaConverter, JSONSchema } from '../src/generators/schema-converter.js';
import { ParsedInterface, ParsedTypeAlias } from '../src/parsers/interface-parser.js';

describe('Schema Converter', () => {
  describe('convertType', () => {
    const converter = new SchemaConverter([], []);

    it('should convert string type', () => {
      const schema = converter.convertType('string');
      expect(schema).toEqual({ type: 'string' });
    });

    it('should convert number type', () => {
      const schema = converter.convertType('number');
      expect(schema).toEqual({ type: 'number' });
    });

    it('should convert boolean type', () => {
      const schema = converter.convertType('boolean');
      expect(schema).toEqual({ type: 'boolean' });
    });

    it('should convert array type', () => {
      const schema = converter.convertType('string[]');
      expect(schema).toEqual({
        type: 'array',
        items: { type: 'string' },
      });
    });

    it('should convert Array<T> syntax', () => {
      const schema = converter.convertType('Array<number>');
      expect(schema).toEqual({
        type: 'array',
        items: { type: 'number' },
      });
    });

    it('should convert nullable types', () => {
      const schema = converter.convertType('string | null');
      expect(schema).toEqual({
        type: 'string',
        nullable: true,
      });
    });

    it('should convert Record type', () => {
      const schema = converter.convertType('Record<string, number>');
      expect(schema).toEqual({
        type: 'object',
        additionalProperties: { type: 'number' },
      });
    });

    it('should convert string literal union', () => {
      const schema = converter.convertType("'a' | 'b' | 'c'");
      expect(schema).toEqual({
        type: 'string',
        enum: ['a', 'b', 'c'],
      });
    });

    it('should convert interface reference', () => {
      const schema = converter.convertType('TransactionExtended');
      expect(schema).toEqual({
        $ref: '#/components/schemas/TransactionExtended',
      });
    });

    it('should normalize IEsploraApi namespace', () => {
      const schema = converter.convertType('IEsploraApi.Transaction');
      expect(schema).toEqual({
        $ref: '#/components/schemas/EsploraTransaction',
      });
    });
  });

  describe('convertInterface', () => {
    it('should convert a simple interface', () => {
      const interfaces: ParsedInterface[] = [
        {
          name: 'TestInterface',
          properties: [
            { name: 'id', type: 'string', optional: false },
            { name: 'count', type: 'number', optional: true },
          ],
          sourceFile: 'test.ts',
        },
      ];

      const converter = new SchemaConverter(interfaces, []);
      const schema = converter.convertInterface(interfaces[0]);

      expect(schema).toEqual({
        type: 'object',
        properties: {
          id: { type: 'string' },
          count: { type: 'number' },
        },
        required: ['id'],
      });
    });

    it('should handle interface with extends', () => {
      const interfaces: ParsedInterface[] = [
        {
          name: 'BaseInterface',
          properties: [{ name: 'base', type: 'string', optional: false }],
          sourceFile: 'test.ts',
        },
        {
          name: 'ExtendedInterface',
          properties: [{ name: 'extra', type: 'number', optional: false }],
          extends: ['BaseInterface'],
          sourceFile: 'test.ts',
        },
      ];

      const converter = new SchemaConverter(interfaces, []);
      converter.convertInterface(interfaces[0]);
      const schema = converter.convertInterface(interfaces[1]);

      expect(schema).toHaveProperty('allOf');
      expect(schema.allOf).toHaveLength(2);
    });
  });
});
