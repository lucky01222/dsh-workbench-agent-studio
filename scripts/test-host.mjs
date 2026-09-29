import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
const root = process.env.DSH_RUNTIME_ROOT
if (!root) throw new Error('Set DSH_RUNTIME_ROOT to the directory containing official Harness node_modules')
const temp = await mkdtemp(join(resolve(root), '.studio-tests-'))
try {
 const target = join(temp, 'lifecycle.test.mjs')
 await build({entryPoints:['test/lifecycle.integration.mjs'],outfile:target,bundle:true,platform:'node',format:'esm',external:['@deepseek-ai/*'],alias:{'dsh-workbench-agent-studio-runtime/schema':resolve('packages/runtime/src/schema.mjs'), 'dsh-workbench-agent-studio-service/protocol':resolve('packages/service/src/protocol.mjs')}})
 const result=spawnSync(process.execPath,['--test',target],{stdio:'inherit'})
 process.exitCode=result.status??1
} finally { await rm(temp,{recursive:true,force:true}) }
