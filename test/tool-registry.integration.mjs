import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import { createScope, scopeOf } from '@deepseek-ai/dsh-scope'
import StudioToolRuntime from '../packages/runtime/src/tool-registry.mjs'

function tool(name, execute = async args => args.value ?? 'ok') {
  return defineTool({ name, description: name, parameters: { value: { type: 'string' } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }, execute })
}

async function harness(t) {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  await ctx.plugin(Loader)
  await ctx.plugin(SystemPrompt, { personaPrefix: '' })
  return ctx
}

async function mount(ctx, id, apply, context = ctx) {
  ctx.loader.builtins[id] = { inject: ['loader', 'tools'], apply }
  const { EntryTree } = await import('@deepseek-ai/cordis-plugin-loader')
  const tree = new EntryTree(context)
  context.effect(() => () => tree.root.stop())
  await tree.root.update([{ id, name: `cordis:${id}` }])
  await tree.await()
  return tree
}

async function scoped(ctx, key = {}, options) {
  let scope
  await ctx.plugin({ inject: ['loader', 'tools'], apply(owner) { scope = createScope(owner, key, options) } })
  return scope
}

async function stop(tree) {
  await Promise.all([...tree.entries()].map(entry => entry.fiber?.dispose()))
  tree.root.stop()
}

test('subclass publishes tools to pending dependents with the official config and execution contract', async t => {
  const ctx = await harness(t)
  const echo = tool('echo')
  let registeringContext
  const pending = await ctx.plugin({ inject: ['tools'], apply(child) { registeringContext = child; child.tools.register(echo) } })
  assert.equal(registeringContext, undefined)
  await ctx.plugin(StudioToolRuntime, { mode: 'native', maxParallelSubCalls: 2 })
  await pending.await()
  assert.ok(registeringContext)
  assert.equal(StudioToolRuntime.Config, ToolRuntime.Config)
  assert.deepEqual(StudioToolRuntime.inject, ToolRuntime.inject)
  assert.equal(ctx.tools.get('echo'), echo)
  assert.equal(ctx.tools.registrationOf('echo'), undefined, 'anonymous plugins must not gain fabricated module ownership')
  const result = await ctx.tools.execute({ name: 'echo', arguments: { value: 'actual tool result' }, callId: 'call', signal: new AbortController().signal })
  assert.equal(result.isError, false)
  assert.deepEqual(result.content, [{ type: 'text', text: 'actual tool result' }])
})

test('captures the caller Loader entry, follows nested fibers and reports changes synchronously', async t => {
  const ctx = await harness(t)
  await ctx.plugin(StudioToolRuntime)
  let child, first, observed
  ctx.on('tools/change', () => { if (ctx.tools.get('first')) observed = ctx.tools.registrationOf('first') })
  const tree = await mount(ctx, 'bundle', async c => {
    child = c
    first = c.tools.register(tool('first'))
    await c.plugin({ inject: ['tools'], apply(nested) { nested.tools.register(tool('nested')) } })
  })
  assert.deepEqual(observed, { name: 'first', scope: 'global', moduleName: 'cordis:bundle', entryId: 'bundle', entryChain: [{ entryId: 'bundle', moduleName: 'cordis:bundle' }] })
  assert.equal(ctx.tools.registrationOf('nested').entryId, 'bundle')
  const second = child.tools.register(tool('second'))
  assert.equal(ctx.tools.registrationOf('second').moduleName, 'cordis:bundle')
  await first(); await first()
  assert.equal(ctx.tools.registrationOf('first'), undefined)
  assert.equal(ctx.tools.get('first'), undefined)
  await second()
  assert.equal(ctx.tools.registrationOf('second'), undefined)
  const returned = ctx.tools.registrationOf('nested')
  returned.entryChain[0].moduleName = 'tampered'
  assert.equal(ctx.tools.registrationOf('nested').moduleName, 'cordis:bundle')
  await stop(tree)
  assert.equal(ctx.tools.registrationOf('nested'), undefined)
  assert.equal(ctx.tools.get('nested'), undefined)
})

test('same definition can have distinct scope owners; shadows and restrictions follow official visibility', async t => {
  const ctx = await harness(t)
  await ctx.plugin(StudioToolRuntime)
  const shared = tool('shared'), key = {}, scope = await scoped(ctx, key)
  await mount(ctx, 'global-owner', child => { child.tools.register(shared) })
  let release
  await mount(ctx, 'scope-owner', child => { release = child.tools.register(shared) }, scope.ctx)
  assert.equal(ctx.tools.registrationOf('shared').moduleName, 'cordis:global-owner')
  assert.equal(ctx.tools.registrationOf('shared', key).moduleName, 'cordis:scope-owner')
  const descendant = await scoped(ctx, {}, { parent: key }), descendantKey = scopeOf(descendant.ctx)
  assert.equal(ctx.tools.registrationOf('shared', descendantKey).moduleName, 'cordis:scope-owner')
  let revealedOwner
  ctx.on('tools/change', () => { revealedOwner = ctx.tools.registrationOf('shared', key)?.moduleName })
  await release()
  assert.equal(revealedOwner, 'cordis:global-owner', 'unregister change observers must see ancestor provenance immediately')
  assert.equal(ctx.tools.registrationOf('shared', key).moduleName, 'cordis:global-owner')
  scope.ctx.tools.restrict({ allow: [] })
  assert.equal(ctx.tools.get('shared', key), undefined)
  assert.equal(ctx.tools.registrationOf('shared', key), undefined)
  await scope.dispose(); await descendant.dispose()
})

