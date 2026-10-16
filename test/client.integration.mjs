import test from 'node:test'
import assert from 'node:assert/strict'
import { StudioController } from '../packages/ui/src/client/controller.mjs'
import { PluginChoiceStore } from '../packages/ui/src/client/plugin-choice-store.mjs'
import { setPluginMode, setPluginEnabled } from '../packages/ui/src/client/plugin-capabilities.mjs'
import {LIBRARY_OWNER,LEGACY_KNOWLEDGE_OWNER,UNIFIED_LIBRARY_TOOLS} from '../packages/ui/src/client/plugin-capabilities.mjs'
import { Definition } from 'dsh-workbench-agent-studio-runtime/schema'
import './client-styles.integration.mjs'
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
const definition={name:'A',description:'',provider:'test',model:'test',modelSelection:'explicit',systemPrompt:'old',tools:[],skills:[]}
const doc=id=>({id,agentPreset:id,revision:1,definition:{...definition,name:id},readOnly:false})
function setup(custom={}){const docs=[doc('a'),doc('b')];const api=async(method,args)=>{if(custom[method])return custom[method](args);if(method==='bootstrap')return {agents:docs,presets:[],cwd:'/tmp'};if(method==='models')return [];if(method==='catalog')return {tools:[],skills:[]};if(method==='history')return {runs:[],evaluations:[]};throw Error(method)};const c=new StudioController(api);c.documents=docs;c.publish({document:docs[0],draft:docs[0].definition,cwd:'/tmp',openIds:['a'],messages:[{id:'m',role:'user',text:'hello'}]});return c}
const run=id=>({id,sessionId:id,status:'succeeded',document:doc('a'),input:[],output:[{id:'out',role:'assistant',text:id}],mode:'model-only'})

function migrationSetup(){
 const oldLibrary=UNIFIED_LIBRARY_TOOLS.slice(0,7),oldKnowledge=UNIFIED_LIBRARY_TOOLS.slice(10),tools=[...oldLibrary,...oldKnowledge],bindings={[LIBRARY_OWNER]:{enabled:true,mode:'all',tools:oldLibrary},[LEGACY_KNOWLEDGE_OWNER]:{enabled:true,mode:'all',tools:oldKnowledge},unrelated:{enabled:false,mode:'custom',tools:['unrelated_exact']}}
 const database=new Map([['a',{...doc('a'),definition:{...definition,tools,pluginBindings:bindings}}],['b',doc('b')]]),calls=[],receipts=new Map();let loseApply=false,previewDelay,applyError
 const catalog=UNIFIED_LIBRARY_TOOLS.map(name=>({name,description:name,pluginId:LIBRARY_OWNER,pluginVersion:'0.23.1'})),projection=d=>({tools:[...d.tools],pluginBindings:structuredClone(d.pluginBindings)})
 const api=async(method,args)=>{
  calls.push({method,args})
  if(method==='bootstrap')return {agents:[...database.values()],presets:[],cwd:'/workspace',capabilityBindings:true}
  if(method==='models')return []
  if(method==='history')return {runs:[],evaluations:[]}
  if(method==='catalog')return {tools:catalog,skills:[],capabilityBindings:true}
  if(method==='ownerMigrationPreview'){
   if(previewDelay)await previewDelay.promise
   const current=database.get(args.id),selected=args.policy==='current'?[...UNIFIED_LIBRARY_TOOLS]:[...current.definition.tools],after={tools:selected,pluginBindings:{[LIBRARY_OWNER]:{enabled:true,mode:'custom',tools:selected},unrelated:bindings.unrelated}}
   const latest=[...receipts.values()].filter(value=>value.receipt.agentId===args.id).at(-1)?.receipt;return {version:1,status:current.definition.pluginBindings?.[LEGACY_KNOWLEDGE_OWNER]?'ready':'not-needed',...latest?{receipt:structuredClone(latest)}:{},id:args.id,revision:args.revision,permissionHash:'saved-permissions',catalogHash:'current-catalog',policy:args.policy,before:projection(current.definition),after,added:selected.filter(x=>!current.definition.tools.includes(x)),removed:[],disabledBindings:{unrelated:bindings.unrelated},reasons:[],affectedOwners:[LEGACY_KNOWLEDGE_OWNER,LIBRARY_OWNER]}
  }
  if(method==='ownerMigrationApply'){
   if(applyError){const failure=applyError;applyError=null;throw failure}const prior=receipts.get(args.operationId);if(prior?.receipt.status==='undone')throw Object.assign(Error('migration already undone'),{code:'MIGRATION_UNDONE'});if(prior?.receipt.status==='undo-prepared')throw Object.assign(Error('migration undo pending'),{code:'MIGRATION_UNDO_PENDING'});if(prior&&prior.receipt.status!=='prepared')return structuredClone(prior)
   const current=database.get(args.id);if(current.revision!==args.revision)throw Object.assign(Error('revision conflict'),{code:'REVISION_CONFLICT'})
   const selected=args.policy==='current'?[...UNIFIED_LIBRARY_TOOLS]:[...current.definition.tools],after={tools:selected,pluginBindings:{[LIBRARY_OWNER]:{enabled:true,mode:'custom',tools:selected},unrelated:bindings.unrelated}},next={...current,revision:current.revision+1,definition:{...current.definition,...after}},receipt={id:args.operationId,agentId:args.id,status:'applied',before:projection(current.definition),after,sourceRevision:current.revision,appliedRevision:next.revision,policy:args.policy,permissionHash:args.permissionHash,catalogHash:args.catalogHash}
   database.set(args.id,next);const result={document:next,receipt};receipts.set(args.operationId,structuredClone(result));if(loseApply){loseApply=false;throw Error('synthetic connection lost after commit')}return result
  }
  if(method==='ownerMigrationUndo'){
   const old=receipts.get(args.operationId),current=database.get(args.id),next={...current,revision:current.revision+1,definition:{...current.definition,...old.receipt.before}},receipt={...old.receipt,status:'undone',undoOperationId:args.undoOperationId};database.set(args.id,next);receipts.set(args.operationId,{document:next,receipt});return {document:next,receipt}
  }
  throw Error(method)
 }
 const c=new StudioController(api)
 return {c,calls,database,bindings,receipts,api,failApply(error){applyError=error},async open(){await c.refresh();await c.open('a')},loseNextApply(){loseApply=true},delayPreview(value){previewDelay=value}}
}

