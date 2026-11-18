import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {chromium} from 'playwright'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {start} from '../packages/server/src/http.ts'
test('isolated browser form, CSP and one-use validated answer',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'janotate-html-')),service=await start(dir,0,false,resolve('dist'))
 const browser=await chromium.launch(),client=new Client({name:'security',version:'1'})
 try{
 await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',service.origin)))
 const example=JSON.parse(readFileSync('packages/docs/src/content/docs/interfaces/html.md','utf8').match(/```json\n([\s\S]*?)\n```/)[1])
 example.arguments.items.push({...example.arguments.items[0],title:'Second editor'})
 const opened=(await client.callTool(example)).structuredContent
 const page=await browser.newPage()
 await page.goto(opened.url)
 await page.frameLocator('iframe').first().getByLabel('Name').waitFor()
 await page.frameLocator('iframe').nth(1).getByLabel('Name').waitFor()
 const [a,b]=page.frames().filter(f=>f.parentFrame())
 assert.notEqual(new URL(a.url()).origin,new URL(opened.url).origin)
 assert.equal(await page.locator('iframe').first().getAttribute('sandbox'),'allow-scripts allow-forms')
 assert.deepEqual(await a.evaluate(()=>[()=>parent.localStorage.length,()=>parent.document.cookie].map(read=>{try{read();return false}catch(e){return e.name==='SecurityError'}})),[true,true])
 for(const url of [service.origin+'/health',b.url()]){
 const directive=await a.evaluate(async(url)=>{
 const violation=new Promise(resolve=>document.addEventListener('securitypolicyviolation',e=>resolve(e.effectiveDirective),{once:true}))
 await fetch(url,{method:'POST',body:'editor=x'}).catch(()=>{})
 return violation
 },url)
 assert.equal(directive,'connect-src')
 }
 assert.equal(await a.evaluate(()=>{try{top.location.href='/';return false}catch{return true}}),true)
 assert.equal(page.url(),opened.url)
 async function answer(value){return a.evaluate(async value=>(await fetch(location.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)})).status,value)}
 const get=async()=> (await client.callTool({name:'review_get',arguments:{review_id:opened.review_id}})).structuredContent
 assert.equal(await answer({editor:4}),422)
 assert.equal((await get()).review.items[0].value,undefined)
 await page.getByText(/Invalid answer/).waitFor()
 assert.equal(await answer({editor:'Vim',extra:'drop'}),204)
 assert.equal(await answer({editor:'Replay'}),409)
 assert.deepEqual((await get()).review.items[0].value,{editor:'Vim'})
 await b.getByLabel('Name').fill('Emacs')
 await b.getByRole('button',{name:'Save'}).click()
 await page.getByText('Answer accepted').nth(1).waitFor()
 assert.deepEqual((await get()).review.items[1].value,{editor:'Emacs'})
 }finally{await client.close();await browser.close();service.close();rmSync(dir,{recursive:true})}
})
