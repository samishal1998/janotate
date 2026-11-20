---
title: code
---
Edit the proposed source in CodeMirror, then save or submit it to return the exact text to the agent. JavaScript, TypeScript and JSON have syntax highlighting. Use text for other languages. Code is never executed.

<img alt="TypeScript retry policy in the code editor, with an increased retry limit" src="../../screenshots/code.png" />

```json
{
  "name": "review_open",
  "arguments": {
    "title": "Field Notes pilot",
    "items": [
      {
        "kind": "code",
        "title": "Edit the retry policy",
        "filename": "retry-policy.ts",
        "language": "typescript",
        "code": "type RetryPolicy = { attempts: number; delayMs: number }\n\nexport const policy: RetryPolicy = {\n  attempts: 3,\n  delayMs: 1500,\n}\n"
      }
    ]
  }
}
```
