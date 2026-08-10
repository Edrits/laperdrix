/* =========================================================================
   sync.js — makes the app shared instead of 27 private copies.

   The shape of it, and why:

   Every write goes to localStorage FIRST and the network second. Connectivity
   at the villa is poor, and someone standing in a supermarket car park logging
   a shop must never lose the number because the line dropped. If the request
   fails it joins a queue and is retried later; the entry is already safe.

   Reads replace the local cache with what the server has. The queue is always
   flushed before a read, or a pull would wipe out writes that hadn't landed.

   With no Worker or no token — local development, or someone who opened the
   bare URL — every function quietly no-ops and the app runs device-only, which
   is exactly how it behaved before this file existed.
   ========================================================================= */

(function (global) {
  'use strict';

  // Not a secret: it's a public address. The SHARE_TOKEN gates access and never
  // appears in any file — it arrives on the share link as #t=…
  const WORKER_URL = 'https://laperdrix.neddritchie.workers.dev';

  /* THE DATES. Change them here and nowhere else.
     They used to be declared separately in index.html and kitty.html, which is
     one edit away from the calendar and the kitty disagreeing about when the
     holiday is. Saturday to Saturday, fourteen nights. */
  const TRIP = { start: '2027-07-31', end: '2027-08-14' };

  const K_TOKEN  = 'laperdrix.token';
  const K_PEOPLE = 'laperdrix.stays.v1';
  const K_SPEND  = 'laperdrix.expenses.v1';
  const K_SET    = 'laperdrix.settings.v1';
  const K_QUEUE  = 'laperdrix.queue.v1';

  const read = (k, fb) => {
    try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; }
    catch { return fb; }
  };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  function token() {
    try { return localStorage.getItem(K_TOKEN) || ''; } catch { return ''; }
  }
  const configured = () => Boolean(WORKER_URL && token());

  /* The share link is …/#t=<token>. Take it, keep it, and tidy the address bar
     so the token isn't sitting there to be screenshotted. */
  function claimToken() {
    const m = location.hash.match(/[#&]t=([^&]+)/);
    if (!m) return;
    try { localStorage.setItem(K_TOKEN, decodeURIComponent(m[1])); } catch {}
    history.replaceState(null, '', location.pathname + location.search);
  }
  claimToken();

  // Ids are generated on the client so an entry exists the instant it is typed,
  // with no round trip. They must be real UUIDs — the database columns are uuid
  // and would reject anything else.
  function newId() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16);
    (global.crypto || {}).getRandomValues
      ? crypto.getRandomValues(b)
      : b.forEach((_, i) => { b[i] = Math.floor(Math.random() * 256); });
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  }

  /* ------------------------------------------------------------- queue */

  const queue = () => read(K_QUEUE, []);
  const setQueue = q => write(K_QUEUE, q);

  function enqueue(job) {
    const q = queue();
    // Collapse repeated edits of the same thing — only the last one matters,
    // and a fortnight of flaky signal shouldn't build a queue of duplicates.
    const i = q.findIndex(j => j.kind === job.kind && j.id === job.id);
    if (i >= 0) q[i] = job; else q.push(job);
    setQueue(q);
  }

  async function send(job) {
    const t = encodeURIComponent(token());
    if (job.op === 'del') {
      const res = await fetch(`${WORKER_URL}/${job.kind}?t=${t}&id=${encodeURIComponent(job.id)}`,
        { method: 'DELETE' });
      return res.ok || res.status === 400;   // 400 = never reached the server anyway
    }
    const res = await fetch(`${WORKER_URL}/${job.kind}?t=${t}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(job.payload),
    });
    return res.ok;
  }

  async function flush() {
    if (!configured()) return { sent: 0, left: queue().length };
    let q = queue(), sent = 0;
    const keep = [];
    for (const job of q) {
      let ok = false;
      try { ok = await send(job); } catch { ok = false; }
      ok ? sent++ : keep.push(job);
    }
    setQueue(keep);
    return { sent, left: keep.length };
  }

  /* -------------------------------------------------------------- writes */

  function savePerson(person) {
    const list = read(K_PEOPLE, []);
    const i = list.findIndex(p => p.id === person.id);
    if (i >= 0) list[i] = person; else list.push(person);
    list.sort((a, b) => String(a.from).localeCompare(String(b.from)) || String(a.name).localeCompare(String(b.name)));
    write(K_PEOPLE, list);
    enqueue({ kind: 'person', op: 'put', id: person.id, payload: person });
    flush();
    return list;
  }

  function removePerson(id) {
    write(K_PEOPLE, read(K_PEOPLE, []).filter(p => p.id !== id));
    enqueue({ kind: 'person', op: 'del', id });
    flush();
  }

  function saveExpense(expense) {
    const list = read(K_SPEND, []);
    const i = list.findIndex(e => e.id === expense.id);
    if (i >= 0) list[i] = expense; else list.push(expense);
    write(K_SPEND, list);
    enqueue({ kind: 'expense', op: 'put', id: expense.id, payload: expense });
    flush();
    return list;
  }

  function removeExpense(id) {
    write(K_SPEND, read(K_SPEND, []).filter(e => e.id !== id));
    enqueue({ kind: 'expense', op: 'del', id });
    flush();
  }

  /* Shared app state — the cooking rota, and whatever small shared setting
     comes next. One row for the whole trip, so the queue id is a constant and
     repeated saves collapse to the last one. Last write wins, which is right
     for something one person regenerates on purpose. */
  function saveSettings(patch) {
    const next = Object.assign({}, read(K_SET, {}), patch || {});
    write(K_SET, next);
    enqueue({ kind: 'settings', op: 'put', id: 'settings', payload: next });
    flush();
    return next;
  }

  /* --------------------------------------------------------------- read */

  // Flush first, then pull. The other way round would overwrite writes that
  // have not reached the server yet.
  async function pull() {
    if (!configured()) return null;
    await flush();
    try {
      const res = await fetch(`${WORKER_URL}/data?t=${encodeURIComponent(token())}`);
      if (!res.ok) return null;
      const body = await res.json();
      if (!body || !Array.isArray(body.people)) return null;
      write(K_PEOPLE, body.people);
      write(K_SPEND, Array.isArray(body.expenses) ? body.expenses : []);
      // Only overwrite settings when the server actually sent some. Before the
      // migration lands the field is absent, and clobbering a locally-built
      // rota with {} would delete it on every refresh.
      if (body.settings && typeof body.settings === 'object') write(K_SET, body.settings);
      return body;
    } catch { return null; }
  }

  // Retry whatever is stuck as soon as the line comes back.
  global.addEventListener('online', () => { flush(); });

  global.Sync = {
    WORKER_URL, TRIP, K_TOKEN, K_PEOPLE, K_SPEND, K_SET,
    configured, token, newId,
    people: () => read(K_PEOPLE, []),
    expenses: () => read(K_SPEND, []),
    settings: () => read(K_SET, {}),
    savePerson, removePerson, saveExpense, removeExpense, saveSettings,
    pull, flush,
    pending: () => queue().length,
  };
})(window);
