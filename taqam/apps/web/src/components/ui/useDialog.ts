'use client';
import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Number of dialogs currently open (the demo banner hides while one is open). */
let openCount = 0;
export const DIALOG_EVENT = 'taqam:dialogs';
const announce = () => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(DIALOG_EVENT, { detail: openCount })); };
export const openDialogs = () => openCount;

/**
 * Modal dialog behaviour: Escape closes, initial focus moves into the dialog (an autoFocus field wins, else the first
 * focusable element, else the dialog itself), Tab / Shift+Tab are trapped inside, and focus returns to the element
 * that opened it when the dialog closes.
 */
export function useDialog<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const el = ref.current;
    openCount++; announce();
    const focusables = () => (el ? Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null || x === document.activeElement) : []);
    // Let autoFocus children run first.
    const t = window.setTimeout(() => {
      if (!el || el.contains(document.activeElement)) return;
      const body = el.querySelector<HTMLElement>('[data-dialog-body]');
      const first = (body && Array.from(body.querySelectorAll<HTMLElement>(FOCUSABLE))[0]) || focusables()[0];
      (first ?? el).focus();
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !el) return;
      const items = focusables();
      if (!items.length) { e.preventDefault(); el.focus(); return; }
      const first = items[0]; const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !el.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !el.contains(active))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      openCount = Math.max(0, openCount - 1); announce();
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, [open]);
  return ref;
}
