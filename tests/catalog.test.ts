import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,readFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {tmpdir} from 'node:os'
import {chromium} from 'playwright'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {start} from '../packages/server/src/http.ts'
test('review the actual CLI entrypoint with diagram and hunk anchors',async()=>{
 const data=mkdtempSync(join(tmpdir(),'janotate-change-')),server=await start(data,0,false,resolve('dist'))
 const browser=await chromium.launch(),client=new Client({name:'catalog',version:'1'})
 try{
 await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',server.origin)))
 const examples={}
 for(const kind of ['diagram','diff','matrix','scope_board','plan','function_overview']){
   const source=readFileSync('packages/docs/src/content/docs/interfaces/'+kind+'.md','utf8')
   const call=JSON.parse(source.match(/```json\n([\s\S]*?)\n```/)[1])
   assert(!(await client.callTool(call)).isError)
   examples[kind]=call.arguments.items[0]
 }
 const lines=readFileSync('bin/janotate.mjs','utf8').trimEnd().split('\n')
 examples.diff.steps=[{id:'cli',label:'CLI entrypoint',patch:'@@ -0,0 +1,'+lines.length+' @@\n'+lines.map(l=>'+'+l).join('\n')}]
 examples.diagram.spec='flowchart LR\nShim[CLI entrypoint] --> Server[Review server]'
 const opened=(await client.callTool({name:'review_open',arguments:{title:'Review CLI change',items:[examples.diagram,examples.diff]}})).structuredContent
 const page=await browser.newPage();await page.goto(opened.url)
 const field=page.locator('fieldset')
 await field.first().getByRole('button',{name:'CLI entrypoint'}).click()
 async function comment(section,body){
 await section.getByRole('textbox').fill(body)
 await section.getByRole('button',{name:'Add comment'}).click()
 await section.locator('li').filter({hasText:body}).waitFor()
 }
 await comment(field.first(),'Entry point matches the package binary.')
 await field.nth(1).locator('summary').click()
 await field.nth(1).getByRole('button',{name:'Comment on hunk'}).click()
 await comment(field.nth(1),'Error handling sets the exit status.')
 await field.nth(1).getByRole('combobox').selectOption('approved')
 await field.nth(1).getByRole('button',{name:'Save answer'}).click()
 await page.getByRole('button',{name:'Submit review'}).click()
 await page.getByText('Review submitted').waitFor()
 const r=(await client.callTool({name:'review_get',arguments:{review_id:opened.review_id}})).structuredContent
 assert.deepEqual(r.result.comments.map(c=>c.anchor.path),['node:Shim','hunk:cli:0'])
 assert.deepEqual(r.result.answers[0].value,{cli:'approved'})
 examples.diff.steps[0].patch=Array.from({length:200},(_,n)=>'@@ -'+(n+1)+' +'+(n+1)+' @@\n-before\n+after').join('\n')
 const large=(await client.callTool({name:'review_open',arguments:{title:'Large diff',items:[examples.diff]}})).structuredContent
 await page.goto(large.url);await page.locator('summary').last().waitFor()
 assert.equal(await page.locator('details:not([open])').count(),200)
 await page.locator('summary').last().click();await page.getByText('+after',{exact:false}).last().waitFor({timeout:1000})
 }finally{await browser.close();await client.close();server.close();rmSync(data,{recursive:true})}
})
