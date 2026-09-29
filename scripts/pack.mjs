import {cp,mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {spawnSync} from 'node:child_process'
const root=process.cwd(), out=resolve(process.argv[2]??'release')
await mkdir(out,{recursive:true})
const stage=await mkdtemp(join(root,'.release-stage-'))
try{
 const manifest=JSON.parse(await readFile('package.json','utf8'))
 for(const key of ['devDependencies','workspaces','scripts'])delete manifest[key]
 await writeFile(join(stage,'package.json'),JSON.stringify(manifest,null,2)+'\n')
 for(const part of ['dist','locale','cordis.patch.yml','README.md','THIRD_PARTY_NOTICES.md'])await cp(part,join(stage,part),{recursive:true})
 for(const name of ['runtime','service','ui']){
  const source=`packages/${name}`, meta=JSON.parse(await readFile(`${source}/package.json`,'utf8'))
  const target=join(stage,'node_modules',meta.name)
  await mkdir(target,{recursive:true})
  await cp(`${source}/package.json`,join(target,'package.json'))
  for(const file of ['dist','locale','README.md','THIRD_PARTY_NOTICES.md'])await cp(`${source}/${file}`,join(target,file),{recursive:true})
 }
 const run=dir=>{const p=spawnSync('npm',['pack','--ignore-scripts','--cache',join(root,'.npm-pack-cache'),'--pack-destination',out,'--json'],{cwd:dir,encoding:'utf8'});if(p.status)throw Error(p.stderr||p.stdout);for(const item of JSON.parse(p.stdout))console.log(`${item.filename}: ${item.size} bytes; bundled: ${(item.bundled??[]).join(', ')||'none'}`)}
 // Each component remains distributable; the main archive embeds all three.
 for(const name of ['runtime','service','ui'])run(join(stage,'node_modules',`dsh-workbench-agent-studio-${name}`))
 run(stage)
}finally{await rm(stage,{recursive:true,force:true})}
