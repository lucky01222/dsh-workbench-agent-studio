import test from 'node:test'
import assert from 'node:assert/strict'
import { skillGroups, toggleSkillGroup, skillGroupState } from '../packages/ui/src/client/skill-groups.mjs'
import { skillOwner } from '../packages/service/src/skill-owner.mjs'

const profile = '/home/u/runtime/home/profiles/web/node_modules'
test('skill owners come from the bundle under the profile, including nested and scoped packages', () => {
  assert.equal(skillOwner(`${profile}/dsh-workbench-office/node_modules/dsh-workbench-univer/skills/univer/SKILL.md`), 'dsh-workbench-office')
  assert.equal(skillOwner(`${profile}/@openviking/dsh-memory-plugin/skills/openviking-memory/SKILL.md`), '@openviking/dsh-memory-plugin')
  assert.equal(skillOwner(`${profile}/dsh-workbench-library/skills/library-knowledge/SKILL.md`), 'dsh-workbench-library')
  assert.equal(skillOwner('/home/u/.dsh/skills/notes/SKILL.md'), undefined)
  assert.equal(skillOwner(undefined), undefined)
})

const plugins = [{ id: 'dsh-workbench-office', nameKey: 'pluginCapabilityOffice' }, { id: 'dsh-workbench-library', name: '资料库' }]
const catalog = [
  { name: 'notes', description: 'mine', source: 'user-dsh' },
  { name: 'univer', description: 'u', source: 'bundled', owner: 'dsh-workbench-office' },
  { name: 'univer-doc', description: 'd', source: 'bundled', owner: 'dsh-workbench-office' },
  { name: 'library-knowledge', description: 'k', source: 'bundled', owner: 'dsh-workbench-library' },
  { name: 'openviking-memory', description: 'm', source: 'bundled', owner: '@openviking/dsh-memory-plugin' },
  { name: 'repo-guide', description: 'p', source: 'project-dsh' },
]
test('skills are grouped by owning plugin first, then project, user and unavailable selections', () => {
  const groups = skillGroups(catalog, ['univer', 'gone'], plugins)
  assert.deepEqual(groups.map(group => group.id), ['plugin:dsh-workbench-office', 'plugin:dsh-workbench-library', 'plugin:@openviking/dsh-memory-plugin', 'project', 'user', 'missing'])
  assert.equal(groups[0].nameKey, 'pluginCapabilityOffice'); assert.equal(groups[1].name, '资料库'); assert.equal(groups[2].name, '@openviking/dsh-memory-plugin')
  assert.deepEqual(groups.at(-1).skills, [{ name: 'gone', description: '', missing: true }])
})
test('without a catalog the selection is kept in one neutral group', () => {
  assert.deepEqual(skillGroups(null, ['a'], plugins), [{ id: 'selected', nameKey: 'skillGroupSelected', skills: [{ name: 'a', description: '' }] }])
  assert.deepEqual(skillGroups(null, [], plugins), [])
})
test('a group checkbox selects or clears exactly its skills and reports partial state', () => {
  const [office] = skillGroups(catalog, [], plugins)
  assert.equal(skillGroupState(['univer'], office), 'partial')
  assert.deepEqual(toggleSkillGroup(['notes', 'univer'], office, true), ['notes', 'univer', 'univer-doc'])
  assert.deepEqual(toggleSkillGroup(['notes', 'univer', 'univer-doc'], office, false), ['notes'])
  assert.equal(skillGroupState(['univer', 'univer-doc'], office), 'all')
  const missing = skillGroups(catalog, ['gone'], plugins).at(-1)
  assert.deepEqual(toggleSkillGroup([], missing, true), [], 'an unavailable skill is never newly added')
})
