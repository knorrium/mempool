import express, { Request, Response } from 'express';
import * as path from 'path';
import { createRequire } from 'module';
import { SpecLoader, SpecInfo } from './spec-loader.js';

const require = createRequire(import.meta.url);

export interface SwaggerServerOptions {
  port: number;
  host: string;
  outputDir: string;
  watch: boolean;
  open: boolean;
}

export class SwaggerServer {
  private app: express.Application;
  private specLoader: SpecLoader;
  private options: SwaggerServerOptions;
  private server: ReturnType<express.Application['listen']> | null = null;

  constructor(options: SwaggerServerOptions) {
    this.options = options;
    this.app = express();

    this.specLoader = new SpecLoader({
      outputDir: options.outputDir,
      onSpecsChanged: () => {
        console.log('[server] Specs changed, clients will reload on next poll');
      },
    });

    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Serve swagger-ui-dist static files
    const swaggerUiPath = path.dirname(require.resolve('swagger-ui-dist/package.json'));
    this.app.use('/swagger-ui', express.static(swaggerUiPath));

    // API routes
    this.app.get('/api/specs', this.handleListSpecs.bind(this));
    this.app.get('/api/specs/status', this.handleStatus.bind(this));
    this.app.get('/api/specs/:filename(*)', this.handleGetSpec.bind(this));

    // Main page
    this.app.get('/', this.handleIndex.bind(this));
  }

  private async handleIndex(_req: Request, res: Response): Promise<void> {
    const html = this.generateIndexHtml();
    res.type('html').send(html);
  }

  private async handleListSpecs(_req: Request, res: Response): Promise<void> {
    try {
      const specs = await this.specLoader.listSpecs();
      res.json(specs);
    } catch (error) {
      console.error('Error listing specs:', error);
      res.status(500).json({ error: 'Failed to list specs' });
    }
  }

  private async handleGetSpec(req: Request, res: Response): Promise<void> {
    const filename = req.params.filename;

    try {
      const spec = await this.specLoader.loadSpec(filename);
      if (spec) {
        res.json(spec);
      } else {
        res.status(404).json({ error: 'Spec not found' });
      }
    } catch (error) {
      console.error(`Error loading spec ${filename}:`, error);
      res.status(500).json({ error: 'Failed to load spec' });
    }
  }

  private async handleStatus(_req: Request, res: Response): Promise<void> {
    try {
      const status = await this.specLoader.getStatus();
      res.json({
        ...status,
        watchMode: this.options.watch,
      });
    } catch (error) {
      console.error('Error getting status:', error);
      res.status(500).json({ error: 'Failed to get status' });
    }
  }

