import * as fs from 'fs/promises';
import * as path from 'path';
import * as YAML from 'yaml';
import * as chokidar from 'chokidar';

export interface SpecInfo {
  filename: string;
  displayName: string;
  path: string;
  isVariant: boolean;
  isAsyncApi: boolean;
  lastModified: number;
}

export interface SpecLoaderOptions {
  outputDir: string;
  onSpecsChanged?: () => void;
}

export class SpecLoader {
  private outputDir: string;
  private specsDir: string;
  private variantsDir: string;
  private asyncapiDir: string;
  private watcher: chokidar.FSWatcher | null = null;
  private onSpecsChanged?: () => void;
  private lastModified: number = 0;

  constructor(options: SpecLoaderOptions) {
    this.outputDir = options.outputDir;
    this.specsDir = path.join(options.outputDir, 'openapi');
    this.variantsDir = path.join(this.specsDir, 'variants');
    this.asyncapiDir = path.join(options.outputDir, 'asyncapi');
    this.onSpecsChanged = options.onSpecsChanged;
  }

  /**
   * Convert a filename to a human-readable display name
   * e.g., "mainnet-full.yaml" → "Mainnet Full"
   */
  private toDisplayName(filename: string, isVariant: boolean): string {
    const baseName = filename
      .replace(/\.(yaml|yml|json)$/, '')
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    // Mark main specs as "All Networks" reference
    if (!isVariant && baseName === 'Mempool Api') {
      return 'All Networks (Reference)';
    }

    return baseName;
  }

  /**
   * Get file modification time
   */
  private async getLastModified(filePath: string): Promise<number> {
    try {
      const stats = await fs.stat(filePath);
      return stats.mtimeMs;
    } catch {
      return 0;
    }
  }

  /**
   * List all available spec files
   */
  async listSpecs(): Promise<SpecInfo[]> {
    const specs: SpecInfo[] = [];

    // Check main openapi directory for main spec
    try {
      const mainFiles = await fs.readdir(this.specsDir);
      for (const file of mainFiles) {
        if (file.match(/\.(yaml|yml|json)$/)) {
          const filePath = path.join(this.specsDir, file);
          const stat = await fs.stat(filePath);
          if (stat.isFile()) {
            specs.push({
              filename: file,
              displayName: this.toDisplayName(file, false),
              path: filePath,
              isVariant: false,
              isAsyncApi: false,
              lastModified: stat.mtimeMs,
            });
          }
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }

    // Check variants directory
    try {
      const variantFiles = await fs.readdir(this.variantsDir);
      for (const file of variantFiles) {
        if (file.match(/\.(yaml|yml|json)$/)) {
          const filePath = path.join(this.variantsDir, file);
          const stat = await fs.stat(filePath);
          if (stat.isFile()) {
            specs.push({
              filename: `variants/${file}`,
              displayName: this.toDisplayName(file, true),
              path: filePath,
              isVariant: true,
              isAsyncApi: false,
              lastModified: stat.mtimeMs,
            });
          }
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }

    // Check asyncapi directory for WebSocket specs
    try {
      const asyncapiFiles = await fs.readdir(this.asyncapiDir);
      for (const file of asyncapiFiles) {
        if (file.match(/\.(yaml|yml|json)$/)) {
          const filePath = path.join(this.asyncapiDir, file);
          const stat = await fs.stat(filePath);
          if (stat.isFile()) {
            specs.push({
              filename: `asyncapi/${file}`,
              displayName: `WebSocket: ${this.toDisplayName(file, false)}`,
              path: filePath,
              isVariant: false,
              isAsyncApi: true,
              lastModified: stat.mtimeMs,
            });
          }
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }

    // Sort: variants first (bitcoin-networks as default), then main specs, then AsyncAPI specs
    // This ensures users see network-specific specs first to avoid cross-network confusion
    specs.sort((a, b) => {
      // AsyncAPI specs come last
      if (a.isAsyncApi !== b.isAsyncApi) {
        return a.isAsyncApi ? 1 : -1;
      }
      // Variants come before main specs
      if (a.isVariant !== b.isVariant) {
        return a.isVariant ? -1 : 1;
      }
      // "Bitcoin Networks" should be first among variants
      if (a.isVariant && b.isVariant) {
        if (a.displayName === 'Bitcoin Networks') return -1;
        if (b.displayName === 'Bitcoin Networks') return 1;
      }
      return a.displayName.localeCompare(b.displayName);
    });

    return specs;
  }

  /**
   * Load and parse a spec file
   */
  async loadSpec(filename: string): Promise<object | null> {
    const specs = await this.listSpecs();
    const spec = specs.find(s => s.filename === filename);

    if (!spec) {
      return null;
    }

    try {
      const content = await fs.readFile(spec.path, 'utf-8');

      if (filename.endsWith('.json')) {
        return JSON.parse(content);
      } else {
        return YAML.parse(content);
      }
    } catch (error) {
      console.error(`Error loading spec ${filename}:`, error);
      return null;
    }
  }

  /**
   * Get the modification status for hot-reload polling
   */
  async getStatus(): Promise<{ lastModified: number; specCount: number }> {
    const specs = await this.listSpecs();
    const maxModified = specs.reduce((max, spec) => Math.max(max, spec.lastModified), 0);

    return {
      lastModified: maxModified,
      specCount: specs.length,
    };
  }

  /**
   * Start watching for file changes
   */
  startWatching(): void {
    if (this.watcher) {
      return;
    }

    const watchPaths = [
      path.join(this.specsDir, '*.yaml'),
      path.join(this.specsDir, '*.yml'),
      path.join(this.specsDir, '*.json'),
      path.join(this.variantsDir, '*.yaml'),
      path.join(this.variantsDir, '*.yml'),
      path.join(this.variantsDir, '*.json'),
      path.join(this.asyncapiDir, '*.yaml'),
      path.join(this.asyncapiDir, '*.yml'),
      path.join(this.asyncapiDir, '*.json'),
    ];

    this.watcher = chokidar.watch(watchPaths, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    this.watcher.on('all', (event, filePath) => {
      console.log(`[watch] ${event}: ${path.basename(filePath)}`);
      this.lastModified = Date.now();
      if (this.onSpecsChanged) {
        this.onSpecsChanged();
      }
    });

    console.log('Watching for spec changes...');
  }

  /**
   * Stop watching for file changes
   */
  async stopWatching(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }
}
