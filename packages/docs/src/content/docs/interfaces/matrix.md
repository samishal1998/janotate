---
title: matrix
---
Adjust criterion weights, compare totals and choose an option.

```json
{
  "name": "review_open",
  "arguments": {
    "title": "Review a change",
    "items": [
      {
        "kind": "matrix",
        "title": "matrix",
        "criteria": [
          {
            "id": "portability",
            "label": "Portability",
            "weight": 1
          }
        ],
        "options": [
          {
            "id": "md",
            "label": "Markdown",
            "scores": {
              "portability": 4
            }
          }
        ]
      }
    ]
  }
}
```
