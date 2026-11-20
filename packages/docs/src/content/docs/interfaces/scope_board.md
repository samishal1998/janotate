---
title: scope_board
---
Drag cards between columns to set the scope, or choose a column from the card menu.

<img alt="Shift work organized into scope columns with per-card move controls" src="../../screenshots/scope_board.png" />

```json
{
  "name": "review_open",
  "arguments": {
    "title": "Review a change",
    "items": [
      {
        "kind": "scope_board",
        "title": "Scope the first shift",
        "cards": [
          {
            "id": "export",
            "label": "Receipt export",
            "column": "in scope",
            "reason": "Compare tablet and server receipts at shift end."
          },
          {
            "id": "alerts",
            "label": "Overnight alerts",
            "column": "deferred",
            "reason": "Revisit alert thresholds after the pilot shift."
          },
          {
            "id": "digest",
            "label": "Weekly summary",
            "column": "deferred",
            "reason": "Wait for a full week of receipt data."
          },
          {
            "id": "fleet",
            "label": "Fleet rollout",
            "column": "out of scope",
            "reason": "This review covers the first shift only."
          }
        ]
      }
    ]
  }
}
```
