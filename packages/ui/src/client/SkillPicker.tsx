/** Skills chooser with the plugin picker's layout: sources on the left, skills on the right. */
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Button, Input, Modal, IconCloseOutline16, IconSearchOutline16, IconChevronLeftOutline14, IconChevronRightOutline14, IconLoadingOutline16, IconSkillOutline16 } from './primitives.tsx'
import { skillGroupState, toggleSkillGroup } from './skill-groups.mjs'
import type { SkillGroup } from './SkillSummary.tsx'
import css from './PluginPicker.module.css'

interface Props {
  open: boolean
  groups: readonly SkillGroup[]
  selected: readonly string[]
  readOnly?: boolean
  loading?: boolean
  /** Shown instead of the list when skills cannot be read yet (no working directory, catalog missing). */
  notice?: string | null
  initialGroupId?: string | null
  t: (key: string, values?: Record<string, string | number>) => string
  onRefresh?: () => void
  onClose: () => void
  onComplete: (names: string[]) => void
}

/** The selection is copied on entry, committed on Done and discarded on every close path. */
export function SkillPicker({ open, groups, selected, readOnly = false, loading = false, notice, initialGroupId, t, onRefresh, onClose, onComplete }: Props) {
  const [draft, setDraft] = useState<string[]>([...selected])
  const [filter, setFilter] = useState<'all' | 'selected'>('all')
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [mobileDetail, setMobileDetail] = useState(false)
  const wasOpen = useRef(false), detailRef = useRef<HTMLElement | null>(null), backRef = useRef<HTMLButtonElement | null>(null)
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())
  const nameOf = (group: SkillGroup) => group.nameKey ? t(group.nameKey) : group.name ?? group.id

  useEffect(() => {
    if (open && !wasOpen.current) {
      const first = groups.find(group => group.id === initialGroupId) ?? groups.find(group => group.skills.some(skill => selected.includes(skill.name))) ?? groups[0]
      setDraft([...selected]); setFilter('all'); setQuery(''); setActiveId(first?.id ?? null); setMobileDetail(!!initialGroupId)
    }
    wasOpen.current = open
  }, [open, groups, selected, initialGroupId])
  useEffect(() => {
    if (open && mobileDetail && window.matchMedia('(max-width:600px)').matches) backRef.current?.focus({ preventScroll: true })
  }, [open, mobileDetail, activeId])

  const normalized = query.trim().toLocaleLowerCase()
  const visible = groups.map(group => {
    const groupMatches = !!normalized && nameOf(group).toLocaleLowerCase().includes(normalized)
    const skills = group.skills.filter(skill => (filter === 'all' || draft.includes(skill.name))
      && (!normalized || groupMatches || `${skill.name} ${skill.description}`.toLocaleLowerCase().includes(normalized)))
    return { group, skills }
  }).filter(row => row.skills.length)
  const active = visible.find(row => row.group.id === activeId) ?? visible[0]
  const total = groups.reduce((count, group) => count + group.skills.length, 0)
  const toggle = (name: string, checked: boolean) => { setDraft(value => checked ? [...value, name] : value.filter(item => item !== name)) }
  const choose = (group: SkillGroup) => { setActiveId(group.id); setMobileDetail(true); if (detailRef.current) detailRef.current.scrollTop = 0 }

  return <Modal open={open} headless title={t('selectSkills')} className={css.dialog} onClose={onClose}>
    <div className={css.shell} data-skill-picker>
      <header className={css.header}><div><h2>{t('selectSkills')}</h2></div><Button size="sm" shape="rounded" className={css.closeButton} icon={<IconCloseOutline16 />} aria-label={t('close')} onClick={onClose} /></header>
      <div className={css.toolbar}>
        <nav className={css.filters} aria-label={t('skillPickerFilter')}>{(['all', 'selected'] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} className={css.filter} onClick={() => { setFilter(value); setMobileDetail(false) }}>{t(value === 'all' ? 'skillPickerAll' : 'skillPickerSelected')}</button>)}</nav>
        <Input data-modal-autofocus className={css.search} icon={<IconSearchOutline16 />} aria-label={t('skillPickerSearch')} placeholder={t('skillPickerSearch')} value={query} onChange={event => { setQuery(event.currentTarget.value); setMobileDetail(false) }} />
      </div>
      <div className={css.body} data-detail={mobileDetail || undefined}>
        <section className={css.catalog} aria-label={t('skillPickerGroups')}>
          {loading && <p className={css.empty} role="status"><IconLoadingOutline16 />{t('catalogLoading')}</p>}
          {!loading && notice && <p className={css.empty}>{notice}</p>}
          {visible.map(({ group }) => {
            const state = skillGroupState(draft, group), available = group.skills.filter(skill => !skill.missing).length
            const chosen = group.skills.filter(skill => draft.includes(skill.name)).length
            return <div key={group.id} className={clsx(css.pluginRow, active?.group.id === group.id && css.activeRow)}>
              <input type="checkbox" className={css.checkbox} aria-label={t('skillPickerChooseGroup', { name: nameOf(group) })} checked={state === 'all'}
                ref={element => { if (element) element.indeterminate = state === 'partial' }} disabled={readOnly || !available && state === 'none'}
                onChange={event => { const checked = event.currentTarget.checked; setDraft(value => toggleSkillGroup(value, group, checked)) }} />
              <button type="button" ref={element => { if (element) rowRefs.current.set(group.id, element); else rowRefs.current.delete(group.id) }} className={css.pluginOpen} aria-current={active?.group.id === group.id ? 'true' : undefined} onClick={() => { choose(group) }}>
                <IconSkillOutline16 />
                <span className={css.pluginText}><strong>{nameOf(group)}</strong></span>
                <span className={css.rowCount}>{chosen ? t('skillSelectedCount', { selected: chosen, total: group.skills.length }) : t('skillGroupTotal', { count: group.skills.length })}</span>
                <IconChevronRightOutline14 className={css.rowChevron} />
              </button>
            </div>
          })}
          {!loading && !notice && !visible.length && <p className={css.empty}>{t(normalized ? 'noMatches' : filter === 'selected' ? 'skillPickerNoSelected' : 'noSkills')}</p>}
        </section>
        <section ref={detailRef} className={css.detail} aria-label={t('skillPickerDetail')}>
          {active && <>
            <button ref={backRef} type="button" className={css.back} onClick={() => { setMobileDetail(false); requestAnimationFrame(() => { rowRefs.current.get(active.group.id)?.focus({ preventScroll: true }) }) }}><IconChevronLeftOutline14 />{t('skillPickerGroups')}</button>
            <div className={css.detailHeading}><IconSkillOutline16 /><h3>{nameOf(active.group)}</h3><span className={css.detailCount}>{t('skillGroupTotal', { count: active.group.skills.length })}</span></div>
            <div className={css.toolHeading}><span>Skills</span><span>{active.group.skills.filter(skill => draft.includes(skill.name)).length} / {active.group.skills.length}</span></div>
            {active.skills.map(skill => <label className={css.toolRow} key={skill.name}>
              <input type="checkbox" className={css.checkbox} aria-label={t('skillPickerChoose', { name: skill.name })} checked={draft.includes(skill.name)}
                disabled={readOnly || skill.missing && !draft.includes(skill.name)} onChange={event => { toggle(skill.name, event.currentTarget.checked) }} />
              <span className={css.toolText}><strong>{skill.name}</strong>
                {skill.description && <small className={css.toolDescription} title={skill.description}>{skill.description}</small>}
                {skill.missing && <small className={css.conditionText}>{t('skillMissing')}</small>}</span>
            </label>)}
          </>}
        </section>
      </div>
      <footer className={css.footer}>
        <div className={css.summary} role="status"><strong>{t('skillPickerSummary', { count: draft.length, total })}</strong></div>
        {onRefresh && <Button size="sm" shape="rounded" className={css.refresh} disabled={loading} onClick={onRefresh}>{t('pluginPickerRefresh')}</Button>}
        {readOnly ? <Button variant="primary" onClick={onClose}>{t('close')}</Button> : <>
          <Button variant="outline" onClick={onClose}>{t('cancel')}</Button><Button variant="primary" onClick={() => { onComplete([...draft]) }}>{t('pluginPickerComplete')}</Button>
        </>}
      </footer>
    </div>
  </Modal>
}
