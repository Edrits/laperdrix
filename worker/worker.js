// Cloudflare Worker for La Perdrix.
//
// ⚠️  DEPLOYS ARE MANUAL. This file is the source of truth, but it reaches
//     Cloudflare by being pasted into the dashboard. If you change it, say so
//     loudly — otherwise the live version silently drifts from the repo.
//     THIS FILE HAS CHANGED: it now does data sync as well as photographs, so
//     it must be re-pasted or the app will keep working device-by-device.
//     IT HAS CHANGED AGAIN SINCE THAT NOTE WAS WRITTEN: people now carry an
//     optional `household` label. Until this file is re-pasted, a household
//     typed on a phone is stored locally and then silently dropped on the way
//     to the database. Run schema.sql's household migration BEFORE pasting.
//
// Two jobs:
//   1. Hand out short-lived signed URLs for the photographs, which live in a
//      PRIVATE Supabase bucket. The site is public on Pages; the photos are not.
//   2. Store the shared data — who is coming, and what everyone has spent — so
//      that 27 phones see the same thing instead of 27 private copies.
//
// Routes
//   GET    /health              → {ok:true}. No token. For checking the deploy.
//   GET    /photos?t=           → {name: signedUrl, …} for all photographs.
//   GET    /data?t=             → {people:[…], expenses:[…]}
//   POST   /person?t=           → upsert one person   (body = the record)
//   POST   /expense?t=          → upsert one expense  (body = the record)
//   DELETE /person?t=&id=       → remove one person
//   DELETE /expense?t=&id=      → remove one expense
//
// Secrets to set in the dashboard (Settings → Variables and Secrets → Add,
// with Type set to **Secret**, not Text):
//   SUPABASE_URL                e.g. https://yumadmlyepizjxneunqe.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   bypasses row-level security — never put this in
//                               the repo, the page, or a chat window
//   SHARE_TOKEN                 the long random string that is the app's password

const ALLOWED_ORIGINS = [
  'https://edrits.github.io',
  'http://localhost:4173',
];

// An allow-list, not a path parameter. Anything reaching Supabase Storage as a
// caller-supplied path is a directory-traversal bug waiting to happen.
const PHOTOS = ['group', 'lake', 'abbey', 'chair', 'mirror', 'heads', 'hens'];

const BUCKET = 'trip-photos';
const EXPIRES_IN = 60 * 60 * 12;   // 12 hours; a page load always gets fresh ones
const TRIP_NAME = 'La Perdrix';
// Must match TRIP in sync.js. Two places is one too many, but the Worker cannot
// import from the site — so if you change one, change the other.
const TRIP_DATES = { start: '2027-07-31', end: '2027-08-14' };

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// Compare in constant time so the response time can't be used to guess the
// token a character at a time.
function tokenMatches(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string') return false;
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ----------------------------------------------------------- supabase */

function sb(env, path, init) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      ...(init && init.headers),
    },
  });
}

// One trip, found or created on demand, so there is no separate setup step and
// no trip id to configure anywhere.
//
// Looked up by NAME, deliberately not by access_token. Keying it on the token
// would mean that changing SHARE_TOKEN — a thing you might reasonably do if the
// link got forwarded too widely — silently created a second empty trip and
// orphaned everyone's data. The token is stored on the row, but it is not the
// identity of the row.
async function tripId(env) {
  const name = encodeURIComponent(TRIP_NAME);
  const found = await sb(env, `trips?name=eq.${name}&select=id,start_date,end_date&limit=1`);
  if (found.ok) {
    const rows = await found.json();
    if (Array.isArray(rows) && rows.length) {
      const row = rows[0];
      // Dates move. Keep the stored row in step with TRIP_DATES rather than
      // leaving whatever was true when the row was first created — otherwise
      // the database quietly disagrees with the app.
      if (row.start_date !== TRIP_DATES.start || row.end_date !== TRIP_DATES.end) {
        await sb(env, `trips?id=eq.${row.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ start_date: TRIP_DATES.start, end_date: TRIP_DATES.end }),
        });
      }
      return row.id;
    }
  }
  const made = await sb(env, 'trips', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      name: TRIP_NAME,
      destination: 'St Martin de Ribérac, Dordogne',
      start_date: TRIP_DATES.start,
      end_date: TRIP_DATES.end,
      access_token: env.SHARE_TOKEN,
    }),
  });
  if (!made.ok) return null;
  const rows = await made.json();
  return Array.isArray(rows) && rows.length ? rows[0].id : null;
}

async function signOne(env, name) {
  const res = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${name}.jpg`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: EXPIRES_IN }),
    },
  );
  if (!res.ok) return null;
  const body = await res.json();
  // Supabase has used both spellings across versions, and returns a path
  // relative to /storage/v1 rather than an absolute URL.
  const rel = body.signedURL || body.signedUrl;
  if (!rel) return null;
  return `${env.SUPABASE_URL}/storage/v1${rel.startsWith('/') ? '' : '/'}${rel}`;
}

/* ------------------------------------------------- shapes on the wire
   The database columns are deliberately more formal than the app's objects.
   Translating in one place keeps the client simple and lets the schema evolve
   without the phones caring. */

const personOut = r => ({
  id: r.id, name: r.name, icon: r.icon,
  from: r.arrives_on, to: r.departs_on,
  counts: r.counts_in_share !== false,
  // Empty string, never null — the app treats '' as "no household given", and a
  // literal null would render as the word "null" the moment anything joins it
  // to a string.
  household: r.household || '',
});

