import {useEffect,useRef,useState} from 'react'
import type {PrintSticker} from '../print/pdf'
const EMOJI=['⭐','🌞','💛','✈️','🌸','🎒','☕','🎉']
function imageFor(label:string){const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Stickers unavailable');ctx.font='96px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,64,70);return canvas.toDataURL('image/png')}
export function PrintPlayground({source,stickers,onChange}:{source:string;stickers:PrintSticker[];onChange:(stickers:PrintSticker[])=>void}){
 const canvas=useRef<HTMLCanvasElement>(null),board=useRef<HTMLDivElement>(null),[page,setPage]=useState(0),[pages,setPages]=useState(1),[size,setSize]=useState({width:612,height:792}),[selected,setSelected]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(true),[zoom,setZoom]=useState(1),[drag,setDrag]=useState<{id:string;x:number;y:number}|null>(null)
 const move=useRef<{id:string;pointer:number;x:number;y:number}|null>(null)
 useEffect(()=>{
  let active=true,task:{destroy:()=>Promise<void>}|undefined,render:{cancel:()=>void}|undefined
  setBusy(true);setError('')
  async function draw(){try{
   const pdfjs=await import('pdfjs-dist');if(!active)return;pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).href
   const loading=pdfjs.getDocument({url:source});task=loading;const pdf=await loading.promise
   if(!active)return;setPages(pdf.numPages);const n=Math.min(page,pdf.numPages-1);if(n!==page)setPage(n)
   const sheet=await pdf.getPage(n+1),viewport=sheet.getViewport({scale:1}),ctx=canvas.current?.getContext('2d');if(!ctx||!active)return
   setSize({width:viewport.width,height:viewport.height});const scaled=sheet.getViewport({scale:1.5});ctx.canvas.width=scaled.width;ctx.canvas.height=scaled.height
   const drawing=sheet.render({canvasContext:ctx,canvas:ctx.canvas,viewport:scaled});render=drawing;await drawing.promise;if(active)setBusy(false)
  }catch{if(active){setBusy(false);setError('Preview unavailable. Use the PDF below.')}}}
  void draw();return()=>{active=false;render?.cancel();void task?.destroy()}
 },[source,page])
 useEffect(()=>setSelected(''),[page])
 const coordinates=(clientX:number,clientY:number)=>{const rect=board.current!.getBoundingClientRect();return{x:Math.max(16/size.width,Math.min(1-16/size.width,(clientX-rect.left)/rect.width)),y:Math.max(16/size.height,Math.min(1-16/size.height,(clientY-rect.top)/rect.height))}}
 const add=(label:string,x=.5,y=.5)=>{if(stickers.length>=24)return;const id=crypto.randomUUID();onChange([...stickers,{id,image:imageFor(label),label,x,y,page}]);setSelected(id)}
 const update=(id:string,x:number,y:number)=>onChange(stickers.map(s=>s.id===id?{...s,x:Math.max(16/size.width,Math.min(1-16/size.width,x)),y:Math.max(16/size.height,Math.min(1-16/size.height,y))}:s))
 return <section className="print-playground" aria-label="Decorate your print">
  <aside className="sticker-tray" aria-label="Sticker tray">{EMOJI.map(label=><button type="button" key={label} draggable disabled={busy||!!error||stickers.length>=24} aria-label={`Add ${label} sticker`} onClick={()=>add(label)} onDragStart={e=>{e.dataTransfer.setData('text/tatada-sticker',label);e.dataTransfer.effectAllowed='copy'}}>{label}</button>)}{selected&&<button type="button" aria-label="Remove selected sticker" onClick={()=>{onChange(stickers.filter(s=>s.id!==selected));setSelected('')}}>×</button>}</aside>
  <div className="sticker-workspace"><div className="sticker-page-controls"><button type="button" className="print-page-tool" disabled={page===0} aria-label="Previous print page" onClick={()=>setPage(n=>n-1)}>‹</button><span>{page+1} / {pages}</span><button type="button" className="print-page-tool" aria-label="Zoom print out" disabled={zoom===1} onClick={()=>setZoom(n=>n-1)}>−</button><button type="button" className="print-page-tool" aria-label="Zoom print in" disabled={zoom===3} onClick={()=>setZoom(n=>n+1)}>+</button><button type="button" className="print-page-tool" disabled={page>=pages-1} aria-label="Next print page" onClick={()=>setPage(n=>n+1)}>›</button></div>
   {error&&<p role="alert">{error}</p>}{busy&&<p role="status">Loading page…</p>}
   <div className="sticker-scroll"><div className="sticker-board" ref={board} style={{width:`${zoom*100}%`,aspectRatio:`${size.width}/${size.height}`}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const label=e.dataTransfer.getData('text/tatada-sticker');if(!busy&&EMOJI.includes(label)){const p=coordinates(e.clientX,e.clientY);add(label,p.x,p.y)}}}>
    <canvas ref={canvas} aria-label="Print page"/>
    {!busy&&!error&&stickers.filter(s=>s.page===page).map(s=><button type="button" className={`placed-sticker${selected===s.id?' selected':''}`} key={s.id} aria-label={`Move ${s.label} sticker`} style={{left:`${(drag?.id===s.id?drag.x:s.x)*100}%`,top:`${(drag?.id===s.id?drag.y:s.y)*100}%`,width:`${32/size.width*100}%`}} onClick={()=>setSelected(s.id)} onPointerDown={e=>{move.current={id:s.id,pointer:e.pointerId,x:s.x,y:s.y};setSelected(s.id);e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(move.current?.id===s.id&&move.current.pointer===e.pointerId){const p=coordinates(e.clientX,e.clientY);move.current={...move.current,...p};setDrag({id:s.id,...p})}}} onPointerUp={()=>{if(move.current)update(s.id,move.current.x,move.current.y);move.current=null;setDrag(null)}} onPointerCancel={()=>{move.current=null;setDrag(null)}} onKeyDown={e=>{const delta={ArrowLeft:[-.01,0],ArrowRight:[.01,0],ArrowUp:[0,-.01],ArrowDown:[0,.01]}[e.key];if(delta){e.preventDefault();update(s.id,s.x+delta[0],s.y+delta[1])}else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();onChange(stickers.filter(v=>v.id!==s.id))}}}><img draggable={false} src={s.image} alt=""/></button>)}
   </div></div>
   <p className="small dim">Drag a sticker in. Tap to add; arrow keys to move.</p>
  </div>
 </section>
}
