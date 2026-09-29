import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { StudioService } from '../packages/service/src/service.mjs'
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
const definition={name:'test',description:'',modelSelection:'explicit',provider:'test',model:'test',systemPrompt:'',tools:[],skills:[]}
test('unload drains preparation and newly registered prompt job before closing storage',async()=>{
 const gate=deferred(),entered=deferred(),rows=new Map();let closed=false,first=true
 const table={get:id=>rows.get(id),put:async(id,value)=>{if(first){first=false;entered.resolve();await gate.promise}assert.equal(closed,false,'write after close');rows.set(id,value)}}
 const service=new StudioService({llm:{async *stream({signal}){signal.throwIfAborted();yield {type:'text-delta',text:'unexpected'}}}})
 service.domain={table:()=>table,close:async()=>{closed=true}};service.document=()=>({definition});service.selection=d=>d
 const preparing=service.dispatch('prompt',{id:randomUUID(),instruction:'write',original:'old',definition})
 await entered.promise;const stopping=service.dispose();gate.resolve();const record=await preparing;await stopping
 assert.equal(closed,true);assert.notEqual(rows.get(record.id).status,'running');assert.equal(service.promptJobs.size,0)
 await assert.rejects(service.dispatch('bootstrap'),/stopping/)
})
test('manual invocation preserves edited arguments, deduplicates and rejects identity reuse',async()=>{
 const receipts=new Map(),calls=[];const run={id:randomUUID(),status:'waiting-tools',cwd:'/tmp',document:{definition},output:[{tools:[{id:'tool-1',name:'test',arguments:'{"text":"original"}'}]}]}
 const service=new StudioService({agents:{withInitiator:(_a,f)=>f()}});service.domain={table:()=>({get:id=>receipts.get(id),put:async(id,v)=>receipts.set(id,v)})};service.run=()=>run
 service.createHandle=async()=>({agent:{id:randomUUID(),session:{append(){}},runMaintenance:f=>f(new AbortController().signal)},dispose:async()=>{}})
 service.callTool=async(_live,tool)=>{calls.push(tool);return {text:JSON.parse(tool.arguments).text,error:false}}
 const args={runId:run.id,callId:'tool-1',executionId:randomUUID(),arguments:'{"text":"edited"}'}
 const [a,b]=await Promise.all([service.executeManual(args),service.executeManual(args)]);assert.deepEqual(a,b);assert.equal(a.output.result,'edited');assert.equal(calls.length,1)
 assert.deepEqual(await service.executeManual(args),a);assert.throws(()=>service.executeManual({...args,arguments:'{}'}),/identity conflicts/)
})
test('manual cancellation remains interrupted when official tools return an error result',async()=>{
 const entered=deferred(),controller=new AbortController(),receipts=new Map();const run={id:randomUUID(),status:'waiting-tools',cwd:'/tmp',document:{definition},output:[{tools:[{id:'call',name:'test',arguments:'{}'}]}]}
 const service=new StudioService({agents:{withInitiator:(_a,f)=>f()}});service.domain={table:()=>({get:id=>receipts.get(id),put:async(id,v)=>receipts.set(id,v)})};service.run=()=>run
 service.createHandle=async()=>({agent:{id:randomUUID(),session:{append(){}},runMaintenance:f=>f(new AbortController().signal)},dispose:async()=>{}})
 service.callTool=async()=>{entered.resolve();await new Promise(r=>controller.signal.addEventListener('abort',r,{once:true}));return {text:'aborted',error:true}}
 const pending=service.manual({runId:run.id,callId:'call',executionId:randomUUID(),arguments:'{}'},controller);await entered.promise;controller.abort();assert.equal((await pending).status,'interrupted')
})
test('formal conversations are attached to an official workspace',async()=>{
 const id=randomUUID();let created
 const service=new StudioService({workspaceRegistry:{create:async cwd=>{assert.equal(cwd,'/test');return {id:'workspace-test'}}},sessionController:{create:async request=>{created=request;return {sessionId:'session-test'}}}})
 service.document=()=>({id,definition});service.preflight=async d=>d;service.directory=async cwd=>cwd
 assert.deepEqual(await service.dispatch('conversation',{id,cwd:'/test'}),{sessionId:'session-test'})
 assert.deepEqual(created,{workspaceId:'workspace-test',agentPreset:`wb-studio-${id}`})
})

