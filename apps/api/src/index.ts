import { getRealGraph } from '@hero/agent';
import { build } from './app.js';

const app = build({
  getChatGraph: getRealGraph,
  getMcpGraph: getRealGraph,
});

app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
