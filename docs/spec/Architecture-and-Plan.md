# Agent Review App: Architecture and Plan

Nov 16, 2026 · @Sami AlMis'hal

## Where we stand

The app is a browser UI started with `npx`, reached by the agent over MCP, with review state kept on disk. These are the decisions so far:

- **Browser, not desktop.** Agent HTML, diagrams and diffs are native to the web, while GPUI would still need an embedded webview. Tauri can wrap it later.
- **Tools are the contract.** The agent never depends on logs, elicitation or any other client extra.
- **A review is stored state.** The agent opens a review and waits by long-polling. If you're away it stops, and when you reprompt it fetches the result by id.
- **Persistent workspace.** A decision log spans sessions, and single-session mode is the same app on a throway store.
- **Dynamic HTML.** An interface with no native component arrives as sandboxed HTML that posts its answers back.
- **The interfaces** are the 22 in the [Agent Interface Catalog](https://claude.ai/artifact/PoHmkypppL5Mgr5yPLhj4g).

## Architecture

&#91;embedded content: architecture, 6 components\]

Locally the client starts a stdio shim, which finds or starts the one server for that project. A hosted server skips the shim and takes HTTP with a token. Either way the tools are identical, and the logs are optional.

## MCP tool surface

Six tools cover the whole loop, and each returns within 45 seconds by default, so no client timeout can lose a review.

| Tool | Takes | Returns |
| --- | --- | --- |
| `review_open` | typed items, title, mode (workspace or session) | review id and the URL to open |
| `review_wait` | review id, wait seconds | `done` with the result, or `pending` with the id |
| `review_get` | review id | status and result; never blocks |
| `review_status` | review id | state, and counts of open, answered and skipped items |
| `item_update` | review id, item id, patch | the revised item, reopened for you |
| `decisions_query` | text, item kind, tags | confirmed decisions with source and date |

How the wait behaves, and what the research changed:

- **The hold is capped, not the review.** `review_wait` holds for 45 seconds, then returns `pending` with the id. The agent loops until your 10-minute limit, then stops and waits for you to reprompt it.
- **A longer hold needs client config.** Claude Code reads a per-server `timeout` in `.mcp.json` as a hard wall-clock limit that progress notifications don't extend ([Claude Code docs](https://code.claude.com/docs/en/mcp)). Set it above the hold if you raise the hold.
- **Desktop may be stricter.** A user report describes a fixed limit near 60 seconds in Claude Desktop, with the result silently dropped ([issue 22542](https://github.com/anthropics/claude-code/issues/22542)). I found nothing in the docs, so treat it as unconfirmed.
- **Send heartbeats anyway.** One write-up describes an idle timeout that aborts a call with no response or progress for a window ([DEV post](https://dev.to/rulestack/when-your-mcp-tool-fails-errors-hangs-and-empty-results-what-claude-code-actually-does-with-2a50)), so `review_wait` emits a progress notification every few seconds.

## Item schema and states

Every interface is a typed item with the same base fields, and the first slice needs only two kinds: `decision` and `html`.

```ts
type Status = 'asked' | 'defaulted' | 'confirmed' | 'corrected' | 'superseded';
type Source = { by: 'user' | 'agent'; basis?: 'stated' | 'inferred' | 'unverified' };

interface ItemBase {
  id: string;
  kind: string;                 // 'decision' | 'html' | later: 'claim', 'diff', 'diagram'
  title: string;
  status: Status;
  source: Source;
  evidence?: { label: string; url?: string }[];
}

interface DecisionItem extends ItemBase {
  kind: 'decision';
  options: { id: string; label: string; tradeoffs: string; recommended?: boolean }[];
}

interface HtmlItem extends ItemBase {
  kind: 'html';
  html: string;
  expects: object;              // JSON Schema; a post that doesn't match is rejected
}

type Anchor =
  | { type: 'item' }
  | { type: 'node'; path: string }                                  // diagram node, table row, diff hunk
  | { type: 'text'; exact: string; prefix: string; suffix: string }; // text quote

interface ReviewResult {
  reviewId: string;
  answers: { itemId: string; status: Status; value?: unknown }[];
  comments: { itemId: string; anchor: Anchor; body: string }[];
  skipped: string[];            // neither approved nor rejected
}
```

Anchors take two forms. Typed items use a structural anchor (item id plus a node path). Free text uses a text quote with surrounding context, the W3C Web Annotation approach, which tolerates small edits to the text ([Apache Annotator](https://annotator.apache.org/docs/getting-started), [Hypothesis](https://web.hypothes.is/blog/fuzzy-anchoring/)). Status moves as in the discussion diagram in the catalog.

## Running it

One command starts or finds the server, state lives in a single SQLite file, and nothing depends on a live connection.

- **Start or find.** The client launches the package with `npx`. The shim checks for a lock file in the project, reuses a running server, or starts one on a fixed port derived from the project path and prints the URL. Two agents on one project share one workspace. This is a recommendation.
- **Storage.** One SQLite file through Node's built-in `node:sqlite`, which avoids a native addon install under `npx` and supports WAL and FTS5 ([CodeGraph](https://github.com/colbymchenry/codegraph/pull/282)). Sources disagree on its status: one project calls it stable from Node 24 ([DeepL CLI](https://github.com/DeepL/deepl-cli/pull/96)), while Better Auth's docs call it a release candidate as of 24.15 ([Better Auth](https://better-auth.com/docs/beta/adapters/sqlite)). Require Node 24 and expect the API to settle.
- **Decision export.** Confirmed decisions are also written as plain files in the repo, so the log travels with git. Whether that is on by default is an open decision below.
- **Hosted mode.** Bind to localhost unless a host flag is set. A token in the URL opens the UI, and a bearer token covers MCP. Agent HTML posts only to its own item's endpoint.
- **Logs.** One JSON line per event on stdout, such as a review being submitted, as a nudge to fetch by id. The tools stay the source of truth.
- **SDK.** The official TypeScript SDK has server and client packages, Express, Hono and Node HTTP adapters, and a stateless HTTP mode ([SDK examples](https://ts.sdk.modelcontextprotocol.io/v2/documents/examples_server_README.html)). Stateless suits this design because review state is in the store, not in a session. One copy of the main-branch README labels v2 pre-alpha ([README](https://github.com/RootWestM/typescript-sdk)), so check the release status and pin a version before building.

## What to reuse

No existing tool covers typed items, diagrams and a decision log together, but five pieces are worth reusing or studying and two are worth waiting on.

| Option | What it gives us | Verdict |
| --- | --- | --- |
| [MCP Apps](https://github.com/modelcontextprotocol/ext-apps) | Tools declare a `ui://` HTML resource that the host renders in a sandboxed iframe, talking over postMessage | Borrow the sandbox model for dynamic HTML. Our UI is its own host, so no client support is needed |
| [Plannotator](https://github.com/backnotprop/plannotator) | A hook on plan mode opens a local review UI; approving continues, denying sends annotations back | The closest existing tool. Study its flow; we add typed items, diagrams and the log |
| [Crit](https://github.com/tomasz-tomczyk/crit) | Renders a plan or diff in the browser like a pull request, with comments on lines | Borrow the PR-style review for the diff walkthrough |
| [react-diff-view](https://github.com/otakustay/react-diff-view) | Split and unified diffs, widgets for inline comments, syntax highlighting through refractor 3.x | Use for diffs. Its README admits slow rendering on huge diffs, so collapse hunks by default |
| [Apache Annotator](https://annotator.apache.org/docs/getting-started) | Describes a text selection as a quote with context, and re-highlights it in the DOM | Use for comments on free text |
| [MCP elicitation](https://nango.dev/blog/mcp-elicitation-explained) | The server asks for flat form input mid-call. Claude Code CLI shows a terminal dialog; Desktop has been [missing it](https://claudeissues.com/issue/41110-feature-mcp-elicitation-support-in-claude-desktop-app) | Optional extra only. Too flat for diagrams and anchored comments |
| [MCP Tasks](https://www.developersdigest.tech/blog/claude-code-mcp-tasks-elicitations-long-running-tools-2026) | A durable task handle the client polls. Public beta in Claude Code CLI from v2.1.304, not in the VS Code extension or desktop app | Later: make `review_wait` task-capable once client support spreads |

Client support moves fast and has had bugs, such as a report that Claude Code [advertises an empty elicitation capability](https://claudeissues.com/issue/88075-bug-claude-code-v2-1-237-does-not-advertise-url-mode-elicitation-on-mcp-2026-07). So plain tools stay the only hard dependency.

## First slice and roadmap

&#91;embedded content: roadmap, 5 phases with gates\]

Phase 1 is the first slice. Dynamic HTML comes before diagrams on purpose: any interface not built yet can be prototyped as HTML and promoted to a native component later.

## Open decisions

Six decisions are open, and each has a recommendation so you can accept them in one pass.

| Decision | Options | Recommendation |
| --- | --- | --- |
| Wait behavior | One 9-minute hold, or 45-second holds the agent loops | 45-second holds looped to 10 minutes. A long hold needs per-client timeout config and may fail on Desktop |
| Decision export | Off, on by default, or on request | On by default into a repo folder, off in session mode |
| Decision log scope | Per project, or shared across projects | Per project first, and a user-level log later if you want one |
| Node baseline | Node 24 only, or Node 22 with a fallback | Node 24 only, because `node:sqlite` is still settling |
| Runtime | Node or Bun | Node, so `npx` and `node:sqlite` stay the single path |
| Hosted auth | Static token, or OAuth | Static token in phase 5, and OAuth only if others will use it |
