import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),{savePrintDraft,printDraft}=require(`${process.env.TATADA_TEST_BUILD}/print/draft.js`)
test('decoration drafts cannot cross accounts with the same trip ID',()=>{savePrintDraft({account:'account-a',id:'lisbon',kind:'card',caption:'Private A caption',stickers:[]});assert.equal(printDraft('account-a','lisbon','card').caption,'Private A caption');assert.equal(printDraft('account-b','lisbon','card'),undefined);assert.equal(printDraft('account-a','other-trip','card'),undefined);assert.equal(printDraft('account-a','lisbon','journal'),undefined)})
