---
title: HTML form
---
Supply a fragment with a form posting to its current URL. The separate-origin sandbox permits scripts and forms. Its submission URL expires after one accepted answer. Form fields are strings. Scripted forms can post JSON to the same URL. Declare the accepted fields in an object schema. The parent displays validation errors and acceptance.

```json
{"name":"review_open","arguments":{"title":"Editor preferences","items":[{"kind":"html","title":"Editor","html":"<form method='post'><label>Name <input name='editor'></label><button>Save</button></form>","expects":{"type":"object","properties":{"editor":{"type":"string","minLength":1}},"required":["editor"]}}]}}
```
