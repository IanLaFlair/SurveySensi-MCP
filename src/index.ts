// src/index.ts di surveysensei-mcp

import { ExampleMcpServer } from './server';

export { ExampleMcpServer };

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // ✅ Pastikan SELALU ada sessionId di query
    let sessionId = url.searchParams.get('sessionId');

    // Kalau client (Inspector, Toolbox, dll) nggak kirim sessionId,
    // kita pakai default "global" supaya SELALU masuk ke DO yang sama.
    if (!sessionId) {
      sessionId = 'global';
      url.searchParams.set('sessionId', sessionId);
    }

    // ✅ Pakai idFromName biar deterministik (sessionId yang sama → DO yang sama)
    const id = env.EXAMPLE_MCP_SERVER.idFromName(sessionId);

    console.log(
      `[MCP entry] routing request path=${url.pathname} sessionId=${sessionId} → DO id=${id.toString()}`,
    );

    const newReq = new Request(url.toString(), request);

    // Forward ke Durable Object
    return env.EXAMPLE_MCP_SERVER.get(id).fetch(newReq);
  },
};
