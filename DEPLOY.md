# Deploying La Perdrix

Three accounts, roughly twenty minutes. Everything here needs your logins, so
these are steps for you rather than for Claude.

**The shape of it:** the site is public on GitHub Pages, the photographs are not.
They sit in a private Supabase bucket, and a Cloudflare Worker hands out
short-lived links to anyone holding the share token.

---

## ⚠️ Before anything else: the key that matters

Supabase gives you two keys. They are not equivalent.

| Key | What it is | Where it may go |
|---|---|---|
| Project **URL** | `https://yumadmlyepizjxneunqe.supabase.co` | Anywhere. Not a secret. |
| **`anon`** key | Public client key | Anywhere, though we don't use it. |
| **`service_role`** key | **Bypasses every security rule. Reads or deletes anything.** | **Only** the Cloudflare Worker's secrets. |

The `service_role` key must never go into this repository, into `index.html`, or
into a chat window — including with Claude. The static files are world-readable
once Pages is on, so anything in them is public.

If it ever leaks: Supabase → Settings → API → **Reset** `service_role`, then set
the new value in Cloudflare.

---

## 1 · Supabase — the photographs

1. Open your project → **SQL Editor** → **New query**.
2. Paste the whole of `schema.sql`, run it. It creates the tables and two private
   buckets, `receipts` and `trip-photos`.
3. Go to **Storage** → `trip-photos`. Confirm it says **Private**.
4. Upload the seven files from `photos/`, keeping their names exactly:
   `group.jpg`, `lake.jpg`, `abbey.jpg`, `chair.jpg`, `mirror.jpg`, `heads.jpg`,
   `hens.jpg`. The Worker looks for those names.
5. **Settings → API.** You'll need the project URL and the `service_role` key in
   step 2. Copy them somewhere temporary; don't paste them into the repo.

---

## 2 · Cloudflare — the Worker

1. **Workers & Pages → Create → Worker.** Name it `laperdrix`. Deploy the
   default, then **Edit code**.
2. Delete what's there, paste the whole of `worker/worker.js`, **Deploy**.
3. **Settings → Variables and Secrets → Add**, three times.

   > **Set the Type to `Secret`, not `Text`.** The dialog offers both and Text is
   > easy to pick by accident. Text stores the value in the clear and shows it
   > back to you in the dashboard; Secret encrypts it and becomes write-only, so
   > afterwards it reads `Value encrypted` and can only be overwritten, never
   > read. Neither type is ever exposed to the browser — this is about who can
   > see it in your Cloudflare account, not about a public leak.
   >
   > If you already added one as Text: delete it, re-add it as Secret, and
   > rotate the Supabase key (Settings → API → Reset) since it has been sitting
   > in the clear. Reset in Supabase *first*, then put the new value in
   > Cloudflare, or the Worker briefly has a dead key.


   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | your project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` key |
   | `SHARE_TOKEN` | a long random string — see below |

   For the token, run this and use the output:

   ```bash
   python3 -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

4. Check it: open `https://laperdrix.<your-subdomain>.workers.dev/health`.
   It should report `ok:true` with all three secrets `true`. It never prints
   their values.

> **Deploys are manual and always will be.** `worker/worker.js` in this repo is
> the source of truth, but nothing pushes it — you paste it. If the file changes
> and you don't re-paste, the live Worker silently keeps the old behaviour.

---

## 3 · GitHub Pages — the site

1. Create a repository, e.g. `laperdrix`. **Public is fine** — the site contains
   no secrets, and the photographs are not in it (`.gitignore` excludes
   `photos/`).
2. Push:

   ```bash
   git remote add origin git@github.com:Edrits/laperdrix.git && git push -u origin main
   ```

3. **Settings → Pages →** deploy from `main`, folder `/ (root)`.
4. Before telling anyone the URL, set the Worker address. In `index.html` find:

   ```js
   const WORKER_URL = '';
   ```

   Put your Worker's address in it, then commit and push.

---

## 4 · The share link

The token is the password. Send people:

```
https://edrits.github.io/laperdrix/#t=YOUR_SHARE_TOKEN
```

Opening it stores the token on that device and strips it from the address bar.
From then on the plain URL works on that phone.

Anyone with this link can see everything and edit the dates. That is the
deliberate trade for having no accounts — but it means the app should never hold
anything genuinely sensitive.

---

## Checking it actually works

- `…/health` → `ok:true`, three secrets `true`.
- `…/photos` with no token → **401**. With a wrong token → **401**.
  If either returns photographs, stop and check `SHARE_TOKEN`.
- Open the site in a private window **without** the `#t=` fragment: it should
  load and work, showing soft blurred stand-ins instead of the photographs.
  That is correct behaviour, not a failure.
- Open it **with** the fragment: all seven photographs appear.
- Confirm nothing leaked:

  ```bash
  git grep -iE "service_role|eyJ[A-Za-z0-9_-]{20,}" -- . && echo "FOUND — do not push" || echo "clean"
  ```

---

## What is deliberately not done yet

- **Nothing is shared yet — this is the big one.** Dates and spending live in
  each phone's `localStorage`, not in the database. So everyone sees their own
  entries and nobody else's, and the kitty on your phone is not the kitty on
  Kate's. Deploying does **not** change this. Making it shared is the next real
  piece of work, and the tables `schema.sql` already creates are waiting for it.
- **No receipt photography.** Snapping a receipt and having the number read off
  it needs an `ANTHROPIC_API_KEY` added to the Worker. Not built yet.
- **No offline support.** No service worker, so a first visit on a bad line
  shows the stand-ins until it can reach the Worker. Deferred on purpose.

The kitty itself **is** built — `kitty.html`, reached from the button at the
bottom of the landing page. It needs no extra deployment step; it is just
another file in the repo and Pages will serve it.
