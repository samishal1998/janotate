import {DatabaseSync} from 'node:sqlite'
import {randomUUID} from 'node:crypto'

export type Choice = {id:string,label:string,tradeoffs:string,recommended?:boolean}
export type Decision = {kind:'decision',title:string,options:Choice[],status?:'asked'|'defaulted',source?:{by:string,basis?:string}, default?:string, allow_other?:boolean}
export function openStore(path:string) {
  const db = new DatabaseSync(path)
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS review(id TEXT PRIMARY KEY,title TEXT NOT NULL,mode TEXT NOT NULL,state TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT,submitted_at TEXT);
    CREATE TABLE IF NOT EXISTS item(id TEXT PRIMARY KEY,review_id TEXT NOT NULL REFERENCES review(id),kind TEXT NOT NULL,title TEXT NOT NULL,body_json TEXT NOT NULL,status TEXT NOT NULL,source_by TEXT NOT NULL,source_basis TEXT,value_json TEXT,revision INTEGER NOT NULL DEFAULT 1,superseded_by TEXT REFERENCES item(id));`)
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
      ...JSON.parse(String(i.body_json)),id:String(i.id),status:i.status,value:i.value_json===null?undefined:JSON.parse(String(i.value_json))
    }))
    return {...row,id, state:row.state, submitted_at:row.submitted_at, items}
  }
  function result(id:string){
    const review=get(id)
    return {state:review.state,result:review.state==='done'?{
      review_id:id,submitted_at:review.submitted_at,answers:review.items.filter(i=>i.value!==undefined).map(i=>({item_id:i.id,status:i.status,value:i.value})),
      comments:[],skipped:review.items.filter(i=>i.value===undefined).map(i=>i.id)
    }:null}
  }
  return {get,result,close:()=>db.close(),
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
      for(const [key,answer] of Object.entries(answers)){
        const item=review.items.find(i=>i.id===key)
        if(!item) throw Error('not_found: item_id')
        const recommended=item.options.find((o:Choice)=>o.recommended)
        const custom='other' in answer
        if(custom ? item.allow_other===false || !answer.other.trim() : !item.options.some((o:Choice)=>o.id===answer.option))throw Error('invalid_items: answer')
        const value=custom?answer.other:answer.option
        const status=recommended && (custom || recommended.id!==value)?'corrected':'confirmed'
        db.prepare("UPDATE item SET value_json=?,status=?,source_by='user',source_basis='stated' WHERE id=?").run(JSON.stringify(value),status,key)
      }
      db.prepare("UPDATE review SET state='done',submitted_at=? WHERE id=?").run(new Date().toISOString(),id)
      return result(id)
    })}
  }
}
