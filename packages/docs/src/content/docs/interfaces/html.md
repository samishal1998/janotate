---
title: HTML form
---
Supply a fragment with a form posting to its current URL. The separate-origin sandbox permits scripts and forms. Its submission URL expires after one accepted answer. Form fields are strings. Scripted forms can post JSON to the same URL. Declare the accepted fields in an object schema. The parent displays validation errors and acceptance.

```json
{"name":"review_open","arguments":{"title":"Editor preferences","items":[{"kind":"html","title":"Editor","html":"<form method='post'><label>Name <input name='editor'></label><button>Save</button></form>","expects":{"type":"object","properties":{"editor":{"type":"string","minLength":1}},"required":["editor"]}}]}}
```

<img alt="Review controls for html" src="../../screenshots/html.png" />

The optional assets object accepts lists named scripts, styles and images. List only the exact HTTPS resources the form needs. By default the frame can fetch only its own submission URL. Use postMessage with type resize and a numeric height to fit the frame, or type submit to ask the parent to refresh its status. The server determines whether the submission was accepted.

The policy restricts subresource requests, form targets and top-level navigation. Browsers can allow a sandboxed document to navigate its own frame. A web iframe alone does not guarantee network isolation for arbitrary hostile JavaScript.
