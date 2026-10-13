export class QrPreparationCache {
  private entries=new Map<string,{expires:number;value:Promise<number>}>();
  constructor(private now=Date.now){}
  get(key:string,load:()=>Promise<number>){
    const now=this.now(),existing=this.entries.get(key);
    if(existing&&existing.expires>now)return existing.value;
    if(this.entries.size>32)this.entries.clear();
    const entry={expires:now+20000,value:Promise.resolve().then(load)};
    this.entries.set(key,entry);
    entry.value.catch(()=>{if(this.entries.get(key)===entry)this.entries.delete(key);});
    return entry.value;
  }
}
const caches=new WeakMap<object,QrPreparationCache>();
export function qrPreparationCache(database:object){
  let cache=caches.get(database);if(!cache){cache=new QrPreparationCache();caches.set(database,cache);}return cache;
}
