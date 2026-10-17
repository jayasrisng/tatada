import { useState } from 'react'
import type { ChecklistItem, Phase } from '../types'
import { uid, useStore } from '../state/store'
import { useUI } from '../state/ui'
import { Doodle } from './Doodle'
import { ChalkCheck } from './ui'

const KIND_ICON: Record<ChecklistItem['kind'], string> = {
  booking: 'ticket',
  task: 'pencil',
  doc: 'note',
  pack: 'suitcase',
  idea: 'compass',
  memory: 'heart',
}

export function ChecklistRow({ item, showTrip }: { item: ChecklistItem; showTrip?: string }) {
  const { dispatch, state } = useStore()
  const { openMagic } = useUI()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(item.text)
  const action = state.actions.find((a) => a.checklistItemId === item.id && a.status !== 'cancelled')

  const save = () => {
    setEditing(false)
    if (text.trim() && text !== item.text) dispatch({ type: 'editItem', id: item.id, text: text.trim() })
    else setText(item.text)
  }

  return (
    <li className={`crow ${item.done ? 'done' : ''}`}>
      <ChalkCheck checked={item.done} onChange={() => dispatch({ type: 'toggleItem', id: item.id })} label={item.text} />
      <div className="crow-main">
        {editing ? (
          <input
            className="crow-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') (setText(item.text), setEditing(false))
            }}
            autoFocus
            aria-label="Edit item"
          />
        ) : (
          <button className="crow-text" onClick={() => setEditing(true)} aria-label={`Edit: ${item.text}`}>
            <span className="strike">{item.text}</span>
          </button>
        )}
        <div className="crow-meta">
          <Doodle name={KIND_ICON[item.kind]} size={14} stroke={2.4} />
          {showTrip && <span>{showTrip}</span>}
          {item.note && <span className="crow-note">{item.note}</span>}
          {action && !item.done && <span className="crow-fo">Fo · {action.status === 'needs_input' ? 'needs you' : action.status === 'proposed' ? 'awaiting ok' : 'working'}</span>}
        </div>
      </div>
      {editing ? (
        <button className="iconbtn danger" onMouseDown={(e) => e.preventDefault()} onClick={() => dispatch({ type: 'deleteItem', id: item.id })} aria-label="Delete item">
          <Doodle name="trash" size={20} />
        </button>
      ) : (
        item.magicPrompt &&
        !item.done &&
        !action && (
          <button className="fo-pill" onClick={() => openMagic({ tripId: item.tripId, prefill: item.magicPrompt, itemId: item.id, autoSend: true })}>
            <Doodle name="sparkle" size={15} /> Fo
          </button>
        )
      )}
    </li>
  )
}

export function AddRow({ tripId, phase, placeholder = 'add…' }: { tripId?: string; phase: Phase; placeholder?: string }) {
  const { dispatch } = useStore()
  const [text, setText] = useState('')
  return (
    <form
      className="add-row"
      onSubmit={(e) => {
        e.preventDefault()
        if (!text.trim()) return
        dispatch({ type: 'addItem', item: { id: uid(), tripId, phase, text: text.trim(), done: false, kind: 'task' } })
        setText('')
      }}
    >
      <Doodle name="plus" size={18} />
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={`Add to ${phase}`} />
    </form>
  )
}
