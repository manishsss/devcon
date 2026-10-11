export function projectLink(project: { website?: string | null; x?: string | null }): string | null {
  if (project.website) {
    try {
      const url = new URL(project.website);
      if (['https:', 'http:'].includes(url.protocol)) return url.href;
    } catch {}
  }
  const handle = (project.x || '').replace(/^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i, '').replace(/^@/, '').replace(/\/$/, '');
  return /^[a-zA-Z0-9_]{1,15}$/.test(handle) ? `https://x.com/${handle}` : null;
}
