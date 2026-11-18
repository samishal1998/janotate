import React,{useEffect,useState} from 'react'
export function HtmlFrame({review,item}){
 const [url,setUrl]=useState(''),[message,setMessage]=useState('Loading form')
 useEffect(()=>{
   const base='/api/review/'+review+'/items/'+item
   const controller=new AbortController(),signal=controller.signal
   async function load(){
     const r=await fetch(base+'/frame',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal})
     if(!r.ok)throw Error('Form unavailable')
     setUrl((await r.json()).url)
   }
   async function status(){const r=await fetch(base+'/frame-status',{signal});setMessage((await r.json()).message)}
   const error=e=>{if(!signal.aborted)setMessage(e.message)}
   load().catch(error)
   const timer=setInterval(()=>status().catch(error),350)
   return ()=>{controller.abort();clearInterval(timer)}
 },[review,item])
 return <>{url&&<iframe title="Review form" sandbox="allow-scripts allow-forms" src={url}/>}<p role="status">{message}</p></>
}
