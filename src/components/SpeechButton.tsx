import { useEffect, useRef, useState } from 'react'
interface SpeechResult { results: { [index: number]: { [index: number]: { transcript: string }; isFinal: boolean }; length: number }; resultIndex: number }
interface Recognition { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: SpeechResult) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start(): void; stop(): void; abort(): void }
export function SpeechButton({ onText, disabled = false }: { onText: (text: string) => void; disabled?: boolean }) {
  const [listening, setListening] = useState(false), [message, setMessage] = useState('')
  const instance = useRef<Recognition | null>(null)
  useEffect(() => () => { if (instance.current) { instance.current.onend = null; instance.current.onresult = null; instance.current.onerror = null; instance.current.abort() } }, [])
  return <div className="speech-control"><button type="button" className="iconbtn" disabled={disabled} aria-label={listening ? 'Stop dictation' : 'Dictate your request'} aria-pressed={listening} onClick={() => {
    if (listening) { instance.current?.stop(); return }
    const win = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
    const Constructor = win.SpeechRecognition ?? win.webkitSpeechRecognition
    if (!Constructor) { setMessage('Voice dictation is unavailable in this browser. You can type your request.'); return }
    const speech = new Constructor(); instance.current = speech
    speech.lang = navigator.language; speech.continuous = false; speech.interimResults = false
    speech.onresult = (e) => { let text = ''; for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) text += e.results[i][0].transcript + ' '; if (text.trim()) onText(text.trim()) }
    speech.onerror = () => { setListening(false); setMessage('Dictation ended. Check microphone permission, or type instead.') }
    speech.onend = () => setListening(false)
    try { speech.start(); setListening(true); setMessage('Listening. Your browser’s speech service may process audio. Review the transcript before sending.') } catch { setMessage('Microphone could not start. Try typing instead.') }
  }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></svg></button>{message && <p className="small dim" role="status">{message}</p>}</div>
}
