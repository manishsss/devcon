export class RequestLimitError extends Error { status=429; constructor(){super('Request limit reached. Please retry in a minute.');} }
export async function consumeBudget(database:any,key:string,limit:number,now=Date.now(),windowMs=60000){
  const window=Math.floor(now/windowMs);
  const row=await database.prepare(`INSERT INTO request_budgets(key,window,count) VALUES(?,?,1)
    ON CONFLICT(key) DO UPDATE SET window=excluded.window,count=CASE WHEN request_budgets.window=excluded.window THEN request_budgets.count+1 ELSE 1 END
    WHERE request_budgets.window!=excluded.window OR request_budgets.count<? RETURNING count`).bind(key,window,limit).first();
  if(!row)throw new RequestLimitError();
}
export async function requestBudget(database:any,request:Request,scope:string,limit:number){
  await consumeBudget(database,`global:${scope}`,limit*8);
  // Global cap remains effective even if the edge IP header is missing or spoofed.
  const ip=request.headers.get('cf-connecting-ip')||'unknown';
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip)))).map(v=>v.toString(16).padStart(2,'0')).join('');
  await consumeBudget(database,`client:${scope}:${hash}`,limit);
}
export async function boundedRequest(request:Request,maxBytes=6*1048576){
  const length=request.headers.get('content-length');
  if(length&&Number(length)>maxBytes)throw Object.assign(new Error('Request body is too large.'),{status:413});
  if(!request.body)return request;
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let total=0;
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maxBytes){await reader.cancel();throw Object.assign(new Error('Request body is too large.'),{status:413});}chunks.push(value);}
  const body=new Uint8Array(total);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
  return new Request(request.url,{method:request.method,headers:request.headers,body:body.buffer});
}
