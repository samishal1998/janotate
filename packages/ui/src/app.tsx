import React,{useEffect,useState} from 'react'
import {createRoot} from 'react-dom/client'
import './theme.css'
function App(){
  const id=location.pathname.split('/')[2],api='/api/review/'+id
  const [review,setReview]=useState(null),[answers,setAnswers]=useState({}),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  async function load(){const r=await fetch(api);if(!r.ok)throw Error('Review unavailable');setReview(await r.json())}
  useEffect(()=>{if(id)load().catch(e=>setError(e.message))},[id])
  function select(key,value){setAnswers(old=>({...old,[key]:value}))}
  async function submit(){
    setBusy(true);setError('')
    try{const response=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(answers)})
      if(!response.ok)throw Error((await response.json()).error)
      await load()
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  const open=review?.state==='open'
  return <><header><strong>Janotate</strong><a href="/docs/">Documentation</a></header><main>
  {!id?<><h1>Project reviews</h1><p>Open the review link from your agent to answer its questions.</p></>:null}
  {review && <><h1>{review.title}</h1><p role="status">{open?'Open for review':review.state==='done'?'Review submitted':review.state}</p>
  {review.items.map(i=><section key={i.id}><fieldset disabled={!open || busy}><legend>{i.title}</legend>
  <p>{i.status} · {i.source?.by??'agent'} · {i.source?.basis??'unverified'} · <a href="/docs/interfaces/decision/">Decision</a></p>
  {i.options.map(o=><label key={o.id}><input type="radio" name={i.id} checked={(answers[i.id]?.option??(!answers[i.id]?(i.value??(i.status==='defaulted'?i.default:undefined)):undefined))===o.id} onClick={()=>select(i.id,{option:o.id})} readOnly/> {o.label}{o.recommended?' (recommended)':''}<small>{o.tradeoffs}</small></label>)}
  {i.allow_other!==false && <label>Other <input value={answers[i.id]?.other??(!open&&!i.options.some(o=>o.id===i.value)?i.value??'':'')} onChange={e=>select(i.id,e.target.value?{other:e.target.value}:undefined)}/></label>}
  {i.evidence?.map((e,n)=><p key={n}>{e.url?<a href={e.url}>{e.label}</a>:e.label}</p>)}
  {open && <button onClick={()=>select(i.id,undefined)}>Skip item</button>}</fieldset></section>)}
  {open && <button disabled={busy} onClick={submit}>Submit review</button>}</>}
  {error && <p role="alert">{error}</p>}</main></>
}
createRoot(document.getElementById('root')).render(<App/>)
