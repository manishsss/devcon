import {test} from 'node:test';
import assert from 'node:assert/strict';
import {database} from './database.mjs';
import {allocateQrAmount,qrAmount} from '../lib/qr-payment';
const input={chainId:8453,token:'0x'+'a'.repeat(40),treasury:'0x'+'b'.repeat(40),priceUnits:'200000000',reservationId:'one'};
test('QR amounts are below the quote, positive and exactly millesimal even for fractional takeover prices',async()=>{
 const db=database();try{
  for(const priceUnits of ['200000000','1181250000','1771875000','2657812500']){
   const amount=await allocateQrAmount(db,{...input,priceUnits,reservationId:priceUnits});assert.ok(amount<BigInt(priceUnits));assert.ok(amount>BigInt(0));assert.equal(amount%BigInt(1000),BigInt(0));assert.match(qrAmount(amount),/^\d+\.\d{3}$/);
  }
 }finally{db.sqlite.close();}
});
test('concurrent allocations are unique and immutable across cancellation or expiry',async()=>{
 const db=database();try{
  const values=await Promise.all(Array.from({length:30},(_,i)=>allocateQrAmount(db,{...input,reservationId:String(i)})));assert.equal(new Set(values.map(String)).size,30);
  assert.throws(()=>db.sqlite.exec('DELETE FROM qr_payment_amounts'),/cannot be reused/);assert.throws(()=>db.sqlite.exec("UPDATE qr_payment_amounts SET amount_units='1'"),/cannot be reused/);
 }finally{db.sqlite.close();}
});
test('exhaustion fails closed and the same amount can be used on a different chain',async()=>{
 const db=database();try{
  for(let i=1;i<=999;i++)db.sqlite.prepare('INSERT INTO qr_payment_amounts VALUES(?,?,?,?,?,?)').run(input.chainId,input.token,input.treasury,String(200000000-i*1000),String(i),1);
  await assert.rejects(()=>allocateQrAmount(db,input),/unavailable/);
  assert.equal(await allocateQrAmount(db,{...input,chainId:1}),BigInt(199999000));
 }finally{db.sqlite.close();}
});
