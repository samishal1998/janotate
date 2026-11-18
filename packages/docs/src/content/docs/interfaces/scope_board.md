---
title: scope_board
---
Move each card to its final scope column.

```json
{
  "name": "review_open",
  "arguments": {
    "title": "Review a change",
    "items": [
      {
        "kind": "scope_board",
        "title": "scope board",
        "cards": [
          {
            "id": "export",
            "label": "Decision export",
            "column": "in scope",
            "reason": "Travel with the repository"
          }
        ]
      }
    ]
  }
}
```

<img alt="Review controls for scope board" src="../../screenshots/scope_board.png" />
