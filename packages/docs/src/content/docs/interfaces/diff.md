---
title: diff
---
Expand a hunk to inspect the line numbers and coloured changes. Toggle split and unified views, annotate a hunk, and save one ruling per step.

<img alt="Receipt lookup patch with additions and deletions in split view" src="../../screenshots/diff.png" />

```json
{
  "name": "review_open",
  "arguments": {
    "title": "Field Notes pilot",
    "items": [
      {
        "kind": "diff",
        "title": "Inspect the receipt lookup",
        "steps": [
          {
            "id": "receipts",
            "label": "sync.ts",
            "language": "typescript",
            "patch": "@@ -12,3 +12,5 @@\n function sync(note: Note) {\n-  return store.write(note);\n+  const receipt = store.findReceipt(note.id);\n+  if (receipt) return receipt;\n+  return store.writeOnce(note);\n }"
          }
        ]
      }
    ]
  }
}
```
