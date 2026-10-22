import {useEffect,useRef,type ReactNode} from 'react'
export function ConfirmationDialog({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null)
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();dialog?.querySelector<HTMLButtonElement>('[data-cancel]')?.focus();return()=>dialog?.close()},[])
  return <dialog ref={ref} className="confirmation-dialog" aria-label={title} onCancel={e=>{e.preventDefault();onClose()}}>
    <h2>{title}</h2>{children}<button className="btn" data-cancel autoFocus onClick={onClose}>cancel</button>
  </dialog>
}
