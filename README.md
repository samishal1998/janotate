# Janotate

Review a coding agent’s questions in a browser and return structured answers over MCP. Node 24 is required.

The home page at `/` lists the six most recently active open reviews. Resume a review there or visit the searchable decision log at `/decisions`.

Build a checkout with `npm ci` and `npm run build`. Run `node bin/janotate.mjs --no-open` from the checkout, or install the locally packed package into a project and run `npx janotate` there. The CLI prints the project URL. Open its `/docs/` for the tool reference. Use `janotate mcp` as your client's stdio command, or use the server's `/mcp` endpoint.

Workspace reviews persist in `.janotate/workspace.sqlite`. Treat the database as sensitive. See [STATUS.md](STATUS.md) for delivery and verification.

On the home page, **Connect your agent** provides the MCP endpoint for that workspace. The server advertises a workflow, a catalog and an authoring reference per item. Use `janotate context plan` to read a reference offline, or `janotate skill install` to add the workflow to the current project's agent skills. [Agent setup guide](packages/docs/src/content/docs/agents/workflow.md)

Run `janotate review-pr --example` for an interactive pull request review, or `janotate review-pr path/to/review.json` for a validated feynman-review v2 report. Add `--data .janotate/schema-demo` to use the existing Field Notes workspace. The browser returns the reviewer's verdict and anchored discussion to the agent.

For a local package install, run `npm pack` in this checkout, then `npm install /absolute/path/to/janotate-0.0.0.tgz` in your project. The tarball includes the UI and searchable Starlight site. Runtime installation needs Node 24 and the package dependencies.

For hosted use, configure distinct `JANOTATE_UI_TOKEN` and `JANOTATE_MCP_TOKEN` secrets and pass `--host`, `--port` and `--data`. Place TLS at the reverse proxy. See the operations guide under `/docs/guides/operations/` for the separate frame origin, proxy headers and backup procedure.

## Interactive local example

Run `npm run build`, then `node scripts/pilot-demo.ts`. Open the printed URL for a Field Notes pilot with an annotated proposal, rollout map, draggable priorities, sliders, a scope board, deployment diagrams, a code diff and an editable retry policy. Each run creates a fresh workspace review. The opening thread is example data. For a stdio MCP client, use `node bin/janotate.mjs mcp --data .janotate/pilot-demo` from the project root. HTTP clients can use `/mcp` at the printed origin. Call `review_wait` with `after_comment` set to `0`, reply with `discussion_reply`, and use the returned discussion cursor for the next wait.

Run `node scripts/pilot-demo.ts --schema` to open the delivery architecture example in focus view. Turn on **Annotate** and select a column to discuss it. Choose **Edit DBML** to change the schema, then **Preview patch** to see the lines that will go back to the agent. **Save patch** saves the edit locally. **Submit review** returns the unified diff and anchored discussion over MCP. The other items cover Kubernetes, GitHub Actions and the pilot proposal. The example uses `.janotate/schema-demo` as its project data directory.

Run `node scripts/pilot-demo.ts --motion` to review a Kubernetes rollout, scrub a Lottie delivery animation, and compare a successful write with a retry after a lost receipt. Both the schema and motion examples use the same local server. Use **Float** or **Dock** in the guide to change its placement while keeping your place in the rollout plan.

## Optional server-side speech

Open **Voice** beside **Appearance** in the header. Choose Kitten Nano or Kokoro for local CPU narration. On a local server, **Install and use** downloads the selected pack. To use your own service, select **ElevenLabs-compatible** and enter the API base URL, model ID, voice ID and API key. Janotate sends narrated text to the selected endpoint when you start playback. The server stores the key and streams the audio back to the browser. Hosted operators configure their endpoint with `janotate voice configure-elevenlabs`.

On a diagram walkthrough or captioned Lottie animation, open the arrow beside **Play** and choose **Play with audio**. Janotate prepares one clip ahead and advances the diagram after each caption finishes. Full stops, line breaks and blank lines produce progressively longer pauses.

Use `janotate voice status` to inspect the selection and local cache, `janotate voice install kokoro` for the optional Kokoro 82M pack, and `janotate voice off` to disable narration for this project. [Read aloud guide](packages/docs/src/content/docs/guides/read-aloud.md)
