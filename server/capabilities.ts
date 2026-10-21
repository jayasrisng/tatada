import type { ToolInfo } from './fo.ts'

export interface FoCapabilities {
  /** ask_fo accepts a file/attachment argument. */
  attachments: boolean
  /** A tool exposes which email account Fo would send from. */
  senderVisible: boolean
  askFoInputs: string[]
  reason?: string
}

/** Derived from the server's own tool schemas, not assumed from a key or a login. */
export function foCapabilities(tools: ToolInfo[]): FoCapabilities {
  const ask = tools.find((t) => t.name === 'ask_fo')
  const inputs = ask?.inputs ?? []
  const attachments = inputs.some((n) => /attach|file|document|pdf|upload|blob/i.test(n))
  const senderVisible = tools.some((t) => /account|sender|mailbox|integration/i.test(t.name))
  return {
    attachments, senderVisible, askFoInputs: inputs,
    reason: !ask ? 'Fo did not list ask_fo.' : !attachments ? `ask_fo accepts only ${inputs.join(', ') || 'unknown arguments'}${ask.closedInputs ? ' and rejects anything else' : ''}; there is no binary upload field. Hosted PDFs can be handed off through signed HTTPS links.` : undefined,
  }
}
