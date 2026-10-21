import { api } from './server'

/* Client for the server's Fo chat. The browser never talks to MCP directly. */

export type RiskCategory = 'fo_authorization' | 'payment' | 'booking' | 'cancellation' | 'third_party_message'
export const RISK_LABELS: Record<RiskCategory, string> = {
  fo_authorization: 'Fo may carry out this exact request using my connected services; the helper email allowlist does not limit Fo chat',
  payment: 'Fo may spend money or make a purchase',
  booking: 'Fo may book or reserve something',
  cancellation: 'Fo may cancel, refund, or delete something',
  third_party_message: 'Fo may contact someone on your behalf',
}

export interface ChatTurn {
  displayText?: string
  id: string
  role: 'me' | 'fo'
  kind?: 'reply' | 'question' | 'error'
  text: string
  at: number
  risk?: RiskCategory[]
  delivery?: 'sending' | 'delivered' | 'uncertain' | 'failed'
}

export interface FoChat {
  id: string
  tripId?: string
  conversationId?: string
  title?:string
  channel?:string
  syncedAt?:number
  remoteTranscript?:{role:string;text:string;at?:string}[]
  status: 'idle' | 'sending' | 'send_uncertain' | 'working' | 'needs_input' | 'failed' | 'timeout'
  turns: ChatTurn[]
  progress?: string
  error?: string
  pending?: { text: string; message: string; hash: string; risk: RiskCategory[] }
  updatedAt: number
}

export type FoState = { state: 'connected' | 'disconnected' | 'error'; provider: 'live' | 'mock'; tools?: string[]; error?: string }

export const BUSY: FoChat['status'][] = ['sending', 'send_uncertain', 'working']

export const foStatus = () => api<FoState>('/api/fo/status')
export const listChats = async (tripId?: string) => (await api<{ chats: FoChat[] }>(`/api/fo/chats?tripId=${encodeURIComponent(tripId ?? '')}`)).chats
export const createChat = async (tripId?: string) => (await api<{ chat: FoChat }>('/api/fo/chats', { method: 'POST', json: { tripId } })).chat
export const getChat = async (id: string) => (await api<{ chat: FoChat }>(`/api/fo/chats/${id}`)).chat
export const prepare = async (id: string, text: string, context?: string) =>
  (await api<{ chat: FoChat }>(`/api/fo/chats/${id}/prepare`, { method: 'POST', json: { text, context } })).chat
export const discard = async (id: string) => (await api<{ chat: FoChat }>(`/api/fo/chats/${id}/discard`, { method: 'POST', json: {} })).chat
export const send = async (id: string, hash: string, idempotencyKey: string, confirm: RiskCategory[]) =>
  (await api<{ chat: FoChat }>(`/api/fo/chats/${id}/send`, { method: 'POST', json: { hash, idempotencyKey, confirm } })).chat
export const checkAgain = async (id: string) => (await api<{ chat: FoChat }>(`/api/fo/chats/${id}/check`, { method: 'POST', json: {} })).chat

export interface WajoConversation {conversationId:string;title?:string;channel?:string;startedAt?:string}
export const listWajoConversations=()=>api<{conversations:WajoConversation[]}>('/api/fo/conversations').then(r=>r.conversations)
export const importWajoConversation=(conversationId:string,tripId?:string)=>api<{chat:FoChat}>('/api/fo/conversations/import',{method:'POST',json:{conversationId,tripId}}).then(r=>r.chat)
export const syncWajoConversation=(id:string)=>api<{chat:FoChat}>(`/api/fo/chats/${id}/sync`,{method:'POST',json:{}}).then(r=>r.chat)
