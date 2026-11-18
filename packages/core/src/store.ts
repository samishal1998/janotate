import {itemSchema,commentInput} from './schema.ts'
import {DatabaseSync} from 'node:sqlite'
import {randomUUID} from 'node:crypto'

export type Choice = {id:string,label:string,tradeoffs:string,recommended?:boolean}
export type Decision = {kind:'decision',title:string,options:Choice[],status?:'asked'|'defaulted',source?:{by:string,basis?:string}, default?:string, allow_other?:boolean}
export function openStore(path:string) {
  const db = new DatabaseSync(path)
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS review(id TEXT PRIMARY KEY,title TEXT NOT NULL,mode TEXT NOT NULL,state TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT,submitted_at TEXT);
    CREATE TABLE IF NOT EXISTS item(id TEXT PRIMARY KEY,review_id TEXT NOT NULL REFERENCES review(id),kind TEXT NOT NULL,title TEXT NOT NULL,body_json TEXT NOT NULL,status TEXT NOT NULL,source_by TEXT NOT NULL,source_basis TEXT,value_json TEXT,revision INTEGER NOT NULL DEFAULT 1,superseded_by TEXT REFERENCES item(id));`)
  db.exec(`CREATE TABLE IF NOT EXISTS comment(id TEXT PRIMARY KEY,item_id TEXT REFERENCES item(id),parent_id TEXT REFERENCES comment(id),author TEXT,anchor_json TEXT,body TEXT,created_at TEXT,previous_body TEXT)`)
  function comments(id:string){
    return db.prepare('SELECT c.* FROM comment c JOIN item i ON i.id=c.item_id WHERE i.review_id=? ORDER BY c.rowid').all(id).map(({anchor_json,...row})=>({...row,anchor:JSON.parse(String(anchor_json))}))
  }
  function atomic<T>(fn:()=>T) {
    db.exec('BEGIN IMMEDIATE')
    try { const value=fn(); db.exec('COMMIT'); return value }
    catch(error){ db.exec('ROLLBACK'); throw error }
  }
  function get(id:string) {
    const now=new Date().toISOString()
    db.prepare("UPDATE review SET state='expired' WHERE id=? AND state='open' AND expires_at<=?").run(id,now)
    const row=db.prepare('SELECT * FROM review WHERE id=?').get(id)
    if(!row) throw Error('not_found: review_id')
    const items=db.prepare('SELECT * FROM item WHERE review_id=? ORDER BY rowid').all(id).map(i=>({
      ...JSON.parse(String(i.body_json)),id:String(i.id),revision:i.revision,status:i.status,value:i.value_json===null?undefined:JSON.parse(String(i.value_json))
    }))
    return {...row,id, state:row.state, submitted_at:row.submitted_at, comments:comments(id), items}
  }
  function result(id:string){
    const review=get(id)
    return {state:review.state,result:review.state==='done'?{
      review_id:id,submitted_at:review.submitted_at,answers:review.items.filter(i=>i.value!==undefined).map(i=>({item_id:i.id,status:i.status,value:i.value})),
      comments:review.comments,skipped:review.items.filter(i=>i.value===undefined).map(i=>i.id)
    }:null}
  }
  function current(id,key){
    const review=get(id)
    if(review.state!=='open')throw Error('review_closed')
    const item=review.items.find(i=>i.id===key)
    if(!item)throw Error('not_found: item_id')
    return item
  }
  function addComment(id,key,input,author='user',previous=null){
    current(id,key)
    const c=commentInput.parse(input)
    if(c.parent_id&&!db.prepare('SELECT id FROM comment WHERE item_id=? AND id=?').get(key,c.parent_id))throw Error('not_found: parent_id')
    db.prepare('INSERT INTO comment VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),key,c.parent_id??null,author,JSON.stringify(c.anchor),c.body,new Date().toISOString(),previous)
  }
  function save(id,key,answer){
    const item=current(id,key)
    if(answer===null){
      db.prepare("UPDATE item SET status='asked',value_json=NULL WHERE id=?").run(key)
      return
    }
    let value,status='confirmed'
    if(item.kind==='decision'){
      const recommended=item.options.find(o=>o.recommended)
      const custom='other' in answer
      if(custom ? item.allow_other===false || !answer.other.trim() : !item.options.some(o=>o.id===answer.option))throw Error('invalid_items: answer')
      value=custom?answer.other:answer.option
      if(recommended && (custom || recommended.id!==value))status='corrected'
    }else{
      value=answer.values
      const entries=item.kind==='claim'?item.claims:item.defaults
      if(!value||entries.some(e=>!value[e.id])||Object.keys(value).length!==entries.length)throw Error('invalid_items: values')
      if(item.kind==='claim' && Object.values(value).some(v=>!['verified','wrong','research'].includes(v)))throw Error('invalid_items: claim state')
      if(item.kind==='defaults' && entries.some(e=>value[e.id]!==e.value))status='corrected'
    }
    db.prepare("UPDATE item SET value_json=?,status=?,source_by='user',source_basis='stated' WHERE id=?").run(JSON.stringify(value),status,key)
  }
  return {get,result,save,addComment,update(id,key,patch,reply,parent){
    return atomic(()=>{
      const old=current(id,key)
      const body=db.prepare('SELECT body_json FROM item WHERE id=?').get(key).body_json
      const revised=itemSchema.parse({...JSON.parse(body),...patch,kind:old.kind})
      const thread=parent?comments(id).find(c=>c.item_id===key&&c.id===parent):comments(id).filter(c=>c.item_id===key).at(-1)
      if(parent&&!thread)throw Error('not_found: parent_id')
      addComment(id,key,{body:reply,anchor:thread?.anchor??{type:'item'},parent_id:thread?.id},'agent',body)
      db.prepare("UPDATE item SET title=?,body_json=?,revision=revision+1,value_json=NULL,status='asked' WHERE id=?").run(revised.title,JSON.stringify(revised),key)
      return current(id,key)
    })
  },close:()=>db.close(),
    open(title:string,items:Decision[],mode:string,ttl?:number){return atomic(()=>{
      const id=randomUUID(),now=Date.now()
      db.prepare("INSERT INTO review VALUES(?,?,?,'open',?,?,NULL)").run(id,title,mode,new Date(now).toISOString(),ttl?new Date(now+ttl*3600000).toISOString():null)
      const insert=db.prepare('INSERT INTO item(id,review_id,kind,title,body_json,status,source_by,source_basis) VALUES(?,?,?,?,?,?,?,?)')
      return {review_id:id,item_ids:items.map(item=>{
        const key=randomUUID()
        insert.run(key,id,item.kind,item.title,JSON.stringify(item),item.status??'asked',item.source?.by??'agent',item.source?.basis??null)
        return key
      })}
    })},
    submit(id:string,answers:Record<string,{option:string}|{other:string}>){return atomic(()=>{
      const review=get(id)
      if(review.state!=='open') throw Error('review_closed')
      for(const [key,answer] of Object.entries(answers))save(id,key,answer)
      db.prepare("UPDATE review SET state='done',submitted_at=? WHERE id=?").run(new Date().toISOString(),id)
      return result(id)
    })}
  }
}
