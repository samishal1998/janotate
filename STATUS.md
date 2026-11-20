# Delivery status

| Phase | Verification |
| --- | --- |
| 1 Core loop | npm run build built UI, server and seven static pages. npm test passed both tests, including HTTP open, Chromium submission, server restart and identical stdio review_get response. |
| 2 Discussion | npm run build and npm test passed (3 tests), including a browser option comment, MCP item_update reply and a two-item isolation test. |
| 3 Dynamic HTML | node --test --test-timeout=45000 tests/security.test.ts passed in Chromium. Checked parent storage and cookies, policy-blocked network and cross-item post, top navigation, schema rejection, unknown field removal, accepted form and fetch, and replay rejection. |
| 4 Diagrams and diffs | node --test tests/catalog.test.ts passed. The CLI entrypoint review returned node and hunk anchors; a 200-hunk diff started collapsed and the last hunk opened within the test deadline. |
| 5 Workspace and hosting | node --test tests/hosting.test.ts passed. The agent queried a confirmed decision and skipped a duplicate question. Rejected incorrect and cross-role tokens, missing UI login and a mismatched Host header. |

## Decisions

Node 24 only (observed v24.22.1). Keep one decision log per project. Enable Markdown export in workspace mode and disable it in session mode. Use separate static browser and MCP tokens for hosted deployments. Defer domain registration and publishing.

## Dependency evidence and deviations

Offline npm metadata identified the latest cached releases as MCP SDK 1.32.2, Hono 4.13.19, React 19.3.1, Vite 8.3.8, Zod 4.6.7, Vitest 5.1.0, Playwright 1.65.1, Astro 7.4.0 and Starlight 0.42.6. The SDK latest tag points to v1 and the manifest pins 1.32.2. Live registry status was unverifiable under the external-service restriction. Package installation used local cached artifacts, with React and React DOM aligned at 19.2.8, Vite 8.3.6, Hono 4.13.14 and Playwright 1.64.1 (matches installed Chromium 1248). npm workspaces use the available offline cache; pnpm 12.8.1 is installed but its release metadata was unavailable. Node's built-in test runner covers unit, integration and browser tests. Mermaid had no cached npm release metadata.

## Branding

- The approved Nov 19, 2026 handoff is [Janotate_StraightLine_Final_Assets](assets/brand/Janotate_StraightLine_Final_Assets/README.md). Its primary artwork is `masters/approved-app-icon.png`. The ZIP was 11,705,855 bytes and its SHA-256 was `da67438f439c24c809d54c08f5faa098e8580df3765200c29d1dec7f9c5478a7`. All 37 extracted files matched the ZIP. All 36 entries listed in its manifest matched their individual checksums.
- `packages/ui/src/theme.css` and `packages/docs/astro.config.mjs` select the supplied transparent PNG emblem for both themes. The PNG favicon and Apple touch icon in `packages/docs/public/` are byte-for-byte copies of the approved app-icon exports. `packages/ui/index.html` points to those public icons.
- `assets/brand/tokens.css` maps the handoff’s palette to product theme roles. `packages/docs/src/theme.css` maps those roles to Starlight. The older handoff under `branding/Janotate_Brand_Assets` is historical.

## Final checks

- `npm test` passed all nine test cases, covering the store, both MCP transports, docs examples, Chromium review and sandbox flows, decision reuse, history, quotas and errors.
- `npm run typecheck` passed on Node 24.22.1. The pinned Oxlint 1.93.0 CLI ran from the local package cache with `--deny-warnings packages/core/src packages/server/src packages/ui/src scripts bin tests` and exited successfully.
- `npm run build` produced the browser bundle, server and 23 Starlight pages, including the generated 404 page. A temporary broken internal link made `node scripts/build.mjs` fail. Removing it restored a successful build. The checker also verifies local anchor targets.
- `node tests/wait.long.ts` ran for 600,107 ms with 14 pending responses and 120 progress notifications. Every call completed within the client's 60-second deadline. This run began before the final core service refactor. The final integration suite exercised the refactored wait path.
- `node tests/package.smoke.ts` installed the local tarball using a loopback mirror of cached packages. Warm-cache npx launch to a rendered decision took 1,160 ms. The installed package served its documentation with Astro absent from runtime dependencies.
- `npm run screenshots` rendered the interface examples in Chromium for all eleven native kinds. After a theme change rerun this command and rebuild the site.

