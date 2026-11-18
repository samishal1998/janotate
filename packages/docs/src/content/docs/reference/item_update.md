---
title: item_update
---
Revise an open item and reply to its thread. The previous body remains in the thread.

```json
{
  "name": "item_update",
  "arguments": {
    "review_id": "$review_id",
    "item_id": "$item_id",
    "patch": {
      "title": "Revised question"
    },
    "reply": "Updated following your comment."
  }
}
```
