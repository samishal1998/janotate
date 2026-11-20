# Working on Janotate

The PRD in docs/spec governs behavior. Keep core storage and review rules in packages/core, transports and the CLI in packages/server, browser components in packages/ui and Starlight content in packages/docs. The release build copies static assets into dist beside the bundled server.

Use Node 24. Run npm ci, then npm run build before integration and browser tests. Run npm test for all implemented layers. Use node --test tests/store.test.ts for the store. Use node --test tests/review.test.ts for HTTP/stdio integration, executable docs examples and browser restart coverage. The browser tests need the Chromium revision listed by Playwright. Run npm run build for docs and local link checks.

Use GitButler for version control. Keep commits scoped to each phase and record the actual gate command and outcome in STATUS.md.

Run node --test tests/security.test.ts for the real Chromium sandbox gate.

Use node --test tests/catalog.test.ts for diagram and diff anchors and the 200-hunk check. Run node --test tests/hosting.test.ts for auth and decision reuse, and node --test tests/errors.test.ts for negative MCP calls. npm run test:wait exercises ten minutes of real waiting with a 60-second client deadline. npm run typecheck checks all three TypeScript application packages. npm run lint invokes the pinned Oxlint CLI. npm run screenshots regenerates the documentation's interface images from the built browser app. Run node tests/package.smoke.ts to install a local tarball into a temporary project and open a decision with npx. It needs a package cache or registry containing the runtime dependencies.

Run `node --test tests/live-workspace.test.ts` for live discussion, reconnects, proposal annotations, appearance, floating journeys, rankings, range controls and infrastructure views. `node scripts/pilot-demo.ts` starts a local example against the built app.

Run `node --test tests/schema-review.test.ts` for DBML compilation, schema comparisons, local-only browser traffic, column threads, graph controls and unified diff submission. Diagram canvases use React Flow with Dagre layout. The DBML item compiles a single in-memory document with `@dbml/parse`.

Run `node --test tests/journey-dock.test.ts tests/diagram-walkthrough.test.ts tests/lottie-review.test.ts` for guide placement, graph playback and frame-anchored animation discussions. Use `node scripts/pilot-demo.ts --motion` to open these examples on the schema demo server.

Run `node --test tests/voice-packs.test.ts tests/voice-service.test.ts tests/voice-http.test.ts tests/read-aloud.test.ts` for archive integrity, speech worker lifecycle, reviewer access and browser playback. These tests use local fixtures. With an installed pack, `node tests/voice.bench.ts kitten` measures cold and warm CPU synthesis using the diagram walkthrough caption.

Run `node --test tests/home.test.ts tests/recent-reviews.test.ts tests/voice-settings-ui.test.ts` to check the landing page, review cancellation, recent review access and the browser voice picker. Model downloads in the settings test use a fixture.

Run `node --test tests/diagram-audio.test.ts tests/lottie-audio.test.ts tests/playback-narration.test.ts tests/voice-service.test.ts` for synchronized playback, cancellation, autoplay recovery and punctuation timing in the generated WAV.

The distributable agent skill is in `skills/janotate/`. The CLI and both MCP transports serve the workflow and Markdown item references from the same sources. Run `node --test tests/agent-context.test.ts` after building to exercise offline discovery, skill installation and PR import.

Run `node --test tests/advanced-guide.test.ts tests/pr-review.test.ts tests/elevenlabs.test.ts tests/voice-settings-ui.test.ts` for guided subitems and playback, meaning-based PR coverage and line threads, and the compatible speech provider. Provider tests use loopback audio fixtures.

Run `node --test tests/pr-review.test.ts tests/pr-range.test.ts tests/pr-passage.test.ts` for PR discussion anchors, keyboard and pointer selection, cross-page diff ranges, and thread restoration across revisions. To refresh documentation captures, build the app, run `npm run screenshots`, then rebuild to ship the new images. The capture script uses a disposable workspace.
