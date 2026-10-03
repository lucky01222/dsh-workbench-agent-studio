import test from 'node:test'
import assert from 'node:assert/strict'
import { PluginChoiceStore, samePluginSelection } from '../packages/ui/src/client/plugin-choice-store.mjs'

const doc = (id = 'a', revision = 2, tools = ['read', 'write']) => ({ id, revision, definition: { tools } })
const choices = { '@deepseek-ai/dsh-tool-fs': { enabled: true, mode: 'all', tools: ['write', 'read'] } }
function setup(origin = 'http://localhost:3288', storage) {
  const values = new Map()
  const target = storage || { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  return { values, store: new PluginChoiceStore({ storage: () => target, origin: () => origin }) }
}
test('whole-plugin intent only restores against its saved server revision and exact tool set', () => {
  const { store } = setup()
  assert.equal(store.write(doc(), '/workspace', choices), true)
  assert.equal(store.read(doc('a', 2, ['write', 'read']), '/workspace')['@deepseek-ai/dsh-tool-fs'].mode, 'all')
  assert.equal(store.read(doc('a', 3), '/workspace'), null)
  assert.equal(store.read(doc('a', 2, ['read']), '/workspace'), null)
})
test('records cannot cross workspace, browser origin or Agent identity', () => {
  const { store, values } = setup()
  store.write(doc(), '/workspace', choices)
  assert.equal(store.read(doc(), '/other'), null)
  assert.equal(store.read(doc('b'), '/workspace'), null)
  const other = setup('http://localhost:3284', { getItem: key => values.get(key) }).store
  assert.equal(other.read(doc(), '/workspace'), null)
})
test('corrupt or unsupported browser records never override Host tools', () => {
  const { store, values } = setup()
  values.set(store.key('/workspace', 'a'), '{bad')
  assert.equal(store.read(doc(), '/workspace'), null)
  store.write(doc(), '/workspace', choices)
  const record = JSON.parse(values.get(store.key('/workspace', 'a')))
  record.selection['@deepseek-ai/dsh-tool-fs'].mode = 'future-mode'
  values.set(store.key('/workspace', 'a'), JSON.stringify(record))
  assert.equal(store.read(doc(), '/workspace'), null)
})
test('read-only presets never acquire writable intent and failed browser storage is reported', () => {
  const { store } = setup()
  assert.equal(store.write({ ...doc(), readOnly: true }, '/workspace', choices), false)
  const broken = setup('local', { setItem() { throw Error('quota') } }).store
  assert.equal(broken.write(doc(), '/workspace', choices), false)
})
test('delete removes only the deleted Agent intent; inactive catalog preferences do not mark a save dirty', () => {
  const { store } = setup()
  store.write(doc(), '/workspace', choices)
  store.write(doc('b'), '/workspace', choices)
  store.remove('/workspace', 'a')
  assert.equal(store.read(doc(), '/workspace'), null)
  assert.ok(store.read(doc('b'), '/workspace'))
  assert.equal(samePluginSelection(null, {}), true)
  assert.equal(samePluginSelection(choices, { ...choices, disabled: { enabled: false, mode: 'all', tools: ['other'] } }), true)
})

test('durable server bindings make matching browser sidecars ineligible even at the same revision and tool set', () => {
  const { store } = setup()
  store.write(doc(), '/workspace', choices)
  const bound = { ...doc(), definition: { tools: ['read', 'write'], pluginBindings: {
    '@deepseek-ai/dsh-tool-fs': { enabled: true, mode: 'custom', tools: ['read', 'write'] },
  } } }
  assert.equal(store.read(bound, '/workspace'), null)
})
