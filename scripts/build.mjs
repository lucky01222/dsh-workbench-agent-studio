import { build } from 'esbuild'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
const external=['@deepseek-ai/*','dsh-workbench-agent-studio-*']
for(const part of ['service','runtime','ui']) await mkdir(`packages/${part}/dist`,{recursive:true})
await mkdir('dist',{recursive:true})
const host=async(entryPoints,outdir)=>build({entryPoints,outdir,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',target:'node24',external})
await host({index:'src/index.mjs',policy:'src/policy.mjs'},'dist')
await host({index:'packages/service/src/index.mjs',protocol:'packages/service/src/protocol.mjs'},'packages/service/dist')
await host({policy:'packages/runtime/src/policy.mjs',schema:'packages/runtime/src/schema.mjs'},'packages/runtime/dist')
await host({index:'packages/ui/src/index.mjs'},'packages/ui/dist')
const result=await build({entryPoints:['packages/ui/src/client/entry.tsx'],outfile:'packages/ui/dist/client-body.js',write:false,bundle:true,platform:'browser',format:'cjs',jsx:'automatic',target:'es2022',external:['react','react-dom','react/jsx-runtime','@deepseek-ai/*']})
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text,css=result.outputFiles.find(f=>f.path.endsWith('.css'))?.text||''
await writeFile('packages/ui/dist/client.js',`window.__ModuleLoader__.load({id:'dsh-workbench-agent-studio-ui',factory(require){var module={exports:{}};var exports=module.exports;${js}\nconst plugin=module.exports;return {...plugin,apply(ctx){ctx.effect(()=>{const style=document.createElement('style');style.textContent=${JSON.stringify(css)};document.head.append(style);return ()=>style.remove()});return plugin.apply(ctx)}}}});\n`)
// Only remove retired generated artifacts; sources and data never pass through this path.
await rm('dist/client.js',{force:true})
console.log('Built service, portable runtime, UI and compatibility bundle')