## Limits and open items

The diagram renderer supports named nodes, simple arrows and TD/TB/LR layout in Mermaid flowcharts. Full Mermaid syntax remains outside the implementation because the package was unavailable offline. Text anchors use native browser ranges and text-quote selectors.

The six required sandbox checks ran in Chromium. These checks establish the tested browser restrictions. They do not certify complete network isolation for arbitrary JavaScript. Hosted token and Host enforcement ran on loopback. A public TLS reverse proxy and remote CI were not exercised.

The repository is local and the package is unpublished.

## Review workspace redesign

The React workspace uses shadcn/ui Base Nova card and form components with Tailwind CSS v4. Desktop reviews show the item outline, answer choices, per-item discussion and progress. At narrow widths, navigation collapses and discussion moves below its item. The static Starlight site includes refreshed screenshots for all eleven item kinds.

The production build, type check and all nine tests passed. Chromium opened a live two-item session at 320, 1100 and 1440 px without horizontal overflow. The mobile menu navigated to the second item and closed after selection.

## Interactive plan and discussion

The plan viewer shows a branching map with stage descriptions, deliverables and annotation counts. Guided review walks plan stages or discussion threads. Opening a diagram thread selects its variant and node. The discussion panel groups replies, filters by stage, and keeps separate drafts while the reviewer switches threads.

The code item brings the native kind count to twelve. It uses CodeMirror 6 for editable JavaScript, TypeScript, JSON and plain text. Diffs use react-diff-view and Prism for unified and split views. The dependencies came from local caches.

`npm run typecheck` and `npm run build` passed. `npm test` passed all ten tests, including Chromium coverage of guided annotations, threaded replies, variant anchors, split diffs and saved code. In the live Field Notes example, Chromium followed the third discussion thread to the Concurrent edit diagram and verified that variant was selected.

## Live proposal review

The workspace now includes fifteen native item kinds. The three additions are `proposal`, `ranking` and `range`. Proposal comments carry the section ID, exact quote, original offset and surrounding text. A changed or ambiguous passage keeps its original discussion. The scope board also accepts cross-column drops. Reordering and scope changes have keyboard-accessible alternatives.

The light, dark and system appearance control applies to the review and decision log and persists across reloads. The journey starts in the desktop sidebar, can be dragged or moved with arrow keys, and collapses on narrow screens. Pressing Home on its move handle restores its default position.

The browser holds one versioned request per open review for up to 25 seconds. Committed changes wake listeners. An unchanged hold returns HTTP 204. After a disconnect the client backs off and resumes from its last version. `review_wait` can also wake on reviewer comments with a resumable `after_comment` cursor. The new `discussion_reply` MCP tool replies on the original anchor and preserves answers and revisions. An agent must be connected and consuming this feed to answer new comments.

For infrastructure, the existing flowchart renderer now accepts typed resources per variant. The example switches between Kubernetes ingress, service, deployment and pods, and GitHub Actions triggers, jobs and a preview environment. The local npm and Bun caches had no React Flow, Dagre or ELK.js package available. A dedicated graph layout dependency and automatic manifest import remain open for larger diagrams. No external service was contacted.

`npm run typecheck`, `npm run build`, and `npm test` passed (11 tests). The new Chromium test exercised passage selection and persistence, live agent replies, dropped connections with draft preservation, guide controls, light mode persistence, reorder and range answers, cross-column drops, and inspection in both infrastructure views. The pinned Oxlint 1.93.0 CLI passed with `--deny-warnings packages/core/src packages/server/src packages/ui/src scripts bin tests`. `npm run screenshots` rendered all fifteen interface pages' examples.

