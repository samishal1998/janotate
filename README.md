# Janotate

Review a coding agent’s questions in a browser and return structured answers over MCP. Node 24 is required.

Build a checkout with `npm ci` and `npm run build`. Run `node bin/janotate.mjs --no-open` from the checkout, or install the locally packed package into a project and run `npx janotate` there. The CLI prints the project URL. Open its `/docs/` for the tool reference. Use `janotate mcp` as your client's stdio command, or use the server's `/mcp` endpoint.

Workspace reviews persist in `.janotate/workspace.sqlite`. Treat the database as sensitive. See [STATUS.md](STATUS.md) for delivery and verification.

For a local package install, run `npm pack` in this checkout, then `npm install /absolute/path/to/janotate-0.0.0.tgz` in your project. The tarball includes the UI and searchable Starlight site. Runtime installation needs Node 24 and the package dependencies.

For hosted use, configure distinct `JANOTATE_UI_TOKEN` and `JANOTATE_MCP_TOKEN` secrets and pass `--host`, `--port` and `--data`. Place TLS at the reverse proxy. See the operations guide under `/docs/guides/operations/` for the separate frame origin, proxy headers and backup procedure.
