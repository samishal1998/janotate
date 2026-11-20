---
title: ranking
---

Drag rows or use the up and down buttons to set priority. Each answer maps an entry ID to its one-based rank as a string.

<img alt="Shift checks reordered with simultaneous edits first and visible move controls" src="../../screenshots/ranking.png" />

```json
{
  "name": "review_open",
  "arguments": {
    "title": "Field Notes · pilot readiness",
    "items": [
      {
        "kind": "ranking",
        "title": "Prioritize the first shift checks",
        "entries": [
          {
            "id": "receipts",
            "label": "Recover lost receipts",
            "description": "Retry when the response disappears after a successful write."
          },
          {
            "id": "conflicts",
            "label": "Inspect simultaneous edits",
            "description": "Make sure the shift lead can recover both versions."
          },
          {
            "id": "handoff",
            "label": "Rehearse shift handoff",
            "description": "Transfer the shared tablet with pending notes intact."
          }
        ]
      }
    ]
  }
}
```
