import {test} from 'node:test';import assert from 'node:assert/strict';import ts from 'typescript';import {readFileSync} from 'node:fs';
const m={exports:{}};new Function('module','exports',ts.transpileModule(readFileSync('lib/admin-authorization.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m,m.exports);const {authorizeAdministrator:a,requireAdminOrigin:o}=m.exports,settings={ADMIN_USER_ID:'owner',ADMIN_EMAIL:'owner@example.test',PLATFORM_AUTH_BOUNDARY_VERIFIED:'1'},user={userId:'owner',email:'owner@example.test'};
await test('admin denies missing boundary identity and email-only spoof',()=>{assert.throws(()=>a(user,{...settings,PLATFORM_AUTH_BOUNDARY_VERIFIED:undefined}));assert.throws(()=>a(null,settings));assert.throws(()=>a({...user,userId:'attacker'},settings));assert.throws(()=>a(user,{ADMIN_EMAIL:user.email,PLATFORM_AUTH_BOUNDARY_VERIFIED:'1'}));assert.equal(a(user,settings).userId,'owner');});
await test('admin mutations require same-origin header',()=>{for(const headers of [{},{origin:'https://evil.test'}])assert.throws(()=>o(new Request('https://site.test/api/admin',{headers})));o(new Request('https://site.test/api/admin',{headers:{origin:'https://site.test'}}));});
await test('browser admin config excludes credential-bearing RPCs and unknown fields',()=>{
  const fields={treasury:'0x123',reservationMinutes:15,maxUploadMB:5,policy:'policy',target:2200};
  const result=m.exports.browserAdminConfig({...fields,rpc:'https://provider.test/private-key',rpcByChain:{137:'https://provider.test/private-key'},futureSecret:'hidden'});
  assert.deepEqual(result,fields);
  assert.equal(JSON.stringify(result).includes('private-key'),false);
});
