import {HtmlFrame} from './frame'
import React,{useState} from 'react'
export function Item({item:i,review,post}){
  const [draft,setDraft]=useState(null),[body,setBody]=useState(''),[anchor,setAnchor]=useState({type:'item'}),[pending,setPending]=useState(false)
  const threads=review.comments.filter(c=>c.item_id===i.id)
  const saved=i.value===undefined?null:i.kind==='decision'?(i.options.some(o=>o.id===i.value)?{option:i.value}:{other:i.value}):{values:i.value}
  const answer=draft??saved
  async function send(action,value){
    setPending(true)
    try{if(await post(i.id,action,value)){if(action==='answer')setDraft(null);else setBody('')}}finally{setPending(false)}
  }
  function selection(event){
    const sel=window.getSelection()
    if(!sel?.rangeCount||sel.isCollapsed)return
    const range=sel.getRangeAt(0),container=event.currentTarget
    if(!container.contains(range.commonAncestorContainer))return
    const before=range.cloneRange(),after=range.cloneRange()
    before.selectNodeContents(container);before.setEnd(range.startContainer,range.startOffset)
    after.selectNodeContents(container);after.setStart(range.endContainer,range.endOffset)
    setAnchor({type:'text',exact:range.toString(),prefix:before.toString().slice(-48),suffix:after.toString().slice(0,48)})
  }
  const open=review.state==='open'
  function rowValue(key,value){setDraft({values:{...answer?.values,[key]:value}})}
  return <section><fieldset disabled={!open||pending}><legend>{i.title}</legend>
    <p>{i.status} · {i.source?.by??'agent'} · {i.source?.basis??'unverified'} · <a href={'/docs/interfaces/'+i.kind+'/'}>{i.kind}</a></p>
    <div onMouseUp={selection}>
    {i.kind==='decision' && <>{i.options.map(o=><div key={o.id}><label><input type="radio" name={i.id} checked={(answer?.option??(!answer&&i.status==='defaulted'?i.default:undefined))===o.id} onChange={()=>{setDraft({option:o.id});send('answer',{option:o.id})}}/> {o.label}{o.recommended?' (recommended)':''}<small>{o.tradeoffs}</small></label>
    <button onClick={()=>setAnchor({type:'node',path:'option:'+o.id})}>Comment on {o.label}</button></div>)}
    {i.allow_other!==false && <label>Other <input value={answer?.other??''} onChange={e=>setDraft({other:e.target.value})}/></label>}</>}
    {i.kind==='html' && (open?<HtmlFrame review={review.id} item={i.id}/>:<pre>{JSON.stringify(i.value,null,2)}</pre>)}
    {i.kind==='claim' && i.claims.map(c=><label key={c.id}>{c.label} {c.evidence}<select value={answer?.values?.[c.id]??''} onChange={e=>rowValue(c.id,e.target.value)}><option value="">Choose state</option>{['verified','wrong','research'].map(s=><option key={s}>{s}</option>)}</select></label>)}
    {i.kind==='defaults' && i.defaults.map(d=><label key={d.id}>{d.label}<input placeholder={d.value} value={answer?.values?.[d.id]??d.value} onChange={e=>setDraft({values:{...Object.fromEntries(i.defaults.map(e=>[e.id,e.value])),...answer?.values,[d.id]:e.target.value}})}/></label>)}
    </div>
    {i.evidence?.map((e,n)=><p key={n}>{e.url?<a href={e.url}>{e.label}</a>:e.label}</p>)}
    {open && i.kind!=='html' && <><button onClick={()=>send('answer',answer??(i.kind==='defaults'?{values:Object.fromEntries(i.defaults.map(e=>[e.id,e.value]))}:i.default?{option:i.default}:null))}>Save answer</button> <button onClick={()=>send('answer',null)}>Skip item</button></>}
    <ul>{threads.map(c=><li key={c.id}>{c.author} · {c.anchor.exact??c.anchor.path??'Item'} — {c.body}</li>)}</ul>
    {open && <><label>Comment on {anchor.exact??anchor.path??'item'}<textarea value={body} onChange={e=>setBody(e.target.value)}/></label><button disabled={!body.trim()} onClick={()=>send('comments',{body,anchor})}>Add comment</button></>}
  </fieldset></section>
}
