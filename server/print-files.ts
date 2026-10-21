import {Buffer} from 'node:buffer'
import {createHmac} from 'node:crypto'
import {safeEqual} from './crypto.ts'
import {PrintError,type PrintJob} from './print.ts'
import type {Store} from './store.ts'

/** A narrowly scoped bearer link: one approved PDF, for at most 30 minutes. */
export class PrintFiles {
 private store:Store;private secret:string;private base:string;private now:()=>number
 constructor(store:Store,secret:string,base:string,now=Date.now){this.store=store;this.secret=secret;this.base=base.replace(/\/$/,'');this.now=now}
 get reachable(){const u=new URL(this.base);return u.protocol==='https:'&&!['localhost','127.0.0.1','::1','[::1]'].includes(u.hostname)}
 private signature(job:PrintJob,expires:number){return createHmac('sha256',this.secret).update(`tatada-print-v1:${job.ownerId}:${job.id}:${job.pdfHash}:${expires}`).digest('hex')}
 link(job:PrintJob){if(!this.reachable)throw new PrintError(409,'Wajo needs the hosted HTTPS backend to download a print PDF. Local printing can use the optional direct Gmail connection.');return `${this.base}/api/print/file/${job.id}?expires=${job.foDownloadExpires}&token=${this.signature(job,job.foDownloadExpires!)}`}
 read(id:string,expires:string|null,token:string|null){
  const job=this.store.data.printJobs?.[id] as PrintJob|undefined,t=Number(expires)
  if(!job?.pdf||!job.approval||!['sending','send_uncertain','submitted'].includes(job.status)||!Number.isSafeInteger(t)||t!==job.foDownloadExpires||t<=this.now()||!token||!safeEqual(token,this.signature(job,t)))throw new PrintError(404,'Print file unavailable or link expired.')
  return Buffer.from(job.pdf,'base64')
 }
}
