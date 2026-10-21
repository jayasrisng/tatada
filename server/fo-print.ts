import type {PrintDelivery,PrintJob,SenderCheck} from './print.ts'
import type {FoAdapter} from './fo.ts'
import type {FoChatService} from './chat.ts'
import type {Store} from './store.ts'
import type {PrintFiles} from './print-files.ts'

const reason='Wajo does not expose a verified sending identity and independently verifiable Gmail receipt. Connect Gmail in Profile → Printing.'
/** Retained for legacy jobs. Conversational JSON is never delivery evidence. */
export class WajoPrintDelivery implements PrintDelivery {
 readonly mode='fo' as const
 constructor(_options:{store:Store;fo:FoAdapter;chats:FoChatService;files:PrintFiles}){}
 async sender(_owner:string):Promise<SenderCheck>{return {kind:'fo',verified:false,label:'Wajo printing unavailable',ok:false,reason}}
 async send(_owner:string,_job:PrintJob){return {ok:false as const,blocked:true,reason}}
 async reconcile(_owner:string,_job:PrintJob):Promise<'unknown'>{return 'unknown'}
}
