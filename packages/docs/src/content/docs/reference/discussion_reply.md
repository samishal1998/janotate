---
title: discussion_reply
---
Post a threaded agent reply while a review is open. The parent must belong to the specified item. The reply inherits its anchor and preserves the reviewer's answer and item revision. Use `item_update` when the proposal itself changes.

```json
{
  "name": "discussion_reply",
  "arguments": {
    "review_id": "$review_id",
    "item_id": "$item_id",
    "parent_id": "$comment_id",
    "reply": "Yes. The receipt belongs to the original note and survives retries."
  }
}
```