`node scripts/pilot-demo.ts` opens a fresh eight-item workspace review with one example discussion. Chromium verified this demo at 320, 1100 and 1440 pixels, in light and dark appearances, without horizontal page overflow. Pointer drag, collapse, expansion and keyboard reset worked on the desktop guide.

`npm run test:wait` passed against the event-driven wait implementation. The ten-minute run took 600,112 ms, completed 14 holds within the client deadline and delivered 119 progress notifications.

## Graphs and schema review

Infrastructure diagrams now use React Flow 13.0.2 and Dagre 3.1.3. The diagram item keeps its existing flowchart input and variant, node and edge comment paths. Kubernetes and GitHub Actions examples support node dragging, zoom, fit and fullscreen. I compared an initial Cytoscape.js implementation with React Flow. React Flow's custom React nodes let a table expose real column buttons and connect edges directly to those fields. The final bundle uses React Flow.

The sixteenth native kind is `dbml`. It combines the official `@dbml/parse` 12.1.0 compiler, CodeMirror and the shared graph canvas. The per-file compiler runs in browser memory. The optional baseline produces selectable changes for tables, columns, indexes and relationships. The first version returned the exact edited source. Diagram previews and comparisons cover relational structure. Additional DBML declarations stay available in the editor. Multi-file projects and live Kubernetes manifest or workflow imports remain open.

The review outline is searchable. Focus view shows one item, and the threads view indexes conversations across the review and returns the reviewer to the original anchor. The sample command is `node scripts/pilot-demo.ts --schema`. Library verification and installation used the user's authorization to access official documentation and npm. No review content was sent to these services.

`npm run typecheck`, `npm run build`, `npm test` (13 passing tests) and the pinned Oxlint CLI with `--deny-warnings` passed. The Chromium schema test blocked and recorded off-origin requests and observed none. It exercised compilation errors, edited-source persistence, column discussions, focus navigation and exact MCP results. `npm run screenshots` rendered all sixteen interfaces. Manual Chromium checks covered dragging a graph node, entering and leaving fullscreen, and the live review at 320 and 1440 px.

## Review controls and DBML patches

The review and documentation use lighter slate backgrounds in dark mode. All nine dropdowns use the shadcn/ui Base Nova Native Select, with themed desktop menus in supporting browsers and native touch pickers. The primary actions, discussion composer, schema actions and annotation toggle use the Base Nova Button. **Annotate** gives precise targets a custom pointer and focuses the discussion composer. Reviewers can select a passage or tap an available target. Escape exits annotation mode and keeps the comment draft.

DBML source opens read-only. **Edit DBML** opens the editor and **Preview patch** shows additions and deletions against the proposal. New completed DBML answers carry `format`, `base_revision` and a unified `patch`. A confirmed unchanged schema has an empty patch. The store checks the revision and patch before saving. Existing open reviews convert saved source strings on submission. Completed reviews from the previous version retain their original result shape.

`npm run build`, `npm run typecheck`, `npm run lint -- --deny-warnings` and `npm test` passed on Node 24.22.1 (18 tests). Chromium covered cursor and touch targeting, keyboard theme selection, narrow-header fit, DBML preview, save, reload and exact MCP patch delivery. The diagram, editor and patch preview each fit widths of 320, 360, 768, 1100 and 1440 px with zero horizontal page overflow. `npm run screenshots` regenerated all sixteen interface screenshots. `npm_config_offline=true node tests/package.smoke.ts` installed the tarball from cache, rendered a decision with `npx` and opened the packaged docs.

## Compact workspace and motion review

The desktop review uses a single toolbar for views, layout and annotation. On phones, appearance and navigation share the brand header. The first schema diagram now starts at 344 px on a 1440 px viewport, previously 491 px, with a 370 px canvas in both versions. At 320 px wide it starts at 488 px, previously 587 px. Chromium also checked 768 and 1100 px for page overflow. Focus changes and arriving comments have short transitions that respect the reduced-motion preference.

