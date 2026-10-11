import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {build} from 'esbuild'
import React from 'react'

const require=createRequire(import.meta.url),bundle=await build({entryPoints:[fileURLToPath(new URL('../packages/ui/src/client/OwnerMigrationNotice.tsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime'],loader:{'.css':'text','.module.css':'text'},plugins:[{name:'native-button-face',setup(build){build.onResolve({filter:/\/primitives\.tsx$/},()=>({path:'native-buttons',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export const Button = 'button'",loader:'js'}))}}]})
const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(require,module,module.exports)
const {OwnerMigrationNotice}=module.exports,projection=tools=>({tools,pluginBindings:{'dsh-workbench-library':{enabled:true,mode:'custom',tools}}})
const preview={version:1,status:'ready',id:'a',revision:1,policy:'saved',before:projection(['library_get']),after:projection(['library_get']),added:[],removed:[],disabledBindings:{},reasons:[],affectedOwners:['dsh-library-knowledge','dsh-workbench-library']}
const t=(key,values)=>key+(values?':'+Object.values(values).join(','):'')
function elements(value){if(Array.isArray(value))return value.flatMap(elements);return React.isValidElement(value)?[value,...elements(value.props.children)]:[]}
const buttons=nodes=>nodes.filter(node=>node.type==='button')
const text=nodes=>nodes.flatMap(node=>[node.props.children].flat()).filter(value=>typeof value==='string')
const fail=name=>()=>assert.fail(name+' was not requested')

test('a legacy binding shows one Update button and nothing mutates until it is pressed',()=>{
 let updates=0;const nodes=elements(OwnerMigrationNotice({needed:true,disabled:false,t,state:null,onUpdate:()=>updates++,onApply:fail('apply'),onUndo:fail('undo')}))
 assert.equal(nodes.some(node=>node.type==='select'),false);assert.ok(text(nodes).includes('ownerMigrationNeeded'))
 const [update]=buttons(nodes);assert.equal(buttons(nodes).length,1);assert.equal(update.props.children,'ownerMigrationUpdate');assert.equal(update.props.disabled,false);assert.equal(updates,0)
 update.props.onClick();assert.equal(updates,1)
})
test('unsaved edits disable Update and say why',()=>{
 const nodes=elements(OwnerMigrationNotice({needed:true,disabled:true,t,state:null,onUpdate:fail('update'),onApply:fail('apply'),onUndo:fail('undo')}))
 assert.equal(buttons(nodes)[0].props.disabled,true);assert.ok(text(nodes).includes('ownerMigrationSaveFirst'))
})
test('a preview that changes the tool scope lists the change and applies only on Confirm',()=>{
 let applied=0;const changed={...preview,after:projection(['library_get','library_ingest']),added:['library_ingest']}
 const nodes=elements(OwnerMigrationNotice({needed:true,disabled:false,t,state:{status:'idle',policy:'saved',preview:changed,receipt:null,error:null},onUpdate:fail('update'),onApply:()=>applied++,onUndo:fail('undo')}))
 assert.ok(text(nodes).includes('ownerMigrationAdded:library_ingest'));assert.equal(applied,0)
 const confirm=buttons(nodes).find(node=>node.props.children==='ownerMigrationConfirm');assert.equal(confirm.props.disabled,false);confirm.props.onClick();assert.equal(applied,1)
})
test('blocked previews never expose Apply and show the reasons',()=>{
 const onApply=()=>{},nodes=elements(OwnerMigrationNotice({needed:true,disabled:false,t,onUpdate(){},onApply,onUndo(){},state:{status:'idle',policy:'saved',preview:{...preview,status:'blocked',reasons:['missing tool']},receipt:null,error:null}}))
 assert.equal(nodes.some(node=>node.props.onClick===onApply),false);assert.ok(text(nodes).includes('missing tool'));assert.equal(buttons(nodes)[0].props.children,'ownerMigrationCheckAgain')
})
test('an unconfirmed apply offers only the original retry, even with unsaved edits',()=>{
 const onApply=()=>{},nodes=elements(OwnerMigrationNotice({needed:true,disabled:true,recoveryDisabled:false,t,onUpdate:fail('update'),onApply,onUndo:fail('undo'),state:{status:'idle',policy:'saved',preview:null,pendingApply:{operationId:'original'},receipt:{id:'original',agentId:'a',status:'prepared',before:preview.before,after:preview.after},error:null}}))
 assert.equal(buttons(nodes).length,1);const retry=buttons(nodes)[0];assert.equal(retry.props.onClick,onApply);assert.equal(retry.props.disabled,false);assert.ok(text(nodes).includes('ownerMigrationPendingApply'))
})
test('right after the update only Undo remains; older updates and unaffected configurations render nothing',()=>{
 const onUndo=()=>{},receipt={id:'op',agentId:'a',status:'applied',before:projection(['library_get']),after:projection(['library_get'])}
 const nodes=elements(OwnerMigrationNotice({needed:false,disabled:false,t,onUpdate:fail('update'),onApply:fail('apply'),onUndo,state:{status:'idle',policy:'saved',preview:null,receipt,error:null,recent:true}}))
 assert.ok(text(nodes).includes('ownerMigrationApplied'));assert.equal(buttons(nodes).length,1);assert.equal(buttons(nodes)[0].props.onClick,onUndo);assert.equal(buttons(nodes)[0].props.disabled,false)
 assert.equal(OwnerMigrationNotice({needed:false,disabled:false,t,state:{status:'idle',policy:'saved',preview:null,receipt,error:null},onUpdate(){},onApply(){},onUndo(){}}),null)
 assert.equal(OwnerMigrationNotice({needed:false,disabled:false,t,state:null,onUpdate(){},onApply(){},onUndo(){}}),null)
})
