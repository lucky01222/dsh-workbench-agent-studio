import test from 'node:test'
import assert from 'node:assert/strict'
import { StudioController } from '../packages/ui/src/client/controller.mjs'
import { PluginChoiceStore } from '../packages/ui/src/client/plugin-choice-store.mjs'
import { setPluginMode, setPluginEnabled } from '../packages/ui/src/client/plugin-capabilities.mjs'
import { Definition } from 'dsh-workbench-agent-studio-runtime/schema'
import './client-styles.integration.mjs'
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
const definition={name:'A',description:'',provider:'test',model:'test',modelSelection:'explicit',systemPrompt:'old',tools:[],skills:[]}
const doc=id=>({id,agentPreset:id,revision:1,definition:{...definition,name:id},readOnly:false})
function setup(custom={}){const docs=[doc('a'),doc('b')];const api=async(method,args)=>{if(custom[method])return custom[method](args);if(method==='bootstrap')return {agents:docs,presets:[],cwd:'/tmp'};if(method==='models')return [];if(method==='catalog')return {tools:[],skills:[]};if(method==='history')return {runs:[],evaluations:[]};throw Error(method)};const c=new StudioController(api);c.documents=docs;c.publish({document:docs[0],draft:docs[0].definition,cwd:'/tmp',openIds:['a'],messages:[{id:'m',role:'user',text:'hello'}]});return c}
const run=id=>({id,sessionId:id,status:'succeeded',document:doc('a'),input:[],output:[{id:'out',role:'assistant',text:id}],mode:'model-only'})
test('late preset selection cannot replace later tab',async()=>{const d=deferred(),c=setup({readPreset:()=>d.promise});const first=c.open('preset');await c.open('b');d.resolve({...doc('preset'),readOnly:true});await first;assert.equal(c.getSnapshot().document.id,'b');c.dispose()})
test('same-tab history uses last selection despite reversed responses',async()=>{const a=deferred(),b=deferred(),c=setup({getRun:({id})=>id==='a'?a.promise:b.promise});const p=c.openRun('a'),q=c.openRun('b');b.resolve(run('b'));await q;a.resolve(run('a'));await p;assert.equal(c.getSnapshot().runState.run.id,'b');c.dispose()})
test('save deduplicates and retains edits made during request',async()=>{const d=deferred();let calls=0;const c=setup({save:()=>{calls++;return d.promise}});const p=c.save(),q=c.save();c.change({systemPrompt:'new'});d.resolve({...doc('a'),revision:2});await Promise.all([p,q]);assert.equal(calls,1);assert.equal(c.getSnapshot().draft.systemPrompt,'new');assert.equal(c.getSnapshot().status,'dirty');c.dispose()})
test('run refuses stale saved configuration when user edits during save',async()=>{const d=deferred();let calls=0;const c=setup({save:()=>d.promise,run:()=>{calls++;return run('r')}});c.change({systemPrompt:'first'});const p=c.run();c.change({systemPrompt:'second'});d.resolve({...doc('a'),revision:2,definition:{...definition,systemPrompt:'first'}});await assert.rejects(p,/保存期间/);assert.equal(calls,0);c.dispose()})
test('stop cancels whole manual batch, not just current dispatch',async()=>{const first=deferred();let calls=0;const c=setup({executeTool:()=>{calls++;return first.promise},stop:()=>run('r')});c.publish({runState:{run:run('r')},messages:[{id:'m',role:'assistant',text:'',origin:{runId:'r'},tools:[{id:'t1',name:'write',arguments:'{}'},{id:'t2',name:'write',arguments:'{}'}]}]});const p=c.execute('m',['t1','t2']);await c.stop();first.resolve({status:'interrupted'});await p;assert.equal(calls,1);assert.deepEqual(c.getSnapshot().executingToolIds,[]);c.dispose()})
test('prompt cancellation before start reply still stops remote job',async()=>{const d=deferred();let stopped;const c=setup({prompt:()=>d.promise,stopPrompt:({id})=>{stopped=id;return {candidate:'',status:'cancelled'}}});const start=c.prompt({id:'client-id',model:{provider:'test',model:'test'},original:'',instruction:'draft'});const stop=c.promptStop('client-id');d.resolve({id:'server-id',candidate:'',status:'running'});await Promise.all([start,stop]);assert.equal(stopped,'server-id');c.dispose()})

test('reopened tab edits and undo work with the official immutable store',async()=>{const c=setup();c.edit([{id:'m',role:'user',text:'first'}]);await c.open('b');await c.open('a');c.edit([{id:'m',role:'user',text:'second'}]);c.undoMessages();assert.equal(c.getSnapshot().messages[0].text,'first');c.redoMessages();assert.equal(c.getSnapshot().messages[0].text,'second');c.dispose()})


function pluginSetup() {
 const database = new Map([['a', { ...doc('a'), definition: { ...definition, tools: ['read'], skills: [] } }]])
 const values = new Map(), storage = { getItem: k => values.get(k), setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) }
 const choices = new PluginChoiceStore({ storage: () => storage, origin: () => 'test-origin' })
 let catalog = [{ name:'read',description:'Read files' }], calls = [], nextSave
 const api = async (method,args) => {
  calls.push({method,args})
  if(method==='bootstrap')return {agents:[...database.values()],presets:[],cwd:'/workspace'}
  if(method==='models')return []
  if(method==='catalog')return {tools:catalog,skills:[]}
  if(method==='history')return {runs:[],evaluations:[]}
  if(method==='save'){
   Definition.parse(args.definition)
   if(nextSave){const value=nextSave;nextSave=null;await value.promise}
   const current=database.get(args.id)
   if(current.revision!==args.revision)throw Error('revision conflict')
   const saved={...current,revision:current.revision+1,definition:structuredClone(args.definition)}
   database.set(args.id,saved);return saved
  }
  if(method==='copy'){const current=database.get(args.id),saved={...structuredClone(current),id:'copy',revision:1};database.set('copy',saved);return saved}
  if(method==='delete'){database.delete(args.id);return}
  throw Error(method)
 }
 const make=()=>new StudioController(api,{choiceStore:choices})
 return {database,choices,api,make,calls,setCatalog: rows=>catalog=rows,delaySave:d=>nextSave=d}
}
const fsId='@deepseek-ai/dsh-tool-fs'
async function opened(fixture){const c=fixture.make();await c.refresh();await c.open('a');return c}
function wholeFiles(c){const s=c.getSnapshot(),catalog=c.pluginCatalog(),plugin=catalog.find(p=>p.id===fsId);c.changePlugins(setPluginMode(s.pluginSelection,plugin,'all',{confirmed:true}))}

