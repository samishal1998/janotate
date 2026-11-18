import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,readFileSync,readdirSync,existsSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {execFileSync} from 'node:child_process'
import {setTimeout as delay} from 'node:timers/promises'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js'
import {chromium} from 'playwright'
test('documented MCP calls, browser submission and restart',async()=>{
 const data=mkdtempSync(join(tmpdir(),'janotate-')),lock=join(data,'server.json'),args=[resolve('bin/janotate.mjs'),'--data',data,'--no-open']
 const launch=()=>execFileSync(process.execPath,args,{encoding:'utf8'}).trim()
 async function stop(){if(existsSync(lock)){process.kill(JSON.parse(readFileSync(lock,'utf8')).pid,'SIGTERM');for(let n=0;existsSync(lock)&&n<100;n++)await delay(25)}}
 const client=new Client({name:'test',version:'1'}),stdio=new Client({name:'stdio-test',version:'1'})
 let browser
 try{
 const origin=launch()
 await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',origin)))
 await stdio.connect(new StdioClientTransport({command:process.execPath,args:[...args,'mcp']}))
 assert((await stdio.listTools()).tools.some(t=>t.name==='review_get'))
 let id='',url='',itemId=''
 const dir='packages/docs/src/content/docs'
 for(const f of ['interfaces/claim.md','interfaces/defaults.md','reference/review_open.md','reference/item_update.md','interfaces/decision.md','reference/review_wait.md','reference/review_status.md','reference/review_get.md']){
 const source=readFileSync(join(dir,f),'utf8'), example=JSON.parse(source.match(/```json\n([\s\S]+?)\n```/)[1].replace('$review_id',id).replace('$item_id',itemId))
 const r=await client.callTool(example)
 assert(!r.isError,JSON.stringify(r))
 if(example.name==='review_open'){id=r.structuredContent.review_id;url=r.structuredContent.url;itemId=r.structuredContent.item_ids[0]}
 }
 browser=await chromium.launch()
 const page=await browser.newPage()
 await page.goto(url)
 await page.getByRole('radio').first().check()
 await page.getByRole('button',{name:'Comment on Markdown'}).click()
 await page.getByRole('textbox',{name:'Comment on option:md'}).fill('Does this preserve history?')
 await page.getByRole('button',{name:'Add comment'}).click()
 await page.locator('li').filter({hasText:'Does this preserve history?'}).waitFor()
 const update=await client.callTool({name:'item_update',arguments:{review_id:id,item_id:itemId,patch:{title:'Archive format?'},reply:'History is preserved.'}})
 assert.equal(update.structuredContent.status,'asked')
 await page.reload()
 await page.getByText(/History is preserved/).waitFor()
 await page.getByRole('radio').first().check()
 await page.getByRole('button',{name:'Submit review'}).click()
 await page.getByText('Review submitted').waitFor()
 const get=async()=> (await stdio.callTool({name:'review_get',arguments:{review_id:id}})).structuredContent
 const r=await get()
 assert.equal(r.result.answers[0].value,'md')
 await stop();assert.equal(launch(),origin)
 assert.deepEqual(await get(),r)
 }finally{await browser?.close();await stdio.close();await client.close();await stop();rmSync(data,{recursive:true,force:true})}
})
