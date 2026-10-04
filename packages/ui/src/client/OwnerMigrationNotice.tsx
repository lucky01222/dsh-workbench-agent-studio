import {Button} from './primitives.tsx'
import type {PluginSelection} from './plugin-capabilities.types.ts'
import css from './Workbench.module.css'

interface Projection {tools:string[];pluginBindings?:PluginSelection}
interface Preview {version:1;status:'ready'|'not-needed'|'blocked';id:string;revision:number;permissionHash:string;catalogHash:string;policy:'saved'|'current';before:Projection;after:Projection;added:string[];removed:string[];disabledBindings:PluginSelection;reasons:unknown[];affectedOwners:string[]}
interface Receipt {id:string;agentId:string;status:'prepared'|'applied'|'undo-prepared'|'undone';before:Projection;after:Projection;disabledBindings?:PluginSelection}
export interface OwnerMigrationState {status:'idle'|'previewing'|'applying'|'undoing';policy:'saved'|'current';preview:Preview|null;receipt:Receipt|null;error:string|null;pendingApply?:unknown;pendingUndo?:unknown;needsReceiptRefresh?:boolean}
interface Props {needed:boolean;state?:OwnerMigrationState|null;disabled:boolean;recoveryDisabled?:boolean;t:(key:string,values?:Record<string,string|number>)=>string;onPreview:(policy:'saved'|'current')=>void;onApply:()=>void;onUndo:()=>void}
const reason=(value:unknown)=>typeof value==='string'?value:value&&typeof value==='object'&&'message'in value?String(value.message):value&&typeof value==='object'&&'code'in value?String(value.code):''

/** A read-only difference until the explicit Apply button is pressed. */
export function OwnerMigrationNotice({needed,state,disabled,recoveryDisabled=disabled,t,onPreview,onApply,onUndo}:Props){
 if(!needed&&!state?.receipt&&!state?.pendingApply&&!state?.pendingUndo&&!state?.needsReceiptRefresh)return null
 const preview=state?.preview,receipt=state?.receipt,busy=!!state&&state.status!=='idle',pending=!!state?.pendingApply||!!state?.pendingUndo,recovering=pending||state?.needsReceiptRefresh
 // After migration, a fresh not-needed preview describes a hypothetical no-op.
 // The durable receipt is the actual operation and owns its before/after display.
 const shownPreview=preview?.status==='not-needed'&&receipt?null:preview,shown=shownPreview||receipt
 const before=shown?.before.tools||[],after=shown?.after.tools||[],added=shownPreview?.added||after.filter(tool=>!before.includes(tool)),removed=shownPreview?.removed||before.filter(tool=>!after.includes(tool)),disabledOwners=Object.keys(shown?.disabledBindings||{})
 const affected=shownPreview?.affectedOwners||['dsh-workbench-library','dsh-library-knowledge'],beforeOwners=Object.keys(shown?.before.pluginBindings||{}).filter(id=>affected.includes(id)),afterOwners=Object.keys(shown?.after.pluginBindings||{}).filter(id=>affected.includes(id))
 return <div className={css.metadata} data-owner-migration>
  <p className={css.hint} role="status">{t(state?.needsReceiptRefresh?'ownerMigrationReadback':receipt?.status==='prepared'||receipt?.status==='undo-prepared'?'ownerMigrationPrepared':receipt?.status==='undone'?'ownerMigrationUndone':needed?'ownerMigrationNeeded':'ownerMigrationApplied')}</p>
  {needed&&<p className={css.hint}>{t('ownerMigrationFrozen')}</p>}
  {disabled&&!recovering&&<p className={css.hint}>{t('ownerMigrationSaveFirst')}</p>}
  {disabled&&recovering&&!recoveryDisabled&&<p className={css.hint}>{t('ownerMigrationRecoverEdits')}</p>}
  {(needed||preview||receipt?.status==='prepared'||receipt?.status==='undo-prepared'||state?.needsReceiptRefresh)&&<><label className={css.hint}>{t('ownerMigrationPolicy')}<select className={css.select} aria-label={t('ownerMigrationPolicy')} value={state?.policy||'saved'} disabled={disabled||busy||!!recovering} onChange={event=>onPreview(event.currentTarget.value as 'saved'|'current')}><option value="saved">{t('ownerMigrationSaved')}</option><option value="current">{t('ownerMigrationCurrent')}</option></select></label><Button size="sm" disabled={(state?.needsReceiptRefresh?recoveryDisabled:disabled)||busy||pending} onClick={()=>onPreview(state?.policy||'saved')}>{t(busy?'ownerMigrationWorking':state?.needsReceiptRefresh?'ownerMigrationReadback':'ownerMigrationPreview')}</Button></>}
  {(preview||receipt)&&<div data-owner-migration-preview>
   <p className={css.hint}>{t('ownerMigrationCounts',{before:before.length,after:after.length,added:added.length,removed:removed.length})}</p>
   <details className={css.pluginWarning}><summary>{t('ownerMigrationDiff')}</summary>
    <p>{t('ownerMigrationOwners')}: {beforeOwners.join('、')||'—'} → {afterOwners.join('、')||'—'}</p>
    <p>{t('ownerMigrationBefore')}: {before.join('、')||'—'}</p><p>{t('ownerMigrationAfter')}: {after.join('、')||'—'}</p>
    <p>{t('ownerMigrationAdded')}: {added.join('、')||'—'}</p><p>{t('ownerMigrationRemoved')}: {removed.join('、')||'—'}</p>
    {!!disabledOwners.length&&<p>{t('ownerMigrationDisabled')}: {disabledOwners.join('、')}</p>}
   </details>
   {preview?.reasons.map(reason).filter(Boolean).map((text,index)=><p className={css.hint} key={index}>{text}</p>)}
   {preview?.status==='not-needed'&&<p className={css.hint}>{t('ownerMigrationNotNeeded')}</p>}
   {preview?.status==='blocked'&&<p className={css.hint}>{t('ownerMigrationBlocked')}</p>}
   {preview?.status==='ready'&&<Button size="sm" variant="primary" disabled={(state?.pendingApply?recoveryDisabled:disabled)||busy||!!state?.pendingUndo} onClick={onApply}>{t(state?.pendingApply?'ownerMigrationRetry':removed.length?'ownerMigrationApplyChanged':added.length?'ownerMigrationApplyAdded':'ownerMigrationApply',{count:added.length})}</Button>}
  </div>}
  {state?.pendingApply&&!preview&&<Button size="sm" disabled={recoveryDisabled||busy} onClick={onApply}>{t('ownerMigrationRetry')}</Button>}
  {(receipt?.status==='applied'||receipt?.status==='undo-prepared')&&<Button size="sm" disabled={(state?.pendingUndo?recoveryDisabled:disabled)||busy||!!state?.pendingApply} onClick={onUndo}>{t(state?.pendingUndo?'ownerMigrationRetryUndo':'ownerMigrationUndo')}</Button>}
  {state?.error&&<div className={css.dialogError} role="alert"><span>{t('ownerMigrationError')}</span><details><summary>{t('errorDetails')}</summary><pre>{state.error}</pre></details></div>}
 </div>
}
