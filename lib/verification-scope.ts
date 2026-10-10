import { AsyncLocalStorage } from 'node:async_hooks';
const scope=new AsyncLocalStorage<{paymentId:string;token:string}>();
export const VERIFICATION_LEASE_MS=120000;
export function withVerificationScope<T>(paymentId:string,token:string,run:()=>Promise<T>){return scope.run({paymentId,token},run);}
export function fencedDatabase(raw:any):any{
  const owner=scope.getStore();if(!owner)return raw;
  function gates(){return [raw.prepare(`INSERT INTO verification_guards(payment_id,token) VALUES((SELECT id FROM payments WHERE id=? AND verification_lock=?),?) ON CONFLICT(payment_id) DO UPDATE SET token=excluded.token`).bind(owner!.paymentId,owner!.token,owner!.token),raw.prepare('UPDATE payments SET verification_lock_until=? WHERE id=? AND verification_lock=?').bind(Date.now()+VERIFICATION_LEASE_MS,owner!.paymentId,owner!.token)];}
  const unwrap=(statement:any)=>statement.rawStatement||statement;
  async function execute(statements:any[]){const results=await raw.batch([...gates(),...statements.map(unwrap)]);return results.slice(2);}
  function prepare(query:string){const create=(args:any[])=>{const statement=raw.prepare(query).bind(...args);const readOnly=/^\s*(SELECT|PRAGMA|EXPLAIN)\b/i.test(query);return {rawStatement:statement,bind:(...values:any[])=>create(values),run:async()=> (await execute([statement]))[0],first:async(...args:any[])=>readOnly?statement.first(...args):(await execute([statement]))[0]?.results?.[0]||null,all:async()=>readOnly?statement.all(): (await execute([statement]))[0]};};return create([]);}
  return {prepare,batch:execute};
}
