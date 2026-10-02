/** Offline CAD tessellation. No CAD kernel or compiler ships to visitors. */
import { resolve, join } from 'node:path';
import { readFile, writeFile, cp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const tools = process.env.WWW_RENDER_TOOLS;
if (!tools) {
  throw new Error('Set WWW_RENDER_TOOLS to the isolated tool installation.');
}
const app = resolve(import.meta.dirname, '..');
const source = join(app, '../../libs/tau-examples/src/kernels/replicad/planetary-gear-system/main.ts');
const sha256 = createHash('sha256')
  .update(await readFile(source))
  .digest('hex');
await cp(source, join(tools, 'model.ts'));
await writeFile(
  join(tools, 'export-story.mjs'),
  `
import oc from 'replicad-opencascadejs';
import {setOC} from 'replicad';
import model from './model.ts';
import {writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
setOC(oc);
const parts=model();
if(parts.length!==34)throw new Error('Expected 34 parts; review model source.');
let offset=0;const buffers=[];
const meshes=parts.map(({name,shape,color,metalness,roughness})=>{
 const mesh=shape.mesh({tolerance:0.15,angularTolerance:0.25});
 const result={name,color,metalness,roughness};
 for(const [key,Type,data] of [['position',Float32Array,mesh.vertices],['normal',Float32Array,mesh.normals],['index',Uint32Array,mesh.triangles]]){
  const buffer=Buffer.from(new Type(data).buffer);result[key]={offset,length:data.length};offset+=buffer.byteLength;buffers.push(buffer);
 }
 return result;
});
await writeFile(${JSON.stringify(join(app, 'public/planetary.bin.gz'))},gzipSync(Buffer.concat(buffers),{level:9}));
await writeFile(${JSON.stringify(join(app, 'public/planetary.json'))},JSON.stringify({source:'libs/tau-examples/src/kernels/replicad/planetary-gear-system/main.ts',sha256:${JSON.stringify(sha256)},parts:34,teeth:{sun:24,planet:24,ring:72},meshes}));
console.log('Exported',parts.length,'parts;',offset,'uncompressed bytes.');
`,
);
const result = spawnSync(
  process.execPath,
  ['--import', join(tools, 'node_modules/tsx/dist/loader.mjs'), join(tools, 'export-story.mjs')],
  { stdio: 'inherit' },
);
if (result.status !== 0) {
  throw new Error('CAD export failed.');
}
