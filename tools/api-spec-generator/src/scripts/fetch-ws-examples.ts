import WebSocket from 'ws';

interface WSExample {
  name: string;
  payload: Record<string, unknown>;
  response: string;
}

const MEMPOOL_WS_URL = 'wss://mempool.space/api/v1/ws';

async function fetchWSExample(name: string, payload: Record<string, unknown>, timeout = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(MEMPOOL_WS_URL);
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        resolve('// No response received within timeout');
      }
    }, timeout);

    ws.on('open', () => {
      ws.send(JSON.stringify(payload));
    });

    ws.on('message', (data) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        ws.close();
        try {
          const parsed = JSON.parse(data.toString());
          // Pretty print with 2-space indent, truncate if too long
          let response = JSON.stringify(parsed, null, 2);
          if (response.length > 2000) {
            response = response.slice(0, 2000) + '\n  // ... truncated';
          }
          resolve(response);
        } catch {
          resolve(data.toString().slice(0, 2000));
        }
      }
    });

    ws.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}

async function main() {
  console.log('Fetching WebSocket examples from mempool.space...\n');

  const examples: WSExample[] = [
    {
      name: 'want-mempool-blocks',
      payload: { action: 'want', data: ['mempool-blocks'] },
      response: '',
    },
    {
      name: 'want-stats',
      payload: { action: 'want', data: ['stats'] },
      response: '',
    },
    {
      name: 'want-blocks',
      payload: { action: 'want', data: ['blocks'] },
      response: '',
    },
    {
      name: 'track-address',
      payload: { 'track-address': '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' },
      response: '',
    },
  ];

  for (const example of examples) {
    console.log(`Fetching ${example.name}...`);
    try {
      example.response = await fetchWSExample(example.name, example.payload, 8000);
      console.log(`  Got response (${example.response.length} chars)`);
    } catch (err) {
      console.log(`  Error: ${err}`);
      example.response = '// Error fetching example';
    }
  }

  console.log('\n=== Results ===\n');

  for (const example of examples) {
    console.log(`--- ${example.name} ---`);
    console.log(`Payload: ${JSON.stringify(example.payload)}`);
    console.log(`Response:\n${example.response}\n`);
  }
}

main().catch(console.error);
