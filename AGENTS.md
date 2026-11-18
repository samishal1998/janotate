# Working on Janotate

The PRD in docs/spec governs behavior. Keep core storage and review rules in packages/core, transports and the CLI in packages/server, browser components in packages/ui and Starlight content in packages/docs. The release build copies static assets into dist beside the bundled server.

Use Node 24. Run npm ci, then npm run build before integration and browser tests. Run npm test for all implemented layers. Use node --test tests/store.test.ts for the store. Use node --test tests/review.test.ts for HTTP/stdio integration, executable docs examples and browser restart coverage. The browser tests need the Chromium revision listed by Playwright. Run npm run build for docs and local link checks.

Use GitButler for version control. Keep commits scoped to each phase and record the actual gate command and outcome in STATUS.md.
