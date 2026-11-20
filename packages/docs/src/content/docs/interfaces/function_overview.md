---
title: function_overview
---
Expand a named code block to read it with syntax highlighting. Choose **Comment on block** to attach a discussion to that function.

<img alt="Expanded Page title function with highlighted TypeScript and its block comment control" src="../../screenshots/function_overview.png" />

```json
{
  "name": "review_open",
  "arguments": {
    "title": "Review a change",
    "items": [
      {
        "kind": "function_overview",
        "title": "Build the shift summary",
        "blocks": [
          {
            "id": "title",
            "label": "Page title",
            "language": "typescript",
            "code": "function title(crew: string, pending: number) {\n  const status = pending ? `${pending} pending` : \"all delivered\";\n  return `${crew} · ${status}`;\n}"
          },
          {
            "id": "receipt",
            "label": "Receipt status",
            "language": "typescript",
            "code": "function receiptStatus(acceptedAt?: string) {\n  return acceptedAt ? \"Delivered\" : \"Waiting for receipt\";\n}"
          }
        ]
      }
    ]
  }
}
```
