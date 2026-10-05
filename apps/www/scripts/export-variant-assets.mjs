/**
 * Offline export of the authored `faceWidth: 18` variant as per-vertex axial offsets.
 * Same model, same tessellation settings as export-story-assets.mjs. XY never changes for this
 * parameter, so the variant is stored as one float32 dz per committed vertex. The ring re-tessellates
 * with four extra vertices, so its offsets come from the exact axial level map of both exports.
 */
import { resolve, join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const tools = process.env.WWW_RENDER_TOOLS;
if (!tools) {
  throw new Error('Set WWW_RENDER_TOOLS to the isolated tool installation.');
}
const app = resolve(import.meta.dirname, '..');
const source = join(app, '../../libs/tau-examples/src/kernels/replicad/planetary-gear-system/main.ts');
await writeFile(join(tools, 'model.ts'), await readFile(source));
await writeFile(
  join(tools, 'export-variant.mjs'),
  `
import oc from 'replicad-opencascadejs';
import {setOC} from 'replicad';
import model, {defaultParams} from './model.ts';
import {readFile, writeFile} from 'node:fs/promises';
import {gzipSync, gunzipSync} from 'node:zlib';
setOC(oc);
const app=${JSON.stringify(app)};
const manifest=JSON.parse(await readFile(app+'/public/planetary.json','utf8'));
const committed=gunzipSync(await readFile(app+'/public/planetary.bin.gz'));
const tessellate=(p)=>model(p).map(({name,shape})=>({name,m:shape.mesh({tolerance:0.15,angularTolerance:0.25})}));
const variantParameters={...defaultParams,faceWidth:18};
const base=tessellate(defaultParams), wide=tessellate(variantParameters);
const zRange=(parts)=>{let lo=Infinity,hi=-Infinity;for(const {m} of parts){for(let i=2;i<m.vertices.length;i+=3){lo=Math.min(lo,m.vertices[i]);hi=Math.max(hi,m.vertices[i]);}}return [lo,hi];};
const levels=(v)=>[...new Set(Array.from(v).filter((_,i)=>i%3===2).map((z)=>Math.round(z*1000)/1000))].sort((a,b)=>a-b);
let offset=0;const chunks=[];
const meshes=manifest.meshes.map((part,i)=>{
 const a=base[i].m,b=wide[i].m;
 if(base[i].name!==part.name)throw new Error('Part order changed: '+part.name);
 const saved=new Float32Array(committed.buffer,committed.byteOffset+part.position.offset,part.position.length);
 for(let k=0;k<saved.length;k++)if(Math.abs(saved[k]-a.vertices[k])>1e-4)throw new Error('Committed mesh differs from source: '+part.name);
 const dz=new Float32Array(a.vertices.length/3);
 if(a.vertices.length===b.vertices.length){
  for(let k=0;k<a.vertices.length;k+=3){
   if(Math.abs(a.vertices[k]-b.vertices[k])>1e-6||Math.abs(a.vertices[k+1]-b.vertices[k+1])>1e-6)throw new Error('Variant moved XY: '+part.name);
   dz[k/3]=b.vertices[k+2]-a.vertices[k+2];
  }
 }else{
  const from=levels(a.vertices),to=levels(b.vertices);
  if(from.length!==to.length)throw new Error('Axial levels differ: '+part.name);
  for(let k=2;k<a.vertices.length;k+=3){
   const z=Math.round(a.vertices[k]*1000)/1000,j=from.indexOf(z);
   if(j<0)throw new Error('Vertex off axial level: '+part.name);
   dz[(k-2)/3]=to[j]-from[j];
  }
 }
 const bytes=Buffer.from(dz.buffer);chunks.push(bytes);
 const range={offset,length:dz.length};offset+=bytes.byteLength;
 return {name:part.name,dz:range};
});
const [lo,hi]=zRange(base),[wlo,whi]=zRange(wide);
await writeFile(app+'/public/planetary-face18.bin.gz',gzipSync(Buffer.concat(chunks),{level:9}));
await writeFile(app+'/public/planetary-face18.json',JSON.stringify({source:manifest.source,sha256:manifest.sha256,from:{faceWidth:defaultParams.faceWidth},to:{faceWidth:18},axial:{from:Math.round((hi-lo)*100)/100,to:Math.round((whi-wlo)*100)/100},meshes}));
console.log('Variant offsets for',meshes.length,'parts;',offset,'bytes; axial',hi-lo,'->',whi-wlo);
`,
);
const result = spawnSync(
  process.execPath,
  ['--import', join(tools, 'node_modules/tsx/dist/loader.mjs'), join(tools, 'export-variant.mjs')],
  { stdio: 'inherit' },
);
if (result.status !== 0) {
  throw new Error('CAD variant export failed.');
}
