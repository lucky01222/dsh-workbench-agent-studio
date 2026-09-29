/** LLM Space-style document controls using the workbench's shared menus. */
import { useState } from 'react'
import { Button, Menu, IconChevronDownOutline14, IconEllipsisOutline16 } from './primitives.tsx'
import { TrialRunAction, type TrialPaneProps } from './TrialPane.tsx'
import css from './TrialToolbar.module.css'

function HistoryArrow({ redo = false }: { redo?: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={redo ? { transform:'scaleX(-1)' } : undefined}><path d="M3 10h10a7 7 0 0 1 0 14" transform="translate(0 -4)" /><path d="m7 2-4 4 4 4" /></svg>
}

/** Run settings and document history live in the trial pane header, outside the message list.
 * @param props - Controller-owned run and undo/redo controls.
 * @returns The document toolbar actions.
 */
export function TrialToolbar(props: Pick<TrialPaneProps, 'runState' | 'input' | 'busy' | 'canRun' | 'toolsRunning' | 'onRun' | 'onStop' | 't' | 'settings' | 'onSettingsChange' | 'onClear' | 'onShowHistory'> & {
  undoable: boolean
  redoable: boolean
  onUndo: () => void
  onRedo: () => void
}) {
  const [settingsOpen, setSettingsOpen] = useState(false), [moreOpen, setMoreOpen] = useState(false)
  const { t, settings } = props
  const locked = props.busy || props.toolsRunning || !!props.runState && ['preparing', 'running'].includes(props.runState.run.status)
  return <div className={css.toolbar}>
    <Button size="sm" className={css.iconButton} aria-label={t('undo')} title={t('undo')} disabled={locked || !props.undoable} onClick={props.onUndo}><HistoryArrow /></Button>
    <Button size="sm" className={css.iconButton} aria-label={t('redo')} title={t('redo')} disabled={locked || !props.redoable} onClick={props.onRedo}><HistoryArrow redo /></Button>
    <Menu open={moreOpen} portal align="end" compact onClose={() => { setMoreOpen(false) }} anchor={<Button size="sm" aria-label={t('more')} title={t('more')} icon={<IconEllipsisOutline16 />} onClick={() => { setMoreOpen(!moreOpen) }} />}
      items={[{ id: 'history', label: t('history') }, { id: 'clear', label: t('clear'), disabled: locked }]}
      onSelect={(id) => { setMoreOpen(false); if (id === 'history') props.onShowHistory(); else props.onClear() }} />
    <div className={css.runGroup}>
      <TrialRunAction {...props} />
      <Menu open={settingsOpen} portal align="end" compact onClose={() => { setSettingsOpen(false) }}
        anchor={<Button className={css.runSettings} size="sm" variant="primary" disabled={locked} title={t('settings')} aria-label={t('settings')} onClick={() => { setSettingsOpen(!settingsOpen) }} icon={<IconChevronDownOutline14 />} />}
        items={[{ id:'label', type:'label', text:t('settings') }, { id:'react', label: <span className={css.settingRow}>{t('reactLoop')}<span className={css.switch} data-checked={settings.reactLoop} /></span> }, { id:'tools', disabled:settings.reactLoop, label:<span className={css.settingRow}>{t('autoTools')}<span className={css.switch} data-checked={settings.reactLoop || settings.autoTools} /></span> }]}
        onSelect={(id) => { if (id === 'react') props.onSettingsChange({ reactLoop: !settings.reactLoop, autoTools: settings.autoTools }); else if (id === 'tools' && !settings.reactLoop) props.onSettingsChange({ ...settings, autoTools: !settings.autoTools }) }} />
    </div>
  </div>
}
