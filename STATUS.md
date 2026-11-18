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

- packages/ui/src/theme.css controls UI typography, palette and logo slot.
- packages/docs/src/theme.css controls documentation typography, palette and logo slot.

## Final checks

- `npm test` passed all nine test cases, covering the store, both MCP transports, docs examples, Chromium review and sandbox flows, decision reuse, history, quotas and errors.
- `npm run typecheck` passed on Node 24.22.1. The pinned Oxlint 1.93.0 CLI ran from the local package cache with `--deny-warnings packages/core/src packages/server/src packages/ui/src scripts bin tests` and exited successfully.
- `npm run build` produced the browser bundle, server and 23 Starlight pages, including the generated 404 page. A temporary broken internal link made `node scripts/build.mjs` fail. Removing it restored a successful build. The checker also verifies local anchor targets.
- `node tests/wait.long.ts` ran for 600,107 ms with 14 pending responses and 120 progress notifications. Every call completed within the client's 60-second deadline. This run began before the final core service refactor. The final integration suite exercised the refactored wait path.
- `node tests/package.smoke.ts` installed the local tarball using a loopback mirror of cached packages. Warm-cache npx launch to a rendered decision took 1,160 ms. The installed package served its documentation with Astro absent from runtime dependencies.
- `npm run screenshots` rendered the interface examples in Chromium for all eleven native kinds. After a theme change rerun this command and rebuild the site.

## Limits and open items

The diagram renderer supports named nodes, simple arrows and TD/TB/LR layout in Mermaid flowcharts. Full Mermaid syntax remains outside the implementation because the package was unavailable offline. Diffs use a native, lazy unified-hunk viewer. Text anchors use native browser ranges and text-quote selectors.

The six required sandbox checks ran in Chromium. These checks establish the tested browser restrictions. They do not certify complete network isolation for arbitrary JavaScript. Hosted token and Host enforcement ran on loopback. A public TLS reverse proxy and remote CI were not exercised.

Branding awaits the owner's direction. The repository is local and the package is unpublished.
