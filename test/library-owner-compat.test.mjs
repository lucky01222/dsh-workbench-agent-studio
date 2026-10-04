import test from 'node:test'
import assert from 'node:assert/strict'
import {planLibraryOwnerMigration,normalizeLibraryOwnerBindings,isCompatibleLibraryToolOwner,isUnifiedLibraryVersion,LIBRARY_OWNER as library,LEGACY_KNOWLEDGE_OWNER as knowledge,LEGACY_LIBRARY_TOOLS as libraryTools,LEGACY_KNOWLEDGE_TOOLS as knowledgeTools} from '../packages/runtime/src/library-owner-compat.mjs'
import {resolveCapabilities} from '../packages/runtime/src/capabilities.mjs'

const base={name:'Synthetic',description:'',modelSelection:'global',provider:'',model:'',systemPrompt:'Unchanged private content',tools:[],skills:[]}
const choice=(tools,{enabled=true,mode='all',...extra}={})=>({enabled,mode,tools:[...tools],...extra})
const allTools=[...libraryTools,...knowledgeTools]
const rows=()=>allTools.map(name=>({name,pluginId:library,pluginVersion:'0.23.1'}))
const definition=(bindings,tools=Object.values(bindings).filter(b=>b.enabled).flatMap(b=>b.tools))=>({...base,tools:[...new Set(tools)],pluginBindings:bindings})

test('saved strategy freezes both old all bindings at exactly 12 without changing input or private fields',()=>{
 const input=definition({[library]:choice(libraryTools.slice(0,7)),[knowledge]:choice(knowledgeTools)}),original=structuredClone(input),plan=planLibraryOwnerMigration(input,rows())
 assert.equal(plan.status,'ready');assert.equal(plan.version,1);assert.deepEqual(plan.added,[]);assert.deepEqual(plan.removed,[])
 assert.deepEqual(plan.after.pluginBindings,{[library]:choice(input.tools,{mode:'custom'})})
 assert.deepEqual(Object.keys(plan.after.pluginBindings[library]).sort(),['enabled','mode','tools'],'migration must remain readable by the old strict binding schema')
 assert.equal('systemPrompt' in plan.before,false);assert.equal('systemPrompt' in plan.after,false);assert.deepEqual(input,original)
 const normalized=normalizeLibraryOwnerBindings(input,rows());assert.equal(normalized.systemPrompt,input.systemPrompt);assert.equal(normalized.pluginBindings[library].mode,'custom')
 assert.deepEqual(resolveCapabilities(input,rows()).definition.tools,input.tools)
 const repeat=planLibraryOwnerMigration(normalized,rows());assert.equal(repeat.status,'not-needed');assert.deepEqual(repeat.after,plan.after)
})

test('current strategy adds only the original ten Library tools; runtime default remains saved',()=>{
 const input=definition({[library]:choice(libraryTools.slice(0,7)),[knowledge]:choice(knowledgeTools)}),catalog=[...rows(),{name:'library_future_write',pluginId:library,pluginVersion:'0.24.0'}]
 const plan=planLibraryOwnerMigration(input,catalog,{policy:'current'});assert.equal(plan.status,'ready');assert.deepEqual(plan.added,libraryTools.slice(7));assert.equal(plan.after.tools.length,15);assert.ok(!plan.after.tools.includes('library_future_write'))
 assert.equal(resolveCapabilities(input,catalog).definition.tools.length,12)
 const onlyLibrary=planLibraryOwnerMigration(definition({[library]:choice(['library_get'])}),catalog,{policy:'current'})
 assert.deepEqual(onlyLibrary.after.tools,['library_get',...libraryTools.filter(name=>name!=='library_get')]);assert.ok(!onlyLibrary.after.tools.includes('library_read'))
})

test('Knowledge all never gains mutations and remembered invalid members block migration',()=>{
 const input=definition({[knowledge]:choice(knowledgeTools)}),plan=planLibraryOwnerMigration(input,rows(),{policy:'current'})
 assert.deepEqual(plan.after.tools,knowledgeTools);assert.equal(plan.after.pluginBindings[library].mode,'custom')
 for(const name of ['library_ingest','library_get','library_future','openconnector/library_read'])assert.equal(planLibraryOwnerMigration(definition({[knowledge]:choice([...knowledgeTools,name])}),rows()).status,'blocked',name)
})

