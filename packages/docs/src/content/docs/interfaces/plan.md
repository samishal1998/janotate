---
title: plan
---
Set a status on each outline node.

```json
{
  "name": "review_open",
  "arguments": {
    "title": "Review a change",
    "items": [
      {
        "kind": "plan",
        "title": "plan",
        "nodes": [
          {
            "id": "build",
            "label": "Build static assets",
            "children": [
              {
                "id": "verify",
                "label": "Check links"
              }
            ]
          }
        ]
      }
    ]
  }
}
```