const personIn = (b, trip) => ({
  id: UUID.test(b.id || '') ? b.id : undefined,
  trip_id: trip,
  name: String(b.name || '').slice(0, 60),
  icon: String(b.icon || 'partridge').slice(0, 30),
  colour: null,
  counts_in_share: b.counts !== false,
  arrives_on: b.from || null,
  departs_on: b.to || null,
  // Optional family label — "Ritchie" — used only to group totals. Trimmed, so
  // "Ritchie " and "Ritchie" are the same family; NULL when empty, so an absent
  // household is absent in the database rather than an empty-string third state.
  // The second trim is for the case where the 40-char cap lands mid-space.
  household: String(b.household || '').trim().slice(0, 40).trim() || null,
});

const expenseOut = r => ({
  id: r.id, what: r.description, paidBy: r.paid_by_member_id,
  spentOn: r.spent_on, phase: r.phase, currency: r.currency,
  amountLocal: Number(r.amount_local), amountHome: Number(r.amount_home),
  fxRateUsed: r.fx_rate_used == null ? null : Number(r.fx_rate_used),
  beneficiaries: r.beneficiary_member_ids,
  createdAt: r.created_at ? Date.parse(r.created_at) : Date.now(),
});

const expenseIn = (b, trip) => ({
  id: UUID.test(b.id || '') ? b.id : undefined,
  trip_id: trip,
  description: String(b.what || '').slice(0, 120),
  spent_on: b.spentOn,
  phase: b.phase === 'pre_trip' ? 'pre_trip' : 'on_trip',
  paid_by_member_id: UUID.test(b.paidBy || '') ? b.paidBy : null,
  currency: String(b.currency || 'EUR').slice(0, 3),
  amount_local: Number(b.amountLocal),
  amount_home: Number(b.amountHome),
  fx_rate_used: b.fxRateUsed == null ? null : Number(b.fxRateUsed),
  beneficiaries_ok: undefined,
  beneficiary_member_ids: Array.isArray(b.beneficiaries) && b.beneficiaries.length
    ? b.beneficiaries.filter(x => UUID.test(x)) : null,
  client_id: b.id || null,
});

function badAmount(e) {
  return !isFinite(e.amount_local) || !isFinite(e.amount_home) ||
         Math.abs(e.amount_local) > 1e7 || !e.spent_on;
}

/* ---------------------------------------------------------------- main */

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);
    const json = { ...cors, 'Content-Type': 'application/json' };
    const reply = (body, status) => new Response(JSON.stringify(body), { status: status || 200, headers: json });

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/health' && request.method === 'GET') {
      // Reports whether the secrets are present, never what they are.
      return reply({
        ok: true,
        configured: {
          SUPABASE_URL: Boolean(env.SUPABASE_URL),
          SUPABASE_SERVICE_ROLE_KEY: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
          SHARE_TOKEN: Boolean(env.SHARE_TOKEN),
        },
      });
    }

    // Everything past here needs the token and full configuration.
    if (!env.SHARE_TOKEN || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return reply({ error: 'worker is not configured' }, 500);
    }
    if (!tokenMatches(url.searchParams.get('t') || '', env.SHARE_TOKEN)) {
      return reply({ error: 'bad token' }, 401);
    }

    /* ------------------------------------------------------- photographs */
    if (path === '/photos' && request.method === 'GET') {
      const signed = await Promise.all(PHOTOS.map(async name => [name, await signOne(env, name)]));
      const out = {};
      for (const [name, link] of signed) if (link) out[name] = link;
      if (!Object.keys(out).length) return reply({ error: 'no photographs could be signed' }, 502);
      return new Response(JSON.stringify(out), {
        // Private: this response contains signed URLs for one person's session.
        headers: { ...json, 'Cache-Control': 'private, max-age=600' },
      });
    }

    /* -------------------------------------------------------- shared data */
    const trip = await tripId(env);
    if (!trip) return reply({ error: 'could not reach the trip' }, 502);

    if (path === '/data' && request.method === 'GET') {
      const [pr, er] = await Promise.all([
        sb(env, `members?trip_id=eq.${trip}&select=*&order=created_at.asc`),
        sb(env, `expenses?trip_id=eq.${trip}&select=*&order=spent_on.desc`),
      ]);
      if (!pr.ok || !er.ok) return reply({ error: 'could not read the trip' }, 502);
      return reply({
        people: (await pr.json()).map(personOut),
        expenses: (await er.json()).map(expenseOut),
      });
    }

    if ((path === '/person' || path === '/expense') && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return reply({ error: 'bad body' }, 400); }
      if (!body || typeof body !== 'object') return reply({ error: 'bad body' }, 400);

      const isPerson = path === '/person';
      const row = isPerson ? personIn(body, trip) : expenseIn(body, trip);
      delete row.beneficiaries_ok;
      if (isPerson ? !row.name : badAmount(row)) return reply({ error: 'incomplete' }, 400);

      const res = await sb(env, `${isPerson ? 'members' : 'expenses'}?on_conflict=id`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(row),
      });
      if (!res.ok) return reply({ error: 'could not save', detail: await res.text() }, 502);
      const saved = await res.json();
      const one = Array.isArray(saved) ? saved[0] : saved;
      return reply(isPerson ? personOut(one) : expenseOut(one));
    }

    if ((path === '/person' || path === '/expense') && request.method === 'DELETE') {
      const id = url.searchParams.get('id') || '';
      if (!UUID.test(id)) return reply({ error: 'bad id' }, 400);
      const table = path === '/person' ? 'members' : 'expenses';
      const res = await sb(env, `${table}?id=eq.${id}&trip_id=eq.${trip}`, { method: 'DELETE' });
      if (!res.ok) return reply({ error: 'could not delete' }, 502);
      return reply({ ok: true });
    }

    return reply({ error: 'not found' }, 404);
  },
};
