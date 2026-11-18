# Agent Interface Catalog

Nov 15, 2026 · @Sami AlMis'hal

## Purpose

The agent sends typed review items instead of prose, and the app renders each one as the interface that fits it. This catalog lists 22 interface types drawn from the review and decision moments in your chats since June 2026. Each entry says what the agent sends, what you return, and which session motivated it.

Evidence comes from chat summaries and excerpts, not full transcripts. Where a session doesn't cover an interface, the entry says so.

Prior art worth borrowing from: [Plannotator](https://github.com/backnotprop/plannotator) and [Crit](https://github.com/tomasz-tomczyk/crit) already do anchored plan and diff review for coding agents, and [MCP Apps](https://github.com/modelcontextprotocol/ext-apps) defines sandboxed HTML interfaces for tools. MCP elicitation only supports flat forms, so it can't carry diagrams or anchored comments.

## Master flow

&#91;embedded content: master flow, 5 parts and one loop\]

The agent sends typed items through MCP, the app renders them, and your answers return as one result. Confirmed decisions go to the workspace, and the agent checks the log before asking again.

## How a decision gets discussed

&#91;embedded content: decision discussion states, 6 steps\]

You never reply to a whole document. You select the part you doubt, comment there, and the agent answers in that thread and revises only that piece.

## Dynamic HTML

When no catalog interface fits, the agent sends its own HTML form, and the submit posts the answers back as the item's result. Later you promote the repeat ones into real interfaces.

&#91;embedded content: dynamic HTML flow and sandbox boundary\]

The app can reuse the MCP Apps pattern of a sandboxed iframe talking to the host over postMessage, with a plain form post as the fallback.

- **Sandbox:** no access to the app, the workspace or other items.
- **One endpoint:** the post goes only to this item's id, and only once.
- **Schema:** the agent declares the fields it expects, and a post that doesn't match is rejected.
- **Anchors still work:** you can select text in the HTML and comment on it, like any other item.

## Shared primitives

Every interface is built from the same five parts, so a decision, a claim and a risk all behave consistently.

- **Item:** an id, a kind, a title, and a status: `asked`, `defaulted`, `confirmed`, `corrected` or `superseded`. In your sessions a question, an agent default and a confirmed decision looked identical in the handoff document.
- **Source:** who set the current value, you or the agent. For the agent, the basis: stated by you, inferred, or unverified.
- **Anchor:** any span of text, node, table row or diff hunk can take a comment, and the comment returns with the anchor's id.
- **Evidence:** links to the sources, files or session excerpts an item rests on. An item with no evidence shows as unverified.
- **Result:** what the agent pulls when you finish: item ids with their new status and value, anchored comments, and the items you skipped, which count as neither approved nor rejected.

## Deciding

Four interfaces cover the moments where the agent needs a ruling from you instead of burying the question in prose.

### Decision card

One question with two to four options and their trade-offs, the agent's recommendation marked, and a free-text "other".

- **You return:** the chosen option or a custom answer, an optional comment. The item becomes `confirmed`.
- **Seen in:** ledger transitions (add a seventh `expired` enum value or fold expired rows into an existing terminal state; never ruled), Bedouin (binary name, config layout, chezmoi interop), relay PRD (admin bootstrap, auto-creating named channels), PR classifier (enum sub-values).

### Defaults sheet

Every default the agent picked, each with accept or override, plus accept-all.

- **You return:** per-default accept or a new value. Accepted ones become `confirmed`; untouched ones stay `defaulted`.
- **Seen in:** Bedouin's `[confirm]` items (minijinja, JSON state file, secrets out of scope), relay limits (15 MB buffer, 5 to 10 minute expiry), the PR classifier's 0.5 match threshold that the agent itself called a guess.

### Scope board

Three columns (in scope, deferred, out of scope) with a reason on each card. Moving a card is the decision.

- **You return:** the final column per card. Out-of-scope cards become constraints the agent builds against.
- **Seen in:** the SSO spec (refresh tokens, group sync and SAML out of scope), delegation deferred in the account model, wake-on-request declined for the cooler, the reconcile daemon pushed to v2.

### Term check

Shown before a plan is built from voice input: each unclear or suspect term with the agent's best reading and confirm or correct.

- **You return:** a corrected glossary that stays in the workspace, so terms aren't re-guessed.
- **Seen in:** Dokploy, Sentio (heard as "Sentry"), Ponder (heard as "Panda"), Temporal (heard as "tempura"), and the Kubernetes plan where the agent invented "accordion" and "organization API". You asked for flagging instead of guessing.

## Verifying

Four interfaces make the agent's claims and gaps visible, because the errors in your sessions sat inside text that read as coherent.

### Claim ledger

Every factual claim or assumption a plan rests on, with its evidence and a state: `verified`, `unverified` or `contradicted`. Unverified items sort first.

- **You return:** verified, wrong (with the correction), or needs research. A wrong claim flags every plan item that depends on it.
- **Seen in:** the Amazon courier claim the agent repeated without checking, "all providers block shared credentials in production" (wrong; Privy allows it), DNS-01 TLS assumed necessary, Dokploy's preview feature assumed to fit.

### Coverage matrix

A grid of entities by events (create, update, delete, expire) by sources. Empty cells stay highlighted until each has a named test or an explicit "not applicable".

- **You return:** filled or waived cells. The agent can't mark the feature done while cells are empty.
- **Seen in:** the reservation ledger, where the agent missed delete propagation for gifts and free claims, missed the reverse coupling, dropped orders as a source, and read a gift on "any subdomain of any.com" as a reservation over all .com domains. Also the `feature-contract` skill and the ghost library's 14-case test plan.

### Reconciliation view

Two sets side by side (charges and refunds, expected and actual) with matches drawn, unmatched items listed first, and each item linked to its source.

- **You return:** confirm a match, reject it, or mark an unmatched item as expected.
- **Seen in:** Amazon.eg against Mastercard statements (six unrefunded returns totalling EGP 6,279.80, with many-to-many matches between charges and orders).

### Hypothesis board

Candidate causes, each with evidence for and against, a state (`likely`, `ruled out`, `untested`) and the next check.

- **You return:** a check result pasted against a hypothesis. The board re-ranks.
- **Seen in:** the Cloud Run EHOSTUNREACH errors (IPv6 ordering ruled out on Node 22, subnet exhaustion ruled out for a running instance, NAT port exhaustion likely, three diagnostic steps).

## Understanding

Seven interfaces give you the higher-order view first, so you read code and plans with context instead of reconstructing it.

### Architecture map

A Mermaid-style diagram with clickable nodes, highlighted changes and a traceable flow.

- **You return:** comments anchored to nodes or edges, and "this is wrong" on an edge.
- **Seen in:** the GKE plan (ns3 and ns4 load balancers to CoreDNS to the NS JSON API; a TCP load balancer to Caddy to the parking page), the cooler (on-VM agent, Cloud Function, Cloud Scheduler), the preview platform (Traefik to per-PR stacks, Loki in the shared stack), Bedouin's crate layout.

### Data model view

An ERD where each table expands to columns, constraints and example rows, plus a lifecycle tab showing how rows change.

- **You return:** comments on tables, columns and constraints.
- **Seen in:** the ownership ledger (the `holding` view over wallet and email ledgers), the principal, identity and credential model, the DNS projection table with hex-encoded ltree labels.

### State machine stepper

States and transitions as a diagram, plus a stepper that runs named scenarios through it and shows what each actor and system does at every step.

- **You return:** corrections to a transition (who triggers it, what runs), which the agent applies.
- **Seen in:** domain transitions (six states). You corrected that Temporal starts on accept, and that expiry is a read-time filter, not a timer. The example cast was Alice, Bob, Edward and Dana.

### Diff walkthrough

An agent-led tour of a change: ordered steps, each with a high-level explanation, then the hunks it covers, with a reviewed mark per step.

- **You return:** approve per step, comment on a hunk, or ask why.
- **Seen in:** your point that agent changes are too large and touch unfamiliar code for line-by-line review (Sep 8), the macro-agent scaffold, and the reservation-ledger implementation where cases were missed.

### Function overview

A function shown as named blocks (what each does, inputs, outputs) with the code collapsed underneath. It replaces inline comments and generated markdown files.

- **You return:** comments on a block, or approval of a block's contract instead of its lines.
- **Seen in:** your Nov 15 brief and your design-pattern idea of reviewing shape instead of every line. No single session; this one comes from your stated goal.

### Comparison matrix

Options against criteria with the agent's scoring. You can reweight criteria, hide options and rename columns.

- **You return:** the chosen option and the weights that led to it.
- **Seen in:** Privy alternatives (Logto, Turnkey, Openfort, SuperTokens, WorkOS, Supabase, with the "OAuth on our behalf" column), email forwarding (ImprovMX, Forward Email, OpenSRS, Stalwart), and the two ledger layouts (separate tables or one table).

### Visual picker

Visual options rendered in the contexts they'll be used in (sizes, light and dark), side by side.

- **You return:** a pick, with a note on what to change.
- **Seen in:** the Bedouin logo concepts (Bedouin, Caravan, Wayfarer, Hearth) and the marks sheet shown at 112, 32 and 16 px and knocked out on dark.

## Reviewing and authoring

Three interfaces cover the documents the agent writes for you or for another agent, which is where most of your review time went.

### Plan outline review

A plan as a tree. Each node takes approve, comment or reject, and any selected text takes an anchored comment. Nodes carry their status and source.

- **You return:** per-node status and comments. The agent revises only the flagged nodes.
- **Seen in:** nearly every handoff document (relay PRD, GKE plan, RDE pipeline prompt, pstack signals prompt, the account-model plans), which you reviewed by reading the whole document.

### Draft review

A draft beside the instructions you gave, each as a checklist item the agent marks met or not met, with inline edits and comments.

- **You return:** inline edits, comments, and new instructions that join the checklist.
- **Seen in:** the Amazon.eg customer service email (card closing in October 2026, refund as the primary demand, AWB and RMA spelled out, frustration about return receipts, across several rounds) and the MLS alerts GitHub issue, where an unresolved assignee handle (`fr0rr0`, a 404) needed your call.

### Handoff check

Shown before a plan goes to a coding agent: the package as the downstream agent will see it, with unresolved items, defaults and unverified claims listed on top.

- **You return:** release, or send back with comments.
- **Seen in:** the handoff documents that ended with open questions or `[default, confirm]` items (Bedouin, relay, PR classifier, GKE).

## Tracking

Four interfaces keep state across a session and across plans, which is what the persistent workspace is for.

### Away digest

What happened while you were away: actions taken, decisions the agent made on its own and why, and what is waiting on you, blocking items first.

- **You return:** approve, reverse or answer each item. A reversal creates follow-up work.
- **Seen in:** inferred. Your Oct 21 chat about running agents at max effort and in parallel implies long unattended runs, but nothing in it covers how you review them afterwards.

### Rollout tracker

Phases with gates. Each gate shows its criteria and its rollback, and approving one releases the next phase.

- **You return:** gate approvals, or hold with a reason.
- **Seen in:** the GKE IP cutover runbook, Bedouin milestones M0 to M4, and pstack's two-phase signal plan.

### Risk register

Risks and open questions with likelihood, mitigation and state. Open ones carry across plans until closed.

- **You return:** accept, mitigate or close.
- **Seen in:** the event-automation hub (label timing, idempotency, default-branch dispatch), the eight GKE confirmation items, the ledger's missing `expired` state.

### Decision log

The workspace's history: every confirmed decision with its source, its date and what superseded it. The agent queries it over MCP before asking again.

- **You return:** edit, supersede or retire a decision.
- **Seen in:** the account-model chat, where you corrected the agent for conflating separate threads (the indexer cascade discussion) and asked for documents that don't reference earlier revisions.

## Backlog and open questions

One candidate has thin evidence, four design questions are open, and the template below is for adding entries.

**Candidate, not yet in the catalog**

- **Voice comments:** dictate a comment on a selection. Many of your sessions were voice, with mic cutoffs and mishearings of tool names, so input quality may matter as much as the interfaces.

**Open questions**

- Does an agent-proposed item you haven't seen need its own status, separate from `asked`?
- Should an unverified claim block the handoff check, or only warn?
- Is the decision log scoped to one project or shared across all of them? You haven't answered this one yet.
- Should the agent be able to open a single interface mid-run (a blocking decision card) as well as batch them into a review session?

**Template for a new interface**

```markdown
### <Name>

<One sentence: what it shows.>

- **Use when:** the trigger
- **Agent sends:** the typed fields
- **You return:** the result
- **Seen in:** the session, or "inferred"
```
