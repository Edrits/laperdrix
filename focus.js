/* =========================================================================
   focus.js — the small amount of focus management a modal sheet needs, shared
   by all three pages. No framework, same as everything else here.

   Two things, and only for the sheets that are TRUE modals (a scrim over the
   page, nothing behind meant to be reached):

     1. Trap Tab inside the open sheet, so keyboard and screen-reader users
        can't wander onto the controls sitting behind it.
     2. Put focus back where it came from when the sheet closes, so you aren't
        dumped at the top of the page after every save.

   Deliberately NOT used on index.html's dates sheet: that one is used WHILE
   tapping the calendar behind it, so trapping focus away from the calendar
   would break the very thing it is for. It keeps the page's own Escape-to-close
   and tap-away instead.
   ========================================================================= */

(function (global) {
  'use strict';

  // Everything a person can Tab to. :not([disabled]) and a positive-ish
  // tabindex; the visibility filter drops anything not actually on screen.
  const SEL = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  let active = null;   // { el, prev, onKey }

  const focusables = el =>
    [...el.querySelectorAll(SEL)].filter(n =>
      n.offsetWidth || n.offsetHeight || n.getClientRects().length);

  /* Open a trap on `el`. `initial` chooses where focus lands:
       an element  → focus it,
       undefined   → focus the first focusable inside,
       null        → leave focus alone (the caller places it itself, e.g. the
                     kitty amount field, which must be focused inside the tap's
                     own task or iOS won't raise the keypad).
     Whatever had focus at open time is remembered and restored on release. */
  function trap(el, initial) {
    release();                                  // only ever one at a time
    const prev = document.activeElement;

    const onKey = e => {
      if (e.key !== 'Tab') return;
      const f = focusables(el);
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      // Wrap at the ends, and pull a stray focus (say, after a re-render left it
      // on <body>) back inside.
      if (e.shiftKey) {
        if (document.activeElement === first || !el.contains(document.activeElement)) {
          e.preventDefault(); last.focus();
        }
      } else if (document.activeElement === last || !el.contains(document.activeElement)) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    active = { el, prev, onKey };

    if (initial === null) return;
    (initial || focusables(el)[0] || el).focus();
  }

  function release() {
    if (!active) return;
    const { prev, onKey } = active;
    document.removeEventListener('keydown', onKey, true);
    active = null;
    // Back to the trigger, if it is still in the document.
    try { if (prev && prev.focus && document.contains(prev)) prev.focus(); } catch {}
  }

  global.Focus = { trap, release };
})(window);
