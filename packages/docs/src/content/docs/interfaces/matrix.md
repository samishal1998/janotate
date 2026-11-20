---
title: matrix
---
Adjust criterion weights, compare totals and choose an option.

<img alt="Three handoff formats compared using weighted criteria and a selected option" src="../../screenshots/matrix.png" />

```json
{
  "name": "review_open",
  "arguments": {
    "title": "Review a change",
    "items": [
      {
        "kind": "matrix",
        "title": "Choose a shift handoff format",
        "criteria": [
          {
            "id": "portability",
            "label": "Portability",
            "weight": 1
          },
          {
            "id": "readability",
            "label": "Readability",
            "weight": 2
          },
          {
            "id": "automation",
            "label": "Automation",
            "weight": 1
          }
        ],
        "options": [
          {
            "id": "md",
            "label": "Markdown",
            "scores": {
              "portability": 4,
              "readability": 5,
              "automation": 2
            }
          },
          {
            "id": "json",
            "label": "JSON",
            "scores": {
              "portability": 5,
              "readability": 2,
              "automation": 5
            }
          },
          {
            "id": "csv",
            "label": "CSV",
            "scores": {
              "portability": 4,
              "readability": 3,
              "automation": 3
            }
          }
        ]
      }
    ]
  }
}
```
