---
title: decision
---
Choose one option or enter another answer. Recommendations include their trade-offs. Explicitly select a default to confirm it.

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
          }
        ]
      }
    ]
  }
}
```
