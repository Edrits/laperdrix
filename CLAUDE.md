# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A private web app for a group holiday at **La Perdrix**, St Martin de Ribérac, Dordogne —
31 July – 14 August 2027, around 27 people across several households. Three pages:

1. **`index.html` — the landing page.** Atmosphere first. A cinematic hero, the shape of the
   fortnight, a presence chart showing who's there on which days, and read-only bands for tonight's
   cooks and the kitty total. You go here to *enjoy the feeling of the holiday*, not to do admin.
2. **`kitty.html` — the spend tracker**, deliberately **behind a click** off the landing page.
3. **`rota.html` — the cooking rota** ("Aux fourneaux"), where teams are generated and hand-edited.

The landing page never *writes* rota or kitty state; it renders what those two pages stored. Kitty
and Rota are also reachable top-left from every page.

> Ed's framing, and it governs every design decision: *"a spending tracker so we can keep an eye on
> the balance, **not a direct accounting tool which helps settle**."* The app shows what people have
> put in. **It never tells anyone they owe anyone money.**

## Commands

No build, no lint, no package manager — there is nothing to install.

| Task | Command |
|---|---|
| Run the app | `python3 -m http.server 4173`, then <http://localhost:4173> |
| Unit tests | Open <http://localhost:4173/tests.html>. Pass/fail renders on the page and lands on `window.__results` as `{pass, fail}` |
| Run a *single* test | There is no runner and no filter. Comment out the blocks you don't want in `tests.html` |
| Check the live deployment | `./scripts/check.sh` |
| Regenerate blur placeholders | `python3 scripts/gen_placeholders.py` |
| Regenerate the manifest | `python3 scripts/gen_manifest.py` |

Port **4173** specifically — it is in the Worker's `ALLOWED_ORIGINS`, so any other port fails CORS.
Must be served over HTTP; opening `file://` breaks `fetch` and the localStorage origin.

## The deployed Worker: checking it isn't behind the repo

`worker/worker.js` is pasted into the Cloudflare dashboard by hand, so the repo copy can silently
run ahead of the live one. **As of 11 August 2026 it is not behind**: the `settings` column and the
`/settings` route are both live, so the cooking rota is genuinely shared rather than per-device.
The two manual steps that used to be outstanding — the `alter table` below and the paste — have
landed.

`./scripts/check.sh` does not cover the rota, so check that route by hand. Read-only, and the token
never reaches your shell history:

```bash
curl -s "https://laperdrix.neddritchie.workers.dev/data?t=$(tr -d ' \t\r\n' < secrets.txt)" | head -c 400
```

**The token goes in `?t=`, not an `Authorization` header** — see `tokenMatches` in `worker.js`. A
Bearer header returns `401 bad token`, which reads exactly like a wrong token and sends you looking
for the wrong problem.

A `settings` key in that response means both steps are done. If it is missing, or writing one
returns `502` wrapping `PGRST204`, run this in Supabase and then re-paste the Worker:

```sql
alter table trips add column if not exists settings jsonb not null default '{}'::jsonb;
notify pgrst, 'reload schema';
```

