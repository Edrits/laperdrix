/* =========================================================================
   money.js — the arithmetic behind the kitty.

   Deliberately pure: no DOM, no storage, no fetch. Everything here is a
   function of its arguments, which is what makes tests.html able to check it.

   This file exists because the money maths is where the real bugs are. In
   particular parseAmount, because French receipts write twelve euros fifty as
   "12,50" and reading that as 1250 would multiply an expense by a hundred in a
   ledger the whole group can see.
   ========================================================================= */

(function (global) {
  'use strict';

  /* ------------------------------------------------------------ amounts */

  // Money is held as a number of pence/cents internally wherever we round, so
  // that 0.1 + 0.2 never shows up in a total.
  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  /**
   * Parse an amount typed by a human, in either English or French convention.
   *
   *   "12,50"     → 12.5     (French: twelve euros fifty)
   *   "12.50"     → 12.5
   *   "1 234,56"  → 1234.56  (French thousands are spaces, often non-breaking)
   *   "1.234,56"  → 1234.56
   *   "1,234.56"  → 1234.56
   *   "1,234"     → 1234     (three trailing digits: thousands, not millipence)
   *   "€12,50"    → 12.5
   *
   * Returns null for anything it cannot read, rather than guessing. Callers
   * must treat null as "ask the human", never as zero.
   */
  function parseAmount(input) {
    if (typeof input === 'number') return isFinite(input) ? round2(input) : null;
    if (typeof input !== 'string') return null;

    // Strip currency symbols, letters, and every flavour of space including
    // the non-breaking and narrow ones French receipts and keyboards produce.
    let s = input.replace(/[\s   ]/g, '')
                 .replace(/[€£$]/g, '')
                 .replace(/[A-Za-z]/g, '')
                 .trim();
    if (!s) return null;

    let negative = false;
    if (s.startsWith('-')) { negative = true; s = s.slice(1); }
    if (!/^[0-9.,]+$/.test(s)) return null;

    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    let decimalAt = -1;

    if (lastDot >= 0 && lastComma >= 0) {
      // Both present: whichever comes last is the decimal separator.
      decimalAt = Math.max(lastDot, lastComma);
    } else if (lastDot >= 0 || lastComma >= 0) {
      const at = Math.max(lastDot, lastComma);
      const after = s.length - at - 1;
      // Exactly three digits after a single separator is a thousands grouping
      // ("1,234" / "1.234"). Money is not written to three decimal places.
      decimalAt = (after === 3) ? -1 : at;
    }

    let whole, frac;
    if (decimalAt === -1) {
      whole = s.replace(/[.,]/g, '');
      frac = '';
    } else {
      whole = s.slice(0, decimalAt).replace(/[.,]/g, '');
      frac = s.slice(decimalAt + 1).replace(/[.,]/g, '');
    }
    if (whole === '' && frac === '') return null;
    if (frac.length > 2) return null;            // not a money amount

    const value = Number((whole || '0') + '.' + (frac || '0'));
    if (!isFinite(value)) return null;
    return round2(negative ? -value : value);
  }

  /**
   * Convert a local-currency amount into the home currency.
   * rate is "units of home per 1 unit of local" — EUR→GBP is about 0.85.
   */
  function toHome(amountLocal, rate) {
    if (typeof amountLocal !== 'number' || !isFinite(amountLocal)) return null;
    if (typeof rate !== 'number' || !isFinite(rate) || rate <= 0) return null;
    return round2(amountLocal * rate);
  }

  function toLocal(amountHome, rate) {
    if (typeof amountHome !== 'number' || !isFinite(amountHome)) return null;
    if (typeof rate !== 'number' || !isFinite(rate) || rate <= 0) return null;
    return round2(amountHome / rate);
  }

  const SYMBOLS = { EUR: '€', GBP: '£', USD: '$' };

  function formatMoney(amount, currency) {
    if (typeof amount !== 'number' || !isFinite(amount)) return '—';
    const sym = SYMBOLS[currency] || '';
    const neg = amount < 0;
    const n = Math.abs(amount).toFixed(2)
      .replace(/\B(?=(\d{3})+(?!\d))/g, ',');   // thousands separators
    return (neg ? '−' : '') + sym + n;
  }

  /* ------------------------------------------------------------- shares */

  /**
   * Who a given expense was for. null/empty beneficiaries means everybody.
   * Only people with counts=true are ever charged a share.
   */
  function beneficiariesOf(expense, people) {
    const counting = people.filter(p => p.counts !== false);
    if (!expense.beneficiaries || expense.beneficiaries.length === 0) return counting;
    const set = new Set(expense.beneficiaries);
    const picked = counting.filter(p => set.has(p.id));
    // If the named people have since been removed, fall back to everyone
    // rather than silently charging the cost to nobody.
    return picked.length ? picked : counting;
  }

  /**
   * What each person has put in, and — if the trip is computing shares at all —
   * what an even split would have been.
   *
   * basis: 'per_person' | 'none'
   *   'none' deliberately computes no shares. It is a real supported mode, for
   *   a group that wants to see the spending without being audited.
   *
   * Returns [{ id, paid, share, balance }], balance = paid − share.
   * A positive balance means that person has put in more than their share.
   */
  function summarise(people, expenses, basis) {
    const paid = new Map(people.map(p => [p.id, 0]));
    const share = new Map(people.map(p => [p.id, 0]));

    for (const e of expenses) {
      const amount = typeof e.amountHome === 'number' ? e.amountHome : 0;
      if (paid.has(e.paidBy)) paid.set(e.paidBy, paid.get(e.paidBy) + amount);

      if (basis === 'none') continue;
      const who = beneficiariesOf(e, people);
      if (!who.length) continue;
      const each = amount / who.length;
      for (const p of who) share.set(p.id, share.get(p.id) + each);
    }

    return people.map(p => {
      const paidTotal = round2(paid.get(p.id) || 0);
      const shareTotal = basis === 'none' ? 0 : round2(share.get(p.id) || 0);
      return {
        id: p.id,
        paid: paidTotal,
        share: shareTotal,
        balance: basis === 'none' ? 0 : round2(paidTotal - shareTotal),
      };
    });
  }

  /**
   * Suggested transfers to level everyone up, using the fewest payments.
   * Greedy: repeatedly settle the largest debtor against the largest creditor.
   *
   * This is only ever a suggestion. The app must not present it as a debt —
   * see the copy in kitty.html.
   */
  function levellingTransfers(summary, epsilon) {
    const eps = typeof epsilon === 'number' ? epsilon : 0.01;
    const owed = summary.filter(s => s.balance < -eps)
      .map(s => ({ id: s.id, amount: -s.balance }))
      .sort((a, b) => b.amount - a.amount);
    const due = summary.filter(s => s.balance > eps)
      .map(s => ({ id: s.id, amount: s.balance }))
      .sort((a, b) => b.amount - a.amount);

    const out = [];
    let i = 0, j = 0;
    let guard = 0;
    while (i < owed.length && j < due.length && guard++ < 10000) {
      const amount = round2(Math.min(owed[i].amount, due[j].amount));
      if (amount > eps) out.push({ from: owed[i].id, to: due[j].id, amount });
      owed[i].amount = round2(owed[i].amount - amount);
      due[j].amount = round2(due[j].amount - amount);
      if (owed[i].amount <= eps) i++;
      if (due[j].amount <= eps) j++;
    }
    return out;
  }

  /**
   * What each person has spent, biggest first. This is the whole point of the
   * kitty now: not who owes what, just who has put in what.
   *
   * people   — [{ id, ... }]; only `id` is read, and everybody gets a row, so
   *            the chart shows the whole group rather than only the payers.
   * expenses — [{ paidBy, amountLocal, amountHome }]. An expense whose paidBy
   *            matches nobody is ignored: a person can be removed on the
   *            landing page while their expenses remain, and a phantom row for
   *            somebody no longer on the trip would be worse than nothing.
   *
   * Returns [{ id, paidLocal, paidHome, count, fraction }] sorted by paidHome
   * descending, then count descending, then id — a total order, so two people
   * who are level do not swap places between renders.
   *
   * `fraction` is paidHome as a proportion of the largest paidHome, 0..1, and
   * is what the bars set their widths from. When nobody has spent anything it
   * is 0 for everyone rather than a division by zero.
   *
   * `count` is how many expenses that person logged, whatever their amounts
   * turned out to read as.
   */
  function spendByPerson(people, expenses) {
    const amountOf = v => (typeof v === 'number' && isFinite(v) ? v : 0);

    const local = new Map();
    const home = new Map();
    const count = new Map();
    for (const p of people) {
      local.set(p.id, 0);
      home.set(p.id, 0);
      count.set(p.id, 0);
    }

    for (const e of expenses || []) {
      if (!count.has(e.paidBy)) continue;
      local.set(e.paidBy, local.get(e.paidBy) + amountOf(e.amountLocal));
      home.set(e.paidBy, home.get(e.paidBy) + amountOf(e.amountHome));
      count.set(e.paidBy, count.get(e.paidBy) + 1);
    }

    const rows = people.map(p => ({
      id: p.id,
      paidLocal: round2(local.get(p.id) || 0),
      paidHome: round2(home.get(p.id) || 0),
      count: count.get(p.id) || 0,
      fraction: 0,
    }));

    // Refunds can make a total negative; only a positive top gives a scale.
    let top = 0;
    for (const r of rows) if (r.paidHome > top) top = r.paidHome;
    if (top > 0) for (const r of rows) r.fraction = r.paidHome / top;

    rows.sort((a, b) =>
      (b.paidHome - a.paidHome) ||
      (b.count - a.count) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    return rows;
  }

  /* --------------------------------------------------------- households */

  /*
     Families. A person record may carry an optional `household` string — a
     family name like "Ritchie". Matching is on the trimmed name, compared
     case-insensitively, so "ritchie" and " Ritchie " are one family; the label
     shown is the first spelling encountered. An empty, whitespace-only or
     missing household means the person is not in one.

     Somebody with no household stands alone as their own group of one. That is
     what keeps every caller on a single code path: a chart or a summary never
     has to ask whether a row is a family or a person.
  */

  // The household a person belongs to, trimmed. '' means they are not in one.
  function householdNameOf(person) {
    const h = person && person.household;
    return typeof h === 'string' ? h.trim() : '';
  }

  /**
   * The households present in a people list, in a stable order — first
   * appearance in `people`, so the groups do not reshuffle between renders.
   *
   * Returns [{ key, label, ids }]:
   *   key   — 'hh:<lowercased trimmed household>', or 'me:<person id>' for
   *           somebody who is not in a family
   *   label — the household name as first spelled, or the person's name
   *   ids   — the member ids in that group, in people order
   */
  function householdsOf(people) {
    const byKey = new Map();
    for (const p of people || []) {
      if (!p) continue;
      const name = householdNameOf(p);
      // Prefixed, so a household called "a" can never collide with a person
      // whose id is "a".
      const key = name ? 'hh:' + name.toLowerCase() : 'me:' + p.id;
      let g = byKey.get(key);
      if (!g) {
        g = { key: key, label: name || p.name || String(p.id), ids: [] };
        byKey.set(key, g);
      }
      g.ids.push(p.id);
    }
    return Array.from(byKey.values());
  }

  /**
   * spendByPerson, folded onto households. The field names are deliberately
   * identical so the chart can render either from one code path.
   *
   * Returns [{ key, label, ids, paidLocal, paidHome, count, fraction }] sorted
   * biggest paidHome first, then count descending, then key — the same total
   * order discipline as spendByPerson, so groups level on money do not swap
   * places between renders.
   *
   * Totals are summed from the raw expenses and rounded once at the group, not
   * summed from already-rounded per-person figures, so a family's bar is the
   * true total rather than the accumulated rounding of its members.
   */
  function spendByHousehold(people, expenses) {
    const amountOf = v => (typeof v === 'number' && isFinite(v) ? v : 0);

    const groups = householdsOf(people);
    const keyOfMember = new Map();
    for (const g of groups) for (const id of g.ids) keyOfMember.set(id, g.key);

    const local = new Map();
    const home = new Map();
    const count = new Map();
    for (const g of groups) {
      local.set(g.key, 0);
      home.set(g.key, 0);
      count.set(g.key, 0);
    }

    for (const e of expenses || []) {
      // A payer who is no longer on the trip belongs to no group and is
      // ignored, exactly as in spendByPerson.
      if (!keyOfMember.has(e.paidBy)) continue;
      const key = keyOfMember.get(e.paidBy);
      local.set(key, local.get(key) + amountOf(e.amountLocal));
      home.set(key, home.get(key) + amountOf(e.amountHome));
      count.set(key, count.get(key) + 1);
    }

    const rows = groups.map(g => ({
      key: g.key,
      label: g.label,
      ids: g.ids.slice(),
      paidLocal: round2(local.get(g.key) || 0),
      paidHome: round2(home.get(g.key) || 0),
      count: count.get(g.key) || 0,
      fraction: 0,
    }));

    // Refunds can make a total negative; only a positive top gives a scale.
    let top = 0;
    for (const r of rows) if (r.paidHome > top) top = r.paidHome;
    if (top > 0) for (const r of rows) r.fraction = r.paidHome / top;

    rows.sort((a, b) =>
      (b.paidHome - a.paidHome) ||
      (b.count - a.count) ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

    return rows;
  }

  /**
   * summarise(), folded onto households.
   *
   * IMPORTANT — shares stay PER PERSON. A family of five carries five shares,
   * not one. Households only aggregate what has already been computed per
   * head; they never change the denominator. Treating a household as a single
   * share would mean a couple with three children paid the same as a lone
   * adult, which is the exact unfairness the person-as-atom model avoids.
   * People with counts === false still contribute no share, as in summarise().
   *
   * basis is optional and defaults to 'per_person'; 'none' is passed straight
   * through, so a trip computing no shares folds to no shares.
   *
   * Returns [{ id, paid, share, balance }] where `id` is the GROUP KEY, so
   * levellingTransfers() consumes the result unchanged and suggests
   * family-to-family transfers instead of person-to-person. It remains a
   * suggestion and must never be presented as a debt.
   */
  function summariseHouseholds(people, expenses, basis) {
    const how = basis || 'per_person';
    const rows = summarise(people || [], expenses || [], how);
    const byId = new Map(rows.map(r => [r.id, r]));

    return householdsOf(people).map(g => {
      let paid = 0, share = 0;
      for (const id of g.ids) {
        const r = byId.get(id);
        if (!r) continue;
        paid += r.paid;
        share += r.share;
      }
      paid = round2(paid);
      share = round2(share);
      return {
        id: g.key,
        paid: paid,
        share: share,
        balance: how === 'none' ? 0 : round2(paid - share),
      };
    });
  }

  /* ------------------------------------------------------------- totals */

  function total(expenses, field) {
    const key = field || 'amountHome';
    return round2(expenses.reduce((sum, e) => {
      const v = e[key];
      return sum + (typeof v === 'number' && isFinite(v) ? v : 0);
    }, 0));
  }

  global.Money = {
    round2, parseAmount, toHome, toLocal, formatMoney,
    beneficiariesOf, summarise, levellingTransfers, spendByPerson, total,
    householdsOf, spendByHousehold, summariseHouseholds,
  };
})(typeof window !== 'undefined' ? window : globalThis);
