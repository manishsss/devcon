import Home, {type Inventory} from '@/components/campaign-home';
import {db,inventory} from '@/lib/campaign';
import {monitorPayments} from '@/lib/payment';
import {requestBudget} from '@/lib/abuse';
import {headers} from 'next/headers';
import {waitUntil} from 'cloudflare:workers';

export const dynamic='force-dynamic';

export default async function Page(){
  try{
    await requestBudget(db(),new Request('https://site.invalid/',{headers:await headers()}),'inventory',60);
    const current=await inventory();
    waitUntil(monitorPayments().catch(()=>{console.error('Background page monitor failed; payment retries remain available.');}));
    return <Home initialInventory={current as Inventory}/>;
  }catch{
    console.error('Initial auction inventory unavailable; client will retry.');
    return <Home/>;
  }
}
