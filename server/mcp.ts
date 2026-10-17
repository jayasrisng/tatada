import type { Fetch } from './oauth.ts'

/*
 * Minimal MCP client over Streamable HTTP (JSON or SSE responses). Fo's server
 * is stateless (no session id), which keeps this small.
 *
 * Error classes matter for safety: an HTTP 4xx means the request was rejected
 * before processing (safe to retry), while network errors, timeouts and 5xx
 * mean we can't know whether a tool ran ("uncertain").
 */

export class McpHttpError extends Error {
  status: number
  constructor(status: number, body: string) {
    super(`MCP HTTP ${status}: ${body.slice(0, 200)}`)
    this.status = status
  }
  get definite() {
    return this.status >= 400 && this.status < 500
  }
}
export class McpRpcError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(`MCP error ${code}: ${message}`)
    this.code = code
  }
}
export class McpUncertainError extends Error {}

export interface ToolResult {
  content?: { type: string; text?: string }[]
  structuredContent?: unknown
  isError?: boolean
}

const PROTOCOL = '2025-06-18'

export class McpClient {
  private url: string
  private fetch: Fetch
  private timeoutMs: number
  private initialized = false
  private id = 0

  constructor(url: string, o: { fetch?: Fetch; timeoutMs?: number } = {}) {
    this.url = url
    this.fetch = o.fetch ?? fetch
    this.timeoutMs = o.timeoutMs ?? 60_000
  }

  async callTool(token: string, name: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (!this.initialized) {
      await this.rpc(token, 'initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'tatada', version: '0.2.0' } })
      this.initialized = true
    }
    return (await this.rpc(token, 'tools/call', { name, arguments: args })) as ToolResult
  }

  private async rpc(token: string, method: string, params: unknown): Promise<unknown> {
    const id = ++this.id
    let res: Response
    try {
      res = await this.fetch(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          authorization: `Bearer ${token}`,
          'mcp-protocol-version': PROTOCOL,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (e) {
      throw new McpUncertainError(`network error during ${method}: ${(e as Error).message}`)
    }
    const text = await res.text().catch(() => {
      throw new McpUncertainError(`response lost during ${method}`)
    })
    if (!res.ok) {
      if (res.status >= 500) throw new McpUncertainError(`MCP HTTP ${res.status} during ${method}`)
      throw new McpHttpError(res.status, text)
    }
    const msg = parseMessage(text, id)
    if (!msg) throw new McpUncertainError(`no JSON-RPC response for ${method}`)
    if (msg.error) throw new McpRpcError(msg.error.code, msg.error.message)
    return msg.result
  }
}

interface RpcMessage {
  id?: number
  result?: unknown
  error?: { code: number; message: string }
}

export function parseMessage(text: string, id: number): RpcMessage | undefined {
  const t = text.trim()
  if (!t) return undefined
  if (t.startsWith('{')) return JSON.parse(t)
  // SSE: take the data: payloads and find the response with our id.
  const msgs = t
    .split(/\r?\n/)
    .filter((l) => l.startsWith('data:'))
    .map((l) => {
      try {
        return JSON.parse(l.slice(5).trim()) as RpcMessage
      } catch {
        return undefined
      }
    })
  return msgs.find((m) => m && m.id === id)
}
