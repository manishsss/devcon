import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const safeKey=key=>/^[A-Za-z0-9_.-]{1,128}$/.test(key)&&key!=='.'&&key!=='..';
const quote=v=>v===null?'NULL':typeof v==='number'?String(v):Buffer.isBuffer(v)?"X'"+v.toString('hex')+"'":"'"+String(v).replaceAll("'","''")+"'";
export function exportSql(db){
  db.exec('BEGIN');try{const tables=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();let result=tables.map(t=>t.sql+';').join('\n');for(const t of tables){for(const row of db.prepare(`SELECT * FROM "${t.name.replaceAll('"','""')}"`).all()){result+=`\nINSERT INTO "${t.name}" (${Object.keys(row).map(k=>'"'+k+'"').join(',')}) VALUES (${Object.values(row).map(quote).join(',')});`;}}result+='\n'+db.prepare("SELECT sql FROM sqlite_master WHERE type IN ('index','trigger') AND sql IS NOT NULL ORDER BY type,name").all().map(r=>r.sql+';').join('\n');db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}
}
export function encryptBackup(sql,objects,key){
  if(key.length!==32)throw Error('A 32-byte backup key is required.');
  const records=objects.map(({key:objectKey,bytes})=>{if(!safeKey(objectKey))throw Error('Unsafe object key.');return {key:objectKey,sha256:hash(bytes),data:Buffer.from(bytes).toString('base64')};});
  const payload=Buffer.from(JSON.stringify({version:1,sql,sqlHash:hash(sql),objects:records}));const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),encrypted=Buffer.concat([cipher.update(payload),cipher.final()]);return Buffer.from(JSON.stringify({iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),data:encrypted.toString('base64')}));
}
export async function restoreBackup(encrypted,key,target){
  // Always a new destination: never overwrite an existing database/bucket mirror.
  const envelope=JSON.parse(encrypted.toString()),decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'hex'));decipher.setAuthTag(Buffer.from(envelope.tag,'hex'));const p=JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data,'base64')),decipher.final()]).toString());
  if(p.version!==1||hash(p.sql)!==p.sqlHash||!Array.isArray(p.objects))throw Error('Backup manifest mismatch.');const keys=new Set();for(const o of p.objects){if(!safeKey(o.key)||keys.has(o.key)||hash(Buffer.from(o.data,'base64'))!==o.sha256)throw Error('Object integrity failure.');keys.add(o.key);}
  const validation=new DatabaseSync(':memory:');try{validation.exec(p.sql);if(validation.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Database integrity failed.');const logos=validation.prepare('SELECT logo_url FROM sponsors').all();for(const row of logos)if(!keys.has(row.logo_url))throw Error('Backup is missing a referenced logo.');}finally{validation.close();}
  await mkdir(target,{recursive:false,mode:0o700});await mkdir(join(target,'objects'),{mode:0o700});const restored=new DatabaseSync(join(target,'database.sqlite'));try{restored.exec(p.sql);}finally{restored.close();}for(const o of p.objects)await writeFile(join(target,'objects',o.key),Buffer.from(o.data,'base64'),{mode:0o600,flag:'wx'});return {sqlHash:p.sqlHash,objectCount:p.objects.length};
}
if(import.meta.url===`file://${process.argv[1]}`){
 const [operation,input,objectsOrTarget,output]=process.argv.slice(2);const raw=process.env.BACKUP_KEY_HEX;if(!/^[0-9a-fA-F]{64}$/.test(raw||''))throw Error('BACKUP_KEY_HEX required; never put the key in arguments or source.');const key=Buffer.from(raw,'hex');
 if(operation==='backup'){const db=new DatabaseSync(input,{readOnly:true});let sql;try{sql=exportSql(db);}finally{db.close();}const objects=[];for(const name of await readdir(objectsOrTarget))objects.push({key:name,bytes:await readFile(join(objectsOrTarget,name))});await writeFile(output,encryptBackup(sql,objects,key),{flag:'wx',mode:0o600});console.log('Encrypted local backup created.');}
 else if(operation==='restore'){console.log(await restoreBackup(await readFile(input),key,objectsOrTarget));}else throw Error('Usage: backup <sqlite-file> <objects-directory> <new-backup-file> OR restore <backup-file> <new-directory>.');
}
