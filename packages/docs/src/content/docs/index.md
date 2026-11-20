---
title: Quick start
---
From the project directory run `npx janotate` after installing the package locally. The command prints the workspace URL. Use `--no-open` to suppress the browser launch.

The workspace lists open reviews and lets you resume the latest one. **Connect your agent** shows the endpoint for this project.

<img alt="Janotate workspace with three open reviews, a Resume latest review button and the project’s MCP endpoint" src="./screenshots/workspace-home.png" />

Configure your MCP client's stdio command as `npx janotate mcp` in the same directory, or connect to the printed URL with the path `/mcp`. Ask your agent to [open a review](./reference/review_open/). Follow its review link, choose an answer, and submit. Unanswered items are skipped.

The [agent setup guide](./agents/workflow/) includes the installable project skill, offline CLI reference and pull request example.

The agent can [wait for submission](./reference/review_wait/) or [fetch the result](./reference/review_get/) after a restart. The SQLite file in the project data directory contains your review content. Treat it as sensitive.
