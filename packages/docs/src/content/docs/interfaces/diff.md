---
title: diff
---
Select a step, expand a unified diff hunk and attach a comment. Save a ruling for every step.

```json
{
  "name": "review_open",
  "arguments": {
    "title": "Review a change",
    "items": [
      {
        "kind": "diff",
        "title": "diff",
        "steps": [
          {
            "id": "title",
            "label": "Show the project name",
            "patch": "@@ -1 +1 @@\n-<title>Review</title>\n+<title>Janotate</title>"
          }
        ]
      }
    ]
  }
}
```

<img alt="Review controls for diff" src="../../screenshots/diff.png" />
