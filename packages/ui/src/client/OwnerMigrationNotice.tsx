import {Button} from './primitives.tsx'
import type {PluginSelection} from './plugin-capabilities.types.ts'
import css from './AgentStudio.module.css'

interface Projection {tools:string[];pluginBindings?:PluginSelection}
interface Preview {version:1;status:'ready'|'not-needed'|'blocked';id:string;revision:number;permissionHash:string;catalogHash:string;policy:'saved'|'current';before:Projection;after:Projection;added:string[];removed:string[];disabledBindings:PluginSelection;reasons:unknown[];affectedOwners:string[]}
interface Receipt {id:string;agentId:string;status:'prepared'|'applied'|'undo-prepared'|'undone';before:Projection;after:Projection;disabledBindings?:PluginSelection}
export interface OwnerMigrationState {status:'idle'|'previewing'|'applying'|'undoing';policy:'saved'|'current';preview:Preview|null;receipt:Receipt|null;error:string|null;pendingApply?:unknown;pendingUndo?:unknown;needsReceiptRefresh?:boolean;recent?:boolean}
interface Props {needed:boolean;state?:OwnerMigrationState|null;disabled:boolean;recoveryDisabled?:boolean;t:(key:string,values?:Record<string,string|number>)=>string;onUpdate:()=>void;onApply:()=>void;onUndo:()=>void}
const reason=(value:unknown)=>typeof value==='string'?value:value&&typeof value==='object'&&'message'in value?String(value.message):value&&typeof value==='object'&&'code'in value?String(value.code):''

/**
 * One row for the Library owner update. Update keeps the saved tools and applies
 * at once; a preview that adds or removes tools waits for an explicit confirmation.
 */
export function OwnerMigrationNotice({needed,state,disabled,recoveryDisabled=disabled,t,onUpdate,onApply,onUndo}:Props){
 const preview=state?.preview,receipt=state?.receipt,busy=!!state&&state.status!=='idle'
 const pendingApply=!!state?.pendingApply,pendingUndo=!!state?.pendingUndo,readback=!!state?.needsReceiptRefresh
 // Undo is offered right after an update in this session; an older finished update shows nothing.
 const applied=!needed&&(receipt?.status==='applied'&&!!state?.recent||receipt?.status==='undo-prepared')
 if(!needed&&!applied&&!pendingApply&&!pendingUndo&&!readback)return null
 const error=state?.error&&<div className={css.dialogError} role="alert"><span>{t('ownerMigrationError')}</span><details><summary>{t('errorDetails')}</summary><pre>{state.error}</pre></details></div>
 const row=(text:string,action?:{label:string;onClick:()=>void;disabled:boolean},detail?:string)=><div className={css.migration} data-owner-migration>
  <span role="status">{text}{detail&&<small>{detail}</small>}</span>
  {action&&<Button size="sm" shape="rounded" variant="outline" disabled={action.disabled} onClick={action.onClick}>{action.label}</Button>}
  {error}
 </div>
 if(readback)return row(t('ownerMigrationReadbackHint'),{label:t('ownerMigrationReadback'),onClick:onUpdate,disabled:recoveryDisabled||busy})
 if(pendingApply)return row(t('ownerMigrationPendingApply'),{label:t(busy?'ownerMigrationWorking':'ownerMigrationRetry'),onClick:onApply,disabled:recoveryDisabled||busy})
 if(pendingUndo)return row(t('ownerMigrationPendingUndo'),{label:t(busy?'ownerMigrationWorking':'ownerMigrationRetry'),onClick:onUndo,disabled:recoveryDisabled||busy})
 if(applied)return row(t('ownerMigrationApplied'),{label:t(busy?'ownerMigrationWorking':'ownerMigrationUndo'),onClick:onUndo,disabled:disabled||busy})
 if(preview?.status==='blocked')return row(t('ownerMigrationBlocked'),{label:t('ownerMigrationCheckAgain'),onClick:onUpdate,disabled:disabled||busy},preview.reasons.map(reason).filter(Boolean).join('；'))
 if(preview?.status==='not-needed')return row(t('ownerMigrationNotNeeded'))
 if(preview?.status==='ready'&&(preview.added.length||preview.removed.length)){
  const changes=[preview.added.length?t('ownerMigrationAdded',{tools:preview.added.join('、')}):'',preview.removed.length?t('ownerMigrationRemoved',{tools:preview.removed.join('、')}):''].filter(Boolean).join('；')
  return row(t('ownerMigrationChanged'),{label:t(busy?'ownerMigrationWorking':'ownerMigrationConfirm'),onClick:onApply,disabled:disabled||busy},changes)
 }
 return row(t('ownerMigrationNeeded'),{label:t(busy?'ownerMigrationWorking':'ownerMigrationUpdate'),onClick:onUpdate,disabled:disabled||busy},disabled&&!busy?t('ownerMigrationSaveFirst'):undefined)
}
