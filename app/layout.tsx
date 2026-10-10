import type { Metadata } from "next";
import "./globals.css";
import { ThemeSwitch } from "@/components/theme-switch";

export const metadata: Metadata = {
  title: "8 Projects. 1 Devcon T-Shirt.",
  description: "Eight projects. One T-shirt. Join Manish on his Devcon Mumbai journey.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-palette="burgundy" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{__html: `(function(){try{var p=localStorage.getItem('devcon-accent');if(p==='orange'||p==='burgundy')document.documentElement.dataset.palette=p;}catch(e){}})();`}} /></head>
      <body className="antialiased">{children}<ThemeSwitch /></body>
    </html>
  );
}
