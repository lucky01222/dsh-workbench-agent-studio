import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { PromptController } from './prompt-controller.ts'
import { ConnectorController } from './connector-controller.ts'
import { buildPluginCatalog, clonePluginSelection, selectionFromTools, flattenPluginSelection, isUnifiedLibraryCatalog, hasLegacyLibraryBindings } from './plugin-capabilities.mjs'
import { PluginChoiceStore, samePluginSelection, samePluginBaseline } from './plugin-choice-store.mjs'
const clone=v=>structuredClone(v), uid=()=>crypto.randomUUID(), blank=()=>[{id:uid(),role:'user',text:''}]
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value
/** Tool allowlists are sets; object insertion order is not an editor change.
 * Keep skills and all other arrays ordered, and preserve exact prompt/model values. */
const definitionKey=definition=>{if(!definition)return JSON.stringify(definition);const value={...definition};if(Array.isArray(value.tools))value.tools=[...value.tools].sort();if(value.pluginBindings!==undefined)value.pluginBindings=Object.fromEntries(Object.entries(value.pluginBindings).map(([id,choice])=>[id,{...choice,...Array.isArray(choice.tools)?{tools:[...choice.tools].sort()}:{}}]));return JSON.stringify(canonical(value))}
const sameDefinition=(left,right)=>definitionKey(left)===definitionKey(right)
const migrationState=(policy='saved')=>({status:'idle',policy,preview:null,receipt:null,error:null,pendingApply:null,pendingUndo:null})
const migrationConflicts=new Set(['REVISION_CONFLICT','MIGRATION_PREVIEW_CHANGED','MIGRATION_BLOCKED','UNDO_PERMISSION_CONFLICT','OPERATION_CONFLICT','AGENT_DELETED','READ_ONLY','COMPOSITION_REVIEW_REQUIRED','FROZEN_DEFINITION','MIGRATION_PENDING','MIGRATION_UNDONE','MIGRATION_UNDO_PENDING'])
const permissionKey=definition=>JSON.stringify({tools:[...new Set(definition?.tools||[])].sort(),bindings:definition?.pluginBindings===undefined?null:Object.entries(clonePluginSelection(definition.pluginBindings)).sort(([a],[b])=>a.localeCompare(b)).map(([id,b])=>[id,b.enabled,b.mode,[...b.tools].sort()])})
function migrationPreviewState(preview,prior,cwd){
 const receipt=preview.receipt?.agentId===preview.id?clone(preview.receipt):prior.receipt?.agentId===preview.id?prior.receipt:null
 const pendingApply=receipt?.status==='prepared'&&Number.isSafeInteger(receipt.sourceRevision)&&typeof receipt.permissionHash==='string'&&typeof receipt.catalogHash==='string'&&['saved','current'].includes(receipt.policy)?{id:preview.id,revision:receipt.sourceRevision,cwd,policy:receipt.policy,permissionHash:receipt.permissionHash,catalogHash:receipt.catalogHash,operationId:receipt.id}:null
 const pendingUndo=receipt?.status==='undo-prepared'&&typeof receipt.undoOperationId==='string'?{id:preview.id,operationId:receipt.id,undoOperationId:receipt.undoOperationId,cwd}:null
 return {...prior,status:'idle',policy:pendingApply?.policy||preview.policy,preview:pendingApply||pendingUndo?null:{...preview,cwd},receipt,pendingApply,pendingUndo,error:null,needsReceiptRefresh:false}
}
const initial=()=>({roster:{authorable:true,presets:[]},models:null,document:null,draft:null,status:'saved',busy:false,loading:true,error:null,cwd:'',catalog:null,catalogLoading:false,capabilityBindings:false,pluginSelection:null,pluginSavedSelection:null,pluginBaseline:null,pluginIntentWorkspace:null,pluginIntentSource:null,pluginSelectionEdited:false,pluginDirectory:null,pluginDirectoryError:null,pluginStorageWarning:false,ownerMigration:null,openIds:[],contexts:[],contextKey:'',settings:{reactLoop:false,autoTools:false},messages:blank(),output:[],executingToolIds:[],runs:[],evaluations:[],results:{},input:'',inputMessages:[],undoable:false,redoable:false,sessionReadyId:null})
export class StudioController {
 constructor(api,{choiceStore=new PluginChoiceStore(),pluginDirectoryProvider=null}={}){this.api=api;this.choiceStore=choiceStore;this.pluginDirectoryProvider=pluginDirectoryProvider;this.store=createSnapshotStore(initial());this.tabs=new Map();this.undo=[];this.redo=[];this.alive=true;this.pollGeneration=0;this.selectionGeneration=0;this.busyCount=0;this.catalogGeneration=0;this.recordsGeneration=0;this.runLoadGeneration=0;this.manualGeneration=0;this.saving=new Map();this.pendingPrompts=new Map();this.records=createSnapshotStore({query:{},page:{items:[]},loading:false,error:null,detail:null});this.writer=new PromptController(this,{start:r=>this.prompt(r),get:id=>this.promptGet(id),stop:id=>this.promptStop(id)});this.connector=new ConnectorController(Object.fromEntries(['status','providers','actions','refresh','restart','select','console'].map(method=>[method,args=>api('connector'+method[0].toUpperCase()+method.slice(1),args??{})])))}
 getSnapshot=()=>this.store.getSnapshot()
 subscribe=fn=>this.store.subscribe(fn)
 publish(patch){if(!this.alive)return;this.store.set({...this.getSnapshot(),...patch});this.persist()}
 async guard(task,{busy=true}={}){if(busy){this.busyCount++;this.publish({busy:true,error:null})}const epoch=this.selectionGeneration;try{return await task()}catch(e){if(epoch===this.selectionGeneration)this.publish({error:e.message});throw e}finally{if(busy){this.busyCount--;this.publish({busy:this.busyCount>0})}}}
 capture(){const s=this.getSnapshot();return {document:s.document,draft:s.draft,cwd:s.cwd,messages:s.messages,runState:s.runState,settings:s.settings,status:s.status,runs:s.runs,evaluations:s.evaluations,results:s.results,catalog:s.catalog,pluginSelection:s.pluginSelection,pluginSavedSelection:s.pluginSavedSelection,pluginBaseline:s.pluginBaseline,pluginIntentWorkspace:s.pluginIntentWorkspace,pluginIntentSource:s.pluginIntentSource,pluginSelectionEdited:s.pluginSelectionEdited,pluginStorageWarning:s.pluginStorageWarning,ownerMigration:s.ownerMigration,undo:this.undo,redo:this.redo}}
 persist(){if(!this.restored)return;const s=this.getSnapshot();if(s.document)this.tabs.set(s.document.agentPreset,this.capture());try{localStorage.setItem('wb-studio-workspace-v2',JSON.stringify({active:s.document?.agentPreset,openIds:s.openIds,tabs:[...this.tabs]}))}catch{/* Explicitly saved documents remain on Host; local draft is best-effort. */}}
 async refresh(){const boot=await this.api('bootstrap');const models=await this.api('models');this.documents=boot.agents;this.workspace=boot.cwd;this.publish({roster:{authorable:true,presets:[...boot.agents.map(d=>({id:d.id,name:d.definition.name,description:d.definition.description,managed:true})),...boot.presets.map(p=>({...p,builtIn:true}))]},models:{groups:models,default:boot.defaultModel},cwd:this.getSnapshot().cwd||boot.cwd,capabilityBindings:boot.capabilityBindings===true||(boot.capabilityBindings===undefined&&this.getSnapshot().capabilityBindings)});return boot}
 async initialize(){await this.guard(async()=>{await this.refresh();try{const saved=JSON.parse(localStorage.getItem('wb-studio-workspace-v2')||'null');if(saved){this.tabs=new Map(saved.tabs);this.publish({openIds:saved.openIds});this.restored=true;if(saved.active&&this.tabs.has(saved.active))await this.open(saved.active)}else{const legacy=JSON.parse(localStorage.getItem('wb-studio-draft')||'null');this.restored=true;if(legacy?.doc){await this.open(legacy.doc.id);this.publish({draft:legacy.draft,messages:legacy.messages||blank(),settings:{reactLoop:legacy.mode==='react',autoTools:legacy.mode==='tool-batch'},status:sameDefinition(legacy.draft,legacy.doc.definition)?'saved':'dirty'})}}}catch(e){this.publish({error:'草稿恢复失败：'+e.message});this.restored=true}finally{this.publish({loading:false})}})}
 doc(raw,readOnly=false){return {...raw,agentPreset:raw.id,readOnly,runtime:raw.runtime||(raw.sourcePreset||readOnly?{source:raw.sourcePreset||raw.id}:undefined)}}
 async open(id){
  if(this.getSnapshot().executingToolIds.length)throw new Error('请先停止工具执行');
  this.migrationGeneration=(this.migrationGeneration||0)+1;const epoch=++this.selectionGeneration,current=this.getSnapshot();
  if(current.document)this.tabs.set(current.document.agentPreset,this.capture());
  this.pollGeneration++;clearTimeout(this.timer);let saved=this.tabs.get(id);
  const fresh=this.documents?.find(document=>document.id===id);
  if(saved&&fresh&&fresh.revision>=saved.document.revision&&saved.status==='saved'&&!samePluginBaseline(saved.document,fresh))saved=null;
  if(saved){this.undo=saved.undo||[];this.redo=saved.redo||[];this.publish({...saved,ownerMigration:saved.ownerMigration?{...saved.ownerMigration,status:'idle'}:null,output:[],toolRunState:undefined,sessionReadyId:saved.runState?.run?.sessionId||null,error:null,openIds:[...new Set([...current.openIds,id])],undoable:this.undo.length>0,redoable:this.redo.length>0});if(['running','preparing'].includes(saved.runState?.run?.status))this.poll(saved.runState.run.id,id)}
  else{const raw=this.documents.find(d=>d.id===id)||await this.api('readPreset',{id,cwd:current.cwd});if(epoch!==this.selectionGeneration||!this.alive)return;this.undo=[];this.redo=[];this.publish({document:this.doc(raw,raw.readOnly),draft:clone(raw.definition),messages:blank(),output:[],runState:undefined,toolRunState:undefined,status:'saved',error:null,runs:[],evaluations:[],catalog:null,pluginSelection:null,pluginSavedSelection:null,pluginBaseline:null,pluginIntentWorkspace:null,pluginIntentSource:null,pluginSelectionEdited:false,pluginStorageWarning:false,ownerMigration:null,openIds:[...new Set([...this.getSnapshot().openIds,id])],undoable:false,redoable:false})}
  await Promise.all([this.refreshCatalog(),this.history()]);
 }
 close(id){if(this.getSnapshot().busy||this.getSnapshot().executingToolIds.length)return;const s=this.getSnapshot();this.tabs.set(s.document?.agentPreset,this.capture());const ids=s.openIds.filter(x=>x!==id);this.publish({openIds:ids});if(s.document?.agentPreset===id){if(ids.length)void this.open(ids.at(-1));else {this.selectionGeneration++;this.pollGeneration++;this.publish({document:null,draft:null,pluginSelection:null,pluginSavedSelection:null,pluginBaseline:null,pluginIntentWorkspace:null,runState:undefined})}}}
 pluginWorkspace(){return this.workspace||this.getSnapshot().cwd||''}
 pluginCatalog(snapshot=this.getSnapshot()){
  const rows=[...(snapshot.catalog?.tools||[])],ids=new Set(rows.map(row=>row.id||row.name));
  const recorded=snapshot.pluginSelection||snapshot.draft?.pluginBindings||snapshot.document?.definition.pluginBindings;
  const owners=new Map(Object.entries(recorded||{}).flatMap(([id,choice])=>choice.tools.map(name=>[name,id])));
  for(const name of snapshot.draft?.tools||[])if(!name.startsWith('openconnector/')&&!ids.has(name)){const owner=owners.get(name);rows.push({name,id:name,description:'',unavailable:'当前运行位置不可用',...(snapshot.capabilityBindings?{pluginId:owner&&owner!=='unassigned'?owner:null}:{})});ids.add(name)}
  return buildPluginCatalog(rows,{installedBundles:snapshot.pluginDirectory?.bundles||[],unavailable:snapshot.catalog?.unavailable||[],capabilityBindings:snapshot.capabilityBindings,selection:recorded})
 }
 pluginDocumentBaseline(document){return document?{id:document.id,revision:document.revision,definition:{tools:[...document.definition.tools],...(document.definition.pluginBindings!==undefined?{pluginBindings:clonePluginSelection(document.definition.pluginBindings)}:{})}}:null}
 configurationStatus(draft,selection,savedSelection,document=this.getSnapshot().document){return sameDefinition(draft,document?.definition)&&samePluginSelection(selection,savedSelection)?'saved':'dirty'}
 invalidateOwnerMigration(){this.migrationGeneration=(this.migrationGeneration||0)+1;const state=this.getSnapshot().ownerMigration;return state&&!state.pendingApply&&!state.pendingUndo?{...state,status:'idle',preview:null,error:null}:state}
 reconcilePlugins(snapshot=this.getSnapshot()){
  if(!snapshot.document||!snapshot.draft)return {};
  const candidate=this.documents?.find(doc=>doc.id===snapshot.document.id);
  const server=candidate&&candidate.revision>=snapshot.document.revision?candidate:snapshot.document;
  const stale=!samePluginBaseline(snapshot.document,server),acceptServer=stale&&snapshot.status==='saved';
  const conflict=stale&&!acceptServer;
  const document=acceptServer?this.doc(server):snapshot.document;
  const source=acceptServer?{...snapshot,document,draft:clone(server.definition),pluginSelection:null,pluginSelectionEdited:false}:snapshot;
  const catalog=this.pluginCatalog(source);
  const workspace=this.pluginWorkspace(),crossWorkspace=snapshot.pluginIntentWorkspace&&snapshot.pluginIntentWorkspace!==workspace;
  const sourceDraft=crossWorkspace?{...source.draft,tools:[...server.definition.tools],skills:[...server.definition.skills]}:source.draft;
  const stored=this.choiceStore.read(server,workspace);
  const serverBindings=snapshot.capabilityBindings?server.definition.pluginBindings:undefined;
  const current=source.pluginSelection&&snapshot.pluginIntentWorkspace===workspace&&(samePluginBaseline(snapshot.pluginBaseline,server)||conflict&&snapshot.pluginSelectionEdited)
   &&(serverBindings===undefined||snapshot.pluginIntentSource==='server'||snapshot.pluginSelectionEdited)?source.pluginSelection:null;
  const saved=selectionFromTools(server.definition.tools,catalog,serverBindings!==undefined?serverBindings:stored);
  const selection=selectionFromTools(sourceDraft.tools,catalog,current||serverBindings||stored);
  const external=sourceDraft.tools.filter(name=>name.startsWith('openconnector/'));
  const tools=flattenPluginSelection(selection,catalog),draft=document.readOnly?sourceDraft:{...sourceDraft,tools:[...new Set([...tools,...external])]};
  if(!document.readOnly&&!draft.tools.includes('skill')&&draft.skills.length)draft.skills=[];
  return {document,pluginSelection:selection,pluginSavedSelection:saved,pluginBaseline:this.pluginDocumentBaseline(conflict?document:server),pluginIntentWorkspace:workspace,
   pluginIntentSource:serverBindings!==undefined?'server':current?snapshot.pluginIntentSource:stored?'browser':'legacy',draft,
   ...(acceptServer?{pluginSelectionEdited:false}:{}),
   status:conflict?'conflict':['conflict','saving','error'].includes(snapshot.status)?snapshot.status:this.configurationStatus(draft,selection,saved,document)}
 }
 change=patch=>{
  const s=this.getSnapshot();if(s.document?.readOnly)return;const draft={...s.draft,...patch};
  if(patch.skills?.length)draft.tools=[...new Set([...draft.tools,'skill'])];if(patch.tools&&!draft.tools.includes('skill'))draft.skills=[];
  let selection=s.pluginSelection;
  if(patch.tools||patch.skills){const catalog=this.pluginCatalog({...s,draft}),next=selectionFromTools(draft.tools,catalog);
   for(const [id,choice] of Object.entries(selection||{})){if(!choice.enabled||choice.mode!=='all')continue;const plugin=catalog.find(p=>p.id===id);if(!plugin)continue;
    const desired=new Set(flattenPluginSelection({[id]:choice},[plugin]));const actual=plugin.tools.filter(tool=>draft.tools.includes(tool.id)).map(tool=>tool.id);
    if(desired.size===actual.length&&actual.every(name=>desired.has(name)))next[id]=clonePluginSelection({[id]:choice})[id];
   }selection=next;
  }
  if(s.capabilityBindings&&(patch.tools||patch.skills))draft.pluginBindings=clonePluginSelection(selection||{});
  this.publish({draft,pluginSelection:selection,ownerMigration:this.invalidateOwnerMigration(),pluginSelectionEdited:s.pluginSelectionEdited||!!(patch.tools||patch.skills),status:this.configurationStatus(draft,selection,s.pluginSavedSelection,s.document)})
 }
 changePlugins=selection=>{
  const s=this.getSnapshot();if(s.document?.readOnly||!s.draft)return;const catalog=this.pluginCatalog(s);
  const tools=[...new Set([...flattenPluginSelection(selection,catalog),...s.draft.tools.filter(name=>name.startsWith('openconnector/'))])];
  const draft={...s.draft,tools,...(!tools.includes('skill')?{skills:[]}:{})};
  if(s.capabilityBindings)draft.pluginBindings=clonePluginSelection(selection);
  const next=clonePluginSelection(selection);this.publish({draft,pluginSelection:next,ownerMigration:this.invalidateOwnerMigration(),pluginSelectionEdited:true,status:this.configurationStatus(draft,next,s.pluginSavedSelection,s.document)})
 }
 ownerMigrationNeeded(snapshot=this.getSnapshot()){
  return !!snapshot.document&&!snapshot.document.readOnly&&isUnifiedLibraryCatalog(snapshot.catalog?.tools||[])&&hasLegacyLibraryBindings(snapshot.document.definition.pluginBindings||{})
 }
 ownerMigrationReady(recovery=false){
  const s=this.getSnapshot();if(!s.document||s.document.readOnly||s.document.deleted)throw new Error('只读或已删除 Agent 不能迁移。')
  if(s.status!=='saved'&&!recovery)throw new Error('请先保存或放弃当前修改，再核对工具归属。')
  if(s.executingToolIds.length||['running','preparing'].includes(s.runState?.run?.status))throw new Error('请先停止当前试运行，再核对工具归属。')
  return s
 }
 async ownerMigrationPreview(policy='saved'){
  if(!['saved','current'].includes(policy))throw new Error('迁移范围不正确。')
  if(this.getSnapshot().ownerMigration?.needsReceiptRefresh)return this.reloadOwnerMigrationReceipt(this.getSnapshot())
  const s=this.ownerMigrationReady(),prior=s.ownerMigration||migrationState();if(prior.pendingApply||prior.pendingUndo)throw new Error('上次提交结果尚未核对，请先重试原操作。')
  const generation=this.migrationGeneration=(this.migrationGeneration||0)+1,selection=this.selectionGeneration,request={id:s.document.id,revision:s.document.revision,cwd:s.cwd,policy}
  this.publish({ownerMigration:{...prior,status:'previewing',policy,preview:null,error:null}})
  try{
   const preview=await this.api('ownerMigrationPreview',request)
   if(!this.alive||generation!==this.migrationGeneration||selection!==this.selectionGeneration||this.getSnapshot().document?.id!==request.id)return preview
   const current=this.getSnapshot();if(current.document.revision!==request.revision||current.status!=='saved')throw new Error('配置已变化，请保存后重新预览。')
   if(preview?.version!==1||preview.id!==request.id||preview.revision!==request.revision||preview.policy!==policy||!['ready','not-needed','blocked'].includes(preview.status))throw new Error('迁移预览身份无法核对，请重新读取。')
   this.publish({ownerMigration:migrationPreviewState(preview,prior,request.cwd)});return preview
  }catch(error){if(this.alive&&generation===this.migrationGeneration&&selection===this.selectionGeneration)this.publish({ownerMigration:{...prior,status:'idle',policy,preview:null,error:error.message}});throw error}
 }
 async acceptOwnerMigration(result,submitted,request,kind){
  const r=result?.receipt
  if(!result?.document||result.document.id!==submitted.document.id||result.document.id!==request.id||!Number.isSafeInteger(result.document.revision)||result.document.revision<1||r?.agentId!==request.id||r.id!==request.operationId||r.status!==(kind==='apply'?'applied':'undone')||(kind==='undo'?r.undoOperationId!==request.undoOperationId:r.sourceRevision!==request.revision||r.policy!==request.policy||r.permissionHash!==request.permissionHash||r.catalogHash!==request.catalogHash))throw new Error('迁移回执身份无法核对，请沿用原操作重试。')
  this.adoptOwnerMigrationDocument(result.document,{...migrationState(),receipt:clone(result.receipt)},submitted)
  await this.refresh();if(this.getSnapshot().document?.id===result.document.id)await this.refreshCatalog()
  return result
 }
 adoptOwnerMigrationDocument(raw,ownerMigration,submitted){
  const doc=this.doc(raw)
  const update=local=>{
   const clean=local.status==='saved'&&sameDefinition(local.draft,submitted.draft)&&local.document?.revision===submitted.document.revision
   if(local.document?.revision>doc.revision)return {...local,ownerMigration}
   const saved=clonePluginSelection(raw.definition.pluginBindings||{})
   const samePermissions=permissionKey(local.draft)===permissionKey(submitted.document.definition)
   let draft=local.draft
   if(samePermissions){const {pluginBindings:_old,...rest}=local.draft;draft=clean?clone(raw.definition):{...rest,tools:[...raw.definition.tools],...(raw.definition.pluginBindings!==undefined?{pluginBindings:clonePluginSelection(raw.definition.pluginBindings)}:{})}}
   return {...local,document:doc,draft,...samePermissions?{pluginSelection:saved,pluginSelectionEdited:false}:{},pluginSavedSelection:saved,pluginBaseline:this.pluginDocumentBaseline(doc),pluginIntentSource:'server',ownerMigration,status:samePermissions?this.configurationStatus(draft,saved,saved,doc):'conflict'}
  }
  this.documents=(this.documents||[]).map(d=>d.id===doc.id&&d.revision<=doc.revision?raw:d)
  if(this.getSnapshot().document?.id===doc.id)this.publish(update(this.getSnapshot()))
  else{const tab=this.tabs.get(doc.id);if(tab)this.tabs.set(doc.id,update(tab))}
 }
 async reloadOwnerMigrationReceipt(submitted,message){
  const id=submitted.document?.id,selection=this.selectionGeneration
  try{
   await this.refresh();const raw=this.documents?.find(doc=>doc.id===id&&!doc.deleted)
   if(!raw)throw new Error('当前 Agent 已不可用，未改动本地草稿。')
   const preview=await this.api('ownerMigrationPreview',{id,revision:raw.revision,cwd:submitted.cwd,policy:'saved'})
   if(!this.alive||this.selectionGeneration!==selection||this.getSnapshot().document?.id!==id)return preview
   if(preview?.version!==1||preview.id!==id||preview.revision!==raw.revision)throw new Error('当前迁移记录无法核对，请重新读取。')
   const state=migrationPreviewState(preview,migrationState(),submitted.cwd);state.preview=null;state.error=message||null
   this.adoptOwnerMigrationDocument(raw,state,submitted);return preview
  }catch(error){if(this.alive&&this.selectionGeneration===selection&&this.getSnapshot().document?.id===id)this.publish({ownerMigration:{...migrationState(),needsReceiptRefresh:true,error:[message,error.message].filter(Boolean).join('；')}});throw error}
 }
 async ownerMigrationApply(){
  if(this.migrationMutation)return this.migrationMutation
  const s=this.ownerMigrationReady(!!this.getSnapshot().ownerMigration?.pendingApply),state=s.ownerMigration||migrationState(),preview=state.preview
  const request=state.pendingApply||(()=>{if(preview?.status!=='ready'||preview.id!==s.document.id||preview.revision!==s.document.revision||preview.cwd!==s.cwd)throw new Error('请先读取当前配置的迁移预览。');return {id:preview.id,revision:preview.revision,cwd:preview.cwd,policy:preview.policy,permissionHash:preview.permissionHash,catalogHash:preview.catalogHash,operationId:uid()}})()
  if(request.id!==s.document.id||state.receipt?.status==='prepared'&&(state.receipt.agentId!==s.document.id||state.receipt.id!==request.operationId)){this.publish({ownerMigration:{...migrationState(),error:'迁移请求不属于当前 Agent 或记录，请重新读取迁移记录。'}});throw new Error('迁移请求身份不匹配')}
  this.publish({ownerMigration:{...state,status:'applying',pendingApply:request,error:null}})
  this.migrationMutation=this.guard(async()=>{
   try{return await this.acceptOwnerMigration(await this.api('ownerMigrationApply',request),s,request,'apply')}
   catch(error){if(this.getSnapshot().document?.id===request.id){const readback=['MIGRATION_UNDONE','MIGRATION_UNDO_PENDING'].includes(error.code);this.publish({ownerMigration:{...state,status:'idle',pendingApply:migrationConflicts.has(error.code)?null:request,...migrationConflicts.has(error.code)?{preview:null}:{},needsReceiptRefresh:readback,error:migrationConflicts.has(error.code)?error.message+'；请核对迁移记录并重新预览，系统不会自动更换操作标识提交。':error.message}});if(readback)await this.reloadOwnerMigrationReceipt(s,error.message).catch(()=>{})}throw error}
  }).finally(()=>{this.migrationMutation=null});return this.migrationMutation
 }
 async ownerMigrationUndo(){
  if(this.migrationMutation)return this.migrationMutation
  const s=this.ownerMigrationReady(!!this.getSnapshot().ownerMigration?.pendingUndo),state=s.ownerMigration||migrationState(),receipt=state.receipt
  if(!['applied','undo-prepared'].includes(receipt?.status)||receipt.agentId!==s.document.id)throw new Error('没有可撤销的当前迁移回执。')
  const request=state.pendingUndo||{id:s.document.id,operationId:receipt.id,undoOperationId:uid(),cwd:s.cwd}
  if(request.id!==s.document.id||request.operationId!==receipt.id||receipt.status==='undo-prepared'&&request.undoOperationId!==receipt.undoOperationId){this.publish({ownerMigration:{...migrationState(),receipt,error:'撤销请求不属于当前 Agent 或记录，请重新读取迁移记录。'}});throw new Error('迁移撤销请求身份不匹配')}
  this.publish({ownerMigration:{...state,status:'undoing',pendingUndo:request,error:null}})
  this.migrationMutation=this.guard(async()=>{
   try{return await this.acceptOwnerMigration(await this.api('ownerMigrationUndo',request),s,request,'undo')}
   catch(error){if(this.getSnapshot().document?.id===request.id)this.publish({ownerMigration:{...state,status:'idle',pendingUndo:migrationConflicts.has(error.code)?null:request,error:migrationConflicts.has(error.code)?error.message+'；请核对迁移记录，系统不会自动更换操作标识撤销。':error.message}});throw error}
  }).finally(()=>{this.migrationMutation=null});return this.migrationMutation
 }
 async create(name){return this.guard(async()=>{const d=await this.api('create',{name});await this.refresh();await this.open(d.id)})}
 async save(){const id=this.getSnapshot().document.id;if(this.saving.has(id))return this.saving.get(id);const task=this.saveDocument().finally(()=>this.saving.delete(id));this.saving.set(id,task);return task}
 async saveDocument(){
  const s=this.getSnapshot(),epoch=this.selectionGeneration;if(s.document.readOnly)return s.document;this.publish({status:'saving'});
  const submitted=clonePluginSelection(s.pluginSelection||selectionFromTools(s.draft.tools,this.pluginCatalog(s),s.draft.pluginBindings));
  const {pluginBindings:ignored,...legacyDefinition}=s.draft;
  const definition=s.capabilityBindings?{...s.draft,pluginBindings:submitted}:legacyDefinition;
  const workspace=this.pluginWorkspace();
  try{const raw=await this.api('save',{id:s.document.id,revision:s.document.revision,cwd:s.cwd,definition});const doc=this.doc(raw);
   const authoritative=raw.definition.pluginBindings!==undefined;
   const savedSelection=authoritative?clonePluginSelection(raw.definition.pluginBindings):submitted;
   const stored=authoritative||this.choiceStore.write(doc,workspace,savedSelection);
   const merge=local=>{
    const currentSelection=local.pluginSelection||selectionFromTools(local.draft.tools,this.pluginCatalog({...s,...local}));
    const sameIntent=samePluginSelection(currentSelection,submitted);
    const changed=!sameDefinition(local.draft,s.draft)||!sameIntent;
    let draft=changed?local.draft:clone(raw.definition),selection=changed?currentSelection:savedSelection;
    if(changed&&sameIntent&&authoritative){selection=savedSelection;draft={...draft,tools:[...new Set([...raw.definition.tools.filter(name=>!name.startsWith('openconnector/')),...draft.tools.filter(name=>name.startsWith('openconnector/'))])],pluginBindings:clonePluginSelection(savedSelection)}}
    return {document:doc,draft,pluginSelection:selection,pluginSavedSelection:savedSelection,pluginBaseline:this.pluginDocumentBaseline(doc),
     pluginIntentSource:authoritative?'server':local.pluginIntentSource,pluginSelectionEdited:changed&&!sameIntent,
     pluginStorageWarning:!stored,status:changed?this.configurationStatus(draft,selection,savedSelection,doc):'saved'};
   };
   if(epoch===this.selectionGeneration&&this.getSnapshot().document?.id===doc.id)this.publish(merge(this.getSnapshot()));
   else{const tab=this.tabs.get(doc.id);if(tab)this.tabs.set(doc.id,{...tab,...merge(tab)})}
   await this.refresh();return doc;
  }catch(e){if(epoch===this.selectionGeneration)this.publish({status:/已更新|conflict/i.test(e.message)?'conflict':'error',error:e.message});throw e}
 }
 async copy(name){await this.guard(async()=>{let s=this.getSnapshot();if(!s.document.readOnly&&s.status!=='saved')await this.save();s=this.getSnapshot();let d=s.document.readOnly?await this.api('copyPreset',{id:s.document.id,name,cwd:s.cwd}):await this.api('copy',{id:s.document.id});if(!s.document.readOnly&&name!==d.definition.name)d=await this.api('save',{id:d.id,revision:d.revision,cwd:s.cwd,definition:{...d.definition,name}});if(s.pluginSelection&&d.definition.pluginBindings===undefined)this.choiceStore.write(this.doc(d),this.pluginWorkspace(),s.pluginSelection);await this.refresh();await this.open(d.id)})}
 async remove(){await this.guard(async()=>{const id=this.getSnapshot().document.id;await this.api('delete',{id});this.choiceStore.remove(this.pluginWorkspace(),id);this.tabs.delete(id);this.publish({document:null,draft:null,pluginSelection:null,pluginSavedSelection:null,pluginBaseline:null,pluginIntentWorkspace:null,openIds:this.getSnapshot().openIds.filter(v=>v!==id)});await this.refresh()})}
 async reload(){const id=this.getSnapshot().document.id;this.tabs.delete(id);this.publish({document:null,pluginSelection:null,pluginSavedSelection:null,pluginBaseline:null,pluginIntentWorkspace:null});await this.refresh();await this.open(id)}
 async refreshCatalog(){const s=this.getSnapshot(),epoch=++this.catalogGeneration,selection=this.selectionGeneration;this.publish({catalogLoading:true,ownerMigration:this.invalidateOwnerMigration()});try{
  const [result,directory]=await Promise.all([this.api('catalog',{cwd:s.cwd,selected:s.draft?.tools||[]}),this.pluginDirectoryProvider?this.pluginDirectoryProvider().catch(error=>({error:String(error.message||error)})):Promise.resolve(s.pluginDirectory)]);
  if(epoch===this.catalogGeneration&&selection===this.selectionGeneration&&this.getSnapshot().cwd===s.cwd){const current={...this.getSnapshot(),catalog:result,capabilityBindings:result.capabilityBindings===true||(result.capabilityBindings===undefined&&this.getSnapshot().capabilityBindings),...(directory&&!directory.error?{pluginDirectory:directory}:{}),pluginDirectoryError:directory?.error||null};this.publish({...current,...this.reconcilePlugins(current)});const saved=this.getSnapshot(),bindings=saved.document?.definition.pluginBindings;if(saved.status==='saved'&&!saved.document?.readOnly&&isUnifiedLibraryCatalog(result.tools||[])&&(bindings?.['dsh-workbench-library']||bindings?.['dsh-library-knowledge'])&&!saved.ownerMigration?.pendingApply&&!saved.ownerMigration?.pendingUndo)await this.ownerMigrationPreview('saved').catch(()=>{})}
 }finally{if(epoch===this.catalogGeneration)this.publish({catalogLoading:false})}}
 edit=messages=>{const s=this.getSnapshot();this.undo=[...this.undo,clone(s.messages)];this.redo=[];this.publish({messages:clone(messages),output:[],undoable:true,redoable:false})}
 undoMessages=()=>{if(!this.undo.length)return;this.redo=[...this.redo,this.getSnapshot().messages];this.publish({messages:this.undo.at(-1),undoable:this.undo.length>1,redoable:true});this.undo=this.undo.slice(0,-1);this.persist()}
 redoMessages=()=>{if(!this.redo.length)return;this.undo=[...this.undo,this.getSnapshot().messages];this.publish({messages:this.redo.at(-1),undoable:true,redoable:this.redo.length>1});this.redo=this.redo.slice(0,-1);this.persist()}
 wireMessages(messages){return messages.map(({id,role,text,thinking,tools})=>({id,role,text,...(thinking?{thinking}:{}),...(tools?{tools}: {})}))}
 decorate(r){return {...r,input:r.input.map(m=>m.text).join('\n\n'),messages:r.input,configuration:r.document.definition,settings:{reactLoop:r.mode==='react',autoTools:r.mode==='tool-batch'}}}
 useRun(r){const source=this.getSnapshot();this.publish({runState:{run:this.decorate(r)},toolRunState:undefined,messages:[...r.input,...r.output.map(m=>({...m,origin:{runId:r.id},...(r.status==='running'?{streaming:true}:{})}))],output:[],sessionReadyId:r.sessionId,error:r.error||null})}
 async run(messageId){return this.guard(async()=>{let s=this.getSnapshot();const epoch=this.selectionGeneration;if(s.status!=='saved'&&!s.document.readOnly)await this.save();if(epoch!==this.selectionGeneration)return;s=this.getSnapshot();if(!s.document.readOnly&&s.status!=='saved')throw new Error('保存期间配置又有修改，请保存后重新运行。');const index=messageId?s.messages.findIndex(m=>m.id===messageId):-1;const messages=this.wireMessages(index<0?s.messages:s.messages.slice(0,index+1));const args={id:s.document.id,revision:s.document.revision,cwd:s.cwd,messages,mode:s.settings.reactLoop?'react':s.settings.autoTools?'tool-batch':'model-only',maxSteps:10};const r=await this.api(s.document.readOnly?'runPreset':'run',args);if(epoch!==this.selectionGeneration){await this.api('stop',{id:r.id});return}this.useRun(r);this.poll(r.id,s.document.id)})}
 poll(id,agentId){const epoch=++this.pollGeneration;const tick=async()=>{try{const r=await this.api('getRun',{id});if(!this.alive||epoch!==this.pollGeneration)return;if(this.getSnapshot().document?.id===agentId)this.useRun(r);if(['running','preparing'].includes(r.status))this.timer=setTimeout(tick,250);else await this.history()}catch(e){if(epoch===this.pollGeneration)this.publish({error:e.message})}};this.timer=setTimeout(tick,150)}
 async stop(){this.manualGeneration++;const s=this.getSnapshot(),epoch=this.selectionGeneration;if(s.runState){const r=await this.api('stop',{id:s.runState.run.id});if(epoch===this.selectionGeneration&&!s.executingToolIds.length)this.useRun(r)}}
 async execute(messageId,ids){if(this.getSnapshot().executingToolIds.length)throw new Error('工具批次正在执行');const epoch=++this.manualGeneration,s=this.getSnapshot(),m=s.messages.find(m=>m.id===messageId);if(!m?.origin)throw new Error('只有真实输出中的工具调用可以执行');this.publish({executingToolIds:ids});try{for(const id of ids){if(epoch!==this.manualGeneration||!this.alive)break;const tool=m.tools.find(t=>t.id===id);const executionId=uid();let done=false;const watch=async()=>{try{const receipts=await this.api('receipts',{id:m.origin.runId}),current=receipts.find(r=>r.id===executionId);if(!done&&current?.sessionId)this.publish({toolRunState:{run:{...s.runState.run,sessionId:current.sessionId}},sessionReadyId:current.sessionId})}catch{}finally{if(!done&&this.alive)this.manualTimer=setTimeout(watch,200)}};const task=this.api('executeTool',{runId:m.origin.runId,callId:id,executionId,arguments:tool.arguments});void watch();let receipt;try{receipt=await task}finally{done=true;clearTimeout(this.manualTimer)}if(receipt.output){this.edit(this.getSnapshot().messages.map(v=>v.id===messageId?{...v,tools:v.tools.map(t=>t.id===id?receipt.output:t)}:v))}}}finally{this.publish({executingToolIds:[]})}}
 clear=()=>{this.pollGeneration++;clearTimeout(this.timer);this.edit(blank());this.publish({runState:undefined,toolRunState:undefined})}
 async history(){const s=this.getSnapshot();if(!s.document)return;const epoch=this.selectionGeneration,h=await this.api('history',{id:s.document.id});if(epoch!==this.selectionGeneration)return;this.publish({runs:h.runs.map(r=>this.decorate(r)),evaluations:h.evaluations,results:Object.fromEntries(h.runs.map(r=>[r.id,r.output.map(m=>m.text+'\n'+(m.tools??[]).map(t=>`${t.name}\n${t.result??''}`).join('\n')).join('\n')]))})}
 async openRun(id){const epoch=this.selectionGeneration,load=++this.runLoadGeneration;const r=await this.api('getRun',{id});if(epoch!==this.selectionGeneration||load!==this.runLoadGeneration)return;this.pollGeneration++;this.useRun(r);if(['running','preparing'].includes(r.status))this.poll(r.id,this.getSnapshot().document.id)}
 async evaluate(request){const result=await this.api('evaluate',request);await this.history();return result}
 async conversation(){return this.guard(async()=>{const s=this.getSnapshot(),epoch=this.selectionGeneration;if(s.status!=='saved'&&!s.document.readOnly)await this.save();if(epoch!==this.selectionGeneration)throw new Error('Agent 已切换，请重新开始对话');if(!s.document.readOnly&&this.getSnapshot().status!=='saved')throw new Error('保存期间配置又有修改，请保存后重新开始对话。');const r=await this.api(s.document.readOnly?'conversationPreset':'conversation',{id:s.document.id,cwd:s.cwd});return r.sessionId})}
 async prompt(request){const s=this.getSnapshot();const {id,model,original,instruction}=request;const draft={...s.draft,modelSelection:'explicit',provider:model.provider,model:model.model};const promise=this.api('prompt',{id:s.document.id,cwd:s.cwd,definition:draft,original,instruction});this.pendingPrompts.set(id,promise);const job=await promise;return {...job,text:job.candidate}}
 async promptGet(id){const pending=this.pendingPrompts.get(id),remote=pending?await pending:null;const job=await this.api('getPrompt',{id:remote?.id||id});return {...job,text:job.candidate}}
 async promptStop(id){const pending=this.pendingPrompts.get(id);if(!pending)return;try{const remote=await pending,job=await this.api('stopPrompt',{id:remote.id});return {...job,text:job.candidate}}finally{this.pendingPrompts.delete(id)}}
 async refreshRecords(query={}){const epoch=++this.recordsGeneration;this.records.set({...this.records.getSnapshot(),query,loading:true,detail:null});try{const data=await this.api('records');if(!this.alive||epoch!==this.recordsGeneration)return;this.recordData=data;const items=[...data.runs.map(r=>({id:r.id,kind:'trial',agentPreset:r.document.id,agentName:r.document.definition.name,status:r.status,revision:r.document.revision,createdAt:r.createdAt,preview:r.input.map(m=>m.text).join(' ').slice(0,150),sessionId:r.sessionId})),...data.prompts.map(p=>({id:p.id,kind:'prompt',agentPreset:p.agentId,agentName:p.document?.definition.name||data.agents.find(d=>d.id===p.agentId)?.definition.name||p.agentId,status:p.status,createdAt:p.createdAt,preview:p.instruction}))].filter(i=>(!query.agentPreset||query.agentPreset===i.agentPreset)&&(!query.kind||query.kind===i.kind)&&(!query.status||query.status===i.status)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));this.records.set({query,loading:false,error:null,page:{items,agents:data.agents.map(d=>({id:d.id,name:d.definition.name}))},detail:null})}catch(e){if(!this.alive||epoch!==this.recordsGeneration)return;this.records.set({...this.records.getSnapshot(),loading:false,error:e.message})}}
 openRecord(item){const data=this.recordData;const r=data.runs.find(r=>r.id===item.id);const p=data.prompts.find(p=>p.id===item.id);this.records.set({...this.records.getSnapshot(),detail:{item,...(r?{trial:{run:this.decorate(r)},sessionReady:true}:{}),...(p?{prompt:{request:{instruction:p.instruction,original:p.original},text:p.candidate}}:{})}});if(r)this.traceRecord=r}
 dispose(){this.alive=false;this.pollGeneration++;clearTimeout(this.timer);clearTimeout(this.manualTimer);this.writer.dispose();this.connector.dispose()}
}
