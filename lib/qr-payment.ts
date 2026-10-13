// Amount identifiers are permanent, scoped to the receiving network/token/address.
// Underpayments are a checkout discount only; the auction's listed price is unchanged.
export function qrAmount(units:string|bigint){
 const value=BigInt(units);return `${value/BigInt(1000000)}.${String(value%BigInt(1000000)).padStart(6,'0').slice(0,3)}`;
}
export async function allocateQrAmount(database:any,input:{chainId:number;token:string;treasury:string;priceUnits:string;reservationId:string},now=Date.now()){
 // Bound parameters may be REAL in D1; SQL casts to INTEGER before canonical text conversion.
 const base=BigInt(input.priceUnits)/BigInt(1000)*BigInt(1000);
 if(base>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('QR price exceeds the supported exact range.');
 const row=await database.prepare(`WITH RECURSIVE offsets(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM offsets WHERE n<999)
 INSERT INTO qr_payment_amounts(chain_id,token_contract,treasury,amount_units,reservation_id,allocated_at)
 SELECT ?,?,?,CAST(CAST(? AS INTEGER)-n*1000 AS TEXT),?,? FROM offsets
 WHERE ?-n*1000>0 AND NOT EXISTS(SELECT 1 FROM qr_payment_amounts q WHERE q.chain_id=? AND q.token_contract=? AND q.treasury=? AND q.amount_units=CAST(CAST(? AS INTEGER)-n*1000 AS TEXT))
 AND NOT EXISTS(SELECT 1 FROM payments p WHERE p.chain_id=? AND lower(p.token_contract)=? AND p.amount_units=CAST(CAST(? AS INTEGER)-n*1000 AS TEXT))
 ORDER BY n LIMIT 1 RETURNING amount_units`).bind(input.chainId,input.token.toLowerCase(),input.treasury.toLowerCase(),Number(base),input.reservationId,now,Number(base),input.chainId,input.token.toLowerCase(),input.treasury.toLowerCase(),Number(base),input.chainId,input.token.toLowerCase(),Number(base)).first();
 if(!row)throw new Error('QR payment amounts are unavailable for this price. Use wallet checkout.');
 return BigInt(row.amount_units);
}
