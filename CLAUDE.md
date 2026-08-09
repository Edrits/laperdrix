# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## What this is

A private web app for a group holiday at **La Perdrix**, St Martin de Ribérac, Dordogne —
31 July – 14 August 2027, around 27 people across several households. Two halves:

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
| **App / landing** | Profiles, expenses, the kitty, and **all presentation** | `schema.sql`, `index.html`, `kitty.html`, `styles.css`, `photos.css`, `icons.js`, `money.js`, `sync.js`, `worker/` |

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

- **Local:** `python3 -m http.server 4173`, then <http://localhost:4173>. Must be served over HTTP,
  not opened as `file://` — `fetch` and the localStorage origin both depend on it. Port 4173
  specifically: it is in the Worker's `ALLOWED_ORIGINS`, so any other port fails CORS.
- **Host:** GitHub Pages.
- **API:** one Cloudflare Worker holding `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
  `ANTHROPIC_API_KEY` as secrets. The browser never talks to Supabase directly.
- **Data:** Supabase Postgres over its REST API, via plain `fetch` from the Worker. No client library.

**Worker deploys are manual** — Ed pastes `worker.js` into the Cloudflare dashboard, as with
`vocab-sync`. The repo copy is the source of truth, so **flag loudly if you change it** or the live
version silently drifts.

## How a number gets from a phone to the database

Four files, and you need all four in your head before changing any of them.

`index.html` / `kitty.html` → `sync.js` → `worker/worker.js` → Supabase REST.

**`sync.js` is local-first, and the order is load-bearing.** Every write goes to `localStorage`
first and the network second, because someone logging a shop in a supermarket car park must not
lose the number when the line drops. A failed request joins a queue and is retried on the next
write and on the `online` event.

- **`flush()` before `pull()`, always.** A pull overwrites the local cache with the server's copy,
  so pulling first would silently destroy writes that hadn't landed yet.
- The queue **collapses by `(kind, id)`** — re-editing the same expense replaces its queued job
  rather than stacking a fortnight of duplicates.
- **Ids are generated on the client and must be real UUIDs** (`Sync.newId()`). The database columns
  are `uuid` and reject anything else, so a made-up id fails at the far end, long after the user
  saw it save.
- **With no token, every function quietly no-ops** and the app runs device-only. That is deliberate,
  not a bug — it is how local development and a tokenless visitor both work.

**The Worker translates between two vocabularies, and this is the thing that catches you out.**
The database is formal snake_case; the app's objects are terse camelCase. `personIn`/`personOut`
and `expenseIn`/`expenseOut` in `worker.js` are the only place the two meet — `description ↔ what`,
`paid_by_member_id ↔ paidBy`, `arrives_on ↔ from`, `counts_in_share ↔ counts`. **Adding a field
means editing both directions**, or it round-trips to `undefined` and the loss is silent.

**The trip is found by name (`TRIP_NAME`), never by token.** Keying it on `SHARE_TOKEN` would mean
that changing the token — a reasonable thing to do if the link got forwarded too widely — created a
second empty trip and orphaned everyone's data. Rotating the token is therefore safe at any time.

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

People pick an **icon** as their profile. **Thirty-six of them**, in one inline SVG sprite in
`icons.js` — there are 27 people, and 18 would have forced strangers to share a partridge. Each icon
carries its own colour, so picking one is a single decision rather than two.

Drawn to one recipe: `24x24`, `fill="none"`, `stroke="currentColor"`, `stroke-width="1.7"`, round
caps and joins. Anything new must match, and must come from the same well — the garden, the kitchen,
the river, the evenings. Add the slug **and** its colour to `ICONS`, and the `<g id="i-slug">` to the
sprite; a mismatch renders an empty circle with no error.

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
- **`money.js` stays pure** — no DOM, no storage, no `fetch`. Every function is a function of its
  arguments, which is the only reason `tests.html` can check it. Put anything impure elsewhere.
- **`parseAmount` returns `null` for what it cannot read**, never `0`. Callers must treat `null` as
  "ask the human"; defaulting it to zero silently books a free lunch.
- **Bump the `?v=` on changed assets** — `styles.css?v=10`, `sync.js?v=1`. Pages caches hard, and
  phones that already have the app will otherwise keep the old file for days.
- **The kitty is led by its bar chart, and the splitting UI was taken out on purpose.** Ed:
  *"this tool should really just be a place where people can list what they spend… it's not to
  eventually split everything, it's just a good way to track who spent what so if large amounts
  need settling they can."* So the page is one scroll — total, filter, **who's spent what**, the
  entries — and the form is only **how much → who paid → what for → when**. There is no
  per-expense beneficiary picker and no share-basis setting any more. Old expenses that already
  carry `beneficiaries` still load and still render; nothing new can create them. Don't reintroduce
  either without Ed asking: each was removed because it was friction in a form that has to work
  one-handed in a supermarket.
- `Money.spendByPerson()` is what the chart draws from. Everyone with a profile gets a row,
  including people who have spent nothing — an empty track is a fact worth showing, and it stops
  the chart reading as a leaderboard. A negative total gets a zero-width bar rather than a negative
  one, or a refund would invert the whole ordering.
- `Money.levellingTransfers()` exists and computes who-could-pay-whom, but **it is a suggestion and
  must never be presented as a debt.** See Ed's framing at the top. It now lives in a closed
  `<details>` at the foot of `kitty.html`, still carrying the line saying nothing is owed —
  findable if someone goes looking, invisible otherwise.
- `split_basis` has a `per_household` value in the schema enum, but `summarise()` implements only
  `per_person` and `none`, and the app now always passes `per_person`. Picking `per_household`
  would silently behave as an even per-person split.
- **Amount fields must stay `type="text"` with `inputmode="decimal"`.** `type="number"` rejects
  `12,50` outright in some locales, which loses French receipts at the keyboard rather than in the
  parser. The phone keypad comes from `inputmode`, and the keyboard only *appears* if `focus()` is
  called synchronously inside the tap's own task — iOS ignores a deferred one.

## Testing and checking

No Node, so no Vitest.

- **Unit tests:** open `tests.html` over the local server. It asserts against `money.js` and shows a
  pass/fail summary; results are also on `window.__results` as `{pass, fail}`. There is no test
  runner and no way to run a single test — edit or comment out the block you don't want.
- **Deployment:** `./scripts/check.sh` checks the live Worker end to end — secrets present, data
  routes deployed (i.e. the pasted copy isn't stale), a wrong token refused with 401, the database
  reachable, all seven photographs signable. It reads the share token from `secrets.txt` or `.env`
  (both gitignored) so it never has to be typed into a shell history or a chat window.
- **`manifest.webmanifest` is generated**, not hand-edited — `python3 scripts/gen_manifest.py`.
  Percent-encoding a data URI inside JSON by hand is how you get an icon that never renders.
