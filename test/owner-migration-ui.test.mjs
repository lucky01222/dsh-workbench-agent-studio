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
test('the migration notice shows saved policy and exact differences, and mutates only after an explicit button action',()=>{
 let applied=0;const policies=[],props={needed:true,disabled:false,t,state:{status:'idle',policy:'saved',preview,receipt:null},onPreview:p=>policies.push(p),onApply:()=>applied++,onUndo(){assert.fail('no undo was requested')}}
 let nodes=elements(OwnerMigrationNotice(props));assert.equal(nodes.find(n=>n.type==='select').props.value,'saved');assert.equal(applied,0)
 nodes.find(n=>n.type==='select').props.onChange({currentTarget:{value:'current'}});assert.deepEqual(policies,['current']);assert.equal(applied,0)
 const expanded={...preview,policy:'current',after:projection(['library_get','library_ingest']),added:['library_ingest']};nodes=elements(OwnerMigrationNotice({...props,state:{...props.state,policy:'current',preview:expanded}}))
 const button=nodes.find(n=>n.type==='button'&&n.props.children==='ownerMigrationApplyAdded:1');assert.ok(button);assert.equal(button.props.disabled,false);button.props.onClick();assert.equal(applied,1)
 assert.ok(nodes.some(n=>n.type==='p'&&n.props.children==='ownerMigrationCounts:1,2,1,0'))
})
test('blocked previews never expose Apply, and persisted prepared requests offer only the original explicit retry',()=>{
 const onApply=()=>{},props={needed:true,disabled:false,t,onPreview(){},onApply,onUndo(){}}
 let nodes=elements(OwnerMigrationNotice({...props,state:{status:'idle',policy:'saved',preview:{...preview,status:'blocked',reasons:['blocked']},receipt:null}}));assert.equal(nodes.some(n=>n.props.onClick===onApply),false)
 nodes=elements(OwnerMigrationNotice({...props,state:{status:'idle',policy:'current',preview:null,pendingApply:{operationId:'old'},receipt:{id:'old',agentId:'a',status:'prepared',before:preview.before,after:preview.after}}}))
 assert.equal(nodes.find(n=>n.type==='select').props.disabled,true);assert.ok(nodes.some(n=>n.props.onClick===onApply&&n.props.children==='ownerMigrationRetry'))
})
test('unsaved persona edits do not disable the original recovery action while new actions stay disabled',()=>{
 const onApply=()=>{},props={needed:true,disabled:true,recoveryDisabled:false,t,onPreview(){},onApply,onUndo(){},state:{status:'idle',policy:'saved',preview,pendingApply:{operationId:'original'},receipt:null}}
 const nodes=elements(OwnerMigrationNotice(props)),retry=nodes.find(node=>node.props.onClick===onApply)
 assert.equal(retry.props.disabled,false);assert.equal(nodes.find(node=>node.type==='select').props.disabled,true);assert.ok(nodes.some(node=>node.props.children==='ownerMigrationRecoverEdits'));assert.equal(nodes.some(node=>node.props.children==='ownerMigrationSaveFirst'),false)
})
test('an applied receipt remains the displayed change when a refreshed preview is not-needed',()=>{
 const before=projection(Array.from({length:12},(_,i)=>'tool-'+i)),after=projection(Array.from({length:15},(_,i)=>'tool-'+i)),onUndo=()=>{}
 const nodes=elements(OwnerMigrationNotice({needed:false,disabled:false,t,onPreview(){},onApply(){assert.fail('a completed migration cannot be applied again')},onUndo,state:{status:'idle',policy:'saved',preview:{...preview,status:'not-needed',before:after,after,added:[],removed:[]},receipt:{id:'actual-operation',agentId:'a',status:'applied',before,after}}}))
 assert.ok(nodes.some(node=>node.type==='p'&&node.props.children==='ownerMigrationCounts:12,15,3,0'));assert.equal(nodes.some(node=>node.type==='p'&&node.props.children==='ownerMigrationCounts:15,15,0,0'),false);assert.ok(nodes.some(node=>node.props.onClick===onUndo&&node.props.disabled===false))
})
