/* =========================================================================
   rota.js — the cooking teams, and which team is up on which night.

   Pure, like money.js: no DOM, no storage, no fetch. Everything is a function
   of its arguments, which is what lets tests.html check it.

   The model is teams, not per-night draws. You make a handful of teams (blank
   to begin with, filled by hand or topped up at random), and they take turns:
   team one cooks the first night, team two the second, and so on, wrapping
   round and going again for the whole fortnight. "Fairness" is just the
   round-robin — every team cooks the same number of nights.

   The cast moves under the teams. People arrive and leave on different days, so
   on any given night some of a team may not be there yet or may have gone home.
   The rule is simple: the team still cooks, with whoever of it is present. Who
   is where is worked out per night; the team keeps its identity regardless.

   Nothing in here runs on its own. Teams change only when somebody edits them.
   ========================================================================= */

(function (global) {
  'use strict';

  const D = iso => new Date(iso + 'T12:00:00Z');       // noon, so DST can't shift a day
  const pad = v => String(v).padStart(2, '0');
  const iso = d => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());

  /**
   * The nights somebody cooks on: every day of the trip except the last.
   * People leave on the final morning, so a fortnight of 31 Jul – 14 Aug is
   * fourteen dinners, not fifteen.
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

  /* A stable pseudo-random number in 0..1 from a string. Deterministic, so a
     given seed always shuffles the same way — a "fill" can be re-run and land
     the same, rather than churning every render. */
  function hash01(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 100000) / 100000;
  }

  /* A deterministic Fisher–Yates shuffle, seeded, so the order is reproducible
     from the seed alone. Returns the same array (mutated) for convenience. */
  function shuffle(arr, seed) {
    const s = String(seed == null ? '' : seed);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(hash01(s + '|' + i + '|' + arr.length) * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /**
   * The whole fortnight, night by night, with the team that is up on each.
   *
   * @param teams   [{ id, name, members: [personId, ...] }] — order is the
   *                rotation order.
   * @param nights  ['2027-07-31', ...] from cookNights()
   * @param people  [{ id, from, to }] — used only to work out who is present
   * @param overrides  optional, sparse { '2027-08-07': {…} } — steer a single
   *                night without touching the rotation. Three shapes:
   *                  { off: true }        — eating out, nobody cooks
   *                  { members: [id, …] } — an ad-hoc lineup, not a team
   *                  { team: teamId }     — a specific team cooks instead
   *                A display-layer replacement only: the round-robin index stays
   *                date-positional, so an override never shifts a later night. A
   *                stale team id falls back to the round-robin team.
   * @returns [{ day, index, team, teamIndex, teamId, teamName,
   *             members, present, absent, here, override?, off? }]
   *          team is null when there are no teams yet, on an eating-out night, or
   *          on an ad-hoc-lineup night. members/present/absent are the cooks
   *          (present = there that night); here is everyone present that night,
   *          for the headcount. override is true on any steered night; off is
   *          true on an eating-out one.
   */
  function schedule(teams, nights, people, overrides) {
    const roster = (people || []).filter(p => p && p.id);
    const byId = new Map(roster.map(p => [p.id, p]));
    const list = (Array.isArray(teams) ? teams : []).filter(t => t && t.id);
    const ov = (overrides && typeof overrides === 'object') ? overrides : {};

    return (nights || []).map((day, i) => {
      const here = roster.filter(p => isHere(p, day)).map(p => p.id);
      const hereSet = new Set(here);
      const o = ov[day];

      // Eating out: nobody cooks. The round-robin index is deliberately NOT
      // bumped, so the team that would have been up this night is still up next
      // time round — an off night skips a turn, it doesn't hand it on.
      if (o && o.off) {
        return { day, index: i, team: null, teamIndex: -1, teamId: null, teamName: '',
                 off: true, override: true, members: [], present: [], absent: [], here };
      }

      // An ad-hoc lineup: whoever was named cooks, not a team. Filter to real
      // people, then split into present and away exactly as for a team.
      if (o && Array.isArray(o.members)) {
        const members = o.members.filter(id => byId.has(id));
        const present = members.filter(id => hereSet.has(id));
        const absent = members.filter(id => !hereSet.has(id));
        return { day, index: i, team: null, teamIndex: -1, teamId: null, teamName: '',
                 override: true, members, present, absent, here };
      }

      if (!list.length) {
        return { day, index: i, team: null, teamIndex: -1, teamId: null, teamName: '',
                 members: [], present: [], absent: [], here };
      }
      // The team up by position. teamIndex is date-positional and is never
      // shifted by an override.
      const teamIndex = i % list.length;
      let team = list[teamIndex];
      let override = false;

      // A named team cooks instead of the round-robin one. A stale id (the team
      // was deleted) falls back to the round-robin team, so a steer can never
      // blank a night.
      if (o && o.team) {
        const picked = list.find(t => t.id === o.team);
        if (picked) { team = picked; override = true; }
      }

      // Only members who are still real people (someone removed keeps no ghost).
      const members = (team.members || []).filter(id => byId.has(id));
      const present = members.filter(id => hereSet.has(id));
      const absent = members.filter(id => !hereSet.has(id));
      return { day, index: i, team, teamIndex, teamId: team.id, teamName: team.name || '',
               override, members, present, absent, here };
    });
  }

  /**
   * The night that is "now": today if it is a cook-night, otherwise the next one
   * still to come. Null once the fortnight is over. Feeds the "who's on tonight"
   * band on the landing page and the top of the rota page.
   */
  function nightFor(sched, todayISO) {
    if (!Array.isArray(sched) || !sched.length) return null;
    return sched.find(n => n.day >= todayISO) || null;
  }

  /**
   * Deal a set of people into n teams, in a shuffled order so the composition
   * varies, dealt round-robin so the sizes stay even. Deterministic from the
   * seed. Used by the "fill" button to top blank teams up at random.
   *
   * @returns [[id, ...], ...] — n arrays, one per team, in team order.
   */
  function deal(ids, n, seed) {
    const count = Math.max(1, n | 0);
    const order = shuffle((ids || []).slice(), seed);
    const out = Array.from({ length: count }, () => []);
    order.forEach((id, i) => out[i % count].push(id));
    return out;
  }

  /**
   * How many nights each person is actually rostered to cook, across the whole
   * fortnight — the present appearances on their team's turns. For the "who
   * cooks how often" panel. Everyone on a team gets a row, even zero.
   */
  function load(sched, teams) {
    const counts = new Map();
    for (const t of (teams || [])) for (const id of (t.members || [])) if (!counts.has(id)) counts.set(id, 0);
    for (const n of (sched || [])) for (const id of n.present) counts.set(id, (counts.get(id) || 0) + 1);
    return [...counts.entries()].map(([id, times]) => ({ id, times }));
  }

  global.Rota = { cookNights, isHere, hash01, shuffle, schedule, nightFor, deal, load };
})(window);
