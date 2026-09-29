import {build} from 'esbuild'
import {mkdtemp,rm} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {spawnSync} from 'node:child_process'
const root=process.cwd()
const temp=await mkdtemp(join(resolve(root),'.studio-client-tests-'))
try{const file=join(temp,'test.mjs');await build({entryPoints:['test/client.integration.mjs'],outfile:file,bundle:true,platform:'node',format:'esm',external:['@deepseek-ai/*'],alias:{'dsh-workbench-agent-studio-runtime/schema':resolve('packages/runtime/src/schema.mjs'), 'dsh-workbench-agent-studio-service/protocol':resolve('packages/service/src/protocol.mjs')}});process.exitCode=spawnSync(process.execPath,['--test',file],{stdio:'inherit'}).status??1}finally{await rm(temp,{recursive:true,force:true})}