test('legacy Library catalog refresh keeps all 12 saved tools without mutation; preview is read-only and defaults to saved',async()=>{
 const f=migrationSetup();await f.open();const before=structuredClone(f.database.get('a')),c=f.c
 assert.equal(c.getSnapshot().draft.tools.length,12);assert.equal(c.getSnapshot().status,'saved');assert.equal(c.ownerMigrationNeeded(),true)
 await c.refreshCatalog();assert.equal(c.getSnapshot().draft.tools.length,12);assert.equal(f.calls.some(x=>/Apply|Undo|save/.test(x.method)),false)
 await c.ownerMigrationPreview();assert.equal(c.getSnapshot().ownerMigration.preview.policy,'saved');assert.deepEqual(c.getSnapshot().ownerMigration.preview.added,[]);assert.deepEqual(f.database.get('a'),before);assert.equal(c.getSnapshot().draft.pluginBindings[LIBRARY_OWNER].mode,'all')
 await c.ownerMigrationPreview('current');assert.equal(c.getSnapshot().ownerMigration.preview.added.length,3);assert.equal(c.getSnapshot().draft.tools.length,12);assert.deepEqual(f.database.get('a'),before);c.dispose()
})
test('choosing skills keeps unified Library bindings intact and adds only the skill loader',async()=>{
 const tools=[...UNIFIED_LIBRARY_TOOLS],bindings={[LIBRARY_OWNER]:{enabled:true,mode:'custom',tools}},document={...doc('a'),definition:{...definition,tools,pluginBindings:bindings}}
 const rows=[...UNIFIED_LIBRARY_TOOLS.map(name=>({name,description:name,pluginId:LIBRARY_OWNER,pluginVersion:'0.29.4'})),{name:'skill',description:'skill',pluginId:'@deepseek-ai/dsh-tool-skill',pluginVersion:'0.1.7-rc.2'}]
 const api=async method=>{if(method==='bootstrap')return {agents:[document],presets:[],cwd:'/workspace',capabilityBindings:true};if(method==='models')return [];if(method==='history')return {runs:[],evaluations:[]}
  if(method==='catalog')return {tools:rows,skills:[{name:'library-knowledge',description:'k',source:'bundled',owner:LIBRARY_OWNER}],capabilityBindings:true}
  if(method==='ownerMigrationPreview')return {version:1,status:'not-needed',id:'a',revision:1,policy:'saved',before:{tools},after:{tools},added:[],removed:[],disabledBindings:{},reasons:[],affectedOwners:[]};throw Error(method)}
 const c=new StudioController(api);await c.refresh();await c.open('a');const before=structuredClone(c.getSnapshot().pluginSelection)
 c.change({skills:['library-knowledge']});let s=c.getSnapshot()
 assert.deepEqual(s.pluginSelection[LIBRARY_OWNER],before[LIBRARY_OWNER]);assert.equal(Object.keys(s.pluginSelection).some(id=>id!==LIBRARY_OWNER&&id!=='@deepseek-ai/dsh-tool-skill'),false)
 assert.deepEqual(s.draft.pluginBindings['@deepseek-ai/dsh-tool-skill'],{enabled:true,mode:'custom',tools:['skill']});assert.ok(s.draft.tools.includes('skill'))
 c.change({skills:[]});s=c.getSnapshot();assert.deepEqual(s.pluginSelection[LIBRARY_OWNER],before[LIBRARY_OWNER]);c.dispose()
})
test('Update keeps the saved tools and applies in one step, then offers only Undo',async()=>{
 const f=migrationSetup();await f.open();const c=f.c
 await c.ownerMigrationUpdate()
 const s=c.getSnapshot();assert.equal(s.document.revision,2);assert.equal(s.draft.tools.length,12);assert.equal(s.ownerMigration.receipt.status,'applied');assert.equal(s.ownerMigration.recent,true);assert.equal(c.ownerMigrationNeeded(),false)
 const previews=f.calls.filter(x=>x.method==='ownerMigrationPreview');assert.ok(previews.length>=1);assert.ok(previews.every(x=>x.args.policy==='saved'))
 const applies=f.calls.filter(x=>x.method==='ownerMigrationApply');assert.equal(applies.length,1);assert.equal(applies[0].args.policy,'saved');assert.equal(f.calls.some(x=>x.method==='save'),false)
 await c.ownerMigrationUndo();assert.equal(c.getSnapshot().ownerMigration.receipt.status,'undone');assert.equal(c.ownerMigrationNeeded(),true);c.dispose()
})
test('Update stops at the preview whenever the tool scope would change',async()=>{
 const f=migrationSetup();f.c.dispose();const before=structuredClone(f.database.get('a'))
 const c=new StudioController(async(method,args)=>{const result=await f.api(method,args);return method==='ownerMigrationPreview'?{...result,status:'ready',added:['library_sources'],after:{...result.after,tools:[...result.after.tools,'library_sources']}}:result})
 await c.refresh();await c.open('a');await c.ownerMigrationUpdate()
 assert.equal(f.calls.some(x=>x.method==='ownerMigrationApply'),false);assert.deepEqual(f.database.get('a'),before);assert.deepEqual(c.getSnapshot().ownerMigration.preview.added,['library_sources'])
 await c.ownerMigrationApply();assert.equal(f.calls.filter(x=>x.method==='ownerMigrationApply').length,1);c.dispose()
})
test('service-parsed definitions with different flat and binding tool order remain saved and load their durable migration receipt',async()=>{
 const f=migrationSetup();await f.open();await f.c.ownerMigrationPreview('current');await f.c.ownerMigrationApply();f.c.dispose()
 const source=f.database.get('a'),original=Definition.parse({...source.definition,connectorBindings:{second:'two',first:'one'}})
 // This is the ordering produced by the real service: the flat cache retains
 // historical read tools first; the merged binding lists Library's core first.
 original.tools=[...UNIFIED_LIBRARY_TOOLS.slice(10),...UNIFIED_LIBRARY_TOOLS.slice(0,10)]
 original.pluginBindings[LIBRARY_OWNER].tools=[...UNIFIED_LIBRARY_TOOLS]
 const stored={...source,definition:original};f.database.set('a',stored);const snapshot=structuredClone(stored)
 const c=new StudioController(f.api),before=f.calls.filter(call=>call.method==='ownerMigrationPreview').length;await c.refresh();await c.open('a');let s=c.getSnapshot()
 assert.notDeepEqual(s.draft.tools,s.document.definition.tools,'fixture must reproduce the actual cache/binding ordering difference');assert.deepEqual([...s.draft.tools].sort(),[...s.document.definition.tools].sort());assert.equal(s.status,'saved');assert.ok(f.calls.filter(call=>call.method==='ownerMigrationPreview').length>before);assert.equal(s.ownerMigration.receipt.status,'applied');assert.equal(s.ownerMigration.receipt.before.tools.length,12);assert.equal(s.ownerMigration.receipt.after.tools.length,15);assert.equal(s.ownerMigration.preview.status,'not-needed');assert.deepEqual(f.database.get('a'),snapshot)
 const reordered=Object.fromEntries(Object.entries(s.draft).reverse());reordered.connectorBindings={first:'one',second:'two'};assert.equal(c.configurationStatus(reordered,s.pluginSelection,s.pluginSavedSelection),'saved')
 c.change({systemPrompt:s.draft.systemPrompt+' '});assert.equal(c.getSnapshot().status,'dirty');c.change({systemPrompt:s.document.definition.systemPrompt});assert.equal(c.getSnapshot().status,'saved');c.change({model:'different-model'});assert.equal(c.getSnapshot().status,'dirty');assert.deepEqual(f.database.get('a'),snapshot);c.dispose()
})
test('explicit migration adopts exact custom scope and preserves disabled owners; undo uses the recorded operation only',async()=>{
 const f=migrationSetup();await f.open();const c=f.c;await c.ownerMigrationPreview();await c.ownerMigrationApply()
 const s=c.getSnapshot();assert.equal(s.document.revision,2);assert.equal(s.draft.tools.length,12);assert.equal(s.draft.pluginBindings[LIBRARY_OWNER].mode,'custom');assert.equal(Object.hasOwn(s.draft.pluginBindings[LIBRARY_OWNER],'contract'),false);assert.deepEqual(s.draft.pluginBindings.unrelated,f.bindings.unrelated);assert.equal(c.ownerMigrationNeeded(),false)
 const call=f.calls.find(x=>x.method==='ownerMigrationApply');assert.equal(call.args.policy,'saved');assert.equal(Object.hasOwn(call.args,'definition'),false);assert.equal(Object.hasOwn(call.args,'systemPrompt'),false)
 await c.ownerMigrationUndo();assert.equal(c.getSnapshot().document.revision,3);assert.equal(c.getSnapshot().ownerMigration.receipt.status,'undone');assert.deepEqual(c.getSnapshot().draft.pluginBindings,f.bindings);assert.equal(c.getSnapshot().draft.tools.length,12);c.dispose()
})
test('an unknown apply outcome retries the same operation without broadening or duplicating migration',async()=>{
 const f=migrationSetup();await f.open();const c=f.c;await c.ownerMigrationPreview();f.loseNextApply();await assert.rejects(c.ownerMigrationApply(),/connection lost/)
 const request=c.getSnapshot().ownerMigration.pendingApply;assert.ok(request.operationId);await assert.rejects(c.ownerMigrationPreview('current'),/尚未核对/)
 await c.ownerMigrationApply();const calls=f.calls.filter(x=>x.method==='ownerMigrationApply');assert.equal(calls.length,2);assert.deepEqual(calls[0].args,calls[1].args);assert.equal(c.getSnapshot().document.revision,2);assert.equal(c.getSnapshot().draft.tools.length,12);assert.equal(c.getSnapshot().ownerMigration.pendingApply,null);c.dispose()
})
test('recovering an unknown migration keeps unsaved persona edits and merges only the unchanged permission projection',async()=>{
 const f=migrationSetup();await f.open();const c=f.c;f.loseNextApply();await assert.rejects(c.ownerMigrationApply(),/connection lost/)
 const request=structuredClone(c.getSnapshot().ownerMigration.pendingApply);c.change({systemPrompt:'unsaved persona',model:'unsaved-model',description:'unsaved description'})
 await c.ownerMigrationApply();const s=c.getSnapshot();assert.equal(s.status,'dirty');assert.equal(s.draft.systemPrompt,'unsaved persona');assert.equal(s.draft.model,'unsaved-model');assert.equal(s.draft.description,'unsaved description');assert.deepEqual(s.draft.tools,s.document.definition.tools);assert.deepEqual(s.draft.pluginBindings,s.document.definition.pluginBindings);assert.equal(s.draft.pluginBindings[LIBRARY_OWNER].mode,'custom');assert.equal(s.document.definition.systemPrompt,'old');assert.equal(s.ownerMigration.pendingApply,null)
 assert.deepEqual(f.calls.filter(call=>call.method==='ownerMigrationApply').map(call=>call.args),[request,request]);assert.equal(f.calls.some(call=>call.method==='save'),false);c.dispose()
})
test('recovering an unknown migration preserves changed local tool choices as a conflict',async()=>{
 // The added tool is grouped under its Host owner, so its position in the flat list is not part of the choice.
 const f=migrationSetup();await f.open();const c=f.c;f.loseNextApply();await assert.rejects(c.ownerMigrationApply(),/connection lost/);c.change({systemPrompt:'local persona',tools:[...c.getSnapshot().draft.tools,'library_sources']});const local=structuredClone(c.getSnapshot().draft)
 await c.ownerMigrationApply();assert.equal(c.getSnapshot().status,'conflict');const kept=c.getSnapshot().draft;assert.deepEqual({...kept,tools:[...kept.tools].sort()},{...local,tools:[...local.tools].sort()});assert.equal(c.getSnapshot().document.definition.tools.length,12);assert.equal(c.getSnapshot().ownerMigration.pendingApply,null);c.dispose()
})
test('an apply replay after another window undid it reads current state without a transient grant or losing persona edits',async()=>{
 const f=migrationSetup();await f.open();const c=f.c;await c.ownerMigrationPreview('current');f.loseNextApply();await assert.rejects(c.ownerMigrationApply(),/connection lost/);const request=structuredClone(c.getSnapshot().ownerMigration.pendingApply)
 await f.api('ownerMigrationUndo',{id:'a',operationId:request.operationId,undoOperationId:'other-window-undo',cwd:'/workspace'});c.change({systemPrompt:'keep this local persona',model:'keep-local-model'})
 const observed=[];const unsubscribe=c.subscribe(()=>observed.push(c.getSnapshot().draft.tools.length));await assert.rejects(c.ownerMigrationApply(),error=>error.code==='MIGRATION_UNDONE');unsubscribe()
 const s=c.getSnapshot();assert.ok(observed.every(count=>count===12));assert.equal(s.document.revision,3);assert.equal(s.ownerMigration.receipt.status,'undone');assert.equal(s.ownerMigration.pendingApply,null);assert.equal(s.ownerMigration.preview,null);assert.equal(s.draft.systemPrompt,'keep this local persona');assert.equal(s.draft.model,'keep-local-model');assert.equal(s.status,'dirty');assert.equal(f.calls.filter(call=>call.method==='ownerMigrationUndo').length,1);assert.deepEqual(f.calls.filter(call=>call.method==='ownerMigrationApply').map(call=>call.args),[request,request]);c.dispose()
})
test('a replay during another window pending undo restores its original undo identity without automatically executing it',async()=>{
 const f=migrationSetup();await f.open();const c=f.c;f.loseNextApply();await assert.rejects(c.ownerMigrationApply(),/connection lost/);const request=c.getSnapshot().ownerMigration.pendingApply,stored=f.receipts.get(request.operationId);stored.receipt={...stored.receipt,status:'undo-prepared',undoOperationId:'other-pending-undo'};c.change({systemPrompt:'unsaved while undo pending'})
 await assert.rejects(c.ownerMigrationApply(),error=>error.code==='MIGRATION_UNDO_PENDING');assert.equal(c.getSnapshot().ownerMigration.pendingApply,null);assert.equal(c.getSnapshot().ownerMigration.pendingUndo.undoOperationId,'other-pending-undo');assert.equal(f.calls.some(call=>call.method==='ownerMigrationUndo'),false)
 await c.ownerMigrationUndo();assert.equal(f.calls.findLast(call=>call.method==='ownerMigrationUndo').args.undoOperationId,'other-pending-undo');assert.equal(c.getSnapshot().draft.systemPrompt,'unsaved while undo pending');assert.equal(c.getSnapshot().status,'dirty');assert.equal(c.getSnapshot().ownerMigration.receipt.status,'undone');c.dispose()
})
test('local edits invalidate preview and a late preview cannot attach to another Agent',async()=>{
 const f=migrationSetup();await f.open();const c=f.c;await c.ownerMigrationPreview();c.change({description:'local edit'});assert.equal(c.getSnapshot().ownerMigration.preview,null);await assert.rejects(c.ownerMigrationApply(),/先保存/)
 await c.reload();const delay=deferred();f.delayPreview(delay);const waiting=c.ownerMigrationPreview();await c.open('b');delay.resolve();await waiting;assert.equal(c.getSnapshot().document.id,'b');assert.equal(c.getSnapshot().ownerMigration,null);assert.equal(f.calls.some(x=>x.method==='ownerMigrationApply'),false);c.dispose()
})
test('reloading reads persisted migration receipts and restores Undo without using a browser-only receipt',async()=>{
 const f=migrationSetup();await f.open();await f.c.ownerMigrationApply();const operation=f.c.getSnapshot().ownerMigration.receipt.id;f.c.dispose()
 const next=new StudioController(f.api);await next.refresh();await next.open('a');assert.equal(next.ownerMigrationNeeded(),false);assert.equal(next.getSnapshot().ownerMigration.receipt.id,operation);assert.equal(next.getSnapshot().ownerMigration.receipt.status,'applied');await next.ownerMigrationUndo();assert.equal(f.calls.findLast(call=>call.method==='ownerMigrationUndo').args.operationId,operation);next.dispose()
})
test('prepared receipts restore exact pending request identities without automatic apply or undo',async()=>{
 const f=migrationSetup(),id='saved-operation',before={tools:f.database.get('a').definition.tools,pluginBindings:f.bindings},receipt={id,agentId:'a',status:'prepared',policy:'current',sourceRevision:1,permissionHash:'original-hash',catalogHash:'original-catalog',before,after:before}
 f.receipts.set(id,{receipt});await f.open();let state=f.c.getSnapshot().ownerMigration
 assert.deepEqual(state.pendingApply,{id:'a',revision:1,cwd:'/workspace',policy:'current',permissionHash:'original-hash',catalogHash:'original-catalog',operationId:id});assert.equal(f.calls.some(call=>call.method==='ownerMigrationApply'),false)
 f.receipts.set(id,{receipt:{...receipt,status:'undo-prepared',undoOperationId:'saved-undo'}});f.c.tabs.clear();await f.c.reload();state=f.c.getSnapshot().ownerMigration;assert.equal(state.pendingUndo.undoOperationId,'saved-undo');assert.equal(state.pendingUndo.operationId,id);assert.equal(f.calls.some(call=>call.method==='ownerMigrationUndo'),false);f.c.dispose()
})
test('a definitive migration conflict clears local retry state and requires another explicit preview',async()=>{
 const f=migrationSetup();await f.open();f.failApply(Object.assign(Error('catalog changed'),{code:'MIGRATION_PREVIEW_CHANGED'}));await assert.rejects(f.c.ownerMigrationApply(),/catalog changed/)
 const state=f.c.getSnapshot().ownerMigration;assert.equal(state.pendingApply,null);assert.equal(state.preview,null);assert.match(state.error,/不会自动更换/);assert.equal(f.calls.filter(call=>call.method==='ownerMigrationApply').length,1);await assert.rejects(f.c.ownerMigrationApply(),/先读取/);f.c.dispose()
})
test('a restored pending request cannot target a different Agent and a mismatched operation receipt is not accepted',async()=>{
 const f=migrationSetup();await f.open();const c=f.c,state=c.getSnapshot().ownerMigration,request={id:'b',revision:1,cwd:'/workspace',policy:'saved',permissionHash:'saved-permissions',catalogHash:'current-catalog',operationId:'foreign'}
 c.publish({ownerMigration:{...state,pendingApply:request}});await assert.rejects(c.ownerMigrationApply(),/身份不匹配/);assert.equal(f.calls.some(call=>call.method==='ownerMigrationApply'),false)
 await c.ownerMigrationPreview();const submitted=c.getSnapshot(),docBefore=structuredClone(submitted.document)
 await assert.rejects(c.acceptOwnerMigration({document:{...docBefore,revision:2},receipt:{id:'another-operation',agentId:'a',status:'applied',sourceRevision:1,policy:'saved',permissionHash:'saved-permissions',catalogHash:'current-catalog'}},submitted,{...request,id:'a',operationId:'expected'},'apply'),/回执身份/)
 assert.deepEqual(c.getSnapshot().document,docBefore);await c.ownerMigrationApply();const after=c.getSnapshot();c.publish({ownerMigration:{...after.ownerMigration,pendingUndo:{id:'b',operationId:after.ownerMigration.receipt.id,undoOperationId:'foreign-undo',cwd:'/workspace'}}});await assert.rejects(c.ownerMigrationUndo(),/身份不匹配/);assert.equal(f.calls.some(call=>call.method==='ownerMigrationUndo'),false);c.dispose()
})
test('a read-only preset regroups by Host owner on every catalog read, ignoring a selection cached by an earlier version',async()=>{
 const preset={id:'standard',revision:1,readOnly:true,definition:{...definition,name:'standard',tools:['mcp__memory__find','present']}},calls=[]
 const c=setup({readPreset:async()=>preset,catalog:async args=>{calls.push(args);return {tools:[{name:'mcp__memory__find',description:'',pluginId:'@vendor/memory'},...(args.source==='standard'?[{name:'present',description:'',pluginId:'@deepseek-ai/dsh-tool-present'}]:[])],skills:[],capabilityBindings:true}}})
 await c.open('standard');let s=c.getSnapshot()
 assert.equal(calls.at(-1).source,'standard');assert.equal(s.pluginSelection.unassigned,undefined);assert.deepEqual(s.pluginSelection['@vendor/memory'].tools,['mcp__memory__find'])
 c.publish({pluginSelection:{unassigned:{enabled:true,mode:'custom',tools:['mcp__memory__find','present']}},pluginIntentWorkspace:c.pluginWorkspace()});await c.refreshCatalog();s=c.getSnapshot()
 assert.equal(s.pluginSelection.unassigned,undefined);assert.deepEqual(s.pluginSelection['@deepseek-ai/dsh-tool-present'].tools,['present']);c.dispose()
})
test('late preset selection cannot replace later tab',async()=>{const d=deferred(),c=setup({readPreset:()=>d.promise});const first=c.open('preset');await c.open('b');d.resolve({...doc('preset'),readOnly:true});await first;assert.equal(c.getSnapshot().document.id,'b');c.dispose()})
test('same-tab history uses last selection despite reversed responses',async()=>{const a=deferred(),b=deferred(),c=setup({getRun:({id})=>id==='a'?a.promise:b.promise});const p=c.openRun('a'),q=c.openRun('b');b.resolve(run('b'));await q;a.resolve(run('a'));await p;assert.equal(c.getSnapshot().runState.run.id,'b');c.dispose()})
test('save deduplicates and retains edits made during request',async()=>{const d=deferred();let calls=0;const c=setup({save:()=>{calls++;return d.promise}});const p=c.save(),q=c.save();c.change({systemPrompt:'new'});d.resolve({...doc('a'),revision:2});await Promise.all([p,q]);assert.equal(calls,1);assert.equal(c.getSnapshot().draft.systemPrompt,'new');assert.equal(c.getSnapshot().status,'dirty');c.dispose()})
test('run refuses stale saved configuration when user edits during save',async()=>{const d=deferred();let calls=0;const c=setup({save:()=>d.promise,run:()=>{calls++;return run('r')}});c.change({systemPrompt:'first'});const p=c.run();c.change({systemPrompt:'second'});d.resolve({...doc('a'),revision:2,definition:{...definition,systemPrompt:'first'}});await assert.rejects(p,/保存期间/);assert.equal(calls,0);c.dispose()})
test('stop cancels whole manual batch, not just current dispatch',async()=>{const first=deferred();let calls=0;const c=setup({executeTool:()=>{calls++;return first.promise},stop:()=>run('r')});c.publish({runState:{run:run('r')},messages:[{id:'m',role:'assistant',text:'',origin:{runId:'r'},tools:[{id:'t1',name:'write',arguments:'{}'},{id:'t2',name:'write',arguments:'{}'}]}]});const p=c.execute('m',['t1','t2']);await c.stop();first.resolve({status:'interrupted'});await p;assert.equal(calls,1);assert.deepEqual(c.getSnapshot().executingToolIds,[]);c.dispose()})
test('prompt cancellation before start reply still stops remote job',async()=>{const d=deferred();let stopped;const c=setup({prompt:()=>d.promise,stopPrompt:({id})=>{stopped=id;return {candidate:'',status:'cancelled'}}});const start=c.prompt({id:'client-id',model:{provider:'test',model:'test'},original:'',instruction:'draft'});const stop=c.promptStop('client-id');d.resolve({id:'server-id',candidate:'',status:'running'});await Promise.all([start,stop]);assert.equal(stopped,'server-id');c.dispose()})

