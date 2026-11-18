# Janotate: Product Requirements

Nov 16, 2026 · @Sami AlMis'hal

## Overview

Janotate is a local-first review app that replaces chat as the place where you and a coding agent decide things. The agent sends typed items (decisions, diffs, diagrams, claims) over MCP, you answer and comment on exact parts in a browser, and the agent receives structured results. The name blends Janus, the god of thresholds, with annotate.

It exists because generation became cheap while review did not. In your own sessions, questions, agent defaults and confirmed decisions looked identical inside long documents, and wrong assumptions survived because the text read as coherent. Janotate gives each of those a status, a source and an anchor.

It runs with one `npx` command, keeps state in a project-local SQLite file, and can also run hosted. Implementers should read this PRD with two companion docs: the Agent Interface Catalog (the 22 interfaces) and the Architecture and Plan doc (research and decisions).

## Goals and non-goals

The goal is to make review cheaper than generation for plans, decisions and code changes, and to stop the same question being asked twice.

**Goals**

- An agent opens a review and gets a structured result back, with no copy-pasting.
- You discuss a decision by commenting on the exact part you doubt, not by replying to a whole document.
- Any interface missing from the catalog can be prototyped as agent-sent HTML and promoted later.
- Confirmed decisions persist per project, and the agent can query them before asking.
- One `npx` command starts it, and a built-in documentation site explains it.

**Non-goals for v1**

- No real-time multi-user editing. One reviewer per review.
- No hosted SaaS, accounts or billing. Hosted mode is self-run with a token.
- No agent runtime. Janotate never calls a model itself.
- No replacement for pull requests. Diffs are reviewed here, merging stays in git.

**Success measures**

| Measure | Target |
| --- | --- |
| Review submitted, then fetched after a server restart | Result intact, 100% of test runs |
| Time from `npx` to a rendered decision card | Under 10 seconds on a warm cache |
| Questions the agent skips because the log already answers | Observable in phase 5 acceptance test |
| Agent-sent HTML that escapes the sandbox in the security test suite | Zero |

## Users and core workflows

There are two users: a developer who reviews, and a coding agent that asks. Four workflows cover how they meet.

1. **Open and answer.** The agent calls `review_open` with typed items and gets a review id and a URL. You open the URL, answer each item and submit. The agent's `review_wait` returns the result.
2. **Discuss a decision.** You select part of an item (an option, a diagram node, a text span) and comment. The agent replies in that thread through `item_update`, and only that item reopens for you. A confirmed item moves to `confirmed`. A later change marks the old one `superseded`, never deleted.
3. **Away and return.** If the review is not done after 10 minutes of looped waits, the agent stops and tells you the review id. When you reprompt it, it calls `review_get` and continues, with no state lost.
4. **Ask once.** Before opening a review, the agent calls `decisions_query`. A question the log already answers is not asked again, and a stale answer is shown as a default for you to confirm.

**Modes**

- **Workspace mode** (default). State persists in the project's database file and the decision log spans reviews.
- **Session mode.** The same app on a throwaway store, discarded when the server stops.
- **Local and hosted.** Local binds to localhost and starts from `npx`. Hosted binds to a host you choose and requires tokens (see Hosting).

## System architecture

&#91;embedded content: system architecture, one process\]

The agent and the browser reach the same core service through different front doors, and only the core service touches the store. The built UI bundle and the docs site are static files that the router serves, so the app needs no build step at runtime.

**Runtime rules**

- **One server per project.** The shim checks a lock file in the project's data folder, reuses a running server, or starts one and prints the URL. Two agents on one project share one workspace.
- **Stateless MCP.** Every tool call stands alone, because review state lives in the store and never in a session.
- **Write before respond.** A submitted review is committed before the browser sees success, so a crash cannot lose it.
- **Logs are a bonus.** The server prints one JSON line per event (such as a review submitted), and nothing may depend on them.

## MCP API

Six tools make up the whole contract, every call returns within 45 seconds, and every id is a server-issued string. Inputs are validated with Zod schemas, and an invalid call returns a tool error naming the field.