test('duplicate and invalid registrations retain the original source, and anonymous shadows stay unknown', async t => {
  const ctx = await harness(t)
  await ctx.plugin(StudioToolRuntime)
  const shared = tool('shared')
  let owner
  await mount(ctx, 'owner', child => { owner = child; child.tools.register(shared) })
  assert.throws(() => owner.tools.register(shared), /already registered/)
  assert.throws(() => owner.tools.register({ name: 'invalid' }), /must declare output/)
  assert.equal(ctx.tools.registrationOf('shared').moduleName, 'cordis:owner')
  assert.equal(ctx.tools.registrationOf('invalid'), undefined)
  const scope = await scoped(ctx)
  scope.ctx.tools.register(shared)
  assert.equal(ctx.tools.registrationOf('shared', scopeOf(scope.ctx)), undefined)
  assert.equal(ctx.tools.registrationOf('shared').moduleName, 'cordis:owner')
  await scope.dispose()
})

test('official scoped guards still deny execution and scope disposal restores visibility', async t => {
  const ctx = await harness(t)
  await ctx.plugin(StudioToolRuntime)
  let calls = 0
  await mount(ctx, 'owner', child => child.tools.register(tool('shared', async () => { calls++; return 'ok' })))
  const key = {}, scope = await scoped(ctx, key)
  scope.ctx.tools.guard(() => 'test guard')
  const result = await ctx.tools.execute({ name: 'shared', arguments: {}, callId: 'guarded', signal: new AbortController().signal, agent: key })
  assert.equal(result.isError, true)
  assert.equal(calls, 0)
  await scope.dispose()
  assert.equal(ctx.tools.registrationOf('shared').moduleName, 'cordis:owner')
})

test('nested Loader entries retain the complete module chain and two registries do not mix ownership', async t => {
  const ctx = await harness(t), other = await harness(t), shared = tool('shared')
  await ctx.plugin(StudioToolRuntime); await other.plugin(StudioToolRuntime)
  await mount(ctx, 'outer', child => mount(ctx, 'inner', inner => { inner.tools.register(shared) }, child).then(() => {}))
  await mount(other, 'other', child => { child.tools.register(shared) })
  assert.deepEqual(ctx.tools.registrationOf('shared').entryChain, [
    { entryId: 'outer:inner', moduleName: 'cordis:inner' },
    { entryId: 'outer', moduleName: 'cordis:outer' },
  ])
  assert.equal(other.tools.registrationOf('shared').moduleName, 'cordis:other')
  assert.throws(() => ctx.tools.register(tool('run_code')), /reserved/)
  assert.equal(ctx.tools.registrationOf('run_code'), undefined)
})

test('restoring the original tools provider remounts dependents cleanly and tracking can be enabled again', async t => {
  const ctx = await harness(t)
  let activations = 0
  ctx.loader.builtins.tracked = StudioToolRuntime
  ctx.loader.builtins.official = ToolRuntime
  ctx.loader.builtins.consumer = { inject: ['tools'], apply(child) { activations++; child.tools.register(tool('restored')) } }
  const rows = provider => [{ id: `tools-${provider}`, name: `cordis:${provider}` }, { id: 'consumer', name: 'cordis:consumer' }]
  await ctx.loader.root.update(rows('tracked')); await ctx.loader.await()
  assert.equal(ctx.tools.registrationOf('restored').entryId, 'consumer')
  assert.equal(activations, 1)
  await ctx.loader.root.update(rows('official')); await ctx.loader.await()
  assert.equal(typeof ctx.tools.registrationOf, 'undefined')
  assert.deepEqual(ctx.tools.schemas().map(item => item.name), ['restored'])
  assert.equal(activations, 2)
  await ctx.loader.root.update(rows('tracked')); await ctx.loader.await()
  assert.equal(ctx.tools.registrationOf('restored').entryId, 'consumer')
  assert.equal(activations, 3)
})

