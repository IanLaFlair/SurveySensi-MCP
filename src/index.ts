import { ExampleMcpServer } from './server';

// Export DO class
export { ExampleMcpServer };

// Worker entrypoint
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // 🔧 Shim penting: ToolboxService kirim POST /sse,
    // sedangkan McpHonoServerDO expect POST /sse/message.
    if (url.pathname === '/sse' && request.method === 'POST') {
      url.pathname = '/sse/message';
    }

    // Logic sessionId originalmu
    const sessionIdStr = url.searchParams.get('sessionId');
    const id = sessionIdStr
      ? env.EXAMPLE_MCP_SERVER.idFromString(sessionIdStr)
      : env.EXAMPLE_MCP_SERVER.newUniqueId();

    console.log(`Fetching sessionId: ${sessionIdStr} with id: ${id}`);

    url.searchParams.set('sessionId', id.toString());

    const newReq = new Request(url.toString(), request);
    return env.EXAMPLE_MCP_SERVER.get(id).fetch(newReq);
  },
};
