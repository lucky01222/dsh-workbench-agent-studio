/**
 * Skills grouped the way tools are: plugin-shipped skills under their plugin, local
 * skills under project/user, and selected names the catalog no longer lists under
 * "unavailable". Without a catalog every selected name stays in one neutral group.
 */
const rank = id => id.startsWith('plugin:') ? 0 : id === 'project' ? 1 : id === 'user' ? 2 : id === 'other' ? 3 : 4

export function skillGroups(catalogSkills, selected, plugins = []) {
  if (!catalogSkills) return selected.length ? [{ id: 'selected', nameKey: 'skillGroupSelected', skills: selected.map(name => ({ name, description: '' })) }] : []
  const groups = new Map()
  const add = (id, label, skill) => {
    if (!groups.has(id)) groups.set(id, { id, ...label, skills: [] })
    groups.get(id).skills.push(skill)
  }
  for (const skill of catalogSkills) {
    const owner = typeof skill.owner === 'string' ? skill.owner : '', source = typeof skill.source === 'string' ? skill.source : ''
    if (owner) {
      const plugin = plugins.find(item => item.id === owner || item.packageName === owner)
      add('plugin:' + owner, plugin?.nameKey ? { nameKey: plugin.nameKey } : { name: plugin?.name || owner }, skill)
    } else if (source.startsWith('project')) add('project', { nameKey: 'skillGroupProject' }, skill)
    else if (source.startsWith('user')) add('user', { nameKey: 'skillGroupUser' }, skill)
    else add('other', { nameKey: 'skillGroupOther' }, skill)
  }
  const known = new Set(catalogSkills.map(skill => skill.name))
  for (const name of selected) if (!known.has(name)) add('missing', { nameKey: 'skillGroupMissing' }, { name, description: '', missing: true })
  // Array sort is stable, so catalog order is kept inside each rank.
  return [...groups.values()].sort((a, b) => rank(a.id) - rank(b.id))
}

/** Toggle every skill of one group in a selection, keeping the selection's order. */
export function toggleSkillGroup(selected, group, checked) {
  const names = group.skills.map(skill => skill.name)
  if (!checked) return selected.filter(name => !names.includes(name))
  return [...selected, ...names.filter(name => !selected.includes(name) && !group.skills.find(skill => skill.name === name)?.missing)]
}

/** 'all' | 'partial' | 'none' for a group's checkbox. */
export function skillGroupState(selected, group) {
  const chosen = group.skills.filter(skill => selected.includes(skill.name)).length
  return chosen === 0 ? 'none' : chosen === group.skills.length ? 'all' : 'partial'
}
