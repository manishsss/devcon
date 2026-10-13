import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {PNG} from 'pngjs';
import {encode as encodeJpeg} from 'jpeg-js';

const require=createRequire(realpathSync(new URL('../node_modules/wrangler/package.json',import.meta.url)));
const {Miniflare}=require('miniflare');
const {build}=require('esbuild');
const fixed=process.env.VERIFY_LEGACY_PNG!=='1';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await build({
 stdin:{contents:`import {validateLogo} from './lib/logo-image.ts'; export default {async fetch(request){try{const file=new File([await request.arrayBuffer()],'logo',{type:request.headers.get('content-type')||'image/png'});const result=await validateLogo(file,5);return new Response(result.bytes,{headers:{'content-type':result.mime}});}catch(error){return new Response(error.message,{status:400});}}};`,resolveDir:root,sourcefile:'logo-worker.ts'},
 bundle:true,write:false,format:'esm',platform:'node',target:'es2022',
 banner:{js:'import {createRequire} from "node:module";import {Buffer} from "node:buffer";const require=createRequire("file:///logo-worker.js");'},
 plugins:fixed?[{name:'workers-png-inflate',setup(build){build.onResolve({filter:/^\.\/sync-inflate$/},()=>({path:fileURLToPath(new URL('../lib/png-sync-inflate.cjs',import.meta.url))}));}}]:[],
});
const worker=new Miniflare({modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat']});
try{
 const png=new PNG({width:2,height:2});png.data=Buffer.alloc(16);for(let i=0;i<4;i++)png.data.set([17,17,17,128],i*4);
 if(!fixed){
  const response=await worker.dispatchFetch('https://test.invalid/',{method:'POST',body:PNG.sync.write(png)});
  assert.equal(response.status,400);assert.match(await response.text(),/Class constructor Inflate cannot be invoked without 'new'/);
  console.log('Reproduced the reported Inflate constructor error in the Workers runtime.');
 }else{
  for(const colorType of [0,2,4,6]){
   const input=PNG.sync.write(png,{colorType});
   const response=await worker.dispatchFetch('https://test.invalid/',{method:'POST',body:input});
   assert.equal(response.status,200,await response.clone().text());
   const decoded=PNG.sync.read(Buffer.from(await response.arrayBuffer()));
   assert.equal(decoded.width,2);assert.equal(decoded.height,2);assert.deepEqual(decoded.data,PNG.sync.read(input).data);
   console.log(`Workers PNG color type ${colorType}: decoded and normalized successfully.`);
  }
  const jpeg=encodeJpeg({width:1,height:1,data:Buffer.from([0,0,0,255])},90).data;
  const response=await worker.dispatchFetch('https://test.invalid/',{method:'POST',body:jpeg,headers:{'content-type':'image/jpeg'}});
  assert.equal(response.status,200,await response.clone().text());assert.equal(PNG.sync.read(Buffer.from(await response.arrayBuffer())).width,1);
  console.log('Workers JPEG upload: normalized to PNG successfully.');
  const corrupt=Buffer.from(PNG.sync.write(png));corrupt[40]^=1;
  assert.equal((await worker.dispatchFetch('https://test.invalid/',{method:'POST',body:corrupt})).status,400);
  assert.equal((await worker.dispatchFetch('https://test.invalid/',{method:'POST',body:'<svg/>'})).status,400);
  console.log('Workers corrupt PNG and SVG inputs: still rejected.');
 }
}finally{await worker.dispose();}
