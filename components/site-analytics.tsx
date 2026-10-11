'use client';
import {useEffect, useRef} from 'react';
import {usePathname} from 'next/navigation';
import {analyticsPage, MEASUREMENT_ID} from '@/lib/analytics-page';

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  [key: `ga-disable-${string}`]: boolean | undefined;
};

export default function SiteAnalytics() {
  const pathname = usePathname();
  const lastPage = useRef('');
  useEffect(() => {
    const target = window as unknown as AnalyticsWindow;
    const page = analyticsPage(window.location.href, document.referrer, document.title);
    target[`ga-disable-${MEASUREMENT_ID}`] = !page;
    if (!page) {lastPage.current=''; return;}
    if (lastPage.current === page.page_location) return;
    lastPage.current = page.page_location;
    target.dataLayer = target.dataLayer || [];
    // Match Google's standard queue format; never send form values or wallet data.
    target.gtag = target.gtag || function() {target.dataLayer!.push(arguments);};
    target.gtag('set', page);
    if (!document.getElementById('devcon-google-tag')) {
      target.gtag('js', new Date());
      target.gtag('config', MEASUREMENT_ID, {
        ...page, send_page_view: false,
        allow_google_signals: false, allow_ad_personalization_signals: false,
      });
      const script = document.createElement('script');
      script.id = 'devcon-google-tag';
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
      document.head.appendChild(script);
    }
    target.gtag('event', 'page_view', {...page, send_to: MEASUREMENT_ID});
  }, [pathname]);
  return null;
}
