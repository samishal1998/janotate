---
title: Digest
---
Read each entry about work completed while you were away. Approve it, reverse it or enter a follow-up answer. Save your rulings to return one value per entry.

<img alt="Build changes with a follow-up answer about receipt retries" src="../../screenshots/digest.png" />

```json
{
  "name": "review_open",
  "arguments": {
    "title": "While you were away",
    "items": [
      {
        "kind": "digest",
        "title": "Review the completed handoff changes",
        "entries": [
          {
            "id": "cache",
            "label": "Asset cache",
            "summary": "Enabled immutable caching for hashed assets."
          },
          {
            "id": "retry",
            "label": "Receipt retries",
            "summary": "A reconnect now reuses the original receipt key."
          }
        ]
      }
    ]
  }
}
```