| Tool | Input | Output |
| --- | --- | --- |
| `review_open` | `title`, `items[]`, `mode` (`workspace` or `session`), `ttl_hours` (optional) | `review_id`, `url`, `item_ids[]` |
| `review_wait` | `review_id`, `wait_seconds` (1 to 45, default 45) | `{state:'done', result}` or `{state:'pending', answered, total}` |
| `review_get` | `review_id` | `{state, result}`; never blocks |
| `review_status` | `review_id` | counts of `asked`, `answered`, `skipped`, plus last activity time |
| `item_update` | `review_id`, `item_id`, `patch`, `reply` (text for the comment thread) | the revised item, status reset to `asked` |
| `decisions_query` | `text`, `kinds[]`, `tags[]`, `limit` | confirmed decisions with source and date |

**Wait semantics**

- `review_wait` holds the connection up to `wait_seconds`, sends a progress notification every 5 seconds, and returns early when you submit.
- `pending` is a normal result. The agent loops for up to 10 minutes in total, then stops and reports the review id.
- A review's `state` is one of `open`, `done`, `expired` or `cancelled`. `done` is final, and `review_get` on a done review is idempotent.

**Result shape**

```ts
interface ReviewResult {
  review_id: string;
  submitted_at: string;                       // ISO 8601
  answers: { item_id: string; status: Status; value?: unknown }[];
  comments: { item_id: string; anchor: Anchor; body: string; created_at: string }[];
  skipped: string[];                          // neither approved nor rejected
}
```

**Errors**

| Code | When | Agent should |
| --- | --- | --- |
| `not_found` | unknown review or item id | stop and report |
| `invalid_items` | an item fails its schema | fix and reopen |
| `review_closed` | `item_update` on a done review | open a new review |
| `quota` | too many open reviews in the project | finish or cancel one |
| `unauthorized` | hosted mode, bad or missing token | stop and report |

Optional extras, never required: elicitation for a one-line question, and MCP Tasks for `review_wait` once client support is broad. Plain tools are the only hard dependency, because client support for both extras has been patchy.

## Data model

Five tables hold everything, and rows are never hard-deleted, because history is the point. The store is one SQLite file in WAL mode, opened through Node's built-in `node:sqlite`, so Node 24 is required.

```sql
CREATE TABLE review (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('open','done','expired','cancelled')),
  mode TEXT NOT NULL CHECK (mode IN ('workspace','session')),
  created_at TEXT NOT NULL,
  submitted_at TEXT,
  expires_at TEXT
);

CREATE TABLE item (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES review(id),
  kind TEXT NOT NULL,                 -- 'decision' | 'html' | later kinds
  title TEXT NOT NULL,
  body_json TEXT NOT NULL,            -- the typed payload for the kind
  status TEXT NOT NULL CHECK (status IN ('asked','defaulted','confirmed','corrected','superseded')),
  source_by TEXT NOT NULL CHECK (source_by IN ('user','agent')),
  source_basis TEXT CHECK (source_basis IN ('stated','inferred','unverified')),
  value_json TEXT,                    -- the answer, when there is one
  revision INTEGER NOT NULL DEFAULT 1,
  superseded_by TEXT REFERENCES item(id)
);

CREATE TABLE comment (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES item(id),
  parent_id TEXT REFERENCES comment(id),   -- thread reply
  author TEXT NOT NULL CHECK (author IN ('user','agent')),
  anchor_json TEXT NOT NULL,               -- item | node path | text quote with prefix and suffix
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES item(id),
  label TEXT NOT NULL,
  url TEXT
);

CREATE TABLE decision (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES item(id),
  question TEXT NOT NULL,
  answer_json TEXT NOT NULL,
  tags TEXT,                          -- comma separated
  decided_at TEXT NOT NULL,
  superseded_by TEXT REFERENCES decision(id)
);
```

**Rules**

- **Supersede, never delete.** Changing a confirmed decision inserts a new `decision` row and points the old row's `superseded_by` at it.
- **Revisions.** `item_update` bumps `revision` and resets `status` to `asked`, and the previous body stays recoverable from the comment thread.
- **Search.** `decisions_query` uses an FTS5 index over `question` and `tags`.
- **Export.** Confirmed decisions are also written as Markdown files under a project folder, so the log travels with git. Whether this is on by default is an open question below.
- **Session mode.** The same schema in a temporary file that is removed when the server stops.

## Item types and UI specs

Every item shares one frame (title, status badge, source badge, evidence, comment thread), and each kind fills the body. Two kinds are fully specified here because the first phases need them, and the rest follow the same contract.

### Decision card (phase 1)

