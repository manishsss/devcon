import type { Metadata, Viewport } from "next";
import SiteAnalytics from "@/components/site-analytics";
import "./globals.css";
import "./mobile.css";

export const metadata: Metadata = {
  title: "Put Your Brand on Me",
  description: "Eight projects. One T-shirt. Join Manish on his Devcon Mumbai journey.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-palette="burgundy" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{__html: `(function(){try{var p=localStorage.getItem('devcon-accent');if(p==='orange'||p==='burgundy')document.documentElement.dataset.palette=p;}catch(e){}})();`}} /></head>
      <body className="antialiased">{children}<SiteAnalytics /></body>
    </html>
  );
}
