---
title: review_open
---
Create a review. Send its URL to the reviewer and keep the returned review_id and item_ids.

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
