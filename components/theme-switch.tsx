"use client";
export function ThemeSwitch() {
  function togglePalette() {
    const root = document.documentElement;
    const next = root.dataset.palette === "burgundy" ? "orange" : "burgundy";
    root.dataset.palette = next;
    try { localStorage.setItem("devcon-accent", next); } catch {}
  }
  return <button className="palette-switch" type="button" onClick={togglePalette} aria-label="Switch between original orange and burgundy palette">
    <span className="switch-to-orange">Back to orange</span>
    <span className="switch-to-burgundy">Try burgundy</span>
  </button>;
}
