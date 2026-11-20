---
title: range
---

Each slider has integer bounds, a step size and an initial value. Arrow keys adjust by one step. Saved answers map each scale ID to its selected value as a string.

<img alt="An eight-tablet cohort and seven-day offline retention selected on two sliders" src="../../screenshots/range.png" />

```json
{
  "name": "review_open",
  "arguments": {
    "title": "Field Notes · pilot readiness",
    "items": [
      {
        "kind": "range",
        "title": "Set the pilot limits",
        "scales": [
          {
            "id": "crew",
            "label": "Tablets in the first cohort",
            "min": 2,
            "max": 20,
            "step": 2,
            "initial": 4,
            "unit": "tablets"
          },
          {
            "id": "hold",
            "label": "Offline retention",
            "min": 1,
            "max": 14,
            "step": 1,
            "initial": 7,
            "unit": "days"
          }
        ]
      }
    ]
  }
}
```