The guide has **Float** and **Dock** actions in both its open and collapsed states. It supports pointer and touch dragging back to the dock, keyboard movement, and Home to redock. The current stop survives placement changes.

Agents can add a narrated walkthrough to each diagram variant. The local examples follow a Kubernetes request, a GitHub Actions deployment, and a retried write after a lost receipt. The seventeenth native kind, `lottie`, accepts self-contained 2D vector animations. The app lazy-loads the SVG light player from the pinned `lottie-web` 5.13.0 package. Playback starts paused. Frame and inclusive frame-range comments reach the agent as structured node anchors. This renderer supports a bounded subset of Lottie and keeps the existing script policy. The [interface reference](packages/docs/src/content/docs/interfaces/lottie.md) lists supported shapes and limits.

`npm run build`, `npm run typecheck`, `npm run lint -- --deny-warnings`, and `npm test` passed (24 tests). `npm run screenshots` generated all 17 interface screenshots. `npm_config_offline=true node tests/package.smoke.ts` installed the packaged app, rendered a review and opened its docs. `node scripts/pilot-demo.ts --motion` opened a four-item review on port 33419. Chromium verified the live walkthrough, redocking, Lottie range targeting, retry variant and rollout plan on both desktop and phone layouts.

## Server-side narration

Projects can enable Kitten Nano 0.8 INT8 with `janotate voice install`. Each project stores its own selection. The OS user shares the model and native runtime between projects. The server starts one CPU worker when someone chooses **Listen** on a proposal section, diagram caption or guided stop. The worker exits after 90 seconds idle. Stopping a pending narration cancels synthesis. The browser plays mono 24 kHz WAV using the existing reviewer session.

The installer pins the platform-specific sherpa-onnx Node runtime to 1.13.8. It supports the English pronunciation data shipped with the model archives. Version 2 changed that interface. The installer checks archive digests before extraction and retains the upstream files. Kokoro 82M v1.0 INT8 is an optional selection. Its worker configuration was exercised with a fixture. The real-model measurements below cover Kitten on Linux x64.

- `node bin/janotate.mjs voice install kitten --data .janotate/schema-demo` downloaded and enabled Kitten for the existing demo. Model and runtime archives totaled 42,322,297 bytes. Their extracted directories used 79,094,885 bytes by `du -sb`. A second install with network access disabled inside the installer reused the cache.
- Three POSTs to the demo speech endpoint synthesized the same diagram caption on an AMD EPYC 9254. The first response took 2.51 s. Warm responses took 2.40 s and 2.28 s. Each contained about 5.2 s of playable audio. The worker's peak RSS across those three requests was 239 MiB. A separate cancellation check completed a concurrent health request in 5 ms and observed worker exit within 28 ms of the HTTP client abort.
- `node tests/voice.bench.ts kitten` exercised the production service directly. One cold request took 2.93 s and two warm requests took 1.44 s and 1.55 s. Each generated 5.19 s of non-silent mono PCM audio. Timing varies with server load.
- `npm test` passed all 34 tests, including Chromium checks for pause, resume, cancellation, preparing one following passage during playback, and recovery from a failed request. `npm run typecheck` and `npm run lint -- --deny-warnings` passed. A separate Chromium session played the real Kitten output on port 33419, paused, resumed and stopped it, and recorded zero off-origin requests. The review fit widths of 360 and 1440 px.
- `npm_config_offline=true node tests/package.smoke.ts` rebuilt and installed the package from the local npm cache, rendered a review in 1,295 ms and opened the packaged read-aloud guide. `npm pack --dry-run --ignore-scripts --json` reported 1,888,906 bytes compressed and 4,855,448 bytes unpacked. Narration added 14,849 compressed bytes over the measured baseline. The tarball contains the worker script. Model weights and native binaries are downloaded only through the voice installer.

## Home and review actions

The root URL now opens a branded landing page with the six most recently active open workspace and session reviews, a direct resume link and a quick start for empty projects. The searchable decision log lives at `/decisions`. The landing artwork uses the approved 512 px raster emblem selected in `packages/ui/src/theme.css`.

