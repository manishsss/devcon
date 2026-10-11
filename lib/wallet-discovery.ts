export type WalletProvider = { request: (args: {method: string; params?: any[]}) => Promise<any> };
export type WalletOption = {id: string; name: string; provider: WalletProvider};

// Wallet metadata is untrusted: render names as text; never inject their SVG/HTML.
export function discoverWallets(target: Window, update: (wallets: WalletOption[]) => void) {
  const wallets: WalletOption[] = [];
  const add = (provider: any, id: string, name: string) => {
    if (!provider || typeof provider.request !== 'function' || wallets.some(item => item.provider === provider)) return;
    wallets.push({provider, id, name: name.slice(0, 60)});
    update([...wallets]);
  };
  const announce = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (typeof detail?.info?.uuid !== 'string' || typeof detail?.info?.name !== 'string') return;
    add(detail.provider, detail.info.uuid, detail.info.name);
  };
  target.addEventListener('eip6963:announceProvider', announce);
  target.dispatchEvent(new Event('eip6963:requestProvider'));
  const legacy = (target as any).ethereum;
  const providers = Array.isArray(legacy?.providers) ? legacy.providers : [legacy];
  providers.forEach((provider: any, index: number) => add(provider, `legacy-${index}`, provider?.isRabby ? 'Rabby' : provider?.isTrust ? 'Trust Wallet' : provider?.isCoinbaseWallet ? 'Coinbase Wallet' : provider?.isMetaMask ? 'MetaMask' : 'Browser wallet'));
  update([...wallets]);
  return () => target.removeEventListener('eip6963:announceProvider', announce);
}

export function walletCheckoutUrl(origin: string, slot: number, chain: number) {
  const url = new URL('/', origin);
  if (url.protocol !== 'https:') throw new Error('Wallet checkout requires HTTPS.');
  if (!Number.isInteger(slot) || slot < 1 || slot > 8) throw new Error('Invalid slot.');
  url.searchParams.set('checkoutSlot', String(slot));
  url.searchParams.set('checkoutChain', String(chain));
  url.hash = 'spots';
  return url.href;
}

export function mobileWalletLinks(checkoutUrl: string) {
  const url = new URL(checkoutUrl);
  if (url.protocol !== 'https:') throw new Error('Wallet checkout requires HTTPS.');
  return [
    {name: 'MetaMask', href: `https://link.metamask.io/dapp/${url.href.slice(8)}`},
    {name: 'Rabby', href: `https://go.rabby.io/mobile/?_cmd=open-dapp&dapp=${encodeURIComponent(url.href)}`},
    {name: 'Trust Wallet', href: `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url.href)}`},
  ];
}