- **Payload.** `options[]` with `id`, `label`, `tradeoffs` and optional `recommended`, plus an optional free-text answer.
- **Layout.** Options as stacked cards, the recommended one marked, trade-offs visible without expanding. A free-text field sits below as "Other".
- **Interaction.** Pick one option (or write another), then optionally comment. Selecting sets `confirmed` or `corrected` (if you chose something other than the recommendation).
- **Comments.** Select any text inside an option to attach a comment, anchored by a text quote with prefix and suffix. An option as a whole takes a node anchor `option:<id>`.
- **Edge cases.** An item the agent marked `defaulted` shows its default preselected and still needs an explicit confirm. Skipping is allowed and returns the item in `skipped`.

### HTML item (phase 3)

- **Payload.** `html` (a document fragment) and `expects` (a JSON Schema for the posted answers).
- **Layout.** A sandboxed frame inside the item frame, with a submit status line outside the frame that the app controls.
- **Interaction.** The form posts only to this item's endpoint, and the answer is validated against `expects` before it is accepted.
- **Comments.** The app cannot reach inside the frame, so comments attach to the item as a whole, not to parts of the HTML.

### The rest of the catalog

Each later kind is a typed payload plus a renderer, and each ships only after its phase gate.

| Kind | Renders | You return | Phase |
| --- | --- | --- | --- |
| `claim` | claim ledger with evidence and a verified, wrong or research state | a state per claim | 2 |
| `defaults` | list of agent defaults with accept or override | accepted or new value per default | 2 |
| `diagram` | clickable diagram from a spec (Mermaid first) | comments on nodes and edges | 4 |
| `diff` | split or unified diff with a stepper | approve per step, comments on hunks | 4 |
| `function_overview` | named blocks with collapsed code | comments on a block | 4 |
| `plan` | outline tree with per-node status | status and comment per node | 4 |
| `matrix` | options by criteria with reweighting | the chosen option and weights | 4 |
| `scope_board` | in scope, deferred, out of scope columns | the final column per card | 4 |
| `digest` | what happened while you were away | approve, reverse or answer per item | 5 |

The other entries in the catalog (coverage matrix, reconciliation view, hypothesis board, state stepper, visual picker, draft review, handoff check, rollout tracker, risk register) are built as HTML items first and promoted to native kinds only when one proves worth it.

## Dynamic HTML and the sandbox

Agent-sent HTML is untrusted code, so it runs in a sandboxed frame with no path to the app, the workspace or any other item. This section is a requirement, and the security test suite must prove each rule.

**Rules**

1. **Sandboxed frame.** The HTML loads in an iframe with `sandbox="allow-scripts allow-forms"` and nothing else. It never gets `allow-same-origin`, so it cannot read the app's storage or cookies.
2. **Separate origin.** The HTML is served from its own origin or port, never from the app's origin.
3. **Strict policy.** The frame is served with a Content Security Policy that blocks all network access except form posts to its own item endpoint, and blocks remote scripts, styles and images unless the agent lists them in the item.
4. **One endpoint, one use.** The frame posts to `/html/<item_id>/<nonce>`. The nonce is random per render and valid for one accepted post, and a second post is refused.
5. **Schema check.** The post body is validated against the item's `expects` schema. A post that does not match is rejected, the form stays open, and the error shows in the app's status line.
6. **App-owned chrome.** The submit status and the item title are drawn by the app outside the frame, so the HTML cannot impersonate them.
7. **No privileged messages.** The frame may use `postMessage` only for a fixed set of events (`resize`, `submit`). Anything else is ignored.

**Post contract**

- A plain HTML form post works with no script, and a script may call `fetch` to the same endpoint.
- The accepted answer becomes the item's `value_json`, and the item moves to `confirmed`.
- Fields beyond `expects` are dropped, never stored.

**Security tests**

| Test | Pass condition |
| --- | --- |
| Frame reads parent storage or cookies | Blocked |
| Frame requests an outside URL | Blocked by the policy |
| Frame posts to another item's endpoint | Refused |
| Replayed post with a used nonce | Refused |
| Post that violates `expects` | Rejected, nothing stored |
| Frame tries to navigate the top window | Blocked |