**Do not probe with `POST /settings`.** It is a *write*, and posting `{}` to see whether the route
exists replaces the whole settings bag — the rota's seed and every hand-pinned night with it. `GET
/data` answers the same question and changes nothing. This has already cost one live rota.

## ⚠️ Two agents are working on this

Work is split to avoid clobbering. Check which side you're on before editing.

| Side | Owns | Files |
|---|---|---|
| **Calendar** | Itinerary and attendance — data and logic | its own schema file, its own JS |
| **App / landing** | Profiles, expenses, the kitty, the rota, and **all presentation** | `schema.sql`, `index.html`, `kitty.html`, `rota.html`, `styles.css`, `photos.css`, `icons.js`, `money.js`, `photos.js`, `rota.js`, `sync.js`, `tests.html`, `scripts/`, `worker/` |

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
  `SHARE_TOKEN` as secrets. The browser never talks to Supabase directly. There is **no
  `ANTHROPIC_API_KEY`** — receipt photography with AI extraction was designed, costed and then
  declined by Ed (*"we don't need that feature, it's not worth it"*). Don't build it back.
- **Data:** Supabase Postgres over its REST API, via plain `fetch` from the Worker. No client library.

**Worker deploys are manual** — Ed pastes `worker.js` into the Cloudflare dashboard, as with
`vocab-sync`. The repo copy is the source of truth, so **flag loudly if you change it** or the live
version silently drifts.

## How a number gets from a phone to the database

Four files, and you need all four in your head before changing any of them.

`index.html` / `kitty.html` / `rota.html` → `sync.js` → `worker/worker.js` → Supabase REST.

`Sync` exposes three kinds of state: `people()`, `expenses()` and `settings()` (the generic JSON bag
on the trip row, currently holding the rota). All three follow the same local-first path.

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
- The trip photographs live in a **private** Supabase bucket and are served as short-lived signed
  URLs. `photos/` and `Photos for project /` are gitignored: the Pages repo is public and the group
  shot shows the family, children included. This has been got wrong once — a trailing space in the
  folder name defeated the ignore rule and the photographs were committed.
- CSS `background-image` cannot send an `Authorization` header, which is why photos are addressed
  through `--ph-*` custom properties that JS sets once the token is known, with inlined blur
  placeholders as the default value.

## Design

Palette and mood come from Ed's own photographs in `Photos for project/`, not from a brief:
terracotta `#b0552f` (the heads, roof tiles), limestone `#e9e4d7`, lichen `#7e8a6a`, cool film-shadow
`#5c7d7a`, lamp amber `#d99a3f`, dapple `#171b14`. Grain over everything.

**Dark mode is the lead design, not an inversion** — several of the reference photos are dim
interiors lit by one warm lamp, and that's the evening-on-the-terrace mood. Accent shifts from
terracotta in light to lamp amber in dark.

**Dark is the default, light is a choice, and there is no "Auto".** Ed asked for exactly that. The
phone's own light/dark setting is ignored: there is **no `prefers-color-scheme` rule in
`styles.css`** and putting one back would quietly hand the decision to the OS again. Instead every
page sets `data-theme` on `<html>` from a **tiny inline script in the `<head>`** — it has to run
before the first paint, or a light frame flashes first, which is worst in the dim room the design
is for. It reads `laperdrix.theme` and treats **anything that isn't `'light'` as dark**, so phones
carrying the old `'auto'` migrate silently on the next visit. Three consequences:

- The theme switcher is two buttons, **Dark then Light**, on all three pages.
- `<meta name="theme-color">` is a **single tag with `id="tc"`**, updated in JS. The old pair of
  media-scoped tags followed the OS, so the address bar could go light over a dark page.
- The manifest's `background_color` and `theme_color` are both `#171b14`, so the home-screen launch
  splash doesn't flash limestone. Regenerate it, don't hand-edit: `python3 scripts/gen_manifest.py`.

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
- **No em dashes in user-facing copy.** Ed asked for them out. A full stop, a comma or a colon
  always does the job: *"…built from everybody's dates. Nothing happens until you ask"*, not
  *"…dates — nothing happens"*. This covers page copy, button and sheet text, strings built in JS,
  `aria-label`s and the `<meta name="description">`. **Two exceptions:** the em dash used as a
  *placeholder* for a figure that hasn't loaded (the countdown, the three kitty stats on the
  landing page, `formatMoney()`'s fallback for a non-number) — that's a glyph standing in for a number, and blanking
  it makes the band look broken for the half-second before data arrives; and **code comments**,
  including this file, which nobody using the app ever sees.
- Money is `numeric(12,2)` in the database — never floats.
- **French receipts use comma decimals.** `12,50` is twelve-fifty, not 1250. Misparsing this
  multiplies an expense by 100 in a shared ledger; it has its own unit test.
- `amount_home` is computed and **stored at save time**, so later FX changes never rewrite history.
- Expenses carry a client-generated `client_id` for idempotency — the offline queue retries, and
  without it a successful-but-retried request duplicates the expense.
