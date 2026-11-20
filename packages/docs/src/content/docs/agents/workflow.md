---
title: Connect your coding agent
---
## Connect to this workspace

Open **Connect your agent** on the workspace home page and copy the MCP endpoint. Add it to your client as a Streamable HTTP server. On a hosted workspace, configure the operator-provided MCP bearer token in the client's secret settings.

<img alt="Expanded Connect your agent panel with the workspace MCP endpoint, its Copy button and the agent setup guide" src="../../screenshots/connect-agent.png" />

For stdio, use `npx` as the command and `janotate`, `mcp` as its arguments. Start the client in the project directory. If the server uses a custom data directory, pass the same `--data` and directory as two additional arguments. An absolute data path works from any working directory.

## Give the agent its workflow

Janotate sends brief instructions during MCP initialization. Clients can list and read these resources on demand.

| Resource | Contents |
| --- | --- |
| `janotate://agent/workflow` | Open a review, handle live threads, resume, and interpret results. |
| `janotate://agent/catalog` | Supported tools, item kinds, and their reference URIs. |
| `janotate://items/diagram` | Author a diagram and walkthrough. Substitute any kind listed in the catalog. |

With the package installed, the same guidance is available offline in the terminal.

```sh
npx janotate context
npx janotate context diagram
npx janotate context --json
```

Run `npx janotate skill install` from the project root to install the shipped skill at `.agents/skills/janotate/SKILL.md`. It preserves existing custom instructions. If your agent uses another skill directory, `npx janotate skill` prints the complete skill for you to save there. These commands work before the server starts.

For clients that only expose tools, put this in the project's agent instructions.

> Search past decisions before opening a Janotate review. Share its URL. Wait with after_comment starting at zero. Reply to each thread before advancing the cursor. On submission, read the answers, skipped items and comments. Resume a previous review by ID.

## Try a pull request review

Run `npx janotate review-pr --example` to open the included receipt-retry review. To import your own, pass the path to a finished feynman-review v2 `review.json`. Use the same `--data` as your existing workspace. Add `--json` when a script needs the URL, review ID and item IDs.