test('frontend saves whole mode separately while the Host receives only its existing strict Definition',async()=>{
 const f=pluginSetup(),c=await opened(f)
 assert.equal(c.getSnapshot().pluginSelection[fsId].mode,'custom')
 wholeFiles(c);assert.equal(c.getSnapshot().status,'dirty')
 await c.save();assert.equal(c.getSnapshot().status,'saved')
 const payload=f.calls.find(x=>x.method==='save').args.definition
 assert.deepEqual(payload.tools,['read']);assert.equal(Object.hasOwn(payload,'pluginSelection'),false)
 assert.equal(f.choices.read(f.database.get('a'),'/workspace')[fsId].mode,'all')
 const next=await opened(f);assert.equal(next.getSnapshot().pluginSelection[fsId].mode,'all')
 c.dispose();next.dispose()
})
test('a newer server edit invalidates browser all mode rather than widening another client selection',async()=>{
 const f=pluginSetup(),c=await opened(f);wholeFiles(c);await c.save()
 const current=f.database.get('a');f.database.set('a',{...current,revision:current.revision+1,definition:{...current.definition,tools:['write']}})
 f.setCatalog([{name:'read',description:''},{name:'write',description:''}])
 await c.reload();assert.equal(c.getSnapshot().pluginSelection[fsId].mode,'custom');assert.deepEqual(c.getSnapshot().draft.tools,['write'])
 c.dispose()
})
test('save retains a mode-only edit made while the previous request is in flight',async()=>{
 const f=pluginSetup(),c=await opened(f);wholeFiles(c)
 const delayed=deferred();f.delaySave(delayed);const save=c.save()
 const plugin=c.pluginCatalog().find(p=>p.id===fsId);c.changePlugins(setPluginMode(c.getSnapshot().pluginSelection,plugin,'custom'))
 delayed.resolve();await save
 assert.equal(c.getSnapshot().status,'dirty');assert.equal(c.getSnapshot().pluginSelection[fsId].mode,'custom')
 assert.equal(f.choices.read(f.database.get('a'),'/workspace')[fsId].mode,'all')
 c.dispose()
})
test('new catalog tools change the draft of a tracked plugin, without implicit save or run',async()=>{
 const f=pluginSetup(),c=await opened(f);wholeFiles(c);await c.save();const saves=f.calls.filter(x=>x.method==='save').length
 f.setCatalog([{name:'read',description:''},{name:'read_image',description:''}]);await c.refreshCatalog()
 assert.deepEqual(c.getSnapshot().draft.tools,['read','read_image']);assert.equal(c.getSnapshot().status,'dirty')
 assert.equal(f.calls.filter(x=>x.method==='save').length,saves);assert.equal(f.calls.some(x=>x.method==='run'),false)
 c.dispose()
})
test('copy and delete bind browser intent to the new identity and its final renamed revision',async()=>{
 const f=pluginSetup(),c=await opened(f);wholeFiles(c);await c.save();await c.copy('renamed')
 assert.equal(c.getSnapshot().document.id,'copy');assert.equal(c.getSnapshot().document.revision,2)
 assert.equal(c.getSnapshot().pluginSelection[fsId].mode,'all')
 await c.remove();assert.equal(f.choices.read({id:'copy',revision:2,definition:{tools:['read']}},'/workspace'),null)
 assert.equal(f.choices.read(f.database.get('a'),'/workspace')[fsId].mode,'all')
 c.dispose()
})
test('plugin projection retains external actions and the existing Skill loader invariant',async()=>{
 const f=pluginSetup();const d=f.database.get('a');d.definition={...d.definition,tools:['read','openconnector/service/action']}
 f.setCatalog([{name:'read',description:''},{name:'skill',description:''}]);const c=await opened(f)
 c.change({skills:['library-knowledge']});assert.ok(c.getSnapshot().draft.tools.includes('skill'))
 const catalog=c.pluginCatalog(),loader=catalog.find(p=>p.id==='@deepseek-ai/dsh-tool-skill')
 c.changePlugins(setPluginEnabled(c.getSnapshot().pluginSelection,loader,false))
 assert.deepEqual(c.getSnapshot().draft.skills,[]);assert.ok(c.getSnapshot().draft.tools.includes('openconnector/service/action'))
 c.dispose()
})


test('restored tab plugin intent cannot cross a changed workspace even when server identity is cloned',async()=>{
 const f=pluginSetup(),c=await opened(f);wholeFiles(c);await c.save();const previous=c.capture()
 c.workspace='/other-workspace';c.tabs.set('a',previous)
 await c.open('a')
 assert.equal(c.getSnapshot().pluginSelection[fsId].mode,'custom')
 assert.deepEqual(c.getSnapshot().draft.tools,['read'])
 assert.equal(c.getSnapshot().pluginIntentWorkspace,'/other-workspace')
 c.dispose()
})
