'use client';

import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';

export default function MobileHeaderActions() {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        toggle.current?.focus();
      }
    }
    const desktop = window.matchMedia('(min-width: 901px)');
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    desktop.addEventListener('change', closeOnDesktop);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      desktop.removeEventListener('change', closeOnDesktop);
    };
  }, [open]);

  return (
    <div className="mobile-header-actions" ref={container}>
      <a className="button primary mobile-header-cta" href="#spots" onClick={() => setOpen(false)}>Get a spot</a>
      <button ref={toggle} type="button" className="mobile-menu-toggle" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} aria-controls="mobile-header-menu" onClick={() => setOpen(value => !value)}>
        {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
      </button>
      {open && (
        <div id="mobile-header-menu" className="mobile-header-menu" aria-label="Section links">
          <a href="#benefits" onClick={() => setOpen(false)}>What you get</a>
          <a href="#why" onClick={() => setOpen(false)}>Why</a>
          <a href="#about" onClick={() => setOpen(false)}>About</a>
        </div>
      )}
    </div>
  );
}
