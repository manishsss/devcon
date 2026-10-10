import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') {
      return { url: new URL('./runtime.mjs', import.meta.url).href, shortCircuit: true };
    }
    if (specifier === 'next/headers' || specifier === 'next/navigation') {
      return { url: new URL('./auth.mjs', import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
