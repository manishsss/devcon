// Configure this in a server-side scheduler. Never embed its token in source.
const origin=process.env.PAYMENT_SITE_ORIGIN,token=process.env.MAINTENANCE_TOKEN;
if(!origin||!/^https:\/\//.test(origin)||!token||token.length<32)throw new Error('Set PAYMENT_SITE_ORIGIN and a secret MAINTENANCE_TOKEN.');
const url=new URL('/api/maintenance/monitor',origin);
const response=await fetch(url,{method:'POST',headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(120000),redirect:'error'});
if(!response.ok)throw new Error(`Payment monitor request failed: HTTP ${response.status}`);
const result=await response.json();
if(typeof result.processed!=='number'||typeof result.failed!=='number')throw new Error('Invalid monitor response.');
console.log(JSON.stringify({processed:result.processed,failed:result.failed,skipped:result.skipped}));
if(result.failed)process.exitCode=1;