test('reopened tab edits and undo work with the official immutable store',async()=>{const c=setup();c.edit([{id:'m',role:'user',text:'first'}]);await c.open('b');await c.open('a');c.edit([{id:'m',role:'user',text:'second'}]);c.undoMessages();assert.equal(c.getSnapshot().messages[0].text,'first');c.redoMessages();assert.equal(c.getSnapshot().messages[0].text,'second');c.dispose()})


function pluginSetup({capabilityBindings=false}={}) {
 const database = new Map([['a', { ...doc('a'), definition: { ...definition, tools: ['read'], skills: [] } }]])
 const values = new Map(), storage = { getItem: k => values.get(k), setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) }
 const choices = new PluginChoiceStore({ storage: () => storage, origin: () => 'test-origin' })
 let catalog = [{ name:'read',description:'Read files',...(capabilityBindings?{pluginId:'@deepseek-ai/dsh-tool-fs'}:{}) }], calls = [], nextSave
 const api = async (method,args) => {
  calls.push({method,args})
  if(method==='bootstrap')return {agents:[...database.values()],presets:[],cwd:'/workspace',...(capabilityBindings?{capabilityBindings:true}:{})}
  if(method==='models')return []
  if(method==='catalog')return {tools:catalog,skills:[],...(capabilityBindings?{capabilityBindings:true}:{})}
  if(method==='history')return {runs:[],evaluations:[]}
  if(method==='save'){
   Definition.parse(args.definition)
   if(nextSave){const value=nextSave;nextSave=null;await value.promise}
   const current=database.get(args.id)
   if(current.revision!==args.revision)throw Error('revision conflict')
   const savedDefinition=structuredClone(args.definition)
   if(capabilityBindings&&savedDefinition.pluginBindings!==undefined){
    const resolved=savedDefinition.tools.filter(name=>name.startsWith('openconnector/'))
    for(const [id,choice] of Object.entries(savedDefinition.pluginBindings))if(choice.enabled){
     const selected=choice.mode==='all'&&id!=='unassigned'?catalog.filter(row=>row.pluginId===id).map(row=>row.id||row.name):choice.tools
     choice.tools=[...new Set(selected)];resolved.push(...selected)
    }
    savedDefinition.tools=[...new Set(resolved)]
   }
   const saved={...current,revision:current.revision+1,definition:savedDefinition}
   database.set(args.id,saved);return saved
  }
  if(method==='copy'){const current=database.get(args.id),saved={...structuredClone(current),id:'copy',revision:1};database.set('copy',saved);return saved}
  if(method==='delete'){database.delete(args.id);return}
  throw Error(method)
 }
 const make=(options={})=>new StudioController(api,{choiceStore:choices,...options})
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
 assert.equal(f.calls.find(x=>x.method==='save').args.cwd,'/workspace')
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
 assert.equal(f.calls.filter(call=>call.method==='save').at(-1).args.cwd,'/workspace')
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

