import { PNG } from 'pngjs';
import { decode as decodeJpeg } from 'jpeg-js';
const MAX_SIDE=2048,MAX_PIXELS=1048576;
function dimensions(width:number,height:number){if(!width||!height||width>MAX_SIDE||height>MAX_SIDE||width*height>MAX_PIXELS)throw new Error('Logo dimensions must be at most 2048px per side and 1 megapixel.');}
function jpegDimensions(bytes:Buffer){
  let offset=2;
  while(offset+4<=bytes.length){if(bytes[offset++]!==255)throw new Error('Invalid JPEG.');while(bytes[offset]===255)offset++;const marker=bytes[offset++];if(marker===0xda||marker===0xd9)break;if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;const size=bytes.readUInt16BE(offset);if(size<2||offset+size>bytes.length)throw new Error('Truncated JPEG.');if([0xc0,0xc1,0xc2].includes(marker)){if(size<8)throw new Error('Invalid JPEG dimensions.');return {height:bytes.readUInt16BE(offset+3),width:bytes.readUInt16BE(offset+5)};}offset+=size;}
  throw new Error('Unsupported JPEG.');
}
export async function validateLogo(file:File,maxUploadMB:number){
  if(!file||typeof file.arrayBuffer!=='function'||!file.size)throw new Error('Upload a PNG or JPG logo.');
  if(file.size>Math.min(maxUploadMB,5)*1048576)throw new Error('Logo must be under 5 MB.');
  const bytes=Buffer.from(await file.arrayBuffer());let image:{width:number;height:number;data:Buffer|Uint8Array};
  if(bytes.length>=33&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){
    if(bytes.toString('ascii',12,16)!=='IHDR')throw new Error('Invalid PNG.');dimensions(bytes.readUInt32BE(16),bytes.readUInt32BE(20));
    // Only single-frame logos: reject APNG before decoding.
    let offset=8;while(offset+12<=bytes.length){const size=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8);if(size>bytes.length-offset-12)throw new Error('Truncated PNG.');if(type==='acTL')throw new Error('Animated logos are unsupported.');offset+=size+12;}
    image=PNG.sync.read(bytes,{checkCRC:true});
  }else if(bytes.length>4&&bytes[0]===255&&bytes[1]===216){
    const size=jpegDimensions(bytes);dimensions(size.width,size.height);image=decodeJpeg(bytes,{useTArray:true,formatAsRGBA:true,tolerantDecoding:false,maxResolutionInMP:1,maxMemoryUsageInMB:32});
  }else throw new Error('Only PNG and JPG logos are supported. SVG is not accepted.');
  dimensions(image.width,image.height);
  // Fresh RGBA encoding strips metadata, scripts, trailing content and source chunks.
  const normalized=new PNG({width:image.width,height:image.height});normalized.data=Buffer.from(image.data);
  const encoded=PNG.sync.write(normalized,{colorType:6,bitDepth:8});
  if(encoded.length>5*1048576)throw new Error('Normalized logo is too large.');
  return {bytes:new Uint8Array(encoded),mime:'image/png'};
}
