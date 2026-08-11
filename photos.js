/* photos.js — the photographs, fetched once and handed to CSS.

   The site is public; the photographs are not, because they show the family
   including children. They live in a private bucket and the Worker hands out
   short-lived signed URLs.

   The awkward constraint: CSS `background-image` cannot send an auth header, so
   the token cannot travel that way — and the stylesheet is public, so it cannot
   contain the token either. Hence custom properties, set here at runtime. Until
   then the blur stand-ins from photos.css are showing.

   Shared by index.html and rota.html rather than copied into both: a page whose
   copy of the list had drifted would silently keep its blur stand-in and look
   like a slow connection rather than a bug.

   Requires sync.js (for the Worker address and the token). */
const Photos = (() => {

  const set = (name, url) =>
    document.documentElement.style.setProperty('--ph-' + name, `url("${url}")`);

  /* names: the ones this page actually uses. Anything else in the Worker's
     reply is ignored, so a page only pays for what it shows. */
  async function load(names) {
    // Development: if the full-size files are sitting next to the page, just
    // use them. Keeps local work free of tokens and Workers entirely.
    try {
      const probe = await fetch('photos/group.jpg', { method: 'HEAD' });
      if (probe.ok) { names.forEach(n => set(n, `photos/${n}.jpg`)); return; }
    } catch {}

    if (!Sync.configured()) return;           // stand-ins stay; nothing is broken

    try {
      const res = await fetch(`${Sync.WORKER_URL}/photos?t=${encodeURIComponent(Sync.token())}`);
      if (!res.ok) return;
      const map = await res.json();
      for (const [name, url] of Object.entries(map)) {
        if (names.includes(name)) set(name, url);
      }
    } catch {}
  }

  return { load, set };
})();
