import SwaggerParser from '@apidevtools/swagger-parser';
import { Parser } from '@asyncapi/parser';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as YAML from 'yaml';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  severity: 'error';
}

export interface ValidationWarning {
  path: string;
  message: string;
  severity: 'warning';
}

export class SpecValidator {
  private asyncapiParser: Parser;

  constructor() {
    this.asyncapiParser = new Parser();
  }

  async validateOpenAPI(specPath: string): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    try {
      // Read and parse the spec
      const content = await fs.readFile(specPath, 'utf-8');
      const spec = YAML.parse(content);

      // Validate using swagger-parser
      await SwaggerParser.validate(spec);

      // Additional custom validations
      this.validateOpenAPICustom(spec, result);

      console.log(`✓ OpenAPI spec ${path.basename(specPath)} is valid`);
    } catch (error: unknown) {
      result.valid = false;

      if (error instanceof Error) {
        result.errors.push({
          path: specPath,
          message: error.message,
          severity: 'error',
        });
      }

      console.error(`✗ OpenAPI spec ${path.basename(specPath)} validation failed`);
    }

    return result;
  }

  async validateAsyncAPI(specPath: string): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    try {
      const content = await fs.readFile(specPath, 'utf-8');

      // Parse and validate using AsyncAPI parser
      const { document, diagnostics } = await this.asyncapiParser.parse(content);

      if (!document) {
        result.valid = false;
        for (const diag of diagnostics) {
          result.errors.push({
            path: `${specPath}:${diag.range?.start?.line || 0}`,
            message: diag.message,
            severity: 'error',
          });
        }
        console.error(`✗ AsyncAPI spec ${path.basename(specPath)} validation failed`);
      } else {
        // Check for warnings
        for (const diag of diagnostics) {
          if (diag.severity === 1) { // Warning
            result.warnings.push({
              path: `${specPath}:${diag.range?.start?.line || 0}`,
              message: diag.message,
              severity: 'warning',
            });
          }
        }

        console.log(`✓ AsyncAPI spec ${path.basename(specPath)} is valid`);
      }
    } catch (error: unknown) {
      result.valid = false;

      if (error instanceof Error) {
        result.errors.push({
          path: specPath,
          message: error.message,
          severity: 'error',
        });
      }

      console.error(`✗ AsyncAPI spec ${path.basename(specPath)} validation failed`);
    }

    return result;
  }

  private validateOpenAPICustom(spec: Record<string, unknown>, result: ValidationResult): void {
    const paths = spec.paths as Record<string, unknown>;
    if (!paths) return;

    // Check for missing operationIds
    for (const [pathKey, pathItem] of Object.entries(paths)) {
      const methods = ['get', 'post', 'put', 'delete', 'patch'];
      for (const method of methods) {
        const operation = (pathItem as Record<string, unknown>)[method] as Record<string, unknown>;
        if (operation && !operation.operationId) {
          result.warnings.push({
            path: `paths.${pathKey}.${method}`,
            message: 'Missing operationId',
            severity: 'warning',
          });
        }
      }
    }

    // Check for missing descriptions
    const components = spec.components as Record<string, unknown>;
    if (components) {
      const schemas = components.schemas as Record<string, unknown>;
      if (schemas) {
        for (const [schemaName, schema] of Object.entries(schemas)) {
          if (!(schema as Record<string, unknown>).description) {
            result.warnings.push({
              path: `components.schemas.${schemaName}`,
              message: 'Missing description',
              severity: 'warning',
            });
          }
        }
      }
    }
  }

  async validateAll(outputDir: string): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    // Validate main OpenAPI spec
    const openapiPath = path.join(outputDir, 'openapi', 'mempool-api.yaml');
    try {
      await fs.access(openapiPath);
      results.push(await this.validateOpenAPI(openapiPath));
    } catch {
      console.warn(`OpenAPI spec not found at ${openapiPath}`);
    }

    // Validate OpenAPI variants
    const variantsDir = path.join(outputDir, 'openapi', 'variants');
    try {
      const variants = await fs.readdir(variantsDir);
      for (const variant of variants) {
        if (variant.endsWith('.yaml') || variant.endsWith('.json')) {
          results.push(await this.validateOpenAPI(path.join(variantsDir, variant)));
        }
      }
    } catch {
      // Variants directory doesn't exist
    }

    // Validate AsyncAPI spec
    const asyncapiPath = path.join(outputDir, 'asyncapi', 'mempool-websocket.yaml');
    try {
      await fs.access(asyncapiPath);
      results.push(await this.validateAsyncAPI(asyncapiPath));
    } catch {
      console.warn(`AsyncAPI spec not found at ${asyncapiPath}`);
    }

    return results;
  }
}

export async function validateSpecs(outputDir: string): Promise<boolean> {
  const validator = new SpecValidator();
  const results = await validator.validateAll(outputDir);

  const allValid = results.every(r => r.valid);
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);

  console.log(`\nValidation complete: ${results.length} specs checked`);
  if (totalErrors > 0) {
    console.log(`  Errors: ${totalErrors}`);
  }
  if (totalWarnings > 0) {
    console.log(`  Warnings: ${totalWarnings}`);
  }

  return allValid;
}
