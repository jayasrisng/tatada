import {useEffect,useRef,type ReactNode} from 'react'
import {Doodle} from './Doodle'
export function Popup({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
 const ref=useRef<HTMLDialogElement>(null)
 useEffect(()=>{const el=ref.current,opener=document.activeElement as HTMLElement;el?.showModal();return()=>{el?.close();requestAnimationFrame(()=>{if(opener?.isConnected)opener.focus()})}},[])
 return <dialog ref={ref} className="trip-tool-popup" aria-label={title} onCancel={onClose}><header><h2>{title}</h2><button autoFocus className="iconbtn" aria-label="Close popup" onClick={onClose}><Doodle name="x" size={22}/></button></header>{children}</dialog>
}
