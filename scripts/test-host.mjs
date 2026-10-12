import { build } from 'esbuild'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
const root = process.env.DSH_RUNTIME_ROOT
if (!root) throw new Error('Set DSH_RUNTIME_ROOT to the directory containing official Harness node_modules')
const temp = await mkdtemp(join(resolve(root), '.studio-tests-'))
try {
 const files=(await readdir('test')).filter(name=>name.endsWith('.integration.mjs') && !name.startsWith('client'))
 const entryPoints=Object.fromEntries(files.map(name=>[name.replace('.integration.mjs','.test'),`test/${name}`]))
 await build({entryPoints,outdir:temp,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',external:['@deepseek-ai/*'],loader:{'.md':'text'},alias:{'dsh-workbench-agent-studio-runtime/schema':resolve('packages/runtime/src/schema.mjs'), 'dsh-workbench-agent-studio-runtime/capabilities':resolve('packages/runtime/src/capabilities.mjs'), 'dsh-workbench-agent-studio-runtime/library-owner-compat':resolve('packages/runtime/src/library-owner-compat.mjs'), 'dsh-workbench-agent-studio-service/protocol':resolve('packages/service/src/protocol.mjs')}})
 const result=spawnSync(process.execPath,['--test',...files.map(name=>join(temp,name.replace('.integration.mjs','.test.mjs')))],{stdio:'inherit'})
 process.exitCode=result.status??1
} finally { await rm(temp,{recursive:true,force:true}) }
