import {useId,useRef,type ReactNode,type RefObject} from 'react'
import {SpeechButton} from './SpeechButton'
export function VoiceField({label,ariaLabel,value,onChange,placeholder,maxLength=2000,disabled=false,required=false,inputRef,actions}: {
 label?:string;ariaLabel?:string;value:string;onChange:(value:string)=>void;placeholder?:string;maxLength?:number;disabled?:boolean;required?:boolean;inputRef?:RefObject<HTMLTextAreaElement|null>;actions?:ReactNode
}) {
 const id=useId(), latest=useRef({value,onChange})
 latest.current={value,onChange}
 return <div className="voice-field">{label&&<label htmlFor={id}>{label}</label>}<div className="voice-composer"><textarea id={id} ref={inputRef} aria-label={ariaLabel} value={value} onChange={e=>onChange(e.target.value)} maxLength={maxLength} disabled={disabled} required={required} placeholder={placeholder??'Tell me what you have in mind…'}/><div className="voice-composer-controls"><SpeechButton disabled={disabled} onText={text=>latest.current.onChange([latest.current.value,text].filter(Boolean).join(' ').slice(0,maxLength))}/>{actions}</div></div></div>
}
