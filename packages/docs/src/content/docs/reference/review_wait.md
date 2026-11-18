---
title: review_wait
---
Wait up to 45 seconds. On pending, repeat for up to ten minutes, then give the reviewer the id.

Example MCP tool call using the id returned by review_open.

```json
{
  "name": "review_wait",
  "arguments": {
    "review_id": "$review_id",
    "wait_seconds": 1
  }
}
```
