# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## What this is

A private web app for a group holiday at **La Perdrix**, St Martin de Ribérac, Dordogne —
9–23 August, around 27 people across several households. Two halves:

1. **The landing page** — atmosphere first. A cinematic hero, the shape of the fortnight, and a
   presence chart showing who's there on which days. You go here to *enjoy the feeling of the
   holiday*, not to do admin.
2. **The kitty** — the spend tracker, deliberately **behind a click** off the landing page.

> Ed's framing, and it governs every design decision: *"a spending tracker so we can keep an eye on
> the balance, **not a direct accounting tool which helps settle**."* The app shows what people have
> put in. **It never tells anyone they owe anyone money.**

## ⚠️ Two agents are working on this

Work is split to avoid clobbering. Check which side you're on before editing.

| Side | Owns | Files |
|---|---|---|
| **Calendar** | Itinerary and attendance — data and logic | its own schema file, its own JS |
| **App / landing** | Profiles, expenses, the kitty, and **all presentation** | `schema.sql`, `index.html`, `styles.css`, `worker/` |

**The integration surface is two database views and nothing else:**

- `trip_days` — what's on, day by day. The landing page's "The days" band renders it.
- `member_presence(member_id, trip_id, arrives_on, departs_on)` — who's there when. The presence
  chart draws bars straight from it.

Keep that surface small. If the calendar side needs a richer attendance model, change what
`member_presence` selects from — the chart keeps working untouched.

**Do not edit the other side's schema file.** `schema.sql` deliberately does not define itinerary
tables; see the ownership note inside it.

## Stack — and why there's no build step

**Plain static HTML/CSS/vanilla JS. No framework, no bundler, no npm.**

There is **no Node, npm, Homebrew or version manager on this Mac**, and that is deliberate — the
same pattern as `../Personal vocab app`. Don't introduce a toolchain. A no-build app also has no
dependency tree to rot between holidays, which matters for something used once every few years.

- **Local:** `./start.command`, or `python3 -m http.server 4173`. Must be served over HTTP, not
  opened as `file://`.
- **Host:** GitHub Pages.
- **API:** one Cloudflare Worker holding `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
  `ANTHROPIC_API_KEY` as secrets. The browser never talks to Supabase directly.
- **Data:** Supabase Postgres over its REST API, via plain `fetch` from the Worker. No client library.

**Worker deploys are manual** — Ed pastes `worker.js` into the Cloudflare dashboard, as with
`vocab-sync`. The repo copy is the source of truth, so **flag loudly if you change it** or the live
version silently drifts.

## Security

- Secrets live **only** in the Cloudflare dashboard. The static files are public on GitHub Pages —
  anything in them is readable by anyone.
- **The share link is the password.** No accounts, no roles. Fine for a family group; it means the
  app should never hold anything genuinely sensitive.
- Receipt photos can carry card digits and names — private bucket, short-lived signed URLs only.

## Design

Palette and mood come from Ed's own photographs in `Photos for project/`, not from a brief:
terracotta `#b0552f` (the heads, roof tiles), limestone `#e9e4d7`, lichen `#7e8a6a`, cool film-shadow
`#5c7d7a`, lamp amber `#d99a3f`, dapple `#171b14`. Grain over everything.

**Dark mode is the lead design, not an inversion** — several of the reference photos are dim
interiors lit by one warm lamp, and that's the evening-on-the-terrace mood. Accent shifts from
terracotta in light to lamp amber in dark.

People pick a **rustic icon** as their profile — partridge, chicken, cheese, wine, dog, fig, walnut,
olive, bread, tomato, sunflower, straw hat, boules, swimming, hammock, steeple, snail, goat. One
inline SVG sprite. Each icon carries its owner's colour through the whole app.

**Every inline `<svg><use>` needs `viewBox="0 0 24 24"`** or it crops instead of scaling.

## Conventions

- **UK spelling** in all user-facing copy and comments (*colour*, *organise*, *travelled*).
- Money is `numeric(12,2)` in the database — never floats.
- **French receipts use comma decimals.** `12,50` is twelve-fifty, not 1250. Misparsing this
  multiplies an expense by 100 in a shared ledger; it has its own unit test.
- `amount_home` is computed and **stored at save time**, so later FX changes never rewrite history.
- Expenses carry a client-generated `client_id` for idempotency — the offline queue retries, and
  without it a successful-but-retried request duplicates the expense.
- Connectivity in rural Dordogne is poor. Expenses save **separately from** their photo, so a failed
  upload never loses the number.

## Testing

No Node, so no Vitest. `tests.html` runs assertions on `money.js` in the browser;
`scripts/check_receipts.py` (stdlib only) measures receipt-extraction accuracy against real fixtures.