test('trial tools run inside a balanced official turn, including cancellation',async()=>{
 const events=[],controller=new AbortController(),service=new StudioService({}),handle={agent:{session:{append:(type,data)=>events.push({type,data})},runMaintenance:work=>work(controller.signal)}}
 await service.withTrialTurn(handle,controller.signal,async()=>{assert.equal(events.at(-1).type,'turn/start');controller.abort()})
 assert.deepEqual(events.map(e=>e.type),['turn/start','turn/end']);assert.equal(events[1].data.reason.kind,'aborted')
})

import { Context } from '@deepseek-ai/cordis'
import { mountStudio } from '../packages/service/src/lifecycle.mjs'
import { createStudioApi, invokeStudioMethod } from '../packages/service/src/protocol.mjs'
import * as uiPlugin from '../packages/ui/src/index.mjs'
import { Readable } from 'node:stream'

test('Cordis parks UI without service, then removes its HTTP route before storage closes',async()=>{
 const ctx=new Context(),events=[]
 const ui=await ctx.plugin(uiPlugin)
 assert.equal(ctx.get('agentStudio'),undefined)
 const waiting=await ctx.plugin({inject:['agentStudio'],apply(c){events.push('consumer-ready');c.effect(()=>async()=>{await Promise.resolve();events.push('consumer-stopped')})}})
 const owner={initialize:async()=>{events.push('recovered')},dispatch:async method=>({method}),dispose:async()=>{assert.ok(events.includes('consumer-stopped'));events.push('storage-closed')}}
 const provider=await ctx.plugin({apply:c=>mountStudio(c,owner)})
 await ui.await();await waiting.await()
 assert.deepEqual(await ctx.agentStudio.bootstrap(),{method:'bootstrap'})
 assert.ok(events.indexOf('recovered')<events.indexOf('consumer-ready'))
 await provider.dispose()
 assert.equal(ctx.get('agentStudio'),undefined)
 let routed=false
 await ctx.waterfall('connection/request',{url:'/api/workbench-agent-studio'},{},()=>{routed=true})
 assert.equal(routed,true,'HTTP adapter must disappear when service is removed')
 assert.ok(events.indexOf('consumer-stopped')<events.indexOf('storage-closed'))
 await ui.dispose();await waiting.dispose()
})

test('failed recovery does not publish a service and closes partial state',async()=>{
 const ctx=new Context();let disposed=0
 await assert.rejects(async()=>await ctx.plugin({apply:c=>mountStudio(c,{initialize:async()=>{throw Error('RECOVERY_TEST')},dispose:async()=>{disposed++}})}),/RECOVERY_TEST/)
 assert.equal(ctx.get('agentStudio'),undefined);assert.equal(disposed,1)
 await ctx.fiber.dispose()
})

test('public API cannot invoke internal methods or Object prototype properties',async()=>{
 const called=[];const api=createStudioApi({dispatch:async(method,args)=>{called.push(method);return args}})
 assert.deepEqual(await invokeStudioMethod(api,'create',{name:'A'}),{name:'A'})
 for(const method of ['dispose','initialize','constructor','__proto__',null])assert.throws(()=>invokeStudioMethod(api,method,{}),/Unknown Studio/)
 assert.deepEqual(called,['create']);assert.ok(Object.isFrozen(api))
})

test('UI HTTP adapter delegates to public service and preserves legacy endpoint/error codes',async()=>{
 let route;const calls=[]
 uiPlugin.apply({agentStudio:createStudioApi({dispatch:async(method,args)=>{calls.push({method,args});if(method==='save')throw Object.assign(Error('conflict'),{code:'REVISION_CONFLICT'});return {id:'persisted'}}}),on:(_name,fn)=>{route=fn}})
 async function request(path,body){const req=Readable.from([Buffer.from(JSON.stringify(body))]);Object.assign(req,{url:path,method:'POST',headers:{'content-type':'application/json'}});const res={statusCode:200,setHeader(){},writeHead(n){this.statusCode=n},end(value){this.body=JSON.parse(value)}};let forwarded=false;await route(req,res,()=>{forwarded=true});return {...res,forwarded}}
 const created=await request('/api/workbench-agent-studio',{method:'create',args:{name:'A'}});assert.deepEqual(created.body,{ok:true,value:{id:'persisted'}})
 const conflict=await request('/api/workbench-agent-studio',{method:'save',args:{}});assert.equal(conflict.statusCode,409)
 const invalid=await request('/api/workbench-agent-studio',{method:'dispose'});assert.equal(invalid.statusCode,400)
 assert.equal((await request('/api/unrelated',{})).forwarded,true)
 assert.deepEqual(calls.map(c=>c.method),['create','save'])
})
