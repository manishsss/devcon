// Read-only configuration evidence. No token or customer data is printed.
export function assessBucket(managed,custom){
  if(typeof managed?.enabled!=='boolean'||!Array.isArray(custom?.domains))return {verified:false,reason:'Incomplete bucket evidence'};
  if(managed.enabled||custom.domains.some(d=>d.enabled!==false))return {verified:true,private:false,reason:'Public R2 domain is enabled'};
  return {verified:true,private:true};
}
export async function auditBucket({accountId,bucket,token,fetcher=fetch}){
  async function read(path){const r=await fetcher(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucket)}/${path}`,{headers:{authorization:`Bearer ${token}`}});const d=await r.json();if(!r.ok||!d.success)throw Error('Cloudflare read access unavailable: '+path);return d.result;}
  return assessBucket(await read('domains/managed'),await read('domains/custom'));
}
if(import.meta.url===`file://${process.argv[1]}`){
  const {CLOUDFLARE_ACCOUNT_ID:accountId,CLOUDFLARE_API_TOKEN:token,R2_BUCKET:bucket}=process.env;
  if(!accountId||!token||!bucket){console.error('Required: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN and R2_BUCKET. No configuration was inspected.');process.exitCode=2;}
  else{try{const evidence=await auditBucket({accountId,token,bucket});console.log(JSON.stringify(evidence));if(!evidence.verified||!evidence.private)process.exitCode=1;}catch{console.error('Bucket configuration could not be verified.');process.exitCode=2;}}
}
