import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverWallets,mobileWalletLinks,walletCheckoutUrl,type WalletOption} from '../lib/wallet-discovery';

const provider=()=>({request:async()=>['0x1111111111111111111111111111111111111111']});
function fakeWindow(ethereum?:unknown){const target=new EventTarget() as unknown as Window; (target as any).ethereum=ethereum;return target;}
function announce(target:Window,p:unknown,name='Rabby',uuid='rabby'){target.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{provider:p,info:{name,uuid,icon:'<script>bad()</script>'}}}));}

test('discovers multiple providers without overwriting or silently selecting one',()=>{
 const target=fakeWindow();const a=provider(),b=provider();let options:WalletOption[]=[];
 target.addEventListener('eip6963:requestProvider',()=>{announce(target,a);announce(target,b,'MetaMask','meta');});
 const stop=discoverWallets(target,value=>options=value);
 assert.equal(options.length,2);assert.equal(options[0].provider,a);assert.equal(options[1].provider,b);
 assert.ok(!('icon' in options[0]));stop();
});
test('repeated announcements and legacy fallback deduplicate by provider identity',()=>{
 const a=provider();const target=fakeWindow({providers:[a]});let options:WalletOption[]=[];
 target.addEventListener('eip6963:requestProvider',()=>{announce(target,a);announce(target,a);});
 const stop=discoverWallets(target,value=>options=value);
 assert.equal(options.length,1);assert.equal(options[0].name,'Rabby');stop();
});
test('late providers are discovered, malformed announcements ignored, cleanup removes listener',()=>{
 const target=fakeWindow();let options:WalletOption[]=[];const stop=discoverWallets(target,value=>options=value);
 announce(target,{});target.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:null}));
 assert.equal(options.length,0);announce(target,provider());assert.equal(options.length,1);
 stop();announce(target,provider(),'MetaMask','meta');assert.equal(options.length,1);
});
test('no injected wallet is a supported empty state and legacy wallets remain usable',()=>{
 let options:WalletOption[]=[];discoverWallets(fakeWindow(),value=>options=value)();assert.equal(options.length,0);
 const a={...provider(),isRabby:true,isMetaMask:true};discoverWallets(fakeWindow(a),value=>options=value)();
 assert.equal(options[0].name,'Rabby');assert.equal(options[0].provider,a);
});
test('mobile app links reopen selected slot and chain without carrying secrets or payment instructions',()=>{
 const target=walletCheckoutUrl('https://devcon.manishh.xyz/?secret=private&tx=0x123',2,8453);
 const url=new URL(target);assert.equal(url.searchParams.get('checkoutSlot'),'2');assert.equal(url.searchParams.get('checkoutChain'),'8453');
 assert.deepEqual([...url.searchParams.keys()],['checkoutSlot','checkoutChain']);
 const links=mobileWalletLinks(target);assert.equal(links.length,3);
 assert.equal(links[0].href,`https://link.metamask.io/dapp/${target.slice(8)}`);
 assert.equal(new URL(links[1].href).searchParams.get('dapp'),target);
 assert.equal(new URL(links[1].href).searchParams.get('_cmd'),'open-dapp');
 assert.equal(new URL(links[2].href).searchParams.get('url'),target);
 for(const link of links)assert.ok(!link.href.includes('private')&&!link.href.includes('/send/')&&!link.href.includes('transfer'));
 assert.throws(()=>walletCheckoutUrl('https://devcon.manishh.xyz',9,8453));
 assert.throws(()=>mobileWalletLinks('javascript:alert(1)'));
});