test('new Host persists plugin intent on explicit save and a separate client restores it without browser sidecars',async()=>{
 const f=pluginSetup({capabilityBindings:true}),c=await opened(f)
 assert.equal(c.getSnapshot().capabilityBindings,true)
 assert.equal(c.getSnapshot().pluginSelection[fsId].mode,'custom')
 assert.equal(c.getSnapshot().status,'saved')
 assert.equal(Object.hasOwn(c.getSnapshot().draft,'pluginBindings'),false)
 wholeFiles(c);await c.save()
 const payload=f.calls.find(call=>call.method==='save').args.definition
 assert.equal(payload.pluginBindings[fsId].mode,'all')
 assert.equal(f.database.get('a').definition.pluginBindings[fsId].mode,'all')
 const broken=new PluginChoiceStore({storage:()=>({getItem:()=>null,setItem(){throw Error('quota')}})})
 const other=f.make({choiceStore:broken});await other.refresh();await other.open('a')
 assert.equal(other.getSnapshot().pluginSelection[fsId].mode,'all')
 await other.save();assert.equal(other.getSnapshot().pluginStorageWarning,false)
 c.dispose();other.dispose()
})

test('server bindings outrank a same-revision browser sidecar and later server edits replace a saved cached tab',async()=>{
 const f=pluginSetup({capabilityBindings:true}),original=f.database.get('a')
 f.choices.write(original,'/workspace',{[fsId]:{enabled:true,mode:'all',tools:['read']}})
 original.definition={...original.definition,pluginBindings:{[fsId]:{enabled:true,mode:'custom',tools:['read']}}}
 const c=await opened(f)
 assert.equal(c.getSnapshot().pluginSelection[fsId].mode,'custom')
 const newer={...original,revision:2,definition:{...original.definition,pluginBindings:{[fsId]:{enabled:true,mode:'all',tools:['read']}}}}
 f.database.set('a',newer)
 await c.refresh();await c.open('a')
 assert.equal(c.getSnapshot().document.revision,2)
 assert.equal(c.getSnapshot().pluginSelection[fsId].mode,'all')
 const other=await opened(f);assert.equal(other.getSnapshot().pluginSelection[fsId].mode,'all')
 c.dispose();other.dispose()
})

