import { Button, IconCloseOutline16, IconPlusOutline16, IconSkillOutline16 } from './primitives.tsx'
import css from './PluginCapabilitySummary.module.css'

export interface SkillGroup { id: string; name?: string; nameKey?: string; skills: { name: string; description: string; missing?: boolean }[] }
interface Props {
  groups: readonly SkillGroup[]
  selected: readonly string[]
  readOnly?: boolean
  loading?: boolean
  t: (key: string, values?: Record<string, string | number>) => string
  onOpen: (groupId?: string) => void
  onRemove: (names: readonly string[]) => void
}

/** Same projection as plugin capabilities: one row per source, each row opens its skills. */
export function SkillSummary({ groups, selected, readOnly, loading, t, onOpen, onRemove }: Props) {
  const rows = groups.map(group => ({ group, chosen: group.skills.filter(skill => selected.includes(skill.name)) })).filter(row => row.chosen.length)
  return <div className={css.root}>
    <div className={css.heading}>
      <span aria-live="polite">{loading && !selected.length ? t('catalogLoading') : selected.length ? t('skillSummary', { count: selected.length }) : t('skillSummaryEmpty')}</span>
      <Button size="sm" variant="outline" shape="rounded" icon={readOnly ? undefined : <IconPlusOutline16 />} onClick={() => { onOpen() }}>{t(readOnly ? 'viewCapabilities' : 'selectSkills')}</Button>
    </div>
    {rows.length > 0 && <div className={css.rows}>{rows.map(({ group, chosen }) => {
      const name = group.nameKey ? t(group.nameKey) : group.name ?? group.id, names = chosen.map(skill => skill.name)
      return <div className={css.row} key={group.id}>
        <IconSkillOutline16 />
        <button type="button" className={css.title} onClick={() => { onOpen(group.id) }}>
          <strong>{name}</strong><small className={css.names} title={names.join('、')}>{names.join('、')}</small>
        </button>
        <span className={css.count}>{t('skillGroupTotal', { count: chosen.length })}</span>
        {!readOnly && <Button size="sm" shape="rounded" className={css.remove} icon={<IconCloseOutline16 />}
          aria-label={t('skillRemoveGroup', { name })} title={t('skillRemoveGroup', { name })} onClick={() => { onRemove(names) }} />}
      </div>
    })}</div>}
  </div>
}