test('custom and disabled selections never expand, and mixed disabled choices survive only in the reversible plan',()=>{
 const off=choice(['library_get','library_ingest'],{enabled:false}),input=definition({[library]:off,[knowledge]:choice(['library_read'],{mode:'custom'})})
 const plan=planLibraryOwnerMigration(input,rows(),{policy:'current'})
 assert.deepEqual(plan.after.tools,['library_read']);assert.deepEqual(plan.disabledBindings,{[library]:off});assert.equal(plan.after.pluginBindings[library].enabled,true)
 const inverse=definition({[library]:choice(['library_get'],{mode:'custom'}),[knowledge]:choice(knowledgeTools,{enabled:false})})
 assert.deepEqual(planLibraryOwnerMigration(inverse,rows(),{policy:'current'}).after.tools,['library_get'])
 const both=planLibraryOwnerMigration(definition({[library]:off,[knowledge]:choice(knowledgeTools,{enabled:false})}),rows())
 assert.equal(both.after.pluginBindings[library].enabled,false);assert.deepEqual(both.after.tools,[]);assert.equal(Object.keys(both.disabledBindings).length,2);assert.deepEqual(both.after.pluginBindings[library].tools,[...off.tools,...knowledgeTools])
})

test('empty old all, unavailable/missing/ambiguous members, unknown owners and unverified unified versions fail closed',()=>{
 const input=definition({[knowledge]:choice(['library_read'])})
 for(const catalog of [[],rows().filter(r=>r.name!=='library_read'),rows().map(r=>r.name==='library_read'?{...r,unavailable:true}:r),rows().map(r=>({...r,pluginId:'other'})),rows().map(r=>({...r,pluginVersion:undefined})),rows().map(r=>({...r,pluginVersion:'0.22.1'})),[...rows(),rows().find(r=>r.name==='library_read')]])assert.equal(planLibraryOwnerMigration(input,catalog).status,'blocked')
 for(const owner of [library,knowledge])for(const policy of ['saved','current'])assert.equal(planLibraryOwnerMigration(definition({[owner]:choice([])}),rows(),{policy}).status,'blocked')
 assert.throws(()=>normalizeLibraryOwnerBindings(input,rows().map(r=>({...r,pluginVersion:undefined}))),{code:'CAPABILITY_UNAVAILABLE'})
 assert.equal(planLibraryOwnerMigration(definition({[knowledge]:choice([],{enabled:false})}),[{name:'library_delete',pluginId:library,pluginVersion:'0.23.1'}]).status,'blocked','an unknown future name cannot attest the unified contract')
})

test('strict snapshot owner exception requires an exact original read tool and a verified unified owner version',()=>{
 const read=rows().find(row=>row.name==='library_read')
 assert.equal(isCompatibleLibraryToolOwner('library_read',knowledge,read),true)
 for(const [name,owner,row] of [['library_ingest',knowledge,rows().find(r=>r.name==='library_ingest')],['library_read','arbitrary-plugin',read],['library_read',knowledge,{...read,pluginId:'other'}],['library_read',knowledge,{...read,pluginVersion:'0.22.1'}],['library_read',knowledge,{...read,pluginVersion:'0.23.1-rc.1'}],['library_read',knowledge,{...read,id:'forged-id'}],['library_read',knowledge,{...read,unavailable:true}]])assert.equal(isCompatibleLibraryToolOwner(name,owner,row),false)
 for(const v of ['0.23.1','0.23.2','0.24.0','1.0.0','0.23.1+build'])assert.equal(isUnifiedLibraryVersion(v),true)
 for(const v of [null,'','0.23','00.23.1','0.22.99','0.23.0','0.23.1-beta','9007199254740999.0.0'])assert.equal(isUnifiedLibraryVersion(v),false)
})

test('already migrated custom is idempotent; an explicitly selected new all contract can use the full unified catalog',()=>{
 const input=definition({[library]:choice(allTools)}),plan=planLibraryOwnerMigration(input,rows())
 assert.equal(plan.status,'not-needed');assert.deepEqual(resolveCapabilities(input,rows()).definition.tools,allTools)
 const exact=definition({[library]:choice(['library_get'],{mode:'custom'})})
 assert.equal(planLibraryOwnerMigration(exact,rows()).status,'not-needed');assert.deepEqual(resolveCapabilities(exact,rows()).definition.tools,['library_get'])
})

test('original paired installation and unrelated plugin policies remain unchanged before the unified provider is present',()=>{
 const oldRows=[...libraryTools.map(name=>({name,pluginId:library,pluginVersion:'0.22.1'})),...knowledgeTools.map(name=>({name,pluginId:knowledge,pluginVersion:'0.16.1'}))]
 const input=definition({[library]:choice(libraryTools.slice(0,7)),[knowledge]:choice(knowledgeTools)})
 assert.equal(resolveCapabilities(input,oldRows).definition.tools.length,15,'current paired all semantics are distinct from saved migration scope')
 assert.equal(planLibraryOwnerMigration(input,oldRows).status,'blocked','a migration preview cannot pretend the unified provider is installed')
 const another={...input,pluginBindings:{...input.pluginBindings,other:choice(['other_read'])},tools:[...input.tools,'other_read']},plan=planLibraryOwnerMigration(another,[...rows(),{name:'other_read',pluginId:'other'},{name:'other_write',pluginId:'other'}])
 assert.deepEqual(plan.after.pluginBindings.other,another.pluginBindings.other);assert.ok(plan.after.tools.includes('other_read'));assert.ok(!plan.after.tools.includes('other_write'))
})
