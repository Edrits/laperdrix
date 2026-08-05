// Cloudflare Worker for La Perdrix.
//
// ⚠️  DEPLOYS ARE MANUAL. This file is the source of truth, but it reaches
//     Cloudflare by being pasted into the dashboard. If you change it, say so
//     loudly — otherwise the live version silently drifts from the repo.
//
// Right now it does one job: hand out short-lived signed URLs for the
// photographs, which live in a PRIVATE Supabase Storage bucket. The site itself
// is public on GitHub Pages; the photographs are not, because they show the
// family including children.
//
// Routes
//   GET /health          → {ok:true}. No token. For checking the deploy works.
//   GET /photos?t=TOKEN  → {name: signedUrl, …} for all photographs at once.
//
// Why one batch route rather than /photo/:name seven times: connectivity at the
// villa is poor, and seven round trips on a bad line is seven chances to stall.
// One request gets the whole set.
//
// Secrets to set in the dashboard (Settings → Variables → Add secret):
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

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);
    const json = { ...cors, 'Content-Type': 'application/json' };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers: json });
    }

    const url = new URL(request.url);

    if (url.pathname === '/health') {
      // Reports whether the secrets are present, never what they are.
      return new Response(JSON.stringify({
        ok: true,
        configured: {
          SUPABASE_URL: Boolean(env.SUPABASE_URL),
          SUPABASE_SERVICE_ROLE_KEY: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
          SHARE_TOKEN: Boolean(env.SHARE_TOKEN),
        },
      }), { headers: json });
    }

    if (url.pathname === '/photos') {
      if (!env.SHARE_TOKEN || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
        return new Response(JSON.stringify({ error: 'worker is not configured' }), { status: 500, headers: json });
      }
      if (!tokenMatches(url.searchParams.get('t') || '', env.SHARE_TOKEN)) {
        return new Response(JSON.stringify({ error: 'bad token' }), { status: 401, headers: json });
      }

      const signed = await Promise.all(PHOTOS.map(async name => [name, await signOne(env, name)]));
      const out = {};
      for (const [name, link] of signed) if (link) out[name] = link;

      if (Object.keys(out).length === 0) {
        return new Response(JSON.stringify({ error: 'no photographs could be signed' }), { status: 502, headers: json });
      }
      return new Response(JSON.stringify(out), {
        // Private: this response contains signed URLs for one person's session.
        headers: { ...json, 'Cache-Control': 'private, max-age=600' },
      });
    }

    return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: json });
  },
};
