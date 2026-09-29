import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {LlmAdapter,createUserMessage} from '@deepseek-ai/dsh-llm'
import {defineTool} from '@deepseek-ai/dsh-tools'
export const inject=['llm','tools','agents','agentPresets','systemPrompt','sessions']
export function apply(ctx,config){
 console.log('PROBE: activated')
 let calls=0,requests=0,titleRequests=0
 class Adapter extends LlmAdapter{
  async listModels(){return [{provider:'studio-test',id:'scripted',name:'Local runtime verification'}]}
  async *stream(options){
   if(options.purpose==='session-title'){titleRequests++;yield {type:'block-start',index:0,blockType:'text'};yield {type:'block-end',index:0,block:{type:'text',text:'Runtime verification'}};yield {type:'finish',reason:{kind:'stop'}};return}
   requests++
   assert.equal(options.model,config.definition.model)
   const systemText=options.messages.filter(m=>m.role==='system').flatMap(m=>m.content.filter(b=>b.type==='text').map(b=>b.text)).join('\n')
   assert.ok(systemText.includes(config.definition.systemPrompt),'Exported prompt must reach the loop system message')
   assert.deepEqual(options.tools.map(t=>t.name).sort(),[...config.definition.tools].sort(),'Only selected tools reach model')
   const hasResult=options.messages.some(m=>m.role==='tool')
   const block=hasResult?{type:'text',text:'RUNTIME_VERIFIED'}:{type:'tool-call',id:randomUUID(),name:'studio_test_echo',arguments:'{"text":"PORTABLE_ECHO"}'}
   yield {type:'block-start',index:0,blockType:block.type}
   if(block.type==='text')yield {type:'text-delta',index:0,text:block.text}
   yield {type:'block-end',index:0,block}
   yield {type:'finish',reason:{kind:hasResult?'stop':'tool-calls'}}
  }
 }
 ctx.llm.registerAdapter(['studio-test'],new Adapter())
 ctx.tools.register(defineTool({name:'studio_test_echo',description:'Local portability test',parameters:{text:{type:'string',required:true}},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},execute:async(args)=>{assert.equal(args.text,'PORTABLE_ECHO');calls++;return args.text}}))
 async function run(){
  await ctx.get('loader')?.await()
  console.log('PROBE: loader settled; presets='+!!ctx.get('agentPresets'))
  assert.ok(ctx.get('agentPresets'),'Preset registry unavailable')
  assert.equal(ctx.get('agentStudio'),undefined,'Editor service must remain absent')
  const h=await ctx.agents.create({sessionId:randomUUID(),meta:{cwd:config.cwd,agentPreset:config.id},agentOptions:{provider:'studio-test',model:'scripted'},setup:async c=>{await ctx.agentPresets.mount(c,config.id)}})
  console.log('PROBE: Agent created')
  try{
   h.agent.followup(createUserMessage({content:[{type:'text',text:'Verify the exported Agent.'}],source:{kind:'user'}}))
   await h.agent.whenIdle();await ctx.sessions.flush(h.agent.session)
   const events=Array.from({length:h.agent.session.seq},(_,i)=>h.agent.session.eventAt(i)).filter(Boolean)
   const end=events.filter(e=>e.type==='turn/end').at(-1)
   assert.equal(end?.data.reason.kind,'completed',JSON.stringify(end?.data))
   assert.equal(calls,1);assert.equal(requests,2)
   assert.ok(events.some(e=>e.type==='assistant/message'&&e.data.message.content.some(b=>b.type==='text'&&b.text==='RUNTIME_VERIFIED')))
   console.log(JSON.stringify({kind:config.kind,status:'PASS',requests,titleRequests,toolCalls:calls,studioService:false,sessionId:h.agent.session.id}))
  }finally{await h.dispose()}
 }
 void run().then(()=>ctx.get('appExit')(0)).catch(e=>{console.error(e);ctx.get('appExit')(1)})
}
