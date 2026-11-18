---
title: Local and hosted operation
---
## Local projects

Start Janotate from the project directory and keep its printed URL. A second client with the same data directory reuses the listener. The lock file in that directory includes the server PID. Send SIGTERM to that process for an orderly shutdown. Temporary session reviews disappear on restart.

## Backups

Stop the server before copying the entire data directory, including any SQLite WAL files. Restore into an empty directory and start with --data pointing there. Protect the backup as you would source code and internal design notes.

## Hosted setup

Set distinct, high-entropy JANOTATE_UI_TOKEN and JANOTATE_MCP_TOKEN secrets in the service environment. Start with --host and a persistent --data volume. Give the reviewer the application URL with their UI secret in the token query parameter. The server exchanges it for an HttpOnly SameSite cookie and redirects to the clean URL. The agent receives only its bearer token and the /mcp endpoint.

Terminate TLS at a reverse proxy. Set JANOTATE_PUBLIC_ORIGIN and JANOTATE_FRAME_ORIGIN to distinct HTTPS origins, and JANOTATE_FRAME_PORT to a fixed upstream port. Route the application origin to --port and the frame origin to JANOTATE_FRAME_PORT. Preserve the public Host header. Disable logging of token-bearing query strings at the proxy. One deployment serves one project and one reviewer.
