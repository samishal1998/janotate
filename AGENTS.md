# Working on Janotate

The PRD in docs/spec governs behavior. Keep core storage and review rules in packages/core, transports and the CLI in packages/server, browser components in packages/ui and Starlight content in packages/docs. The release build copies static assets into dist beside the bundled server.

Use Node 24. Run npm ci, then npm run build before integration and browser tests. Run npm test for all implemented layers. Use node --test tests/store.test.ts for the store. Use node --test tests/review.test.ts for HTTP/stdio integration, executable docs examples and browser restart coverage. The browser tests need the Chromium revision listed by Playwright. Run npm run build for docs and local link checks.

Use GitButler for version control. Keep commits scoped to each phase and record the actual gate command and outcome in STATUS.md.

Run node --test tests/security.test.ts for the real Chromium sandbox gate.

Use node --test tests/catalog.test.ts for diagram and diff anchors and the 200-hunk check. Run node --test tests/hosting.test.ts for auth and decision reuse, and node --test tests/errors.test.ts for negative MCP calls. npm run test:wait exercises ten minutes of real waiting with a 60-second client deadline. npm run typecheck checks all three TypeScript application packages. npm run lint invokes the pinned Oxlint CLI. npm run screenshots regenerates the documentation's interface images from the built browser app. Run node tests/package.smoke.ts to install a local tarball into a temporary project and open a decision with npx. It needs a package cache or registry containing the runtime dependencies.