- Connectivity in rural Dordogne is poor. Expenses save **separately from** their photo, so a failed
  upload never loses the number.
- **`money.js` and `rota.js` stay pure** — no DOM, no storage, no `fetch`. Every function is a
  function of its arguments, which is the only reason `tests.html` can check them. Put anything
  impure elsewhere. Both are where the real bugs live, so new logic belongs in them rather than
  inline in a page.
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
- **Families are a label on the person, not a table.** `members.household` is plain text; the
  `households` table and `members.household_id` are from an earlier design and are dead. Matching
  folds on case and trims, so "Ritchie" and "ritchie " are one family — two people typing the same
  name and agreeing beats two phones racing to create a row with no signal. Both `index.html` and
  `kitty.html` gather the chips from the current people list, first spelling wins.
- **Grouping by family never changes the denominator.** `summariseHouseholds()` sums shares that are
  still computed per head, so a family of five carries five shares. Ed asked for families to group
  "the owing", not to become the unit of it — one-share-per-household would mean a couple with three
  children paid the same as a lone adult, which is the unfairness the person-as-atom model exists to
  avoid. `split_basis = 'per_household'` in the schema means the wrong thing; don't wire it up.
- **Any new field on a person has to be added in four places**, and three of them fail silently:
  `personIn` *and* `personOut` in `worker.js`, the mapper in `kitty.html`'s `loadPeople()`, and the
  mapper in `index.html`. The landing page one is the nastiest — it rebuilds the record on save, so
  a field it drops is erased the next time anyone edits their dates.
- **Clearing the spending deletes through `Sync.removeExpense`, one id at a time**, off a snapshot of
  the ids rather than the live array. Clearing only `localStorage` would look like it worked and then
  have the next `pull()` put everything back. The confirm names the real count and total — a dialog
  that only says "are you sure?" is a speed bump, not a decision.
- **"Start again" only appears under the "Whole trip" filter.** It clears every phase whatever is
  selected, so under "Out there" it was a button that empties the whole kitty sitting at the foot of
  a screen showing part of it, with a confirm whose count didn't match what you could see. The one
  view it shows on is now the one showing everything it will take.
- **The cooking rota only rebuilds when somebody presses the button.** Ed:
  *"Only do it once asked (not as we go as people will slowly add dates in and then we'll have to
  keep adding people if it does it too soon)."* Nothing on any page calls `Rota.buildRota()` to
  *create* state — the stored state is only `{seed, pins, perCook}`, and the teams are derived from
  it on every render. A new arrival changes the presence counts immediately but never silently
  reshuffles tonight's team.
- **Fairness is a share of your own nights, and it is urgency-weighted.** `rota.js` scores people by
  turns still owed divided by nights they have left. The obvious version — rank by the share you've
  cooked so far — shipped first and was wrong: a four-night guest cooked **zero** times while
  everyone else cooked three, because nothing knew their stay was running out. There is a test
  across 25 seeds pinning this. Don't "simplify" it back.
- **A hand-edited night is pinned and survives a scramble.** Any drag, add or remove writes that
  night into `pins`, and `buildRota` leaves pinned nights alone while still counting them towards
  everyone's load. Pins that name somebody who has since changed their dates are dropped — rostering
  an absent person is worse than an uneven rota.
- **`settings` on the trip row is the generic bag for shared app state**, holding the rota. Put the
  next small shared setting in the JSON rather than adding another column: every new column costs a
  migration *and* a manual Worker paste, and they have to land in the right order.
