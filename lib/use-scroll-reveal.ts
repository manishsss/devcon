'use client';
import { useEffect } from 'react';

export function useScrollReveal() {
  useEffect(() => {
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const root = document.querySelector('main');
    if (!root) return;
    const selector = '.hero-copy, .shirt-stage, .fund, .section-heading, .editorial-heading, .spot-card, .deliverable, .faq-list, .empty-lineup, .sponsors article, .transparency, .why-section .about-intro > div:first-child, .about-section .about-intro > div:first-child, .why-section .about-copy > p, .about-section .about-copy > p, .about-videos > a, .about-posts-heading, .about-posts > a';
    const elements = new Set<HTMLElement>();
    const reveal = (element: HTMLElement) => {
      element.classList.add('is-visible');
      observer.unobserve(element);
    };
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) reveal(entry.target as HTMLElement);
    }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });
    const observe = (element: HTMLElement) => {
      if (elements.has(element)) return;
      elements.add(element);
      if (element.matches('.spot-card, .deliverable, .sponsors article')) {
        const mobile = window.matchMedia('(max-width: 650px)').matches;
        const columns = element.matches('.deliverable') ? (mobile ? 1 : 2) : (mobile ? 2 : 4);
        const index = Array.from(element.parentElement?.children ?? []).indexOf(element);
        element.style.setProperty('--reveal-delay', `${(index % columns) * 65}ms`);
      }
      if (element.matches('.about-video, .about-post, .about-copy > p')) {
        const index = Array.from(element.parentElement?.children ?? []).indexOf(element);
        const columns = window.matchMedia('(max-width: 600px)').matches ? 1 : 2;
        element.style.setProperty('--reveal-delay', `${(index % columns) * 60}ms`);
      }
      element.classList.add('scroll-reveal');
      observer.observe(element);
    };
    root.querySelectorAll<HTMLElement>(selector).forEach(observe);
    const mutations = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches(selector)) observe(node);
        node.querySelectorAll<HTMLElement>(selector).forEach(observe);
      }
    });
    mutations.observe(root, { childList: true, subtree: true });
    const handleFocus = (event: Event) => {
      const target = event.target as HTMLElement;
      const element = target.closest<HTMLElement>('.scroll-reveal');
      if (element) reveal(element);
    };
    root.addEventListener('focusin', handleFocus);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      root.removeEventListener('focusin', handleFocus);
      elements.forEach(element => {
        element.classList.remove('scroll-reveal', 'is-visible');
        element.style.removeProperty('--reveal-delay');
      });
    };
  }, []);
}
