import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { tools } from '../../core/src/schema.ts'
export function mcp(dispatch) {
  const server = new McpServer({ name: 'Janotate', version: '0.0.0' })
  for (const [name, inputSchema] of Object.entries(tools)) {
    server.registerTool(name, { inputSchema }, async (args, extra) => {
      const token = extra._meta?.progressToken
      const progress = async (seconds) => {
        if (token !== undefined)
          await extra.sendNotification({
            method: 'notifications/progress',
            params: { progressToken: token, progress: seconds },
          })
      }
      try {
        const value = await dispatch(name, args, progress, extra.signal)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(value) }],
          structuredContent: value,
        }
      } catch (error) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: String(error) }],
        }
      }
    })
  }
  return server
}
