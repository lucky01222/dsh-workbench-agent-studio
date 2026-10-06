import { createHash } from 'node:crypto'
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { PluginBindings } from 'dsh-workbench-agent-studio-runtime/schema'
import { planLibraryOwnerMigration } from 'dsh-workbench-agent-studio-runtime/library-owner-compat'
import { resolveCapabilities } from 'dsh-workbench-agent-studio-runtime/capabilities'
import { Definition, Document, error } from './schema.mjs'

const names = z.array(z.string().min(1)).max(500)
const Projection = z.object({ tools: names, pluginBindings: PluginBindings.optional() }).strict()
const Receipt = z.object({
  version: z.literal(1), id: z.string().uuid(), agentId: z.string().uuid(),
  status: z.enum(['prepared', 'applied', 'undo-prepared', 'undone']),
  policy: z.enum(['saved', 'current']), sourceRevision: z.number().int().positive(),
  appliedRevision: z.number().int().positive(), permissionHash: z.string(), catalogHash: z.string(),
  before: Projection, after: Projection, documentHash: hashValue(),
  disabledBindings: PluginBindings, createdAt: z.string(), appliedAt: z.string().optional(),
  undoOperationId: z.string().uuid().optional(), undoSourceRevision: z.number().int().positive().optional(),
  undoneRevision: z.number().int().positive().optional(), undoneAt: z.string().optional(),
  undoPreparedAt: z.string().optional(), undoDocumentHash: hashValue().optional(),
}).strict()
export const ownerMigrationSpec = defineDomain({
  name: 'workbench_agent_studio_library_migrations', version: 1,
  tables: { operations: domainTable(Receipt) },
})
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])])) : value
export const permissionDigest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
export const permissionProjection = definition => Projection.parse({
  tools: [...definition.tools],
  ...(definition.pluginBindings !== undefined ? { pluginBindings: structuredClone(definition.pluginBindings) } : {}),
})
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const previewInput = z.object({
  id: z.string().uuid(), revision: z.number().int().positive(), cwd: z.string().optional(),
  policy: z.enum(['saved', 'current']).default('saved'),
}).strict()
const applyInput = previewInput.extend({ permissionHash: hash, catalogHash: hash, operationId: z.string().uuid() }).strict()
const undoInput = z.object({ id: z.string().uuid(), operationId: z.string().uuid(), undoOperationId: z.string().uuid(), cwd: z.string().optional() }).strict()
const stamp = () => new Date().toISOString()
function hashValue() { return z.string().regex(/^[a-f0-9]{64}$/) }
const nextDocument = (current, projection, revision, updatedAt) => Document.parse({
  ...current, definition: Definition.parse({ ...current.definition, ...structuredClone(projection) }), revision, updatedAt,
})

