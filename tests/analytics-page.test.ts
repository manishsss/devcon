import test from 'node:test';
import assert from 'node:assert/strict';
import {analyticsPage, MEASUREMENT_ID} from '../lib/analytics-page';
test('uses the provided Google measurement ID',()=>assert.equal(MEASUREMENT_ID,'G-MFYJK754QW'));
test('only public campaign pages are tracked',()=>{
 for(const path of ['/','/terms','/content-logo-policy'])assert.ok(analyticsPage(`https://devcon.manishh.xyz${path}`,'','Devcon'));
 for(const path of ['/admin','/admin/payments','/api/verify','/unknown'])assert.equal(analyticsPage(`https://devcon.manishh.xyz${path}`,'','Private'),null);
});
test('strips query parameters, fragments and detailed referrer paths',()=>{
 const page=analyticsPage('https://devcon.manishh.xyz/?secret=test&wallet=0x123#checkout','https://example.com/private?email=test@example.com','Devcon');
 assert.deepEqual(page,{page_location:'https://devcon.manishh.xyz/',page_referrer:'https://example.com',page_title:'Devcon'});
});
test('invalid or executable referrers are omitted',()=>{
 for(const ref of ['','not-a-url','javascript:alert(1)'])assert.equal(analyticsPage('https://devcon.manishh.xyz/',ref,'Devcon')?.page_referrer,'');
});
