import { AsyncLocalStorage } from 'node:async_hooks'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { scopeChainOf, scopeOf } from '@deepseek-ai/dsh-scope'
import { interpolate } from '@deepseek-ai/cordis-plugin-loader'

// Cordis traces a service through a different proxy for each caller. Keeping
// this state on the instance (rather than a WeakMap keyed by `this`) makes all
// caller views share it. Lazy initialization also survives service publication
// from the official base constructor before subclass initialization finishes.
const ownership = Symbol('studio.tool-ownership')
const deferredOrigins = Symbol('studio.deferred-tool-origins')

/** Preserve the original deployment config while the stock row is disabled. */
function registryConfig(context, config) {
  const original = [...context.get('loader')?.entries() || []].find(entry => entry.options.id === 'tools' && entry.options.name === '@deepseek-ai/dsh-tools')
  if (!original) return config
  const inherited = interpolate(original.context || context, original.options.config || {})
  // Cordis has already added schema defaults to `config`; only explicit input
  // on the adapter row should override a deployment's original values.
  const explicit = context.fiber.entry ? interpolate(context, context.fiber.entry.options.config || {}) : config || {}
  return ToolRuntime.Config({ ...inherited, ...explicit })
}

/** Read Loader identities only; a fiber display name is not an owning module. */
function ownerOf(context, origins) {
  const entryChain = [], visited = new Set(), entries = new Set()
  for (let fiber = context.fiber; fiber && !visited.has(fiber); fiber = fiber.parent?.fiber) {
    visited.add(fiber)
    const entry = fiber.entry
    // Loader gives anonymous descendants their parent's entry too. An actual
    // new Loader declaration wins; otherwise an event-created fiber retains
    // the source plugin whose listener created it on a different Agent ctx.
    const declaredHere = entry && entry !== fiber.parent?.fiber?.entry
    if (!entryChain.length && !declaredHere && origins?.has(fiber)) return origins.get(fiber)
    if (!entry || entries.has(entry)) continue
    entries.add(entry)
    if (entry.options?.group || typeof entry.options?.name !== 'string' || !entry.options.name) continue
    if (typeof entry.id !== 'string' || !entry.id) continue
    entryChain.push({ entryId: entry.id, moduleName: entry.options.name })
  }
  if (!entryChain.length) return undefined
  return { ...entryChain[0], entryChain }
}

function observeDeferredOrigins(context, state) {
  context.on('internal/plugin', fiber => {
    const invocation = state.active.getStore()
    if (!fiber.uid || !invocation) return
    if (fiber.entry && fiber.entry !== fiber.parent?.fiber?.entry) {
      // A listener can invoke Loader, which asynchronously starts another
      // declared plugin under the same async context. That declaration starts
      // a new provenance boundary for its own anonymous inject descendants.
      state.boundaries.set(fiber, invocation)
      return
    }
    const visited = new Set()
    for (let parent = fiber.parent?.fiber; parent && !visited.has(parent); parent = parent.parent?.fiber) {
      visited.add(parent)
      if (state.boundaries.get(parent) === invocation) return
    }
    state.fibers.set(fiber, invocation.origin)
  })
  context.on('internal/listener', function(name, listener, options) {
    if (state.intercepting || typeof name !== 'string' || name.startsWith('internal/')) return
    const origin = ownerOf(this, state.fibers)
    if (!origin) return
    // Re-enter the public registration API with the original owner/options.
    // The narrow synchronous guard prevents wrapping this replacement again.
    state.intercepting = true
    try {
      return this.on(name, function(...args) {
        return state.active.run({ origin }, () => Reflect.apply(listener, this, args))
      }, options)
    } finally { state.intercepting = false }
  })
}

/**
 * Official rc.2 registry plus registration provenance. Execution, visibility,
 * schema validation, restrictions and guards stay in the official superclass.
 * This must replace the host's `tools` provider before tool plugins activate.
 */
export class StudioToolRuntime extends ToolRuntime {
  constructor(context, config) {
    super(context, registryConfig(context, config))
    this[ownership] ??= new WeakMap()
    const state = this[deferredOrigins] ??= { active: new AsyncLocalStorage(), fibers: new WeakMap(), boundaries: new WeakMap(), intercepting: false }
    observeDeferredOrigins(context, state)
  }

  register(definition) {
    const context = this.ctx, scope = scopeOf(context)
    const registry = this[ownership] ??= new WeakMap()
    const owner = ownerOf(context, this[deferredOrigins]?.fibers)
    const record = { owner, scope: scope === undefined ? 'global' : 'scoped' }
    const register = () => super.register(definition)
    return context.effect(function* () {
      let registrations = registry.get(definition)
      if (!registrations) registry.set(definition, registrations = new Map())
      const previous = registrations.get(scope)
      registrations.set(scope, record)
      const forget = () => {
        if (registrations.get(scope) !== record) return
        if (previous) registrations.set(scope, previous)
        else registrations.delete(scope)
        if (!registrations.size) registry.delete(definition)
      }
      // Install before the official register emits tools/change. Failed or
      // duplicate registrations restore the previous provenance atomically.
      let dispose
      try { dispose = register() } catch (error) { forget(); throw error }
      // Cordis collects the exact official disposer. Reverse cleanup order
      // removes provenance first, so tools/change sees the revealed ancestor
      // even when both scopes registered the same definition object.
      yield dispose
      yield forget
    }, 'studio.tools.register()')
  }

  /**
   * Return JSON-only provenance of the definition the official resolver makes
   * visible in this scope. No record means unknown ownership, never a guess.
   */
  registrationOf(name, scope) {
    const definition = super.get(name, scope)
    if (!definition) return undefined
    const registrations = this[ownership]?.get(definition)
    if (!registrations) return undefined
    for (const key of [...scopeChainOf(scope), undefined]) {
      const record = registrations.get(key)
      if (!record) continue
      if (!record.owner) return undefined
      return {
        name,
        scope: record.scope,
        moduleName: record.owner.moduleName,
        entryId: record.owner.entryId,
        entryChain: record.owner.entryChain.map(entry => ({ ...entry })),
      }
    }
    return undefined
  }
}

export default StudioToolRuntime
