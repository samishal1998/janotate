import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const examples = {
  pilot: {
    title: 'Field Notes · pilot readiness',
    data: '.janotate/pilot-demo',
    pages: [
      'interfaces/proposal',
      'interfaces/plan',
      'interfaces/ranking',
      'interfaces/range',
      'interfaces/scope_board',
      'guides/infrastructure',
      'interfaces/diff',
      'interfaces/code',
    ],
  },
  schema: {
    title: 'Field Notes · delivery architecture',
    data: '.janotate/schema-demo',
    pages: ['interfaces/dbml', 'guides/infrastructure', 'interfaces/proposal'],
  },
  motion: {
    title: 'Field Notes · motion review',
    data: '.janotate/schema-demo',
    pages: [
      'guides/infrastructure',
      'interfaces/lottie',
      'guides/retry-trace',
      'interfaces/plan',
    ],
  },
}
const kind = process.argv.includes('--motion')
  ? 'motion'
  : process.argv.includes('--schema')
    ? 'schema'
    : 'pilot'
const example = examples[kind]
const origin = execFileSync(
  process.execPath,
  [resolve('bin/janotate.mjs'), '--data', resolve(example.data), '--no-open'],
  { encoding: 'utf8' },
).trim()
const client = new Client({ name: 'pilot-example', version: '1' })
try {
  await client.connect(
    new StreamableHTTPClientTransport(new URL('/mcp', origin)),
  )
  const items = example.pages.map((file) => {
    const doc = readFileSync(
      'packages/docs/src/content/docs/' + file + '.md',
      'utf8',
    )
    return JSON.parse(doc.match(/```json\n([\s\S]*?)\n```/)[1]).arguments
      .items[0]
  })
  const result = await client.callTool({
    name: 'review_open',
    arguments: {
      title: example.title,
      items,
      mode: 'workspace',
    },
  })
  if (result.isError) throw Error(JSON.stringify(result.content))
  const { review_id, item_ids, url } = result.structuredContent as {
    review_id: string
    item_ids: string[]
    url: string
  }
  const threads = {
    schema: {
      anchor: { type: 'node', path: 'field:notes.client_key' },
      body: 'What prevents a reconnect from creating a second note?',
      reply:
        'The unique client key stays with the note across retries. The receipt records when the server accepted it.',
    },
    motion: {
      anchor: { type: 'node', path: 'node:svc' },
      body: 'During a rollout, when does the Service route a write to the new replica?',
      reply:
        'After the readiness check passes. Switch to the next walkthrough step to see the Service choose a ready pod.',
    },
  }
  function proposalThread() {
    const section = items[0].sections[0],
      exact = 'local receipt',
      start = section.body.indexOf(exact)
    return {
      anchor: {
        type: 'text',
        section_id: section.id,
        exact,
        start,
        prefix: section.body.slice(Math.max(0, start - 48), start),
        suffix: section.body.slice(
          start + exact.length,
          start + exact.length + 48,
        ),
      },
      body: 'Can the crew trace the receipt if the tablet loses its connection again?',
      reply:
        'Yes. The tablet keeps the receipt across restarts and reuses it on the next attempt.',
    }
  }
  const {
    anchor,
    body,
    reply: message,
  } = kind === 'pilot' ? proposalThread() : threads[kind]
  const response = await fetch(
    origin + '/api/review/' + review_id + '/items/' + item_ids[0] + '/comments',
    {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ anchor, body }),
    },
  )
  if (!response.ok) throw Error(await response.text())
  const { comments } = await response.json()
  const reply = await client.callTool({
    name: 'discussion_reply',
    arguments: {
      review_id,
      item_id: item_ids[0],
      parent_id: comments[0].id,
      reply: message,
    },
  })
  if (reply.isError) throw Error(JSON.stringify(reply.content))
  console.log(url + (kind === 'pilot' ? '' : '?view=focus'))
} finally {
  await client.close()
}
