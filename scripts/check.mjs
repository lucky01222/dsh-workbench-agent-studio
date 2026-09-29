import {readdir} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
async function check(dir){for(const item of await readdir(dir,{withFileTypes:true})){const path=`${dir}/${item.name}`;if(item.isDirectory())await check(path);else if(path.endsWith('.mjs')){const r=spawnSync(process.execPath,['--check',path],{stdio:'inherit'});if(r.status)process.exit(r.status)}}}
for(const dir of ['src','packages','scripts'])await check(dir)
console.log('JavaScript syntax checks passed')
