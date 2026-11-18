---
title: Quick start
---
From the project directory run `npx janotate` after installing the package locally. The command prints the workspace URL. Use `--no-open` to suppress the browser launch.

Configure your MCP client's stdio command as `npx janotate mcp` in the same directory, or connect to the printed URL with the path `/mcp`. Ask your agent to [open a review](./reference/review_open/). Follow its review link, choose an answer, and submit. Unanswered items are skipped.

The agent can [wait for submission](./reference/review_wait/) or [fetch the result](./reference/review_get/) after a restart. The SQLite file in the project data directory contains your review content. Treat it as sensitive.
