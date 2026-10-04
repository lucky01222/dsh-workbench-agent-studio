import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { StudioService } from '../packages/service/src/service.mjs'
import { Document } from '../packages/service/src/schema.mjs'
import { LibraryOwnerMigrations, permissionProjection } from '../packages/service/src/library-owner-migrations.mjs'
import { LEGACY_LIBRARY_TOOLS, LEGACY_KNOWLEDGE_TOOLS } from '../packages/runtime/src/library-owner-compat.mjs'

const L = 'dsh-workbench-library', K = 'dsh-library-knowledge', O = 'dsh-workbench-office'
const content7 = LEGACY_LIBRARY_TOOLS.slice(0, 7), read5 = [...LEGACY_KNOWLEDGE_TOOLS]
const base = { name: 'Synthetic Agent', description: '', modelSelection: 'explicit', provider: 'fixture', model: 'no-network',
  systemPrompt: 'Synthetic private persona must not enter permission receipts', tools: [...content7, ...read5], skills: [],
  pluginBindings: { [L]: { enabled: true, mode: 'all', tools: content7 }, [K]: { enabled: true, mode: 'all', tools: read5 },
    [O]: { enabled: false, mode: 'custom', tools: ['univer_status'] } } }
function fixture(definition = base, flags = {}) {
  const values = new Map(), journal = new Map(), writes = [], registrations = []
  let failure
  const table = (name, store = values) => {
    if (!store.has(name)) store.set(name, new Map())
    const data = store.get(name)
    return { get: id => data.get(id), entries: () => data.entries(), put: async (id, value) => {
      if (failure) await failure(name, id, value)
      writes.push({ name, id }); data.set(id, structuredClone(value))
    } }
  }
  const domain = { table, close: async () => {} }, migrationDomain = { table: name => table(name, journal), close: async () => {} }
  const owner = new StudioService({ agentPresets: { register: async value => { registrations.push(value); return async () => {} } } })
  owner.domain = domain; owner.cwd = '/fixture'; owner.directory = async path => path
  let rows = [...LEGACY_LIBRARY_TOOLS, ...read5].map(name => ({ name, pluginId: L, pluginVersion: '0.23.1' }))
  owner.catalog = async () => ({ tools: rows, skills: [] })
  const doc = Document.parse({ id: randomUUID(), revision: 1, createdAt: '2026-10-04T00:00:00.000Z',
    updatedAt: '2026-10-04T00:00:00.000Z', definition: structuredClone(definition), ...flags })
  table('agents').put(doc.id, doc); table('revisions').put(doc.id + ':1', doc)
  const migrations = new LibraryOwnerMigrations(owner, migrationDomain); owner.ownerMigrations = migrations
  writes.length = 0
  const preview = (policy = 'saved', revision = table('agents').get(doc.id).revision) => migrations.preview({ id: doc.id, revision, policy })
  const input = value => ({ id: doc.id, revision: value.revision, policy: value.policy,
    permissionHash: value.permissionHash, catalogHash: value.catalogHash, operationId: randomUUID() })
  return { owner, migrations, table, doc, writes, registrations, preview, input,
    journal: () => [...migrationDomain.table('operations').entries()].map(([, value]) => value),
    rows: next => { rows = next }, fail: next => { failure = next } }
}
test('preview is permission-only and exposes saved12 versus explicitly requested current15 without writes', async () => {
  const f = fixture(), saved = await f.preview(), current = await f.preview('current')
  assert.equal(saved.status, 'ready'); assert.equal(saved.after.tools.length, 12); assert.deepEqual(saved.added, [])
  assert.equal(current.after.tools.length, 15)
  assert.deepEqual([...current.added].sort(), ['library_ingest', 'library_ingest_operation', 'library_sources'])
  assert.equal(f.writes.length, 0); assert.equal(f.registrations.length, 0)
  assert.ok(!JSON.stringify(saved).includes(base.systemPrompt))
  assert.deepEqual(saved.after.pluginBindings[O], base.pluginBindings[O])
})
test('ordinary persona save validates old bindings without silently persisting owner migration', async () => {
  const f = fixture()
  const saved = await f.owner.dispatch('save', { id: f.doc.id, revision: 1, definition: { ...base, systemPrompt: 'Explicit new persona' } })
  assert.equal(saved.revision, 2); assert.equal(saved.definition.systemPrompt, 'Explicit new persona')
  assert.deepEqual(saved.definition.pluginBindings, base.pluginBindings)
  assert.equal(saved.definition.tools.length, 12)
  assert.equal(f.journal().length, 0)
  assert.equal((await f.preview()).status, 'ready')
})
test('apply is CAS-bound, idempotent, adds one revision and never rewrites frozen history', async () => {
  const f = fixture(), historical = structuredClone(f.table('revisions').get(f.doc.id + ':1'))
  const p = await f.preview(), input = f.input(p), first = await f.migrations.apply(input), count = f.writes.length
  assert.equal(first.document.revision, 2); assert.equal(first.receipt.status, 'applied')
  assert.equal(first.document.definition.pluginBindings[L].mode, 'custom')
  assert.equal(first.document.definition.tools.length, 12); assert.equal(first.document.definition.pluginBindings[K], undefined)
  assert.deepEqual(f.table('revisions').get(f.doc.id + ':1'), historical)
  assert.ok(!JSON.stringify(first.receipt).includes(base.systemPrompt))
  assert.deepEqual(await f.migrations.apply(input), first); assert.equal(f.writes.length, count)
  await assert.rejects(f.migrations.apply({ ...input, policy: 'current' }), { code: 'OPERATION_CONFLICT' })
  await assert.rejects(f.migrations.apply({ ...input, operationId: randomUUID() }), { code: 'REVISION_CONFLICT' })
})
test('catalog changes invalidate preview before a durable preparation or Agent write', async () => {
  const f = fixture(), p = await f.preview(), input = f.input(p)
  f.rows([...LEGACY_LIBRARY_TOOLS, ...read5].map(name => ({ name, pluginId: L, pluginVersion: '0.23.2' })))
  await assert.rejects(f.migrations.apply(input), { code: 'MIGRATION_PREVIEW_CHANGED' })
  assert.equal(f.writes.length, 0); assert.deepEqual(f.table('agents').get(f.doc.id), f.doc)
})
test('mixed enablement grants only old read5 and undo restores all disabled choices without changing persona edits', async () => {
  const definition = structuredClone(base); definition.pluginBindings[L].enabled = false; definition.tools = read5
  const f = fixture(definition), p = await f.preview(), applied = await f.migrations.apply(f.input(p))
  assert.deepEqual(applied.document.definition.tools, read5)
  assert.deepEqual(applied.receipt.disabledBindings[L], definition.pluginBindings[L])
  const current = f.table('agents').get(f.doc.id)
  f.table('agents').put(f.doc.id, { ...current, revision: 3, definition: { ...current.definition, systemPrompt: 'Later persona edit', description: 'Later description' } })
  const undoInput = { id: f.doc.id, operationId: applied.receipt.id, undoOperationId: randomUUID() }
  const undone = await f.migrations.undo(undoInput)
  assert.equal(undone.document.revision, 4); assert.equal(undone.document.definition.systemPrompt, 'Later persona edit')
  assert.equal(undone.document.definition.description, 'Later description')
  assert.deepEqual(permissionProjection(undone.document.definition), permissionProjection(definition))
  const count = f.writes.length; assert.deepEqual(await f.migrations.undo(undoInput), undone); assert.equal(f.writes.length, count)
  assert.deepEqual(f.table('revisions').get(f.doc.id + ':2'), applied.document)
})
test('later permission edits block undo rather than overwriting them', async () => {
  const f = fixture(), applied = await f.migrations.apply(f.input(await f.preview()))
  const current = f.table('agents').get(f.doc.id)
  const definition = structuredClone(current.definition); definition.tools.pop(); definition.pluginBindings[L].tools.pop()
  f.table('agents').put(f.doc.id, { ...current, revision: 3, definition })
  await assert.rejects(f.migrations.undo({ id: f.doc.id, operationId: applied.receipt.id, undoOperationId: randomUUID() }), { code: 'UNDO_PERMISSION_CONFLICT' })
  assert.deepEqual(f.table('agents').get(f.doc.id).definition, definition)
})
test('deleted, read-only, composed and frozen definitions remain untouched and cannot apply', async () => {
  for (const flags of [{ deleted: true }, { readOnly: true }, { baseYaml: '[]' },
    { capabilityResolution: { version: 1, resolvedAt: '', tools: base.tools, plugins: [] } }]) {
    const f = fixture(base, flags), p = await f.preview()
    assert.equal(p.status, 'blocked'); assert.ok(p.reasons.length)
    assert.deepEqual(f.table('agents').get(f.doc.id), f.doc); assert.equal(f.writes.length, 0)
  }
})
test('lost completion journal write replays the committed revision and registers the effective role', async () => {
  const f = fixture(), input = f.input(await f.preview()); let failed = false
  f.fail(async (name, _id, value) => { if (!failed && name === 'operations' && value.status === 'applied') { failed = true; throw Error('Simulated durability failure') } })
  await assert.rejects(f.migrations.apply(input), /durability/)
  assert.equal(f.table('agents').get(f.doc.id).revision, 2); assert.equal(f.journal()[0].status, 'prepared')
  const retry = await f.migrations.apply(input)
  assert.equal(retry.receipt.status, 'applied'); assert.equal(retry.document.revision, 2)
  assert.equal([...f.table('revisions').entries()].length, 2)
  assert.ok(f.registrations.length >= 2)
})
test('a prepared revision is not overwritten by ordinary save, and retry finishes the original operation', async () => {
  const f = fixture(), input = f.input(await f.preview()); let failed = false
  f.fail(async (name, _id, value) => { if (!failed && name === 'agents' && value.revision === 2) { failed = true; throw Error('Simulated current document failure') } })
  await assert.rejects(f.migrations.apply(input), /document failure/)
  assert.equal(f.table('agents').get(f.doc.id).revision, 1)
  const reserved = structuredClone(f.table('revisions').get(f.doc.id + ':2'))
  await assert.rejects(f.owner.dispatch('save', { id: f.doc.id, revision: 1, definition: { ...base, systemPrompt: 'Concurrent edit' } }), { code: 'MIGRATION_PENDING' })
  assert.deepEqual(f.table('revisions').get(f.doc.id + ':2'), reserved)
  assert.equal((await f.migrations.apply(input)).document.revision, 2)
})
test('undo resumes after a lost journal response and does not create another revision', async () => {
  const f = fixture(), applied = await f.migrations.apply(f.input(await f.preview()))
  const input = { id: f.doc.id, operationId: applied.receipt.id, undoOperationId: randomUUID() }; let failed = false
  f.fail(async (name, _id, value) => { if (!failed && name === 'operations' && value.status === 'undone') { failed = true; throw Error('Simulated undo journal failure') } })
  await assert.rejects(f.migrations.undo(input), /undo journal/)
  assert.equal(f.table('agents').get(f.doc.id).revision, 3)
  const retry = await f.migrations.undo(input)
  assert.equal(retry.receipt.status, 'undone'); assert.equal(retry.document.revision, 3)
  assert.equal([...f.table('revisions').entries()].length, 3)
})
test('prepared journal blocks all new writes even before the target revision exists', async () => {
  const f = fixture(), preview = await f.preview(), input = f.input(preview); let failed = false
  f.fail(async (name, _id, value) => { if (!failed && name === 'revisions' && value.revision === 2) { failed = true; throw Error('Simulated first revision failure') } })
  await assert.rejects(f.migrations.apply(input), /first revision/)
  assert.equal(f.journal()[0].status, 'prepared'); assert.equal(f.table('revisions').get(f.doc.id + ':2'), undefined)
  await assert.rejects(f.owner.dispatch('save', { id: f.doc.id, revision: 1, definition: { ...base, systemPrompt: 'Cannot hide pending operation' } }), { code: 'MIGRATION_PENDING' })
  await assert.rejects(f.owner.dispatch('delete', { id: f.doc.id }), { code: 'MIGRATION_PENDING' })
  await assert.rejects(f.migrations.apply({ ...input, operationId: randomUUID() }), { code: 'MIGRATION_PENDING' })
  assert.equal((await f.preview()).receipt.id, input.operationId)
  assert.equal((await f.migrations.apply(input)).receipt.status, 'applied')
  assert.equal(f.journal().length, 1)
})
test('an original lost Apply cannot reapply an operation already undone by another client', async () => {
  const f = fixture(), input = f.input(await f.preview()), applied = await f.migrations.apply(input)
  await f.migrations.undo({ id: f.doc.id, operationId: applied.receipt.id, undoOperationId: randomUUID() })
  const count = f.writes.length
  await assert.rejects(f.migrations.apply(input), { code: 'MIGRATION_UNDONE' })
  assert.equal(f.writes.length, count); assert.equal((await f.preview()).receipt.status, 'undone')
})