**Voice** in the workspace header opens project-wide settings for Kitten Nano, Kokoro and Off. Local reviewers explicitly choose **Install and use** for a missing pack. Hosted reviewers can switch to packs installed by the server operator. Changing the model interrupts active narration. Section comment and speaker controls sit alongside their headings. **More review actions** beside Submit contains **End without submitting…**. Confirming returns a cancelled status to the agent, preserves saved answers and comments, and discards unsaved edits.

`npm run build`, `npm run typecheck`, `npm run lint -- --deny-warnings` and the final `npm test` passed (38 tests). Tests cover landing navigation, the hosted recent-reviews feed, voice settings, heading controls, keyboard confirmation and the agent's cancelled result. An earlier parallel test run hit a CLI startup timeout in a temporary project. The rerun passed and the temporary process was closed. `npm_config_offline=true node tests/package.smoke.ts` opened the packed review in 1,156 ms and verified the shipped docs. On port 33419, Chromium opened both existing reviews from the landing flow, checked the header at 320 and 1280 px and focused the proposal comment field on a dark 360 px viewport. The demo still uses Kitten.

## Narrated playback

Diagram walkthroughs and captioned Lottie animations have a split Play button. The primary action plays silently. The arrow offers **Play with audio**, or **Set up audio** when the project needs a voice. Narration paces diagram highlights, and a captioned animation starts moving on audible playback. Pause and Resume keep the current clip. A Lottie item can supply a plain-text `caption` or use its existing composition name.

The browser shares one narration sequence across text chunks and diagram steps. The first nonempty bytes of the current WAV trigger preparation of the next clip, including across step boundaries. Buffering holds at one clip ahead. A paused or interrupted review keeps its place or cancels pending work as appropriate. The speech worker adds pauses directly to the audio so timing survives chunk boundaries. On the live Linux demo, Kokoro produced measured pauses of 120 ms for a comma, 300 ms for a full stop, 450 ms for a newline and 700 ms for a paragraph break in the same WAV.

Chromium exercised the real Kokoro walkthrough at 320 px on port 33419. The second caption request started 2 ms after the first bytes of the first caption arrived, 7.0 seconds before its playback ended. Highlights advanced after each caption finished. The deterministic streaming test in `tests/playback-narration.test.ts` holds an incomplete WAV open after its first byte to check timing and the one-clip limit independently of machine speed.

`npm test` passed all 44 tests. `npm run build`, `npm run typecheck` and `npm run lint -- --deny-warnings` passed. `npm_config_offline=true node tests/package.smoke.ts` rebuilt and installed the package and opened the shipped review and docs. Live Chromium playback also verified the Lottie menu, pause, resume and replay with zero off-origin requests. A separate Kitten synthesis of the same punctuation sample had the same measured pauses as Kokoro.

## Guided review, PR review and agent discovery

The full-review guide browses subitems in review order. It reads current choices and draft values and controls the same diagram or animation playback as the item. It can jump to tables, columns, hunks, findings and active discussion. The Threads inbox shows each anchor, reply count and latest reply, with recently active conversations first. The home page offers the exact MCP endpoint and the setup guide. Missing review links now lead back to the workspace.

MCP initialization offers a workflow, tool descriptions and 20 discoverable resources covering the workflow, catalog and 18 native item kinds. The CLI serves the same references offline with `janotate context [kind]`. `janotate skill install` adds the skill to the calling project and preserves local edits. An independent agent used the shipped skill to open a proposal, receive an anchored question, reply, resume the wait and read the final result over stdio.

The native `pr_review` kind accepts the local feynman-review skill’s built version 2 report. It organizes changes by meaning, connects findings to old and new lines, verifies the file and hunk ledger, and returns an explicit verdict plus anchored comments through MCP. A PR review stays local. Producing a report and submitting anything to a forge remain agent or reviewer actions. The included receipt-retry example passed the original skill’s gate with three files, three hunks and zero warnings. Use `janotate review-pr --example` or pass a report path.

