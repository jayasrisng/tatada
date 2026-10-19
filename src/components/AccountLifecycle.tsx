import {ConfirmationDialog} from './ConfirmationDialog'
import {OriginalLibrary} from './OriginalLibrary'
import { useState } from 'react'
import { useStore } from '../state/store'
import { api } from '../state/server'
import { saveSession } from '../config'
import { clearOriginals } from '../travel/originals'
import { deleteVault } from '../privacy/vault'
import { OFFLINE_SELECTED } from '../offline/pack'
import { Btn } from './ui'
export function AccountLifecycle({exportOnly=false,deleteOnly=false}:{exportOnly?:boolean;deleteOnly?:boolean}) {
  const [open,setOpen]=useState(false)
  const { workspace } = useStore(), [confirm,setConfirm]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[includeVault,setIncludeVault]=useState(true),[serverDeleted,setServerDeleted]=useState(false)
  const connected=['owner','wajo','connected','demo'].includes(workspace.kind)
  const deletion=<>
    <p className="small">Export your data and originals from Your data before continuing. Existing downloads, copied calendar events and provider histories remain outside Tatada. On this local installation, operator API keys remain in the private server configuration.</p><p>This action is permanent. Please confirm you want to delete your Tatada account and its trips, photos, conversations, share links and stored connections.</p>

    <label className="small"><input type="checkbox" checked={includeVault} onChange={e=>setIncludeVault(e.target.checked)}/> Also delete this workspace’s encrypted passport / visa vault on this device</label>
    <label>Type DELETE to remove {connected?'active account data and this device’s copies':'this browser workspace and its confirmations'}<input className="chalk-input" aria-label="Confirm account deletion" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
    <Btn kind="ghost" disabled={busy||confirm!=='DELETE'} onClick={async()=>{setBusy(true);let resume:(()=>void)|undefined;let removedServer=serverDeleted;try{
      resume=await workspace.suspendSync?.()
      if(connected&&!removedServer){await api('/api/account/delete',{method:'POST',json:{confirm}});removedServer=true;setServerDeleted(true)}
      await clearOriginals(workspace.storageKey)
      if(includeVault)await deleteVault(workspace.storageKey)
      const selected=localStorage.getItem(OFFLINE_SELECTED)
      if(selected?.startsWith(workspace.storageKey+':offline:'))localStorage.removeItem(OFFLINE_SELECTED)
      const keys=Object.keys(localStorage).filter(k=>k===workspace.storageKey||k===workspace.storageKey+':recovery'||k===workspace.storageKey+':sync'||k.startsWith(workspace.storageKey+':offline:'))
      keys.forEach(k=>localStorage.removeItem(k));localStorage.setItem(workspace.storageKey+':deleted','1');sessionStorage.removeItem(`${workspace.storageKey}:trip-mode`);if(connected)saveSession()
      location.replace(`${location.pathname}#/welcome`);location.reload()
    }catch(e){if(!removedServer)resume?.();setMessage(`Deletion needs attention: ${(e as Error).message}. Successfully removed records stay removed; retry remaining device cleanup.`);setBusy(false)}}}>confirm and delete account</Btn>
    <p className="small dim">Tatada retains active records until deletion. Local operator backups and hosting backups follow the retention policy in docs; deleting active data cannot erase already exported files or provider records.</p>{message&&<p role="status">{message}</p>}
  </>
  if(deleteOnly)return <section className="profile-delete"><button className="linkbtn danger" onClick={()=>setOpen(true)}>delete account</button>{open&&<ConfirmationDialog title="Delete account?" onClose={()=>{if(!busy)setOpen(false)}}>{deletion}</ConfirmationDialog>}</section>
  return <details className="account-lifecycle"><summary>Export account records &amp; original confirmations</summary>    <p className="small dim">Workspace exports above include your saved trips and notes. Original confirmations and the passphrase vault are separate device stores; download their backups before deleting. Provider histories, other devices and previously downloaded shares need separate removal.</p>
    {connected&&<Btn kind="ghost" disabled={busy} onClick={async()=>{setBusy(true);try{const data=await api('/api/account/export');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='tatada-account-data.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage('Downloaded workspace, conversation history and action records. Credentials are excluded.')}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}}>export server account records</Btn>}
    <OriginalLibrary/>
{exportOnly&&message&&<p role="status">{message}</p>}{!exportOnly&&deletion}</details>
}
