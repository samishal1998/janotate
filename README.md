# Janotate

Review a coding agent’s questions in a browser and return structured answers over MCP. Node 24 is required.

Build a checkout with `npm ci` and `npm run build`. Run `node bin/janotate.mjs --no-open` from the checkout, or install the locally packed package into a project and run `npx janotate` there. The CLI prints the project URL. Open its `/docs/` for the tool reference. Use `janotate mcp` as your client's stdio command, or use the server's `/mcp` endpoint.

Workspace reviews persist in `.janotate/workspace.sqlite`. Treat the database as sensitive. See [STATUS.md](STATUS.md) for delivery and verification.
