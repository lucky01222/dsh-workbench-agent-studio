import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { webcrypto } from 'node:crypto'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import * as store from '@deepseek-ai/dsh-client-store'

const owner = 'dsh-workbench-agent-studio-ui'
const bundle = await readFile('packages/ui/dist/client.js', 'utf8')

function setup() {
  const styles = []
  const document = {
    createElement(tag) {
      assert.equal(tag, 'style')
      const attributes = new Map()
      return {
        textContent: '',
        setAttribute: (name, value) => attributes.set(name, value),
        getAttribute: name => attributes.get(name) ?? null,
        remove() { const i = styles.indexOf(this); if (i >= 0) styles.splice(i, 1) },
      }
    },
    head: { append(style) { styles.push(style) } },
  }
  let registration
  runInNewContext(bundle, { document, crypto: webcrypto, setTimeout, clearTimeout,
    window: { __ModuleLoader__: { load(value) { registration = value } } } })
  assert.equal(registration.id, owner)
  const modules = { react: React, 'react/jsx-runtime': jsxRuntime,
    '@deepseek-ai/dsh-client-store': store, '@deepseek-ai/dsh-client-ui-primitives': {} }
  const plugin = registration.factory(id => {
    assert.ok(Object.hasOwn(modules, id), `Unexpected shared module: ${id}`)
    return modules[id]
  })
  function activate() {
    const disposers = []
    plugin.apply({
      effect(callback) { const dispose = callback(); if (typeof dispose === 'function') disposers.push(dispose) },
      locale: { register() {}, bind: () => () => '' },
      slots: { inject() {} },
      on() { return () => {} },
      remote: { $on() { return () => {} }, pluginInventory: { list: async () => ({ ok: true, value: { managementAvailable: false, entries: [] } }) }, pluginManager: { listBundles: async () => ({ ok: true, value: [] }) } },
    })
    return () => { for (const dispose of disposers.reverse()) dispose() }
  }
  // Harness rc.2 claims untagged styles at factory materialization and removes
  // every style belonging to a module when that module is replaced or pruned.
  function materialize(id) {
    for (const style of styles) if (style.getAttribute('data-plugin') === null) style.setAttribute('data-plugin', id)
  }
  function invalidate(id) {
    for (const style of [...styles]) if (style.getAttribute('data-plugin') === id) style.remove()
  }
  return { styles, document, activate, materialize, invalidate }
}

test('built Studio CSS survives another plugin materializing and being replaced', () => {
  const { styles, document, activate, materialize, invalidate } = setup()
  materialize(owner)
  const stop = activate()
  assert.equal(styles.length, 1)
  const studioStyle = styles[0]
  assert.match(studioStyle.textContent, /\.AgentStudio_root\s*\{/)
  // Document workbench also ships Workbench.module.css; a shared prefix let its rules restyle Studio fields.
  assert.doesNotMatch(studioStyle.textContent, /\.Workbench_/)
  assert.equal(studioStyle.getAttribute('data-plugin'), owner)
  assert.equal(studioStyle.getAttribute('data-plugin-css'), owner)
  const foreignStyle = document.createElement('style')
  document.head.append(foreignStyle)
  materialize('other-plugin')
  assert.equal(foreignStyle.getAttribute('data-plugin'), 'other-plugin')
  invalidate('other-plugin')
  assert.deepEqual(styles, [studioStyle])
  stop()
  assert.equal(styles.length, 0)
})

test('Studio reactivation restores CSS and old cleanup cannot delete the new instance', () => {
  const { styles, activate, invalidate } = setup()
  const stop = activate()
  invalidate(owner)
  assert.equal(styles.length, 0)
  const stopNext = activate()
  assert.equal(styles.length, 1)
  stop()
  assert.equal(styles.length, 1)
  assert.equal(styles[0].getAttribute('data-plugin'), owner)
  stopNext()
  stopNext()
  assert.equal(styles.length, 0)
})
