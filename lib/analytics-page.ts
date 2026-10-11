export const MEASUREMENT_ID = 'G-MFYJK754QW';
const publicPages = new Set(['/', '/terms', '/content-logo-policy']);
export function analyticsPage(href: string, referrer: string, title: string) {
  const page = new URL(href);
  if (!publicPages.has(page.pathname)) return null;
  let cleanReferrer = '';
  try {
    const ref = new URL(referrer);
    if (['https:', 'http:'].includes(ref.protocol)) cleanReferrer = ref.origin;
  } catch { /* No valid referrer. */ }
  return {page_location: page.origin + page.pathname, page_referrer: cleanReferrer, page_title: title};
}
