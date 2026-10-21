import test from 'node:test'
import assert from 'node:assert/strict'
import {ApiKeyCredentials,PreferredFoCredentials} from '../apikey.ts'
test('explicit OAuth wins over the local key and failures never fall back to another account',async()=>{
 let authorized=false,fail=false
 const primary={connected:()=>authorized,accessToken:async()=>{if(fail)throw Error('Reconnect OAuth');return 'oauth-user-token'}}
 const fallback=new ApiKeyCredentials('local-owner-key-1234567890','owner'),credentials=new PreferredFoCredentials(primary,fallback)
 assert.equal(await credentials.accessToken('owner'),'local-owner-key-1234567890')
 authorized=true;assert.equal(await credentials.accessToken('owner'),'oauth-user-token')
 fail=true;await assert.rejects(credentials.accessToken('owner'),/Reconnect OAuth/)
 authorized=false;assert.equal(credentials.connected('owner'),false);await assert.rejects(credentials.accessToken('owner'),/Reconnect OAuth/)
 await assert.rejects(fallback.accessToken('someone-else'),/not connected/)
 const disabled=new ApiKeyCredentials('local-owner-key-1234567890','owner',()=>false)
 assert.equal(disabled.connected('owner'),false);await assert.rejects(disabled.accessToken('owner'),/not connected/)
})