/** Permission-only journal. Prompts, run outputs and frozen sessions never enter it. */
export class LibraryOwnerMigrations {
  constructor(owner, domain) { this.owner = owner; this.domain = domain }
  operations() { return this.domain.table('operations') }
  document(id) {
    const doc = this.owner.domain.table('agents').get(id)
    if (!doc) throw error('Agent 不存在。', 'NOT_FOUND')
    return structuredClone(doc)
  }
  checkMutable(doc) {
    if (doc.deleted) throw error('已删除的 Agent 保持原状，不迁移或恢复。', 'AGENT_DELETED')
    if (doc.readOnly) throw error('只读预设不能直接迁移，请先复制。', 'READ_ONLY')
    if (doc.baseYaml) throw error('此角色包含自定义组件配置，需要先核对组件与工具范围。', 'COMPOSITION_REVIEW_REQUIRED')
    if (doc.capabilityResolution) throw error('此定义带有冻结运行范围，请先另存当前角色。', 'FROZEN_DEFINITION')
  }
  latest(id) {
    return [...this.operations().entries()].map(([, value]) => value).filter(value => value.agentId === id)
      .sort((a, b) => Number(['prepared', 'undo-prepared'].includes(b.status)) - Number(['prepared', 'undo-prepared'].includes(a.status))
        || b.sourceRevision - a.sourceRevision || b.createdAt.localeCompare(a.createdAt))[0]
  }
  assertNoPending(id, allowedOperationId) {
    const pending = [...this.operations().entries()].map(([, value]) => value)
      .find(value => value.agentId === id && ['prepared', 'undo-prepared'].includes(value.status) && value.id !== allowedOperationId)
    if (pending) throw error('此 Agent 有待核对的权限迁移，请使用原操作记录完成恢复。', 'MIGRATION_PENDING')
  }
  async preview(raw) {
    const input = previewInput.parse(raw), doc = this.document(input.id)
    if (doc.revision !== input.revision) throw error('Agent 已更新，请重新核对后迁移。', 'REVISION_CONFLICT')
    const before = permissionProjection(doc.definition), base = {
      version: 1, id: doc.id, revision: doc.revision, policy: input.policy,
      permissionHash: permissionDigest(before), catalogHash: '',
      status: 'blocked', before, after: structuredClone(before), added: [], removed: [],
      disabledBindings: {}, affectedOwners: [], reasons: [],
      ...(this.latest(doc.id) ? { receipt: structuredClone(this.latest(doc.id)) } : {}),
    }
    try { this.checkMutable(doc) } catch (cause) { return { ...base, reasons: [cause.message] } }
    const cwd = await this.owner.directory(input.cwd || this.owner.cwd)
    const catalog = await this.owner.catalog(cwd)
    const catalogHash = permissionDigest(catalog.tools.map(row => ({
      name: row.id || row.name, pluginId: row.pluginId ?? null, pluginVersion: row.pluginVersion ?? null,
      unavailable: row.unavailable || null,
    })).sort((a, b) => a.name.localeCompare(b.name) || String(a.pluginId).localeCompare(String(b.pluginId))))
    const plan = planLibraryOwnerMigration(doc.definition, catalog.tools, { policy: input.policy })
    if (plan.status === 'ready') {
      try { resolveCapabilities(Definition.parse({ ...doc.definition, ...plan.after }), catalog.tools) }
      catch (cause) { return { ...base, ...plan, catalogHash, status: 'blocked', reasons: [cause.message] } }
    }
    return { ...base, ...plan, catalogHash }
  }
  sameOperation(receipt, input) {
    if (receipt.agentId !== input.id || receipt.sourceRevision !== input.revision || receipt.policy !== input.policy
      || receipt.permissionHash !== input.permissionHash || receipt.catalogHash !== input.catalogHash) {
      throw error('操作标识已用于另一项迁移。', 'OPERATION_CONFLICT')
    }
  }
  async writeRevision(current, projection, revision, updatedAt) {
    const next = nextDocument(current, projection, revision, updatedAt)
    const key = current.id + ':' + revision, existing = this.owner.domain.table('revisions').get(key)
    if (existing && permissionDigest(existing) !== permissionDigest(next)) {
      throw error('该修订已有不同内容，保留现有记录。', 'REVISION_CONFLICT')
    }
    if (!existing) await this.owner.domain.table('revisions').put(key, next)
    await this.owner.domain.table('agents').put(current.id, next)
    await this.owner.register(next)
    return next
  }
  async apply(raw) {
    const input = applyInput.parse(raw)
    return this.owner.lock(async () => {
      let receipt = this.operations().get(input.operationId)
      if (receipt) {
        this.sameOperation(receipt, input)
        if (receipt.status === 'undone') throw error('原迁移已被撤销，请重新读取操作记录。', 'MIGRATION_UNDONE')
        if (receipt.status === 'undo-prepared') throw error('原迁移的撤销待完成，请核对原撤销记录。', 'MIGRATION_UNDO_PENDING')
        if (receipt.status === 'applied') return { document: this.document(input.id), receipt: structuredClone(receipt) }
        this.assertNoPending(input.id, receipt.id)
      } else {
        this.assertNoPending(input.id)
        const preview = await this.preview(inputForPreview(input))
        if (preview.permissionHash !== input.permissionHash || preview.catalogHash !== input.catalogHash) {
          throw error('权限或插件目录已变化，请重新预览。', 'MIGRATION_PREVIEW_CHANGED')
        }
        if (preview.status !== 'ready') throw error(preview.reasons.join('；') || '当前定义不需要迁移。', 'MIGRATION_BLOCKED')
        const createdAt = stamp(), target = nextDocument(this.document(input.id), preview.after, input.revision + 1, createdAt)
        receipt = Receipt.parse({
          version: 1, id: input.operationId, agentId: input.id, status: 'prepared', policy: input.policy,
          sourceRevision: input.revision, appliedRevision: input.revision + 1,
          permissionHash: input.permissionHash, catalogHash: input.catalogHash,
          before: preview.before, after: preview.after, documentHash: permissionDigest(target), disabledBindings: preview.disabledBindings, createdAt,
        })
        await this.operations().put(receipt.id, receipt)
      }
      const current = this.document(input.id)
      this.checkMutable(current)
      const currentHash = permissionDigest(permissionProjection(current.definition))
      let next = current
      const revision = this.owner.domain.table('revisions').get(input.id + ':' + receipt.appliedRevision)
      if (currentHash === permissionDigest(receipt.after) && current.revision >= receipt.appliedRevision
        && revision && permissionDigest(revision) === receipt.documentHash) {
        // A committed current document proves completion after a lost response.
        await this.owner.register(current)
      } else if (currentHash === permissionDigest(receipt.before) && current.revision === receipt.sourceRevision) {
        const preview = await this.preview(inputForPreview(input))
        if (preview.catalogHash !== receipt.catalogHash || permissionDigest(preview.after) !== permissionDigest(receipt.after)) {
          throw error('插件目录或迁移结果已变化，请核对待完成操作。', 'MIGRATION_PREVIEW_CHANGED')
        }
        next = await this.writeRevision(current, receipt.after, receipt.appliedRevision, receipt.createdAt)
      } else throw error('Agent 已被其他操作修改，未继续迁移。', 'REVISION_CONFLICT')
      receipt = Receipt.parse({ ...receipt, status: 'applied', appliedAt: stamp() })
      await this.operations().put(receipt.id, receipt)
      return { document: structuredClone(next), receipt: structuredClone(receipt) }
    })
  }
  async undo(raw) {
    const input = undoInput.parse(raw)
    return this.owner.lock(async () => {
      let receipt = this.operations().get(input.operationId)
      if (!receipt || receipt.agentId !== input.id) throw error('迁移回执不存在或不属于此 Agent。', 'NOT_FOUND')
      if (receipt.undoOperationId && receipt.undoOperationId !== input.undoOperationId) throw error('此迁移已有另一项撤销操作。', 'OPERATION_CONFLICT')
      if (receipt.status === 'undone') return { document: this.document(input.id), receipt: structuredClone(receipt) }
      if (!['applied', 'undo-prepared'].includes(receipt.status)) throw error('请先核对并完成原迁移。', 'MIGRATION_PENDING')
      this.assertNoPending(input.id, receipt.id)
      const current = this.document(input.id)
      this.checkMutable(current)
      const currentHash = permissionDigest(permissionProjection(current.definition))
      if (receipt.status === 'applied') {
        if (currentHash !== permissionDigest(receipt.after)) throw error('权限在迁移后已修改，不能覆盖这些选择。', 'UNDO_PERMISSION_CONFLICT')
        const undoPreparedAt = stamp()
        receipt = Receipt.parse({ ...receipt, status: 'undo-prepared', undoOperationId: input.undoOperationId,
          undoSourceRevision: current.revision, undoneRevision: current.revision + 1, undoPreparedAt,
          undoDocumentHash: permissionDigest(nextDocument(current, receipt.before, current.revision + 1, undoPreparedAt)) })
        await this.operations().put(receipt.id, receipt)
      }
      let next = current
      const revision = this.owner.domain.table('revisions').get(input.id + ':' + receipt.undoneRevision)
      if (currentHash === permissionDigest(receipt.before) && current.revision >= receipt.undoneRevision
        && revision && permissionDigest(revision) === receipt.undoDocumentHash) {
        // The original projection is already restored; retain later unrelated edits.
        await this.owner.register(current)
      } else if (currentHash === permissionDigest(receipt.after) && current.revision === receipt.undoSourceRevision) {
        next = await this.writeRevision(current, receipt.before, receipt.undoneRevision, receipt.undoPreparedAt)
      } else throw error('Agent 在撤销准备后已更新，请核对操作。', 'REVISION_CONFLICT')
      receipt = Receipt.parse({ ...receipt, status: 'undone', undoneAt: stamp() })
      await this.operations().put(receipt.id, receipt)
      return { document: structuredClone(next), receipt: structuredClone(receipt) }
    })
  }
}
const inputForPreview = ({ id, revision, cwd, policy }) => ({ id, revision, cwd, policy })