test('a valid frontend sidecar migrates only when the user saves on the new Host',async()=>{
 const f=pluginSetup({capabilityBindings:true})
 f.choices.write(f.database.get('a'),'/workspace',{[fsId]:{enabled:true,mode:'all',tools:['read']}})
 const c=await opened(f);assert.equal(c.getSnapshot().pluginSelection[fsId].mode,'all')
 await c.refreshCatalog()
 assert.equal(f.calls.some(call=>call.method==='save'),false)
 assert.equal(f.database.get('a').definition.pluginBindings,undefined)
 await c.save()
 assert.equal(f.database.get('a').definition.pluginBindings[fsId].mode,'all')
 c.dispose()
})

test('new authoritative registrations refresh an all-mode draft without writes or model execution',async()=>{
 const id='research-plugin',f=pluginSetup({capabilityBindings:true}),d=f.database.get('a')
 d.definition={...d.definition,tools:['lookup_a'],pluginBindings:{[id]:{enabled:true,mode:'all',tools:['lookup_a']}}}
 f.setCatalog([{name:'lookup_a',description:'Lookup A',pluginId:id,pluginVersion:'1.0.0'}])
 const c=await opened(f)
 f.setCatalog([{name:'lookup_a',description:'Lookup A',pluginId:id,pluginVersion:'1.1.0'},{name:'find_b',description:'Find B',pluginId:id,pluginVersion:'1.1.0'}])
 await c.refreshCatalog()
 assert.deepEqual(c.getSnapshot().draft.tools,['lookup_a','find_b'])
 assert.equal(c.getSnapshot().pluginSelection[id].mode,'all')
 assert.equal(c.getSnapshot().status,'dirty')
 assert.equal(f.calls.some(call=>['save','run','conversation'].includes(call.method)),false)
 await c.save()
 assert.deepEqual(c.getSnapshot().draft.pluginBindings[id].tools,['lookup_a','find_b'])
 assert.equal(c.getSnapshot().status,'saved')
 c.dispose()
})

