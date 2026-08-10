/* =========================================================================
   rota.js — who cooks, and on which night.

   Pure, like money.js: no DOM, no storage, no fetch. Everything is a function
   of its arguments, which is what lets tests.html check it.

   The whole problem is fairness with a moving cast. People arrive and leave on
   different days, so "everyone cooks the same number of times" is the wrong
   target — it would have somebody who is there for three nights cooking as
   often as somebody there for fourteen. What is actually fair is that everyone
   cooks the same *share* of the nights they are present for.

   Nothing in here runs on its own. The rota is only rebuilt when somebody asks
   for it, because people add their dates over weeks and a rota that regenerated
   itself would never settle.
   ========================================================================= */

(function (global) {
  'use strict';

  const D = iso => new Date(iso + 'T12:00:00Z');       // noon, so DST can't shift a day
  const pad = v => String(v).padStart(2, '0');
  const iso = d => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());

  /**
   * The nights somebody cooks on: every day of the trip except the last.
   * People leave on the final morning, so a fortnight of 31 Jul – 14 Aug is
   * fourteen dinners, not fifteen — which matches the "14 nights" the landing
   * page has always shown.
   */
  function cookNights(start, end) {
    const out = [];
    const last = D(end);
    for (let d = D(start); d < last; d = new Date(d.getTime() + 86400000)) out.push(iso(d));
    return out;
  }

  /**
   * Is this person around for dinner on this day? Present from their arrival up
   * to but not including their departure day — you don't cook dinner on the
   * morning you drive home.
   */
  function isHere(person, day) {
    if (!person || !person.from || !person.to) return false;
    return person.from <= day && day < person.to;
  }

  /**
   * How many cooks for how many mouths. One cook per six diners, never fewer
   * than two (nobody should be alone in that kitchen) and never more than six
   * (past that they're in each other's way), and never more than are present.
   */
  function teamSizeFor(headcount, opts) {
    const o = opts || {};
    const per = o.perCook || 6;
    const min = o.minTeam || 2;
    const max = o.maxTeam || 6;
    if (headcount <= 0) return 0;
    return Math.min(headcount, Math.max(min, Math.min(max, Math.round(headcount / per))));
  }

  /* A stable pseudo-random number in 0..1 from a string. Deterministic, so the
     same seed always produces the same rota — which is what makes "scramble"
     mean something: a new seed, not a new roll of the dice every render. */
  function hash01(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 100000) / 100000;
  }

  /**
   * Build the whole fortnight's rota.
   *
   * @param people  [{ id, from, to }] — only these three fields are read
   * @param nights  ['2027-07-31', ...] from cookNights()
   * @param opts    { seed, pins, perCook, minTeam, maxTeam }
   *                pins: { '2027-08-03': ['id', ...] } — nights somebody has
   *                edited by hand. They are left exactly as they are and still
   *                count towards everyone's load, so hand-editing one night
   *                doesn't quietly make the rest unfair.
   * @returns [{ day, index, present, size, team, pinned }]
   */
  function buildRota(people, nights, opts) {
    const o = opts || {};
    const seed = String(o.seed == null ? 'la-perdrix' : o.seed);
    const pins = o.pins || {};
    const roster = (people || []).filter(p => p && p.id);
    const known = new Set(roster.map(p => p.id));

    /* The denominator of fairness: how many cook-nights each person is here
       for. Computed across the whole fortnight before anything is assigned. */
    const nightsHere = new Map(roster.map(p => [p.id, 0]));
    for (const day of nights) {
      for (const p of roster) if (isHere(p, day)) nightsHere.set(p.id, nightsHere.get(p.id) + 1);
    }

    /* Everyone's fair share of the cooking, in whole turns: their nights as a
       proportion of all the person-nights on the trip. Someone here four
       nights out of a hundred and twenty-nine person-nights owes roughly one
       turn; someone here the full fortnight owes three. */
    let totalSlots = 0;
    for (const day of nights) {
      totalSlots += teamSizeFor(roster.filter(p => isHere(p, day)).length, o);
    }
    let personNights = 0;
    for (const v of nightsHere.values()) personNights += v;
    const owed = new Map(roster.map(p =>
      [p.id, personNights ? nightsHere.get(p.id) * totalSlots / personNights : 0]));

    /* Nights each person has left, counting tonight. This is what stops a
       four-night guest slipping through never having cooked: comparing shares
       alone can't tell that somebody leaving on Wednesday has run out of
       chances, so their turn quietly never comes. Dividing what they still owe
       by the nights they have left makes their last evening urgent. */
    const nightsLeft = new Map(roster.map(p => [p.id, nightsHere.get(p.id)]));

    const cooked = new Map(roster.map(p => [p.id, 0]));
    const lastNight = new Map();

    return nights.map((day, i) => {
      const present = roster.filter(p => isHere(p, day));
      const size = teamSizeFor(present.length, o);
      const pinned = Array.isArray(pins[day]);

      let team;
      if (pinned) {
        // Somebody moved these by hand. Their word beats the algorithm's, but
        // drop anyone who has since been removed or changed their dates.
        team = pins[day].filter(id => known.has(id) && present.some(p => p.id === id));
      } else {
        const scored = present.map(p => {
          // Turns still owed, spread over the evenings they have left. Rises
          // sharply as somebody's stay runs out, so short visits get their turn
          // instead of being crowded out by people who have all fortnight.
          const urgency = (owed.get(p.id) - cooked.get(p.id)) / Math.max(1, nightsLeft.get(p.id));
          // Two nights running is the one thing everybody notices. Weighted to
          // dominate everything else, but not a hard ban — on a night with
          // barely anyone left it has to be possible.
          const backToBack = lastNight.get(p.id) === i - 1 ? 1000 : 0;
          return { p, k: backToBack - urgency * 10 + hash01(p.id + '|' + seed + '|' + i) };
        });
        scored.sort((a, b) => a.k - b.k || (a.p.id < b.p.id ? -1 : 1));
        team = scored.slice(0, size).map(s => s.p.id);
      }

      for (const id of team) {
        cooked.set(id, (cooked.get(id) || 0) + 1);
        lastNight.set(id, i);
      }
      // Tonight is spent, whether or not they cooked it.
      for (const p of present) nightsLeft.set(p.id, Math.max(0, nightsLeft.get(p.id) - 1));

      return { day, index: i, present: present.map(p => p.id), size, team, pinned };
    });
  }

  /**
   * Per-person load, for showing that the rota is actually fair rather than
   * asking people to take it on trust.
   * @returns [{ id, times, nights, share }] — share is times/nights, 0..1
   */
  function load(rota, people) {
    const times = new Map();
    const here = new Map();
    for (const p of (people || [])) { times.set(p.id, 0); here.set(p.id, 0); }
    for (const night of rota) {
      for (const id of night.present) if (here.has(id)) here.set(id, here.get(id) + 1);
      for (const id of night.team) if (times.has(id)) times.set(id, times.get(id) + 1);
    }
    return (people || []).map(p => {
      const n = here.get(p.id) || 0;
      const t = times.get(p.id) || 0;
      return { id: p.id, times: t, nights: n, share: n ? t / n : 0 };
    });
  }

  /** The night that is on today, or the next one still to come. */
  function nightFor(rota, todayISO) {
    return rota.find(n => n.day === todayISO) || rota.find(n => n.day > todayISO) || null;
  }

  global.Rota = { cookNights, isHere, teamSizeFor, hash01, buildRota, load, nightFor };
})(typeof window !== 'undefined' ? window : globalThis);
