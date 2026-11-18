import React,{useEffect,useState} from 'react'
import {createRoot} from 'react-dom/client'
import './theme.css'
import {Item} from './item'
function App(){
  const id=location.pathname.split('/')[2],api='/api/review/'+id
  const [review,setReview]=useState(null),[answers,setAnswers]=useState({}),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  async function load(){const r=await fetch(api);if(!r.ok)throw Error('Review unavailable');setReview(await r.json())}
  useEffect(()=>{if(id)load().catch(e=>setError(e.message))},[id])
  async function post(key,action,value){
    setBusy(true);setError('')
    try{
      const r=await fetch(api+'/items/'+key+'/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)})
      const data=await r.json()
      if(!r.ok)throw Error(data.error)
      setReview(data);return true
    }catch(e){setError(e.message);return false}finally{setBusy(false)}
  }
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
  {review.items.map(i=><Item key={i.id+":"+i.revision} item={i} review={review} post={post}/>)}
  {open && <button disabled={busy} onClick={submit}>Submit review</button>}</>}
  {error && <p role="alert">{error}</p>}</main></>
}
createRoot(document.getElementById('root')).render(<App/>)