test('save merges server-expanded tools while retaining a concurrent prompt edit',async()=>{
 const f=pluginSetup({capabilityBindings:true}),d=f.database.get('a')
 d.definition={...d.definition,pluginBindings:{[fsId]:{enabled:true,mode:'all',tools:['read']}}}
 const c=await opened(f),pending=deferred();f.delaySave(pending);const saving=c.save()
 c.change({systemPrompt:'concurrent prompt'})
 f.setCatalog([{name:'read',description:'',pluginId:fsId},{name:'write',description:'',pluginId:fsId}])
 pending.resolve();await saving
 assert.equal(c.getSnapshot().draft.systemPrompt,'concurrent prompt')
 assert.deepEqual(c.getSnapshot().draft.tools,['read','write'])
 assert.equal(c.getSnapshot().draft.pluginBindings[fsId].mode,'all')
 assert.equal(c.getSnapshot().status,'dirty')
 c.dispose()
})

test('a mode edit during save remains exact even when the server response expands the previous all mode',async()=>{
 const f=pluginSetup({capabilityBindings:true}),d=f.database.get('a')
 d.definition={...d.definition,pluginBindings:{[fsId]:{enabled:true,mode:'all',tools:['read']}}}
 const c=await opened(f),pending=deferred();f.delaySave(pending);const saving=c.save()
 c.changePlugins(setPluginMode(c.getSnapshot().pluginSelection,c.pluginCatalog().find(plugin=>plugin.id===fsId),'custom'))
 f.setCatalog([{name:'read',description:'',pluginId:fsId},{name:'write',description:'',pluginId:fsId}])
 pending.resolve();await saving
 assert.deepEqual(c.getSnapshot().document.definition.tools,['read','write'])
 assert.equal(c.getSnapshot().document.definition.pluginBindings[fsId].mode,'all')
 assert.deepEqual(c.getSnapshot().draft.tools,['read'])
 assert.equal(c.getSnapshot().pluginSelection[fsId].mode,'custom')
 assert.equal(c.getSnapshot().draft.pluginBindings[fsId].mode,'custom')
 assert.equal(c.getSnapshot().status,'dirty')
 c.dispose()
})

