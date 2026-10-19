import {FoProposal} from './FoProposal'
import { printRoute } from '../print/intent'
import { isPrintRequest, parsePrintRequest } from '../print/plan'
import { go, useUI } from '../state/ui'
import { localToday } from '../magic/dates'
import { uid } from '../state/id'
import { useStore } from '../state/store'
import { FoVoice } from './FoVoice'
import { SpeechButton } from './SpeechButton'
import { beginSignIn, apiUrl } from '../config'
import { useEffect, useRef, useState } from 'react'
import type { Trip } from '../types'
import * as fo from '../state/foChat'
import { Doodle } from './Doodle'
import { Btn } from './ui'

const conversationTitle=(chat:fo.FoChat)=>{const first=chat.turns.find(t=>t.role==='me');return (first?.displayText??first?.text.replace(/^(?:Trip context:|Context: Today,)[^\n]*\n\n/,'').replace(/\n\n\(Tatada ref T-[^)]*\)$/,'')??'New conversation').slice(0,70)}
const newKey = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('')
const tripContext = (t: Trip) => {
  const air=t.bookings.filter(b=>b.kind==='flight').slice(0,2).map(b=>`${b.simulated?'sample ':''}${b.title.slice(0,35)} ${b.flight?.number??''}`).join('; ') || 'not saved'
  const stay=t.bookings.find(b=>b.kind==='stay')
  const base=stay?`${stay.simulated?'sample ':''}${stay.title.slice(0,55)} ${stay.checkIn??''} to ${stay.checkOut??''}`:'not saved'
  return `Trip context: ${t.destination}, ${t.country}; ${t.start} to ${t.end}; ${t.travelers} travelers. Air: ${air}. Stay: ${base}. Needs: ${t.constraints.join('; ').slice(0,90)||'not supplied'}. Membership labels (unverified): ${t.discounts.join('; ').slice(0,60)||'none'}.`.slice(0,500)
}

/**
 * A conversation with the real Fo, through Tatada's server. Opening it only
 * checks the connection (read-only). An explicit send tap delivers ordinary messages; requests involving
 * real-world actions need separate confirmation.
 */
