import { Implementation } from '@modelcontextprotocol/sdk/types.js';
import { McpHonoServerDO } from '@nullshot/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { setupServerTools } from './tools';
import { setupServerResources } from './resources';
import { setupServerPrompts } from './prompts';

/**
 * ExampleMcpServer extends McpHonoServerDO
 */
export class ExampleMcpServer extends McpHonoServerDO<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  getImplementation(): Implementation {
    return {
      name: 'SurveySenseiMcpServer',
      version: '0.1.0',
    };
  }

  configureServer(server: McpServer): void {
    // ⬅️ Pake this.ctx.storage, nggak usah deklar field baru
    setupServerTools(server, this.ctx.storage);
    setupServerResources(server);
    setupServerPrompts(server);
  }
}
