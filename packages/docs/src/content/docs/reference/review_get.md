---
title: review_get
---
Read the state immediately. A submitted review includes answers, skipped item ids and comments.

Example MCP tool call using the id returned by review_open.

```json
{
  "name": "review_get",
  "arguments": {
    "review_id": "$review_id"
  }
}
```
