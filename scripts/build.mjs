import {rolldown} from 'rolldown'
import {cpSync,readdirSync,readFileSync,existsSync,statSync} from 'node:fs'
import {join} from 'node:path'
const bundle=await rolldown({input:'packages/server/src/cli.ts',platform:'node',external:id=>!id.startsWith('.')&&!id.startsWith('/')})
await bundle.write({file:'dist/server.mjs',format:'esm'})
await bundle.close()
for(const pkg of ['ui','docs'])cpSync('packages/'+pkg+'/dist','dist/'+pkg,{recursive:true})
for(const entry of readdirSync('dist/docs',{recursive:true}).filter(f=>f.endsWith('.html'))){
  const file=join('dist/docs',entry),html=readFileSync(file,'utf8')
  for(const [,attr] of html.matchAll(/(?:href|src)="([^"]+)"/g)){
    const url=new URL(attr,'http://local/docs/'+entry.replace(/index\.html$/,''))
    if(url.origin!=='http://local')continue
    const target=join('dist',decodeURIComponent(url.pathname))
    if(!existsSync(target)||statSync(target).isDirectory()&&!existsSync(join(target,'index.html')))throw Error(file+' links to '+attr)
  }
}
