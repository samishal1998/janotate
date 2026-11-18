import {createServer} from 'node:http'
import {readFileSync,statSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {resolve,sep,extname} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {openStore} from '../../core/src/store.ts'
import {submission} from '../../core/src/schema.ts'
import {frames} from './frames.ts'
import {mcp} from './mcp.ts'
import {Hono} from 'hono'
import {getRequestListener} from '@hono/node-server'
export async function start(data,port,session,assets){
  const sessionDir=mkdtempSync(resolve(tmpdir(),'janotate-session-'))
  const workspace=openStore(resolve(data,'workspace.sqlite')),temporary=openStore(resolve(sessionDir,'session.sqlite'))
  function locate(id){try{temporary.get(id);return temporary}catch(error){if(!String(error).includes('not_found'))throw error;return workspace}}
  let origin=''
  async function dispatch(name,args,progress,signal){
    if(name==='review_open'){
      const mode=args.mode??(session?'session':'workspace')
      const store=mode==='workspace'?workspace:temporary
      const r=store.open(args.title,args.items,mode,args.ttl_hours)
      return {...r,url:origin+'/review/'+r.review_id}
    }
    const id=args.review_id,store=locate(id)
    if(name==='item_update')return store.update(id,args.item_id,args.patch,args.reply,args.parent_id)
    if(name==='review_get'){const r=store.result(id);return r.state==='open'?{...r,review:store.get(id)}:r}
    function counts(){
      const r=store.get(id),answered=r.items.filter(i=>i.value!==undefined).length,total=r.items.length
      return {asked:r.state==='done'?0:total-answered,answered,skipped:r.state==='done'?total-answered:0,last_activity:r.submitted_at??r.created_at,total}
    }
    if(name==='review_status')return counts()
    const start=Date.now(),end=start+args.wait_seconds*1000
    let heartbeat=start+5000
    while(Date.now()<end){
      const r=store.result(id)
      if(r.state!=='open')return r
      await delay(Math.min(125,end-Date.now()),undefined,{signal})
      if(Date.now()>=heartbeat){await progress(Math.floor((Date.now()-start)/1000));heartbeat+=5000}
    }
    const latest=store.result(id)
    return latest.state==='open'?{state:'pending',answered:counts().answered,total:counts().total}:latest
  }
  const frame=await frames(locate,()=>origin)
  const app=new Hono()
  app.onError((err,c)=>c.json({error:err.message},400))
  app.get('/health',c=>c.json({service:'Janotate',pid:process.pid}))
  app.get('/api/review/:id',c=>c.json(locate(c.req.param('id')).get(c.req.param('id'))))
  app.get('/api/review/:id/items/:key/frame-status',c=>c.json({message:frame.status(c.req.param('key'))}))
  app.post('/api/review/:id/items/:key/:action',async c=>{
    if(c.req.header('origin')!==origin)return c.text('Forbidden',403)
    const {id,key,action}=c.req.param(),input=await c.req.json(),store=locate(id)
    if(action==='frame'){
      const review=store.get(id),item=review.items.find(i=>i.id===key)
      if(review.state!=='open'||item?.kind!=='html')return c.notFound()
      return c.json({url:frame.issue(id,item)})
    }
    if(action==='comments')store.addComment(id,key,input)
    else if(action==='answer')store.save(id,key,input===null?null:submission.parse({[key]:input})[key])
    else return c.notFound()
    return c.json(store.get(id))
  })
  app.post('/api/review/:id',async c=>{
    if(c.req.header('origin')!==origin || !c.req.header('content-type')?.startsWith('application/json'))return c.text('Forbidden',403)
    const id=c.req.param('id'),result=locate(id).submit(id,submission.parse(await c.req.json()))
    console.log(JSON.stringify({event:'review_submitted',review_id:id}))
    return c.json(result)
  })
  app.get('*',c=>{
    const path=decodeURIComponent(new URL(c.req.url).pathname)
    if(path==='/docs')return c.redirect('/docs/')
    const docs=path.startsWith('/docs/'),root=resolve(assets,docs?'docs':'ui')
    let file=resolve(root,'.'+(docs?path.slice(5):path.startsWith('/review/')?'/index.html':path))
    if(file!==root&&!file.startsWith(root+sep))return c.notFound()
    try{
      if(statSync(file).isDirectory())file=resolve(file,'index.html')
      const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.wasm':'application/wasm'}
      return new Response(readFileSync(file),{headers:{'Content-Type':mime[extname(file)]??'application/octet-stream','X-Content-Type-Options':'nosniff'}})
    }catch{return c.notFound()}
  })
  const listener=getRequestListener(app.fetch)
  const http=createServer(async(req,res)=>{
    if(req.headers.host!==new URL(origin).host || (req.headers.origin && req.headers.origin!==origin)){res.writeHead(403).end();return}
    if(req.url!=='/mcp')return listener(req,res)
    if(req.method!=='POST'){res.writeHead(405).end();return}
    const server=mcp(dispatch),transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined})
    res.on('close',()=>server.close().catch(()=>{}))
    try{await server.connect(transport);await transport.handleRequest(req,res)}catch{if(!res.headersSent)res.writeHead(500);res.end()}
  })
  await new Promise((ok,fail)=>{http.once('error',fail);http.listen(port,'127.0.0.1',ok)})
  origin='http://127.0.0.1:'+http.address().port
  return {origin,close(){frame.close();http.closeAllConnections();http.close();temporary.close();rmSync(sessionDir,{recursive:true});workspace.close()}}
}
