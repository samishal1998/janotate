---
title: defaults
---
Confirm the suggested values or type replacements, then save the defaults together.

<img alt="Shift handoff defaults with an edited receipt retention period" src="../../screenshots/defaults.png" />

```json
{
  "name": "review_open",
  "arguments": {
    "title": "Project choices",
    "items": [
      {
        "title": "Set the shift handoff defaults",
        "kind": "defaults",
        "defaults": [
          {
            "id": "format",
            "label": "Export format",
            "value": "Markdown"
          },
          {
            "id": "retention",
            "label": "Keep local receipts for",
            "value": "7 days"
          },
          {
            "id": "owner",
            "label": "Escalation owner",
            "value": "Shift lead"
          }
        ]
      }
    ]
  }
}
```
