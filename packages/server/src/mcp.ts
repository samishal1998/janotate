import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { tools } from '../../core/src/schema.ts'
import {
  catalog,
  itemMarkdown,
  serverInstructions,
  toolHelp,
  workflowMarkdown,
} from './agent-context.ts'
export function mcp(dispatch) {
  const server = new McpServer(
    { name: 'Janotate', version: '0.0.0' },
    { instructions: serverInstructions },
  )
  function resource(
    name: string,
    uri: string,
    description: string,
    mimeType: string,
    read: () => string,
  ) {
    server.registerResource(name, uri, { description, mimeType }, () => ({
      contents: [{ uri, mimeType, text: read() }],
    }))
  }
  resource(
    'Review workflow',
    'janotate://agent/workflow',
    'Opening, discussing and resuming reviews.',
    'text/markdown',
    workflowMarkdown,
  )
  resource(
    'Item and tool catalog',
    'janotate://agent/catalog',
    'Choose an interaction and find its authoring reference.',
    'application/json',
    () => JSON.stringify(catalog),
  )
  for (const item of catalog.items)
    resource(item.kind, item.uri, item.purpose, 'text/markdown', () =>
      itemMarkdown(item.kind),
    )
  for (const [name, inputSchema] of Object.entries(tools)) {
    server.registerTool(
      name,
      { inputSchema, description: toolHelp[name] },
      async (args, extra) => {
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
      },
    )
  }
  return server
}