test('event-created Agent fibers retain the source plugin across asynchronous and deferred dependency activation', async t => {
  const ctx = await harness(t)
  await ctx.plugin(StudioToolRuntime)
  const key = {}
  let agentScope, late
  await mount(ctx, 'agent-host', host => { agentScope = createScope(host, key) })
  await mount(ctx, 'deferred-owner', source => {
    source.on('agent/created', async ({ agent }) => {
      await Promise.resolve()
      await agent.ctx.inject(['tools'], async runtime => {
        await Promise.resolve()
        runtime.tools.register(tool('deferred'))
      })
      late = agent.ctx.inject(['tools', 'later'], runtime => { runtime.tools.register(tool('later')) })
      await late
      await mount(ctx, 'distinct-module', async own => {
        own.tools.register(tool('distinct'))
        await own.inject(['tools'], async nested => {
          await Promise.resolve()
          nested.tools.register(tool('distinct-injected'))
        })
      }, agent.ctx)
    })
  })
  await ctx.serial('agent/created', { agent: { ctx: agentScope.ctx } })
  assert.equal(ctx.tools.registrationOf('deferred', key).moduleName, 'cordis:deferred-owner')
  assert.equal(ctx.tools.registrationOf('deferred', key).entryId, 'deferred-owner')
  assert.equal(ctx.tools.registrationOf('distinct', key).moduleName, 'cordis:distinct-module', 'a real Loader declaration must outrank the callback that loaded it')
  assert.equal(ctx.tools.registrationOf('distinct-injected', key).moduleName, 'cordis:distinct-module', 'new Loader modules also own their delayed anonymous inject descendants')
  assert.equal(ctx.tools.get('later', key), undefined)
  ctx.provide('later', {})
  await late.await()
  assert.equal(ctx.tools.registrationOf('later', key).moduleName, 'cordis:deferred-owner')
  await agentScope.dispose()
  assert.equal(ctx.tools.registrationOf('deferred', key), undefined)
})

test('a declared plugin keeps its late inject descendants when an unrelated outer listener is the one running', async t => {
  const ctx = await harness(t)
  await ctx.plugin(StudioToolRuntime)
  const key = {}
  let agentScope, late
  await mount(ctx, 'agent-host', host => { agentScope = createScope(host, key) })
  // The inner listener loads a module whose tool waits for a service, as the official file plugin's read_image waits for attachments.
  await mount(ctx, 'preset-loader', source => {
    source.on('agent/created', async ({ agent }) => {
      await mount(ctx, 'image-module', own => { late = own.inject(['tools', 'attachments'], nested => { nested.tools.register(tool('read_image')) }) }, agent.ctx)
    })
  })
  // The outer listener (a request handler) starts the Agent and is still running when the service appears.
  await mount(ctx, 'request-handler', source => {
    source.on('studio/request', async () => {
      await ctx.serial('agent/created', { agent: { ctx: agentScope.ctx } })
      ctx.provide('attachments', {})
      await late.await()
    })
  })
  await ctx.serial('studio/request')
  assert.equal(ctx.tools.registrationOf('read_image', key).moduleName, 'cordis:image-module', 'not the handler that happened to be running')
})

test('a plugin that shadows a tool directly on a live Agent ctx owns it, not the handler that created the Agent', async t => {
  const ctx = await harness(t)
  await ctx.plugin(StudioToolRuntime)
  const key = {}
  let agentScope
  // As dsh-codex does for read_image: no fiber of its own, a plain register on agent.ctx from its listener.
  await mount(ctx, 'enhancer', source => { source.on('agent/created', ({ agent }) => { agent.ctx.tools.register(tool('read_image')) }) })
  await mount(ctx, 'request-handler', source => {
    source.on('studio/request', async () => {
      agentScope = await scoped(ctx, key)
      await ctx.serial('agent/created', { agent: { ctx: agentScope.ctx } })
    })
  })
  await ctx.serial('studio/request')
  assert.equal(ctx.tools.registrationOf('read_image', key).moduleName, 'cordis:enhancer')
})

test('adapter inherits the disabled original registry config while its explicit config wins', async t => {
  const ctx = await harness(t)
  ctx.loader.builtins.tracked = StudioToolRuntime
  await ctx.loader.root.update([
    { id: 'tools', name: '@deepseek-ai/dsh-tools', disabled: true, config: { mode: 'both', maxParallelSubCalls: 3 } },
    { id: 'tracked-tools', name: 'cordis:tracked' },
  ])
  await ctx.loader.await()
  assert.ok(ctx.tools.schemas().some(tool => tool.name === 'run_code'), 'original both mode must not be replaced by adapter schema defaults')
  await ctx.loader.root.update([
    { id: 'tools', name: '@deepseek-ai/dsh-tools', disabled: true, config: { mode: 'both', maxParallelSubCalls: 3 } },
    { id: 'tracked-tools', name: 'cordis:tracked', config: { mode: 'native' } },
  ])
  await ctx.loader.await()
  assert.equal(ctx.tools.schemas().some(tool => tool.name === 'run_code'), false)
})
