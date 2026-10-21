import type {PrintSticker} from './pdf'
// An optional in-memory decoration draft, consumed only for the matching trip.
let draft:{account:string;id:string;kind:string;stickers:PrintSticker[];caption:string}|undefined
export function savePrintDraft(value:NonNullable<typeof draft>){draft=value}
export function printDraft(account:string,id:string,kind:string){return draft?.account===account&&draft.id===id&&draft.kind===kind?draft:undefined}