export function FoChatPanel({ trip, initialText }: { trip?: Trip; initialText?: string; onSimulated: () => void }) {
  const { state, dispatch } = useStore(), { closeMagic } = useUI()
  const [status, setStatus] = useState<fo.FoState | 'connecting'>('connecting')
  const [history,setHistory]=useState<fo.FoChat[]>([]),[showHistory,setShowHistory]=useState(false)
  const contextEpoch=useRef(0),drafts=useRef(new Map<string,string>())
  const [chat, setChat] = useState<fo.FoChat | null>(null)
  const [text, setText] = useState(initialText ?? '')
  const [withTrip, setWithTrip] = useState(true)
  const [keepMoment,setKeepMoment] = useState(false)
  const savedMoments = useRef(new Set<string>())
  const [confirmed, setConfirmed] = useState<fo.RiskCategory[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [paused,setPaused]=useState(false)
  const running=useRef(false)
  const key = useRef(newKey())
  const endRef = useRef<HTMLDivElement>(null)

  // Connection check (tools/list) and the latest conversation for this context.
  useEffect(() => {
    let live = true
    contextEpoch.current++;setHistory([]);setShowHistory(false);drafts.current.clear()
    setStatus('connecting')
    setChat(null)
    fo.foStatus()
      .then((s) => live && setStatus(s))
      .catch((e) => live && setStatus({ state: 'error', provider: 'live', error: (e as Error).message }))
    fo.listChats(trip?.id)
      .then((list) => {if(live){setHistory(previous=>[...new Map([...previous,...list].map(c=>[c.id,c])).values()].sort((a,b)=>b.updatedAt-a.updatedAt));setChat(current=>current??list[0]??null)}})
      .catch(() => {if(live)setError('History could not load. Try again.')})
    return () => {
      live = false
    }
  }, [trip?.id])

  useEffect(()=>{if(chat&&chat.tripId===trip?.id)setHistory(previous=>[chat,...previous.filter(c=>c.id!==chat.id)].sort((a,b)=>b.updatedAt-a.updatedAt))},[chat,trip?.id])

  // Follow progress while Fo is working.
  const working = !!chat && fo.BUSY.includes(chat.status)
  useEffect(() => {
    if (!chat || !working || paused) return
    let live = true
    const t = window.setInterval(() => fo.getChat(chat.id).then(c=>{if(live)setChat(c)}).catch(() => {if(live)setError('Connection lost. Your request is saved; checking will not send it again.')}), 2000)
    return () => {live = false; clearInterval(t)}
  }, [chat?.id, working, paused])

  useEffect(() => {
    // Keep scrolling inside the conversation; opening trip mode must stay at the flight.
    const thread = endRef.current?.closest('.magic-thread')
    thread?.scrollTo({top:thread.scrollHeight,behavior:'smooth'})
  }, [chat?.turns.length, chat?.progress, chat?.pending])

  const run = async (fn: () => Promise<void>) => {
    if(running.current)return
    running.current=true
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      running.current=false
      setBusy(false)
    }
  }

  const createConversation=()=>run(async()=>{
    const epoch=contextEpoch.current
    const next=await fo.createChat(trip?.id)
    if(epoch!==contextEpoch.current)return
    if(chat)drafts.current.set(chat.id,text)
    setChat(next);setText('');setConfirmed([]);setKeepMoment(false);setShowHistory(false);key.current=newKey()
  })
  const openConversation=(id:string)=>run(async()=>{
    const epoch=contextEpoch.current,next=await fo.getChat(id)
    if(epoch!==contextEpoch.current||next.tripId!==trip?.id)return
    if(chat)drafts.current.set(chat.id,text)
    setChat(next);setText(drafts.current.get(id)??'');setConfirmed([]);setShowHistory(false);key.current=newKey()
  })
  const toggleHistory=()=>{
    setShowHistory(v=>!v)
    if(!showHistory)void run(async()=>{const epoch=contextEpoch.current,list=await fo.listChats(trip?.id);if(epoch===contextEpoch.current)setHistory(list)})
  }

  function saveMoment(note: string, messageKey: string) {
    if (!trip || !keepMoment || savedMoments.current.has(messageKey)) return
    const memory = {id:uid(),day:localToday(),kind:'note' as const,text:note,place:trip.destination}
    const next = {...state,trips:state.trips.map(t=>t.id===trip.id?{...t,memories:[...t.memories,memory]}:t)}
    if (new TextEncoder().encode(JSON.stringify(next)).length > 900000) {setError('Your message went to Fo, but journal storage is full. Export your data before saving more moments.');return}
    dispatch({type:'addMemory',tripId:trip.id,memory});savedMoments.current.add(messageKey);setKeepMoment(false)
  }

  const preview = () =>
    run(async () => {
      const c = chat ?? (await fo.createChat(trip?.id))
      setChat(c);setPaused(false)
      const prepared = await fo.prepare(c.id, text.trim(), trip && withTrip ? tripContext(trip) : `Context: Today, ${new Date().toLocaleDateString('en-CA')}. Device timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Location has not been shared; ask before making local recommendations.`)
      setConfirmed([])
      key.current = newKey()
      if (prepared.pending && prepared.pending.risk.every((r) => r === 'fo_authorization')) {
        setChat(prepared)
        setChat(await fo.send(c.id, prepared.pending.hash, key.current, ['fo_authorization']))
        saveMoment(prepared.pending.text, key.current)
        setText('')
      } else setChat(prepared)
    })

  const sendIt = () =>
    run(async () => {
      if (!chat?.pending) return
      setChat(await fo.send(chat.id, chat.pending.hash, key.current, [...new Set<fo.RiskCategory>(['fo_authorization', ...confirmed])]))
      saveMoment(chat.pending.text, key.current)
      setText('')
    })

  const connected = status !== 'connecting' && status.state === 'connected'
  const provider = status !== 'connecting' ? status.provider : undefined
  const pending = chat?.pending
  const allConfirmed = !!pending && pending.risk.every((r) => r === 'fo_authorization' || confirmed.includes(r))

  return (
    <>
      <div className={`fo-conn ${status === 'connecting' ? 'connecting' : status.state}`} role="status">
        <span className="fo-dot" />
        {status === 'connecting'
          ? 'Connecting to Fo…'
          : status.state === 'connected'
            ? `Connected to ${provider === 'mock' ? 'mock Fo (demo, nothing real happens)' : 'Wajo Fo'}`
            : status.state === 'disconnected'
              ? 'Disconnected: Fo isn\'t authorized yet'
              : `Can't reach Fo: ${status.error ?? 'unknown error'}`}
        {connected&&<div className="fo-conversation-controls"><button type="button" className="linkbtn small" onClick={createConversation} disabled={busy||working}>new conversation</button><button type="button" className="linkbtn small" aria-expanded={showHistory} onClick={toggleHistory} disabled={busy}>History{history.length?` (${history.length})`:''}</button></div>}

      </div>

      {showHistory&&<nav className="fo-chat-history" aria-label="Conversation history"><p className="small dim">{trip?.destination??'Today'}</p>{history.length?history.map(c=><button type="button" key={c.id} disabled={busy} aria-current={c.id===chat?.id?'true':undefined} aria-label={`Open conversation: ${conversationTitle(c)}`} onClick={()=>void openConversation(c.id)}><span>{conversationTitle(c)}</span><time dateTime={new Date(c.updatedAt).toISOString()}>{new Date(c.updatedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</time></button>):<p className="small dim">No saved conversations here.</p>}</nav>}

      {status !== 'connecting' && status.state !== 'connected' && (
        <div className="fo-auth">
          <p>Tatada needs your permission to use Fo from your Wajo account. You'll approve it on Wajo; the authorization stays on this computer's Tatada server.</p>
          <div className="ac-buttons">
            <a className="btn btn-solid" href={apiUrl('/api/auth/wajo/start')} onClick={beginSignIn}>
              <span>authorize Fo</span>
            </a>

          </div>
        </div>
      )}

      {connected && <FoVoice />}
      <div className="magic-thread" aria-live="polite">
        {(!chat || !chat.turns.length) && connected && !pending && (
          <div className="magic-empty">
            <p className="magic-hello">what can Fo help with?</p>
            <p className="dim small center-text">Messages go to the real Fo{provider === 'mock' ? ' (mock)' : ''} when you tap send. Actions such as bookings and payments get a separate review.</p>
          </div>
        )}
        {chat?.turns.map((t) => (
          <div key={t.id} className={`bubble ${t.role === 'me' ? 'me' : 'tatada'} fo-turn ${t.kind ?? ''}`}>
            {t.role === 'fo' && <span className="fo-who">{provider === 'mock' ? 'mock Fo' : 'Fo'} {t.kind === 'question' ? 'asks' : t.kind === 'error' ? 'reports a problem' : 'says'}</span>}
            <p className="fo-text">{t.role === 'me' ? t.displayText ?? t.text.replace(/^(?:Trip context:|Context: Today,)[^\n]*\n\n/, '').replace(/\n\n\(Tatada ref T-[^)]*\)$/, '') : t.text}</p>
            {trip&&t.role==='fo'&&t.kind!=='error'&&<FoProposal trip={trip} text={t.text} sourceId={`${chat.id}:${t.id}`}/>}
            {t.role === 'me' && t.delivery && t.delivery !== 'delivered' && <span className={`fo-delivery ${t.delivery}`}>{t.delivery === 'sending' ? 'sending…' : t.delivery === 'uncertain' ? 'checking whether Fo got it…' : 'not delivered'}</span>}
          </div>
        ))}
        {working && (
          <p className="fo-progress">
            <Doodle name="bolt" size={16} /> {chat?.progress ?? (chat?.status === 'send_uncertain' ? 'Checking with Fo before doing anything else…' : 'Fo is working…')}
          <button type="button" className="linkbtn small" onClick={()=>setPaused(v=>!v)}>{paused?'resume checking':'stop waiting'}</button>{paused&&<span className="small"> Request retained. This stops local polling; Fo may continue remotely.</span>}
          </p>
        )}
        {chat?.error && !working && (
          <p className="ac-problem" role="alert">
            {chat.error}{' '}
            {chat.status === 'timeout' && (
              <button className="linkbtn" onClick={() => run(async () => setChat(await fo.checkAgain(chat.id)))}>
                check again
              </button>
            )}
          </p>
        )}

        {pending && (
          <div className="action-card fo-preview real" data-testid="fo-preview">
            <div className="ac-title">
              <strong>Review this action</strong>
              <span className="ac-status">exactly this text will be sent</span>
            </div>
            <pre className="fo-message">{pending.message}</pre>
            {pending.risk.some((r) => r !== 'fo_authorization') && (
              <div className="fo-risks">
                <p className="ac-problem">This may lead Fo to act in the real world. Confirm each one:</p>
                {pending.risk.filter((r) => r !== 'fo_authorization').map((r) => (
                  <label key={r} className="fo-risk">
                    <input type="checkbox" checked={confirmed.includes(r)} onChange={(e) => setConfirmed(e.target.checked ? [...confirmed, r] : confirmed.filter((x) => x !== r))} />
                    <span>{fo.RISK_LABELS[r]}. I'm OK with that.</span>
                  </label>
                ))}
              </div>
            )}
            <div className="ac-buttons">
              <Btn kind="solid" icon="arrow" disabled={busy || !allConfirmed} onClick={sendIt}>
                Send to Fo
              </Btn>
              <Btn kind="ghost" disabled={busy} onClick={() => run(async () => setChat(await fo.discard(chat!.id)))}>
                Edit
              </Btn>
            </div>
          </div>
        )}
        {error && (
          <p className="ac-problem" role="alert">
            {error}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="magic-input fo-input"
        onSubmit={(e) => {
          e.preventDefault()
          if (isPrintRequest(text)) {
            const target = trip ?? state.trips.find(t => text.toLowerCase().includes(t.destination.toLowerCase()))
            if (!target) { setError('Which trip should I print? Open the trip, then tap Print or ask me again.'); return }
            const request = parsePrintRequest(text)
            closeMagic(); go(printRoute(target.id, request.document ?? 'card', text.trim()))
            return
          }
          if (text.trim() && !working && connected) void preview()
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={!connected ? 'connect to start' : chat?.status === 'needs_input' ? 'your answer…' : trip ? `about ${trip.destination}…` : 'what’s on your mind?'}
          aria-label="Message to Fo"
          disabled={!connected || working}
        />
        <SpeechButton disabled={busy||working||!connected} onText={spoken=>setText(previous=>[previous,spoken].filter(Boolean).join(' '))}/>
        <button type="submit" className="send" aria-label="Send message" disabled={!text.trim() || !connected || working || busy}>
          <Doodle name="arrow" size={24} />
        </button>
      </form>
      {trip && <label className="fo-ctx small"><input type="checkbox" checked={keepMoment} onChange={e=>setKeepMoment(e.target.checked)}/> keep my message in this trip’s journal</label>}
      {trip && (
        <label className="fo-ctx small">
          <input type="checkbox" checked={withTrip} onChange={(e) => setWithTrip(e.target.checked)} /> include this trip’s dates and party size
        </label>
      )}
    </>
  )
}
