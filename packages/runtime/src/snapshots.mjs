import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { Definition, CapabilityResolution } from './schema.mjs'
import { resolveCapabilities, toolsForScope } from './capabilities.mjs'

const FrozenCapabilities = z.object({ definition: Definition, resolution: CapabilityResolution }).strict()
const Snapshot = FrozenCapabilities.extend({ sessionId: z.string().min(1), presetId: z.string().optional() }).strict()
export const capabilitySnapshotSpec = defineDomain({ name: 'workbench_agent_studio_capabilities', version: 1,
  tables: { sessions: domainTable(Snapshot) } })
const clone = value => structuredClone(value)
const toolName = name => name.replace(/^openconnector\//, '')
const unavailable = message => Object.assign(new Error(message), { code: 'CAPABILITY_UNAVAILABLE' })

/** Keep an inherited capability ceiling while respecting the child's own filter. */
export function restrictCapabilities(snapshot, allowed) {
  const names = new Set([...allowed].map(toolName))
  const tools = snapshot.resolution.tools.filter(name => names.has(toolName(name)))
  return FrozenCapabilities.parse({
    definition: { ...snapshot.definition, tools, skills: tools.includes('skill') ? snapshot.definition.skills : [] },
    resolution: { ...snapshot.resolution, tools,
      plugins: snapshot.resolution.plugins.map(plugin => ({ ...plugin, tools: plugin.tools.filter(name => tools.includes(name)) })),
      ...(snapshot.resolution.toolOwners ? { toolOwners: Object.fromEntries(Object.entries(snapshot.resolution.toolOwners).filter(([name]) => tools.includes(name))) } : {}) },
  })
}

/** A frozen name cannot silently move to another owning plugin on resume. */
function validateAvailable(snapshot, rows) {
  const available = new Map(rows.flatMap(row => [[toolName(row.id || row.name), row], [row.name, row]]))
  for (const name of snapshot.resolution.tools) {
    const row = available.get(toolName(name))
    if (!row || row.unavailable) throw unavailable(`工具不可用：${name}`)
    const owner = snapshot.resolution.toolOwners?.[name]
      || snapshot.resolution.plugins.find(plugin => plugin.id !== 'unassigned' && plugin.tools.includes(name))?.id
    if (owner && row.pluginId !== owner) throw unavailable(`工具归属已变化：${name}`)
  }
}

function parseFrozen(value) {
  const snapshot = FrozenCapabilities.parse(value)
  if (snapshot.definition.tools.length !== snapshot.resolution.tools.length
    || snapshot.definition.tools.some(name => !snapshot.resolution.tools.includes(name))) {
    throw unavailable('运行工具快照与 Agent 配置不一致。')
  }
  return snapshot
}

/**
 * One Host-owned domain, shared by every preset generation. No custom session
 * events: official rc.2 cannot restore unknown required event types.
 */
export class CapabilitySnapshots {
  constructor(domain, readTools, resolve = resolveCapabilities) {
    this.domain = domain
    this.readTools = readTools
    this.resolveDefinition = resolve
    this.pending = new Map()
    this.closing = false
  }

  get(sessionId) {
    const stored = this.domain.table('sessions').get(sessionId)
    if (!stored) return undefined
    const { sessionId: _id, presetId: _preset, ...snapshot } = stored
    return clone(snapshot)
  }

  async resolve(definition, scope) {
    if (this.closing) throw unavailable('Agent 能力服务正在停止。')
    return this.resolveDefinition(definition, await this.readTools(scope))
  }

  forAgent(agent, config) {
    if (this.closing) return Promise.reject(unavailable('Agent 能力服务正在停止。'))
    const previous = this.pending.get(agent.id) || Promise.resolve()
    const task = previous.catch(() => {}).then(() => this.freeze(agent, config))
    this.pending.set(agent.id, task)
    task.finally(() => { if (this.pending.get(agent.id) === task) this.pending.delete(agent.id) }).catch(() => {})
    return task
  }

  async freeze(agent, { definition, capabilityResolution, source = 'startup' }) {
    const rows = await this.readTools(agent)
    const visible = rows.filter(row => !row.unavailable).map(row => row.id || row.name)
    const header = agent.session.header
    const child = header.origin === 'subagent' || header.isSeeded === true
    const stored = this.get(agent.id)
    let snapshot = stored

    if (!snapshot && source === 'resume') {
      // A resumed child is its own existing session. Its historical admission
      // always precedes today's parent/template configuration, even for forks.
      const request = agent.session.requestHeader?.()
      if (!request || (request.tools || []).some(tool => tool.name === 'run_code')) {
        throw unavailable('旧会话缺少可验证的工具范围快照，请新建会话以使用当前插件配置。')
      }
      const { pluginBindings, ...exact } = definition
      exact.tools = [...new Set((request.tools || []).map(tool => tool.name))]
      if (!exact.tools.includes('skill')) exact.skills = []
      // A child's current filter may narrow the historical request. Preserve
      // that official restriction without turning it into an unavailable error.
      snapshot = child ? this.resolveChild(exact, rows) : this.resolveDefinition(exact, rows)
      if (pluginBindings !== undefined) snapshot.definition.pluginBindings = clone(pluginBindings)
    }
    if (!snapshot && child && header.isSeeded && header.parentSession) {
      // A fork is a continuation of its parent's admitted capability scope,
      // even when an all-mode plugin acquired new tools since the parent began.
      const parent = this.get(header.parentSession)
      const parentRecord = this.domain.table('sessions').get(header.parentSession)
      const samePreset = parentRecord?.presetId !== undefined && parentRecord.presetId === header.agentPreset
      if (parent && samePreset) snapshot = restrictCapabilities(parent, visible)
      else if (parent) {
        // A fork into a different role keeps its own persona/Skills while its
        // requested tools remain beneath the parent's historical ceiling.
        snapshot = restrictCapabilities(this.resolveChild(definition, rows), parent.resolution.tools)
        // A shared name does not prove that the child retained its parent's
        // owning plugin. Validate the inherited identity before recording the
        // child role's otherwise independent prompt and Skills.
        validateAvailable(restrictCapabilities(parent, snapshot.resolution.tools), rows)
      }
    }
    if (!snapshot && capabilityResolution) {
      snapshot = parseFrozen({ definition, resolution: capabilityResolution })
    }
    if (!snapshot) {
      if (child) {
        snapshot = this.resolveChild(definition, rows)
        // An old fork parent may have no domain snapshot. The declared exact
        // names are the only provable ceiling, rather than all-mode expansion.
        if (header.isSeeded) snapshot = restrictCapabilities(snapshot, definition.tools)
      } else snapshot = this.resolveDefinition(definition, rows)
    }

    snapshot = parseFrozen(snapshot)
    if (child) snapshot = restrictCapabilities(snapshot, visible)
    validateAvailable(snapshot, rows)
    if (!stored) await this.domain.table('sessions').put(agent.id, Snapshot.parse({ sessionId: agent.id, ...snapshot,
      ...(header.agentPreset ? { presetId: header.agentPreset } : {}) }))
    return clone(snapshot)
  }

  resolveChild(definition, rows) {
    const effective = rows.filter(row => !row.unavailable)
    const visible = new Set(effective.map(row => toolName(row.id || row.name)))
    const input = clone(definition)
    input.tools = input.tools.filter(name => visible.has(toolName(name)))
    if (!visible.has('skill')) input.skills = []
    if (input.pluginBindings) input.pluginBindings = Object.fromEntries(Object.entries(input.pluginBindings).map(([id, binding]) => {
      const tools = binding.tools.filter(name => visible.has(toolName(name)))
      const enabled = binding.enabled && (binding.mode === 'all' && id !== 'unassigned'
        ? effective.some(row => row.pluginId === id) : tools.length > 0)
      return [id, { ...binding, tools, enabled }]
    }))
    const snapshot = this.resolveDefinition(input, effective)
    if (definition.pluginBindings) snapshot.definition.pluginBindings = clone(definition.pluginBindings)
    return snapshot
  }

  async close() {
    this.closing = true
    await Promise.allSettled([...this.pending.values()])
    await this.domain.close()
  }
}

export const inject = ['storageDomain', 'tools']
export async function apply(ctx) {
  await ctx.effect(async () => {
    const domain = await ctx.storageDomain.open(capabilitySnapshotSpec)
    const owner = new CapabilitySnapshots(domain, scope => toolsForScope(ctx, scope))
    let withdraw
    try { withdraw = ctx.provide('studioCapabilities', owner) }
    catch (error) { await owner.close(); throw error }
    return async () => { await withdraw(); await owner.close() }
  })
}
