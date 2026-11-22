import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStdioServer } from './stdio.js';

export * from './server.js';
export * from './stdio.js';
export * from './http.js';

const isMain =
  Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  startStdioServer().catch((error) => {
    console.error('[mcp-server] Falha ao iniciar servidor stdio:', error);
    process.exit(1);
  });
}
