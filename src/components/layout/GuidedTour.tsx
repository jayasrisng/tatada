import {useServer} from '../../state/server'
import {getPrinter} from '../../print/client'
import {readOnboarding,saveOnboarding,clearOnboarding} from '../../state/onboarding'
import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {useStore} from '../../state/store'
import {go,useUI,useRoute} from '../../state/ui'
import {MagicBuddy} from './Doodle'
interface Step{topic:string;path:string;target:string;text:string;click?:boolean;event?:string;metric?:'trip'|'photo'|'outfit';focus?:boolean;panel?:'vault'|'data'}
export function GuidedTour({onClose,lesson}:{onClose:()=>void;lesson?:string}){
 const {state,workspace}=useStore(),{info}=useServer(),{setFocusTrip,focusTripId,closeMagic}=useUI(),route='/'+useRoute().join('/')
 const needsTrip=useRef(state.trips.length===0).current
 const groups:Record<string,number[]>={photo:needsTrip?[0,1,2]:[2],outfit:[3,4],voice:[5],vault:[7,8],sharing:needsTrip?[0,1,9,10,11,12]:[9,10,11,12]}
 const optional=!!lesson&&!!groups[lesson]
 const callbackPending=new URLSearchParams(location.hash.split('?')[1]??'').has('auth_exchange')
 const [index,setIndex]=useState(()=>optional?0:readOnboarding(workspace.storageKey)??0)
 const entered=useRef(!optional&&(readOnboarding(workspace.storageKey)??0)>=4)
 const [box,setBox]=useState<DOMRect>(),[portal,setPortal]=useState<Element|null>(null)
 const baseline=useRef({trip:state.trips.length,photo:state.trips.reduce((n,t)=>n+t.memories.filter(m=>!!m.image).length,0),outfit:(state.wardrobe??[]).length})
 const trip=state.trips.find(t=>t.status!=='past')??state.trips[0],tripPath=trip?`/trip/${trip.id}`:'/trips'
 const allSteps:Step[]=[
  {topic:'Create a trip',path:'/trips',target:'.tour-new-trip',text:'Click here to create your first trip.',click:true},
  {topic:'Save a trip',path:'/new',target:'.screen.wizard',text:'Tell me your plans, or edit the details yourself. Save your trip to continue.',metric:'trip'},
  {topic:'Journal photo',path:trip?`${tripPath}/journal`:'/trips',target:trip?'.moment-attach':'.tour-new-trip',text:trip?'Add your first journal photo, then tap Save moment.':'Create a trip first to try its photo journal.',metric:'photo'},
  {topic:'Closet',path:'/style',target:'.style-seg [role="tab"]:nth-child(3)',text:'Tap Closet to add something you own.',click:true},
  {topic:'Add an outfit',path:'/style',target:'.closet-cam',text:'Upload an outfit photo. Review the pieces, then save them to your closet.',metric:'outfit'},
  {topic:'Try voice',path:'/new',target:'.speech-control button',text:'Tap the microphone and say where you’d like to go. Review the words before sending. You can type if voice is unavailable.',event:'tatada-dictated'},
  {topic:'Preferences',path:'/welcome',target:'[data-tour="preferences"]',text:'Click Preferences. Add your name, food choices and needs, then save.',event:'tatada-profile-saved'},
  {topic:'Create your vault',path:'/welcome',target:'input[autocomplete="off"][type="password"]',panel:'vault',text:'Create a passphrase to open your vault. Keep it safe; it cannot be reset. Already have one? Unlock it.',event:'tatada-vault-ready'},
  {topic:'Upload a document',path:'/welcome',target:'[data-tour="vault-upload"]',panel:'vault',text:'Choose a document, fill only the fields you need, then Save encrypted.',event:'tatada-document-saved'},
  {topic:'Export your data',path:'/welcome',target:'[data-tour="export-data"]',panel:'data',text:'Click Export to download a backup of your trips and preferences. Vault documents have their own encrypted backup.',event:'tatada-exported'},
  {topic:'Import your data',path:'/welcome',target:'[data-tour="import-data"]',panel:'data',text:'Have a backup? Click Import and review it before replacing anything. Skip if you’re starting fresh.',event:'tatada-workspace-imported'},
  {topic:'Friend’s trip',path:'/trips',target:'[data-tour="import-trip"] button',text:'Have a friend’s trip file? Import it here and review your own copy.',click:true},
  {topic:'Export a trip',path:trip?`${tripPath}/plan`:'/trips',target:trip?'[aria-label="Share trip"]':'.tour-new-trip',text:trip?'Tap Share. Review the preview, confirm what you want to share, then export the trip file.':'Create a trip first to share its route.',event:'tatada-trip-exported'},
  {topic:'Trip Mode',path:trip?`${tripPath}/plan`:'/trips',target:trip?'[data-tour="trip-mode"]':'.tour-new-trip',text:trip?'Tap here to enter Trip Mode.':'Create a trip to use Trip Mode.',click:true},
  {topic:'Back to My World',path:trip?`${tripPath}/plan`:'/trips',target:trip?'.trip-shell-bar button':'.tour-new-trip',focus:!!trip,text:trip?'Tap My World to return to your full workspace.':'Your trip will have a My World button to come back here.',click:true},
  {topic:'Connect Wajo',path:'/welcome',target:'[data-tour="wajo"]',text:'Connect Wajo here when you want Fo. You’ll authorize it privately on Wajo.'},
  {topic:'Your printer',path:'/welcome',target:'#printer-email',text:'Add your printer email and Save. You’ll review each PDF before sending.'},
 ]
 const steps:Step[]=optional?groups[lesson!].map(i=>allSteps[i]):[
  {topic:'Connect Wajo',path:'/welcome',target:'[data-tour="wajo"] a',text:'Connect Wajo to use Fo. You’ll return here after authorizing it.'},
  {topic:'Save your printer',path:'/welcome',target:'#printer-email',text:'Add your printer email, then tap Save.',event:'tatada-printer-saved'},
  {topic:'Create your first trip',path:'/trips',target:route==='/new'?'.trip-intake textarea, .screen.wizard form':'.tour-new-trip',text:route==='/new'?'Tell me your plans, or edit the details yourself. Save your trip to continue.':'Tap here to create your first trip.'},
  {topic:'Enter Trip Mode',path:trip?`${tripPath}/plan`:'/trips',target:'[data-tour="trip-mode"]',text:'Tap here to enter Trip Mode. Your itinerary, bookings and journal stay together.'},
  {topic:'Return to My World',path:trip?`${tripPath}/plan`:'/trips',target:'.trip-shell-bar button',text:'Tap My World to return to your full workspace.'},
 ]
 const finished=index>=steps.length,step=steps[Math.min(index,steps.length-1)]
 const advance=()=>setIndex(i=>Math.min(i+1,steps.length))
 useEffect(()=>{if(optional)return;if(finished){clearOnboarding(workspace.storageKey);return}saveOnboarding(workspace.storageKey,index)},[index,optional,finished,workspace.storageKey])
 useEffect(()=>{if(optional||finished)return;if(index===0&&info.foConnected)advance();else if(index===2&&trip)advance();else if(index===3&&trip&&focusTripId===trip.id){entered.current=true;advance()}else if(index===4&&entered.current&&!focusTripId)advance()},[index,optional,finished,info.foConnected,trip?.id,focusTripId])
 useEffect(()=>{if(optional||index!==1||finished)return;let active=true;void getPrinter().then(p=>{if(active&&p?.email&&p.updatedAt>0)advance()}).catch(()=>{});return()=>{active=false}},[index,optional,finished])

 useEffect(()=>{if(finished||callbackPending)return;closeMagic();if(optional)setFocusTrip(step.focus?trip?.id:undefined);else if(index<3)setFocusTrip(undefined);go(step.path);if(!step.panel){document.querySelectorAll('dialog[open]').forEach(d=>d.dispatchEvent(new Event('cancel',{cancelable:true})));window.dispatchEvent(new CustomEvent('tatada-tour-panel',{detail:undefined}))}},[index,callbackPending])
 useEffect(()=>{if(finished||!step.metric)return;const count={trip:state.trips.length,photo:state.trips.reduce((n,t)=>n+t.memories.filter(m=>!!m.image).length,0),outfit:(state.wardrobe??[]).length};if(count[step.metric]>baseline.current[step.metric])setIndex(i=>i+1)},[index,state])
 useEffect(()=>{if(finished||!step.event)return;const done=advance;window.addEventListener(step.event,done);return()=>window.removeEventListener(step.event!,done)},[index])
 useEffect(()=>{
  let target:HTMLElement|null=null,frame=0,tries=0;setBox(undefined);if(finished)return
  const measure=()=>{if(target?.isConnected)setBox(target.getBoundingClientRect())}
  const advance=()=>setIndex(i=>Math.min(i+1,steps.length))
  const locate=()=>{if(step.metric==='outfit')window.dispatchEvent(new Event('tatada-tour-closet'));if(step.panel&&route===step.path)window.dispatchEvent(new CustomEvent('tatada-tour-panel',{detail:step.panel}));target=document.querySelector<HTMLElement>(step.target);if(!target||!target.getClientRects().length){if(tries++<180)frame=requestAnimationFrame(locate);return}target.classList.add('star-tour-target');target.setAttribute('aria-describedby','star-tour-copy');target.scrollIntoView({block:'center'});measure();if(step.click)target.addEventListener('click',advance)}
  frame=requestAnimationFrame(locate);window.addEventListener('resize',measure);window.addEventListener('scroll',measure,true)
  const observer=new MutationObserver(()=>{if(!target?.isConnected){const replacement=document.querySelector<HTMLElement>(step.target);if(replacement&&replacement.getClientRects().length){target=replacement;target.classList.add('star-tour-target');target.setAttribute('aria-describedby','star-tour-copy')}}if(step.event==='tatada-document-saved'||step.event==='tatada-trip-exported'){const save=document.querySelector<HTMLElement>(step.event==='tatada-document-saved'?'[data-tour="vault-save"]':'[data-tour="share-trip-file"]');if(save&&target!==save){target?.classList.remove('star-tour-target');target?.removeAttribute('aria-describedby');target=save;target.classList.add('star-tour-target');target.setAttribute('aria-describedby','star-tour-copy');target.scrollIntoView({block:'center'})}}const dialog=document.querySelector('dialog[open]');setPortal(old=>old===dialog?old:dialog);measure()});observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']})
  return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',measure);window.removeEventListener('scroll',measure,true);target?.classList.remove('star-tour-target');target?.removeAttribute('aria-describedby');target?.removeEventListener('click',advance)}
 },[index,route])
 useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape)},[onClose])
 const next=()=>{if(!optional&&index===2&&!trip){setIndex(steps.length);return}advance()}
 const leave=()=>{clearOnboarding(workspace.storageKey);onClose()}
 const lessons=[['photo','Journal photo'],['outfit','Add an outfit'],['voice','Try voice'],['vault','Your vault'],['sharing','Export / import']]
 return createPortal(<aside className="star-tour" aria-label="Star guide">{!finished&&box&&<div className="star-tour-ring" style={{top:box.top-4,left:box.left-4,width:box.width+8,height:box.height+8}} aria-hidden="true"/>}<div className={`star-tour-card ${!finished&&box&&box.top>innerHeight/2?'at-top':'at-bottom'}`}><MagicBuddy size={42}/><div className="star-tour-message">{finished?<><p id="star-tour-copy">You’re ready to explore.</p><p className="small">Try something else?</p><div className="lesson-links">{lessons.map(([id,label])=><button className="linkbtn" key={id} onClick={()=>{leave();go('/tour?lesson='+id)}}>{label}</button>)}</div><button className="btn btn-solid" onClick={leave}>Done</button></>:<>{optional?<select aria-label="Guide topic" value={index} onChange={e=>setIndex(Number(e.target.value))}>{steps.map((s,i)=><option key={i} value={i}>{s.topic}</option>)}</select>:<p className="small dim">{index+1} of 5 · {step.topic}</p>}<p id="star-tour-copy" aria-live="polite">{step.text}</p><div className="star-tour-actions"><button className="linkbtn" onClick={leave}>Close tour</button>{index>0&&<button className="linkbtn" onClick={()=>setIndex(i=>i-1)}>Back</button>}<button className="btn" onClick={next}>Skip step</button></div></>}</div></div></aside>,portal?.isConnected?portal:document.body)
}