The model follows the sandboxed-iframe approach of [MCP Apps](https://github.com/modelcontextprotocol/ext-apps), where the UI talks to its host only over a narrow message channel.

## Hosting, auth and security

Local is the default and needs no auth. Hosted mode is opt-in and refuses to start without tokens, so an exposed server is never unauthenticated by accident.

|  | Local (default) | Hosted |
| --- | --- | --- |
| Bind address | `127.0.0.1` | set by `--host`, and only with tokens configured |
| UI access | open on localhost | URL token, then a session cookie |
| MCP access | stdio shim or HTTP on localhost | HTTP with a bearer token |
| Agent HTML origin | separate localhost port | separate hostname or port |
| Storage | project data folder | a volume path set by `--data` |

**Requirements**

- **Two tokens.** A UI token for the browser and an MCP token for the agent, so giving the agent access never hands over the UI.
- **Host check.** Reject requests whose `Host` header does not match the configured host, which blocks DNS rebinding against the local server.
- **Constant-time compare** for tokens, and tokens are never written to logs.
- **TLS is out of scope.** Hosted deployments sit behind a reverse proxy that terminates TLS, and the docs say so plainly.
- **No multi-tenancy.** One server serves one project and one reviewer. Static tokens suffice for v1, and OAuth is deferred unless others will use a shared instance.
- **Data at rest.** The SQLite file holds your plans and decisions, and the docs tell users to treat it as sensitive.

## Documentation site

The app serves a full documentation site at `/docs`, built with Astro Starlight and shipped inside the npm package. Starlight is configured in `astro.config.mjs` ([manual setup](https://starlight.astro.build/manual-setup/)) and builds to a static folder, so nothing in the running app depends on Astro.

**How it is built and served**

- **Package.** A `docs` package in the repo holds the Starlight project, with pages as Markdown or MDX under `src/content/docs/`.
- **Base path.** Set Astro's `base` to `/docs/`. It prefixes every page and asset in both dev and production, so the same build works behind the app's router ([Astro config](https://docs.astro.build/en/reference/configuration-reference/)).
- **Build.** `astro build` writes a static `dist` folder, and the release build copies it into the server package.
- **Serve.** The HTTP router serves that folder at `/docs` as plain static files, with search built in and no Astro at runtime.
- **Links in content.** With a subpath base, hand-written absolute links need the prefix, so content uses relative links ([discussion](https://github.com/withastro/starlight/discussions/966)).
- **In the app.** The UI header links to `/docs`, and each item kind links to its page.

**Page structure**

| Section | Pages |
| --- | --- |
| Start | What Janotate is, quick start with `npx`, connecting an agent over MCP |
| Concepts | Reviews and items, statuses and sources, anchors and comments, the decision log |
| Interfaces | One page per item kind, with a screenshot, its payload and an example call |
| Dynamic HTML | Writing an agent-sent form, the `expects` schema, sandbox limits |
| Reference | Every MCP tool, the result shape, error codes, configuration flags |
| Guides | Local and hosted setup, behind a reverse proxy, backing up the store, session mode |
| Agents | A copy-ready snippet that tells an agent when and how to call Janotate |

**Requirements**

- Every MCP tool and every item kind has a docs page before its phase gate passes.
- Code examples in the docs run in the test suite, so they cannot drift from the API.
- The docs build is part of CI, and a broken link fails the build.

## Repo layout, stack and build

One TypeScript monorepo with four packages, published as a single `janotate` npm package. Items marked *proposed* are my recommendations and not yet verified against current versions.

```
janotate/
  packages/
    core/      review service, store, schemas (no HTTP, no MCP)
    server/    HTTP router, MCP layer, stdio shim, CLI entry
    ui/        React app, built to static assets
    docs/      Astro Starlight site, base /docs/
  tests/       integration, security and e2e
```

| Concern | Choice | Status |
| --- | --- | --- |
| Language and runtime | TypeScript on Node 24 | Decided |
| MCP | Official TypeScript SDK, stateless Streamable HTTP, plus stdio | Decided; pin a version, since one README labels v2 pre-alpha |
| Validation | Zod schemas shared by core, server and UI | Proposed |
| Store | `node:sqlite`, WAL, FTS5 | Decided; sources disagree on its stability |
| HTTP | Hono through the SDK's Hono adapter | Proposed |
| UI | React with Vite | Proposed |
| Diffs | `react-diff-view` with collapsed hunks by default | Decided as a candidate |
| Text anchors | Apache Annotator, text-quote selectors | Decided as a candidate |
| Diagrams | Mermaid first | Proposed |
| Docs | Astro Starlight | Decided |
| Package manager | pnpm workspaces | Proposed |
| Tests | Vitest for units, Playwright for the UI and the sandbox | Proposed |

**Build and release**

1. Build `ui` and `docs` to static folders.
2. Bundle `server` with the built assets inside it.
3. Publish one package whose `bin` is the CLI, so `npx janotate` works with no other install.
4. CI runs lint, type check, unit, integration, the security suite and the docs build, on Node 24 only.

**CLI**

- `janotate` starts or finds the server for the current project and prints the URL.
- `janotate mcp` runs the stdio shim that an MCP client launches.
- Flags: `--port`, `--host`, `--data`, `--session`, `--no-open`.

## Testing

Each phase ends with one acceptance test that a person or a script can run, and a phase is not done until it passes. Tests below that level follow four layers.

- **Unit.** Core service rules: status transitions, supersede logic, schema validation, anchor round trips.
- **Integration.** A real MCP client against a real server and a temporary store, covering every tool and every error code.
- **Security.** The sandbox suite from the Dynamic HTML section, run in a real browser with Playwright.
- **End to end.** A scripted agent opens a review, a browser answers it, and the script reads the result, including across a server restart.

**Acceptance test per phase**

| Phase | Test | Pass condition |
| --- | --- | --- |
| 1 Core loop | Open a decision card, answer it, restart the server, then call `review_get` | Same result returned |
| 2 Discussion | Comment on one option and call `item_update` with a reply | Only that item reopens, and the others stay answered |
| 3 Dynamic HTML | Send a form with an `expects` schema | Valid post accepted, invalid and replayed posts refused |
| 4 Diagrams and diffs | Review one real agent-made change end to end | Comments on nodes and hunks return with correct anchors |
| 5 Workspace and hosting | Confirm a decision, then open a review asking the same question | The agent skips it through `decisions_query`, and hosted mode refuses a bad token |

**Cross-cutting checks**

- A wait loop of 10 minutes against a client with a 60-second tool timeout still returns every call in time.
- A 200-hunk diff renders with hunks collapsed and stays responsive.
- The docs examples are executed in CI.

## Phased delivery

&#91;embedded content: delivery phases with acceptance gates\]

Dynamic HTML comes before diagrams on purpose. Any interface not built yet can be prototyped as HTML and promoted to a native kind later, which lets you test ideas before committing to a renderer.

### Phase 1 in detail: the first slice

The slice proves the whole loop with the smallest surface, and a coding agent can build it in one pass.

1. Scaffold the monorepo with `core`, `server`, `ui` and a `docs` skeleton that builds and serves at `/docs`.
2. Implement the `review` and `item` tables and the status rules in `core`.
3. Implement `review_open`, `review_wait`, `review_get` and `review_status` over stdio and Streamable HTTP, with 45-second holds and progress notifications.
4. Build the decision card in the UI, with option cards, the "Other" field, and a submit that commits before it confirms.
5. Add the start-or-find shim with the lock file, the printed URL and `--no-open`.
6. Write the quick start and the four-tool reference pages in the docs, with examples that run in tests.
7. Pass the phase 1 acceptance test, including the restart case.

**Out of the first slice:** anchored comments, `item_update`, HTML items, the decision log, hosted mode and every other item kind.

## Open questions and risks

Five questions need your call before or during phase 1, and each has a recommendation.

| Question | Recommendation |
| --- | --- |
| Decision export on by default? | On in workspace mode, off in session mode |
| Decision log scope: per project, or shared across projects | Per project first, and a user-level log later |
| Node 24 only, or Node 22 with a fallback | Node 24 only |
| Branding: logo, colors, docs theme | Wait for the image agent's output, then theme Starlight to match |
| Register `janotate.dev` or `janotate.com`, and claim the npm name | Register one domain now, and publish a placeholder package to hold the name |

**Risks**

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| MCP client timeouts differ | One report describes Claude Desktop cutting calls near 60 seconds, unconfirmed | 45-second holds, a progress notification every 5 seconds, a test against a 60-second client |
| `node:sqlite` is still settling | Sources disagree on stability | Require Node 24, hide it behind a small store interface so it can be swapped |
| MCP SDK v2 status | One README labels it pre-alpha | Verify the release before phase 1, and pin the version |
| Sandbox escape | Agent HTML is untrusted code | The security suite is a gate for phase 3, and it blocks release if it fails |
| Scope creep across 22 interfaces | The catalog is large | Ship `decision` and `html` first, and prototype everything else as HTML |
| Large diffs render slowly | `react-diff-view` documents slow renders on very large diffs | Collapse hunks by default and test with a 200-hunk diff |
| Name collisions | Janotate had no npm or web results when I searched, but I did not check trademarks | A trademark search before any public launch |
