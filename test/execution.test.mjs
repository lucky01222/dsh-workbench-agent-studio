import test from 'node:test'
import assert from 'node:assert/strict'
import { executeFinite } from '../packages/service/src/execution.mjs'
import { Definition } from '../packages/runtime/src/schema.mjs'
import { validateInput } from '../packages/service/src/schema.mjs'
const text = [{ type:'text-delta', index:0,text:'done' },{type:'finish',reason:{kind:'stop'}}]
const call = [{type:'block-end',index:0,block:{type:'tool-call',id:'call-1',name:'write',arguments:'{"value":1}'}},{type:'finish',reason:{kind:'tool-calls'}}]
function setup(mode, batches=[call,text], options={}) {
 const calls=[], inputs=[], updates=[], controller=new AbortController();let count=0
 return {controller,calls,inputs,updates,run:()=>executeFinite({input:[{id:'u',role:'user',text:'test'}],mode,maxSteps:3,signal:controller.signal,
   stream:async function*(messages){inputs.push(structuredClone(messages));yield* batches[count++]},execute:async tool=>{calls.push(tool);return {text:'saved',error:false}},publish:async (messages)=>updates.push(messages),...options})}
}
test('model-only exposes real tool request without execution',async()=>{const f=setup('model-only');const r=await f.run();assert.equal(f.calls.length,0);assert.equal(f.inputs.length,1);assert.equal(r.status,'waiting-tools');assert.equal(r.output[0].tools[0].result,undefined)})
test('tool-batch runs exactly one batch and no extra model request',async()=>{const f=setup('tool-batch');const r=await f.run();assert.equal(f.calls.length,1);assert.equal(f.inputs.length,1);assert.equal(r.output[0].tools[0].result,'saved')})
test('react includes actual tool result in next model context',async()=>{const f=setup('react');const r=await f.run();assert.equal(f.inputs.length,2);assert.equal(f.inputs[1][1].tools[0].result,'saved');assert.equal(r.reason,'completed')})
test('historical calls are passed as input and never replayed',async()=>{const input=[{id:'a',role:'assistant',text:'old',tools:[{id:'old',name:'write',arguments:'{}',result:'already saved'}]}];const f=setup('react',[text],{input});await f.run();assert.equal(f.calls.length,0);assert.deepEqual(f.inputs[0],input)})
test('human interaction batch returns without dispatch',async()=>{const batch=structuredClone(call);batch[0].block.name='ask_user_question';const f=setup('react',[batch]);const r=await f.run();assert.equal(r.reason,'human-input');assert.equal(f.calls.length,0)})
test('cancellation stops before any new tool starts',async()=>{const f=setup('react');f.controller.abort();await assert.rejects(f.run(),{name:'AbortError'});assert.equal(f.calls.length,0)})
test('incomplete stream is failure, not success',async()=>{const f=setup('model-only',[text.slice(0,1)]);await assert.rejects(f.run(),/without a finish/)})
test('terminal provider failure is preserved',async()=>{const f=setup('react',[[{type:'finish',reason:{kind:'error',failure:{message:'quota exceeded'}}}]]);await assert.rejects(f.run(),/quota exceeded/)})
test('step limit is explicit',async()=>{const f=setup('react',[call],{maxSteps:1});const r=await f.run();assert.equal(r.reason,'step-limit');assert.equal(f.inputs.length,1)})
test('skills require a loader and duplicate tools are refused',()=>{const d={name:'A',description:'',modelSelection:'unset',provider:'',model:'',systemPrompt:'',tools:[],skills:['x']};assert.equal(Definition.safeParse(d).success,false);assert.equal(Definition.safeParse({...d,tools:['skill'],skills:['x']}).success,true);assert.equal(Definition.safeParse({...d,tools:['skill','skill']}).success,false)})
test('incomplete historical tool input is rejected',()=>assert.throws(()=>validateInput([{role:'assistant',text:'',tools:[{id:'a',name:'write',arguments:'{}'}]}]),/Complete or remove/))
test('final text blocks survive providers without deltas',async()=>{const f=setup('model-only',[[{type:'block-end',index:0,block:{type:'text',text:'complete'}},{type:'finish',reason:{kind:'stop'}}]]);assert.equal((await f.run()).output[0].text,'complete')})
test('final text does not duplicate streamed deltas',async()=>{const f=setup('model-only',[[{type:'text-delta',index:0,text:'done'},{type:'block-end',index:0,block:{type:'text',text:'done'}},{type:'finish',reason:{kind:'stop'}}]]);assert.equal((await f.run()).output[0].text,'done')})
test('token exhaustion is visible and does not execute incomplete calls',async()=>{const f=setup('react',[[...call.slice(0,1),{type:'finish',reason:{kind:'max-tokens'}}]]);assert.equal((await f.run()).reason,'max-tokens');assert.equal(f.calls.length,0)})

import { nextSelection } from '../packages/runtime/src/model-selection.mjs'
test('default reasoning effort stays implicit across repeated headers',()=>{const fallback={provider:'p',model:'m'};const header={config:{...fallback,reasoningEffort:'high'},adapterDefaults:{reasoningEffort:true}};assert.deepEqual(nextSelection(null,header,fallback),fallback);assert.deepEqual(nextSelection(null,header,nextSelection(null,header,fallback)),fallback);assert.deepEqual(nextSelection({...fallback,reasoningEffort:'low'},header,fallback),{...fallback,reasoningEffort:'low'})})
