import test from 'node:test'
import assert from 'node:assert/strict'
import { McpClient, McpUncertainError, parseMessage } from '../mcp.ts'

for (const [name, response] of [
  ['malformed JSON', '{broken'],
  ['mismatched response ID', '{"jsonrpc":"2.0","id":999,"result":{}}'],
  ['missing result', '{"jsonrpc":"2.0","id":2}'],
  ['null result', '{"jsonrpc":"2.0","id":2,"result":null}'],
] as const) {
  test(`${name} after a tool call remains an uncertain execution`, async () => {
    let calls = 0
    const fetcher: typeof fetch = async () => new Response(++calls === 1
      ? '{"jsonrpc":"2.0","id":1,"result":{}}' : response)
    const client = new McpClient('https://fo.example', { fetch: fetcher })
    await assert.rejects(client.callTool('test-token', 'ask_fo', { message: 'test' }), McpUncertainError)
    assert.equal(calls, 2)
  })
}

test('SSE parsing selects the matching response ID', () => {
  const parsed = parseMessage('data: {"id":1,"result":{}}\n\ndata: {"id":2,"result":{"ok":true}}\n', 2)
  assert.deepEqual(parsed?.result, { ok: true })
})