  private generateIndexHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mempool API Documentation</title>
  <link rel="stylesheet" href="/swagger-ui/swagger-ui.css">
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    .header {
      background: #1b1b1b;
      color: white;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      gap: 20px;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .header h1 {
      margin: 0;
      font-size: 18px;
      font-weight: 500;
    }
    .spec-selector {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .spec-selector label {
      font-size: 14px;
      color: #aaa;
    }
    .spec-selector select {
      padding: 6px 12px;
      font-size: 14px;
      border: 1px solid #444;
      border-radius: 4px;
      background: #2d2d2d;
      color: white;
      cursor: pointer;
      min-width: 200px;
    }
    .spec-selector select:hover {
      border-color: #666;
    }
    .spec-selector select:focus {
      outline: none;
      border-color: #5490dc;
    }
    .spec-selector select option {
      background: #2d2d2d;
      color: white;
    }
    .watch-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #888;
      margin-left: auto;
    }
    .watch-indicator.active {
      color: #4caf50;
    }
    .watch-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #888;
    }
    .watch-indicator.active .watch-dot {
      background: #4caf50;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    #swagger-ui {
      max-width: 1460px;
      margin: 0 auto;
    }
    .swagger-ui .topbar {
      display: none;
    }
    .loading {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 200px;
      color: #666;
    }
    .error {
      padding: 20px;
      background: #fee;
      color: #c00;
      border-radius: 4px;
      margin: 20px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Mempool API Documentation</h1>
    <div class="spec-selector">
      <label for="spec-select">Specification:</label>
      <select id="spec-select" disabled>
        <option>Loading...</option>
      </select>
    </div>
    <div class="watch-indicator" id="watch-indicator" style="display: none;">
      <span class="watch-dot"></span>
      <span>Watch mode</span>
    </div>
  </div>
  <div id="swagger-ui">
    <div class="loading">Loading specifications...</div>
  </div>

  <script src="/swagger-ui/swagger-ui-bundle.js"></script>
  <script src="/swagger-ui/swagger-ui-standalone-preset.js"></script>
  <script>
    const STORAGE_KEY = 'mempool-api-spec-selection';
    let swaggerUi = null;
    let specs = [];
    let lastModified = 0;
    let watchMode = false;
    let pollInterval = null;
    let currentSpecIsAsyncApi = false;

    async function loadSpecs() {
      try {
        const response = await fetch('/api/specs');
        specs = await response.json();
        return specs;
      } catch (error) {
        console.error('Failed to load specs:', error);
        document.getElementById('swagger-ui').innerHTML =
          '<div class="error">Failed to load specifications. Make sure specs have been generated.</div>';
        return [];
      }
    }

    async function checkStatus() {
      try {
        const response = await fetch('/api/specs/status');
        const status = await response.json();

        if (status.watchMode !== watchMode) {
          watchMode = status.watchMode;
          const indicator = document.getElementById('watch-indicator');
          if (watchMode) {
            indicator.style.display = 'flex';
            indicator.classList.add('active');
          } else {
            indicator.style.display = 'none';
            indicator.classList.remove('active');
          }
        }

        if (lastModified > 0 && status.lastModified > lastModified) {
          console.log('Specs changed, reloading...');
          lastModified = status.lastModified;

          // Reload specs list
          await loadSpecs();
          populateSelector();

          // Reload current spec
          const select = document.getElementById('spec-select');
          if (select.value) {
            loadSpec(select.value);
          }
        } else {
          lastModified = status.lastModified;
        }
      } catch (error) {
        console.error('Failed to check status:', error);
      }
    }

    function populateSelector() {
      const select = document.getElementById('spec-select');
      const savedSelection = localStorage.getItem(STORAGE_KEY);

      select.innerHTML = '';

      // Group specs
      const mainSpecs = specs.filter(s => !s.isVariant && !s.isAsyncApi);
      const variants = specs.filter(s => s.isVariant && !s.isAsyncApi);
      const asyncapiSpecs = specs.filter(s => s.isAsyncApi);

      if (mainSpecs.length > 0) {
        const mainGroup = document.createElement('optgroup');
        mainGroup.label = 'Main Specs';
        mainSpecs.forEach(spec => {
          const option = document.createElement('option');
          option.value = spec.filename;
          option.textContent = spec.displayName;
          option.dataset.asyncapi = 'false';
          mainGroup.appendChild(option);
        });
        select.appendChild(mainGroup);
      }

      if (variants.length > 0) {
        const variantGroup = document.createElement('optgroup');
        variantGroup.label = 'Variants';
        variants.forEach(spec => {
          const option = document.createElement('option');
          option.value = spec.filename;
          option.textContent = spec.displayName;
          option.dataset.asyncapi = 'false';
          variantGroup.appendChild(option);
        });
        select.appendChild(variantGroup);
      }

      if (asyncapiSpecs.length > 0) {
        const asyncapiGroup = document.createElement('optgroup');
        asyncapiGroup.label = 'WebSocket (AsyncAPI)';
        asyncapiSpecs.forEach(spec => {
          const option = document.createElement('option');
          option.value = spec.filename;
          option.textContent = spec.displayName;
          option.dataset.asyncapi = 'true';
          asyncapiGroup.appendChild(option);
        });
        select.appendChild(asyncapiGroup);
      }

      select.disabled = specs.length === 0;

      // Restore selection or use first spec
      if (savedSelection && specs.some(s => s.filename === savedSelection)) {
        select.value = savedSelection;
      } else if (specs.length > 0) {
        select.value = specs[0].filename;
      }
    }

    function loadSpec(filename) {
      localStorage.setItem(STORAGE_KEY, filename);

      // Check if this is an AsyncAPI spec
      const spec = specs.find(s => s.filename === filename);
      const isAsyncApi = spec && spec.isAsyncApi;
      currentSpecIsAsyncApi = isAsyncApi;

      if (isAsyncApi) {
        // For AsyncAPI specs, show a message with link to AsyncAPI Studio
        const specUrl = window.location.origin + '/api/specs/' + encodeURIComponent(filename);
        const studioUrl = 'https://studio.asyncapi.com/?url=' + encodeURIComponent(specUrl);

        document.getElementById('swagger-ui').innerHTML = \`
          <div style="padding: 40px; max-width: 800px; margin: 0 auto;">
            <h2 style="color: #333; margin-bottom: 20px;">WebSocket API (AsyncAPI)</h2>
            <p style="color: #666; line-height: 1.6; margin-bottom: 30px;">
              This is an AsyncAPI specification for WebSocket endpoints. Swagger UI doesn't natively
              support AsyncAPI specs. You can view this specification using AsyncAPI Studio.
            </p>
            <div style="display: flex; gap: 15px; flex-wrap: wrap;">
              <a href="\${studioUrl}" target="_blank" rel="noopener noreferrer"
                 style="display: inline-block; padding: 12px 24px; background: #5490dc; color: white;
                        text-decoration: none; border-radius: 4px; font-weight: 500;">
                Open in AsyncAPI Studio ↗
              </a>
              <a href="/api/specs/\${encodeURIComponent(filename)}" target="_blank"
                 style="display: inline-block; padding: 12px 24px; background: #f5f5f5; color: #333;
                        text-decoration: none; border-radius: 4px; font-weight: 500; border: 1px solid #ddd;">
                View Raw YAML
              </a>
            </div>
            <div style="margin-top: 40px; padding: 20px; background: #f8f9fa; border-radius: 4px;">
              <h3 style="color: #333; margin: 0 0 15px 0; font-size: 16px;">What's in this spec?</h3>
              <p style="color: #666; margin: 0; line-height: 1.6;">
                The WebSocket API allows real-time subscriptions to blockchain data including
                new blocks, mempool updates, transaction tracking, and address monitoring.
              </p>
            </div>
          </div>
        \`;
        return;
      }

      // If we previously showed AsyncAPI content or swaggerUi is not initialized, recreate
      if (!swaggerUi || document.getElementById('swagger-ui').innerHTML.includes('AsyncAPI')) {
        // Clear the container and reinitialize Swagger UI
        document.getElementById('swagger-ui').innerHTML = '';
        swaggerUi = SwaggerUIBundle({
          url: '/api/specs/' + encodeURIComponent(filename),
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIStandalonePreset
          ],
          plugins: [
            SwaggerUIBundle.plugins.DownloadUrl
          ],
          layout: "StandaloneLayout",
          validatorUrl: null,
          defaultModelsExpandDepth: 1,
          defaultModelExpandDepth: 1,
          docExpansion: 'list',
          filter: true,
          showExtensions: true,
          showCommonExtensions: true,
        });
      } else {
        swaggerUi.specActions.updateUrl('/api/specs/' + encodeURIComponent(filename));
        swaggerUi.specActions.download();
      }
    }

    async function init() {
      await loadSpecs();

      if (specs.length === 0) {
        return;
      }

      populateSelector();

      const select = document.getElementById('spec-select');
      select.addEventListener('change', (e) => {
        loadSpec(e.target.value);
      });

      // Load initial spec
      loadSpec(select.value);

      // Check status and start polling
      await checkStatus();
      pollInterval = setInterval(checkStatus, 2000);
    }

    init();
  </script>
</body>
</html>`;
  }

  async start(): Promise<void> {
    // Start watching if enabled
    if (this.options.watch) {
      this.specLoader.startWatching();
    }

    return new Promise((resolve) => {
      this.server = this.app.listen(this.options.port, this.options.host, () => {
        const url = `http://${this.options.host}:${this.options.port}`;
        console.log(`\nSwagger UI server running at ${url}`);
        console.log(`Serving OpenAPI specs from: ${this.options.outputDir}/openapi`);
        console.log(`Serving AsyncAPI specs from: ${this.options.outputDir}/asyncapi`);
        if (this.options.watch) {
          console.log('Watch mode: enabled');
        }

        // Open browser if requested
        if (this.options.open) {
          this.openBrowser(url);
        }

        resolve();
      });
    });
  }

  private async openBrowser(url: string): Promise<void> {
    const { exec } = await import('child_process');
    const platform = process.platform;

    let command: string;
    if (platform === 'darwin') {
      command = `open "${url}"`;
    } else if (platform === 'win32') {
      command = `start "${url}"`;
    } else {
      command = `xdg-open "${url}"`;
    }

    exec(command, (error) => {
      if (error) {
        console.log(`Could not open browser automatically. Please visit: ${url}`);
      }
    });
  }

  async stop(): Promise<void> {
    await this.specLoader.stopWatching();

    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          console.log('\nServer stopped');
          resolve();
        });
      });
    }
  }
}

export async function startSwaggerServer(options: SwaggerServerOptions): Promise<SwaggerServer> {
  const server = new SwaggerServer(options);
  await server.start();
  return server;
}