A project can explicitly opt into ElevenLabs-compatible speech with its own API base URL, model ID, voice ID and key. The server stores credentials in a user-private settings file and streams audio to the reviewer. Hosted endpoint changes are operator-only. This extends the local-first baseline for users choosing an external speech service. The local model remains selected on the demo. Verification used an isolated compatible HTTP service and real MP3 decoding in Chromium. No live provider credentials or paid account were used.

`npm test` passed 55 tests with zero failures or skips, including provider, browser, guide, PR ledger and both MCP transport tests. `npm run build`, `npm run typecheck` and `npm run lint -- --deny-warnings` passed. `npm_config_offline=true node tests/package.smoke.ts` installed the packed build, opened a decision in 1,316 ms, read a packaged agent reference and imported the packaged PR example. The skill-creator validator passed. Chromium checked the live home, PR finding navigation and voice form at 320 px in dark mode and 1360 px in light mode. The docked guide displays the full 77 px finding title at desktop width. The demo runs on port 33419 with the PR example alongside the existing motion and architecture reviews.

## PR annotations and documentation images

PR reviewers can quote report text, comment on a coverage file or linked change-map node, click a code row, or mark an inclusive line range on the old or new side of a hunk. The range can span diff pages. Source markers and the discussion panel navigate in both directions. Whole-PR comments and targeted drafts stay separate as the reviewer changes locations. New threads validate their source against the current report. Replies to an earlier thread retain its original ledger and wording. A passage that no longer matches its saved context displays the original quote and a change notice.

The documentation has 28 Chromium captures across all 18 item pages and five guides. The PR page shows an annotated finding, a three-line diff range, and the resulting agent discussion. The generator uses the documented examples in a disposable workspace.

On Node 24.22.1, `npm run screenshots` generated all 28 images. `npm run build`, `npm run typecheck`, `npm run lint -- --deny-warnings` and `npm test` passed (59 tests, zero skipped). The offline package check, `npm_config_offline=true node tests/package.smoke.ts`, opened a decision and the packaged PR example. Live Chromium checks exercised passage selection, range selection, source focus and horizontal fit on the existing review at 320 px in dark mode and 1360 px in light mode. The project demo continues to use port 33419.

## Workspace visual refinement

Light and dark themes now use indigo for active navigation and review actions, blue for source references, and a muted teal for outcomes and agent replies. The home page pairs the approved Janotate emblem with a compact introduction and places open reviews beside the connection panel on wide screens. The review header combines progress and status. Single-item reviews omit the item switcher and pager. The decision log separates the decision question, answer and date, and each result opens its source item.

PR summaries pair Before and After. Long diff lines scroll inside their evidence panel on a 320 px phone, and supported languages have syntax highlighting. The guide wraps long stop titles. The discussion groups each author, timestamp and reply action, with one composer for the selected location.

On Node 24.22.1, `npm run build`, `npm run typecheck`, `npm run lint -- --deny-warnings` and `npm test` passed (59 tests, zero skipped). `npm run screenshots` generated 29 images, including the home page for Quick start. `npm_config_offline=true node tests/package.smoke.ts` verified the packed CLI, documentation, agent context and PR example. All 29 packaged screenshots match their source images. Chromium checked the home and PR review on port 33419 in both themes at phone, tablet and desktop widths. Eight sampled text/background pairs per theme measured at least 4.83:1 contrast. A disposable workspace verified decision search, clearing a search and opening the matching source item.

## Paper crane motion example

The Lottie interface page links to the original 7.2-second scene in `packages/docs/public/examples/paper-crane.json`. Its four named markers are guide stops. A live Janotate review on port 33419 played all 216 frames, sought to the lake marker, and selected frames 134–145 for annotation. Chromium also checked horizontal fit at 360 px and eight individual frames. `npm run build` passed. `node --test tests/lottie-review.test.ts tests/lottie-audio.test.ts` passed all five tests. The separate Skottie editor was unavailable locally.
