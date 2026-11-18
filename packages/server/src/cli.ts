import {spawn} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {mkdirSync,readFileSync,writeFileSync,renameSync,rmSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {parseArgs} from 'node:util'
import {setTimeout as delay} from 'node:timers/promises'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import {start} from './http.ts'
import {mcp} from './mcp.ts'
export async function main(){
  if(process.versions.node.split('.')[0]!=='24')throw Error('Janotate requires Node 24')
  const {values,positionals}=parseArgs({allowPositionals:true,options:{data:{type:'string'},port:{type:'string'},host:{type:'string'},session:{type:'boolean'},'no-open':{type:'boolean'}}})
  if(values.host && values.host!=='127.0.0.1')throw Error('Local mode requires 127.0.0.1')
  const data=resolve(values.data??'.janotate')
  mkdirSync(data,{recursive:true,mode:0o700})
  const lock=resolve(data,'server.json'),cmd=positionals[0]
  const port=Number(values.port??(20000+createHash('sha256').update(data).digest().readUInt16BE()%30000))
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid --port')
  async function find(){
    try{
      const {origin,pid}=JSON.parse(readFileSync(lock,'utf8'))
      const url=new URL(origin)
      if(url.protocol!=='http:'||url.hostname!=='127.0.0.1')return
      const health=await (await fetch(origin+'/health',{signal:AbortSignal.timeout(500),redirect:'error'})).json()
      if(health.service==='Janotate' && health.pid===pid)return origin
    }catch{}
  }
  if(cmd==='serve'){
    const service=await start(data,port,values.session,dirname(fileURLToPath(import.meta.url)))
    const tmp=lock+'.'+randomUUID()
    writeFileSync(tmp,JSON.stringify({pid:process.pid,origin:service.origin}),{mode:0o600})
    renameSync(tmp,lock)
    function shutdown(){service.close();rmSync(lock,{force:true});process.exit(0)}
    process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown)
    return
  }
  if(cmd && cmd!=='mcp')throw Error('Unknown command '+cmd)
  let origin=await find()
  if(!origin){
    const child=spawn(process.execPath,[process.argv[1],'serve',...process.argv.slice(2).filter(arg=>arg!=='mcp')],{detached:true,stdio:'ignore'})
    child.unref()
    for(let i=0;i<80 && !origin;i++){await delay(75);origin=await find()}
    if(!origin)throw Error('Could not start the server on port '+port)
  }
  if(cmd==='mcp'){
    const client=new Client({name:'Janotate',version:'0.0.0'})
    await client.connect(new StreamableHTTPClientTransport(new URL('/mcp',origin)))
    await mcp(async(name,args,progress,signal)=>{
      const r=await client.callTool({name,arguments:args},undefined,{signal,onprogress:p=>progress(p.progress)})
      if(r.isError)throw Error(r.content[0].text)
      return r.structuredContent
    }).connect(new StdioServerTransport())
  }else{
    console.log(origin)
    if(!values['no-open']){
      const child=spawn(process.platform==='darwin'?'open':'xdg-open',[origin],{detached:true,stdio:'ignore'})
      child.on('error',()=>{});child.unref()
    }
  }
}