test('catalog reconciliation accepts a newer server configuration when there are no local edits',async()=>{
 const f=pluginSetup({capabilityBindings:true}),old=f.database.get('a')
 old.definition={...old.definition,pluginBindings:{[fsId]:{enabled:true,mode:'all',tools:['read']}}}
 const c=await opened(f)
 f.database.set('a',{...old,revision:2,definition:{...old.definition,tools:['write'],pluginBindings:{[fsId]:{enabled:true,mode:'custom',tools:['write']}}}})
 f.setCatalog([{name:'read',description:'',pluginId:fsId},{name:'write',description:'',pluginId:fsId}])
 await c.refresh();await c.refreshCatalog()
 assert.equal(c.getSnapshot().document.revision,2)
 assert.deepEqual(c.getSnapshot().draft.tools,['write'])
 assert.equal(c.getSnapshot().pluginSelection[fsId].mode,'custom')
 assert.equal(c.getSnapshot().status,'saved')
 c.dispose()
})

test('a newer server binding does not merge or replace an unsaved local exact scope',async()=>{
 const f=pluginSetup({capabilityBindings:true}),old=f.database.get('a')
 old.definition={...old.definition,pluginBindings:{[fsId]:{enabled:true,mode:'all',tools:['read']}}}
 const c=await opened(f)
 c.changePlugins(setPluginMode(c.getSnapshot().pluginSelection,c.pluginCatalog().find(plugin=>plugin.id===fsId),'custom'))
 f.database.set('a',{...old,revision:2,definition:{...old.definition,tools:['write'],pluginBindings:{[fsId]:{enabled:true,mode:'custom',tools:['write']}}}})
 f.setCatalog([{name:'read',description:'',pluginId:fsId},{name:'write',description:'',pluginId:fsId}])
 await c.refresh();await c.refreshCatalog()
 assert.deepEqual(c.getSnapshot().draft.tools,['read'])
 assert.equal(c.getSnapshot().document.revision,1)
 assert.equal(c.getSnapshot().status,'conflict')
 assert.equal(c.getSnapshot().pluginSelection[fsId].mode,'custom')
 await assert.rejects(c.save(),/revision conflict/)
 c.dispose()
})

test('prompt generation sends the currently selected work directory for capability and Skill validation',async()=>{
 let received
 const c=setup({prompt:args=>{received=args;return {id:'prompt-id',candidate:'candidate'}}})
 c.publish({cwd:'/selected-project'})
 await c.prompt({id:'local-id',model:{provider:'test',model:'test'},original:'old',instruction:'improve'})
 assert.equal(received.cwd,'/selected-project')
 c.dispose()
})
