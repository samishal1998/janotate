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

For live discussion, supply the optional integer `after_comment`. Start at zero. On a response with `state: "discussion"`, read each reviewer comment and its anchor. Reply with `discussion_reply` and pass the returned `cursor` as the next `after_comment`. Keep that cursor across pending waits and reconnects. Agent replies do not wake the loop with another discussion result. A wait without the field keeps its original submission behavior.