- **Two classes are already taken and will bite you**: `.chart` (the landing page's presence chart)
  and `.ghost` (`.btn.ghost`, the secondary button). The rota's drag follower had to be renamed
  `.drag-chip` after `.ghost` made every secondary button on the page `position:fixed`. All three
  pages share one stylesheet — grep before naming.
- **`index.html`'s `DOWL` is Monday-first and its `iso()` is UTC.** Index it through `dowIdx()`, and
  never use `iso(new Date())` for "today" — between midnight and 1am BST it returns yesterday, which
  is exactly when a "who's cooking tonight" band is being looked at.
- **Amount fields must stay `type="text"` with `inputmode="decimal"`.** `type="number"` rejects
  `12,50` outright in some locales, which loses French receipts at the keyboard rather than in the
  parser. The phone keypad comes from `inputmode`, and the keyboard only *appears* if `focus()` is
  called synchronously inside the tap's own task — iOS ignores a deferred one.
- **Dates can be typed as well as tapped, and the two must stay in step.** The dates sheet has
  Arrive/Leave `<input type="date">` bounded by `TRIP.start`/`TRIP.end`. Tapping the calendar fills
  them; setting them highlights the calendar. Reversed entries are swapped and out-of-range ones
  clamped, never refused — a field that silently ignores you reads as broken. They listen on
  **`change`, not `input`**: typing a year on a desktop fires `input` at `0002`, which would swap
  the two dates under the person's hands mid-keystroke.
- **The dates sheet is capped at `58svh`, and that cap hangs off `.dates-sheet`, not `#sheet`.**
  It is the one sheet used *while looking at what is behind it*, and at the shared 92svh it covered
  the calendar it was asking you to tap. `kitty.html`'s add-spend sheet **has the same id** and
  needs the taller default, so scoping the cap by id breaks the kitty instead.
- **`clearOfSheet()` scrolls the calendar both ways.** It used to scroll only down, when the grid
  fell behind the sheet; opening the sheet from the button at the foot of the page left the calendar
  off the *top* of the screen with nothing to bring it back, so people got "tap the day you arrive"
  over a photograph.

## Testing and checking

No Node, so no Vitest.

- **Unit tests:** open `tests.html` over the local server. It asserts against the two pure modules,
  `money.js` and `rota.js`, and shows a pass/fail summary; results are also on `window.__results` as
  `{pass, fail}`. There is no test runner and no way to run a single test — edit or comment out the
  block you don't want. **Screenshots, not `getComputedStyle`, are the trustworthy check for
  anything visual** — the preview pane has returned confidently wrong computed values, and a
  JS-driven `.click()` succeeds happily on a button the user cannot see. One shipped that way.
- **Deployment:** `./scripts/check.sh` checks the live Worker end to end — secrets present, data
  routes deployed (i.e. the pasted copy isn't stale), a wrong token refused with 401, the database
  reachable, all nine photographs signable. It reads the share token from `secrets.txt` or `.env`
  (both gitignored) so it never has to be typed into a shell history or a chat window.
- **After adding a column in Supabase, reload the schema cache** — PostgREST keeps its own copy and
  a new column stays invisible to the API until it does:
  ```sql
  notify pgrst, 'reload schema';
  ```
  The symptom is a `502` from the Worker wrapping `PGRST204: Could not find the 'x' column of 'y' in
  the schema cache`. Read that carefully: *"in the schema cache"* means the SQL **did** run and the
  API hasn't noticed. It is not the same error as the column being absent, and chasing it as a failed
  migration wastes an evening. Worse, because `personIn` sends every field unconditionally, one
  unknown column fails **every** person write, not just writes that set it — so the blast radius is
  much bigger than the feature being added.
- **Adding a photograph touches six places, and the bucket is the one that bites.** Put the file in
  `photos/` (gitignored — the Pages repo is public), then add its name to `NAMES` in
  `scripts/gen_placeholders.py` and re-run it, to `PHOTOS` in `worker.js`, to the `Photos.load([…])`
  call in each page that shows it (the loader itself is shared — `photos.js`; each page passes only
  the names it uses, so it isn't signing nine URLs to show one), and to the count in
  `scripts/check.sh`. Then **upload it to the
  `trip-photos` bucket in Supabase under exactly that filename** — locally the page finds the file
  next to itself and everything looks right, so a missing upload only shows up as a blur on the live
  site. `check.sh` is what catches it.
- **`manifest.webmanifest` is generated**, not hand-edited — `python3 scripts/gen_manifest.py`.
  Percent-encoding a data URI inside JSON by hand is how you get an icon that never renders.
