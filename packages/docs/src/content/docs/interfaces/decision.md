---
title: decision
---
Choose one option or enter another answer. Recommendations include their trade-offs. Explicitly select a default to confirm it.

<img alt="Markdown selected alongside the JSON alternative and their trade-offs" src="../../screenshots/decision.png" />

Example MCP tool call.

```json
{
  "name": "review_open",
  "arguments": {
    "title": "Export preferences",
    "items": [
      {
        "kind": "decision",
        "title": "Export format?",
        "options": [
          {
            "id": "md",
            "label": "Markdown",
            "tradeoffs": "Readable in a text editor",
            "recommended": true
          },
          {
            "id": "json",
            "label": "JSON",
            "tradeoffs": "Preserves typed fields for other tools; less convenient to read by hand."
          }
        ]
      }
    ]
  }
}
```
