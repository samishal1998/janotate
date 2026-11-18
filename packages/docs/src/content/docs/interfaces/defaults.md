---
title: defaults
---
Save a state or value for each row before submitting the review.

```json
{
  "name": "review_open",
  "arguments": {
    "title": "Project choices",
    "items": [
      {
        "title": "Project choices",
        "kind": "defaults",
        "defaults": [
          {
            "id": "format",
            "label": "Export format",
            "value": "Markdown"
          }
        ]
      }
    ]
  }
}
```
