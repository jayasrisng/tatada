import { Fragment } from 'react'

/** Small, text-only research formatter. No HTML injection, images or model-supplied links. */
export function ReadingText({ text }: { text: string }) {
  const inline = (line: string) => line.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part.startsWith('*') && part.endsWith('*') ? <em key={i}>{part.slice(1, -1)}</em> : <Fragment key={i}>{part}</Fragment>)
  return <div className="reading-text">{text.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => {
    const lines = paragraph.split('\n')
    if (/^#{1,6}\s/.test(paragraph)) return <h4 key={index}>{inline(paragraph.replace(/^#{1,6}\s+/, ''))}</h4>
    if (lines.every(line => /^[-*]\s/.test(line))) return <ul key={index}>{lines.map((line,i) => <li key={i}>{inline(line.replace(/^[-*]\s+/, ''))}</li>)}</ul>
    return <p key={index}>{lines.map((line,i) => <Fragment key={i}>{i > 0 && <br />}{inline(line)}</Fragment>)}</p>
  })}</div>
}
