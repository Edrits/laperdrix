/* dates.js — the calendar and the dates sheet, shared by index.html and
   calendar.html.

   Both pages show the same calendar and edit people through the same sheet,
   and the save path rebuilds a person from `people` (see load()). Two copies of
   that would be two places to forget a new field, and a field forgotten there
   is erased the next time anyone edits their dates. So it lives here, once.

   A classic script, not a module, on purpose: everything below is a top-level
   binding the page's own inline script reads (people, focus, DAYS, iso, $…),
   and each page defines its own render(), which the handlers here call. Load
   it after icons.js, sync.js and focus.js, and before the page's script.

   The sheet markup is injected rather than written into each page, for the
   same reason the code is shared: it is the form a person is rebuilt from. */
document.body.insertAdjacentHTML('beforeend', `

<!-- .dates-sheet, not #sheet, is what the height cap hangs off: kitty.html's
     add-spend sheet uses the same id, and it needs the taller default. -->
<div class="sheet dates-sheet" id="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
  <div class="in2">
    <h2 id="sheetTitle">Your dates</h2>
    <p class="hint" id="hint"></p>
    <!-- Typing beats tapping here. The sheet covers the bottom of the screen,
         so the calendar behind it is a small target held one-handed, and the
         two are wired together both ways: tap the grid and these fill in, set
         these and the grid highlights. min/max are the trip itself, so the
         native picker cannot offer a day the rest of the page can't show. -->
    <div class="dates">
      <div><label for="dFrom">Arrive</label><input id="dFrom" type="date"></div>
      <div><label for="dTo">Leave</label><input id="dTo" type="date"></div>
    </div>
    <label for="name">Your name</label>
    <input id="name" type="text" autocomplete="given-name" enterkeyhint="done" maxlength="40">
    <!-- Optional, and never guessed at. It only groups the kitty's totals, so
         a wrong family would be quietly wrong for a fortnight. -->
    <label id="hhLabel">Family</label>
    <div class="payers" id="fHouse" role="group" aria-labelledby="hhLabel"></div>
    <input id="fHouseName" type="text" maxlength="30" placeholder="Family name" autocomplete="off" hidden>
    <!-- Asked here because arriving is the one thing you already know when you
         put your dates in, and nobody will come back later to fill it in. -->
    <label id="liftLabel">Getting here</label>
    <div class="payers" id="fLift" role="group" aria-labelledby="liftLabel">
      <button type="button" class="who-chip on" data-lift="">Making my own way</button>
      <button type="button" class="who-chip" data-lift="yes">Need picking up</button>
    </div>
    <div id="fLiftWhere" hidden>
      <div class="payers" id="fFrom" role="group" aria-label="Where from"></div>
      <input id="fFromOther" type="text" maxlength="40" placeholder="Where from" autocomplete="off" hidden>
      <div class="lift-when">
        <label for="fAt">Getting in about</label>
        <input id="fAt" type="time">
      </div>
    </div>
    <label id="pickLabel">Your icon</label>
    <div class="picker" id="picker" role="group" aria-labelledby="pickLabel"></div>
    <div class="row">
      <button class="btn ghost" id="cancel">Cancel</button>
      <button class="btn" id="save" disabled>Save</button>
    </div>
    <button class="remove" id="remove" hidden>Remove me</button>
  </div>
</div>

<!-- --------------------------------------------------------- are you sure?
     "Remove me" sits right under Save and is easy to hit by mistake. The
     message has to be accurate about what actually happens: expenses are
     "on delete set null", so the money stays in the kitty and only the name
     comes off it. Saying "this deletes your spending" would be a lie that
     stops people leaving; saying nothing lets them think it happened. -->
<div class="scrim" id="rmScrim"></div>
<div class="sheet confirm" id="rmSheet" role="dialog" aria-modal="true" aria-labelledby="rmTitle">
  <div class="in2">
    <h2 id="rmTitle">Take yourself off?</h2>
    <p class="cf-body" id="rmBody"></p>
    <div class="row">
      <button class="btn" id="rmCancel">Stay</button>
      <button class="btn danger" id="rmGo">Remove me</button>
    </div>
  </div>
</div>
`);

/* ======================================================================= trip
   The only thing to change when the dates move. Everything on the page is
   derived from these two days — nothing can show a date outside them.
   (Inherited from the calendar work, along with the noon-UTC handling below.) */
const TRIP = Sync.TRIP;   // single source of truth, in sync.js

/* ---------------------------------------------------------------- dates
   Noon UTC throughout, so no summer-time shift can ever move a day. */
const D       = s => new Date(s + 'T12:00:00Z');
const iso     = d => d.toISOString().slice(0,10);
const addDays = (d,n) => new Date(d.getTime() + n*86400000);
const DOW  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DOWL = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const MON  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const dowIdx = d => (d.getUTCDay() + 6) % 7;            // Monday-first

const START = D(TRIP.start), END = D(TRIP.end);
const DAYS = (() => { const o=[]; for (let d=START; d<=END; d=addDays(d,1)) o.push(d); return o; })();
const DAY_KEYS = DAYS.map(iso);

const STORE = 'laperdrix.stays.v1';

let people = load();
let mode   = 'idle';      // 'idle' | 'picking'
let draft  = null;        // {id?, name, icon, from, to}
let hover  = null;        // live end of the range while picking
let focus  = null;        // day whose names are shown

function load(){
  return Sync.people().filter(p => p && p.name && p.from && p.to).map((p,i) => ({
    id: p.id || Sync.newId(),
    name: p.name,
    /* Records written before profiles existed have a colour but no icon.
       Keep them working: give them one rather than dropping the row. */
    icon: p.icon || ICONS[i % ICONS.length][0],
    from: p.from, to: p.to,
    /* Must be carried, not dropped: this list is what the save path rebuilds a
       person from, so losing it here would quietly erase somebody's family the
       next time they edited their dates. */
    household: (p.household || '').trim(),
    /* Same reason as household: the save path rebuilds the record from this
       list, so a field dropped here is erased the next time anyone edits. */
    pickupFrom: (p.pickupFrom || '').trim(),
    pickupAt: (p.pickupAt || '').trim()
  }));
}

const here = (p, k) => p.from <= k && k <= p.to;
const $ = id => document.getElementById(id);
const esc = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------------------------------------------------------------- calendar */
function renderDow(){ $('dow').innerHTML = DOW.map(d => '<span>'+d[0]+'</span>').join(''); }

function blank(){ const s = document.createElement('span'); s.className = 'blank'; return s; }

function renderGrid(){
  const grid = $('grid');
  const rich = grid.classList.contains('rich');
  grid.innerHTML = '';
  for (let i = 0; i < dowIdx(START); i++) grid.appendChild(blank());

  let a = null, b = null;
  if (mode === 'picking' && draft && draft.from){
    const other = draft.to || hover || draft.from;
    a = draft.from < other ? draft.from : other;
    b = draft.from < other ? other : draft.from;
  }

  let lastMonth = null;
  const tk = todayLocal();
  DAYS.forEach(d => {
    const k = iso(d);
    const cell = document.createElement('button');
    cell.className = 'day';
    cell.type = 'button';
    cell.dataset.d = k;

    const showMonth = d.getUTCMonth() !== lastMonth;
    lastMonth = d.getUTCMonth();
    cell.innerHTML = '<span class="num">'+d.getUTCDate()+'</span>' +
      (showMonth ? '<span class="mon">'+MON[d.getUTCMonth()]+'</span>' : '');

    const staying = people.filter(p => here(p, k));
    if (k === tk) cell.classList.add('today');

    if (mode === 'picking'){
      if (a && k >= a && k <= b){
        cell.classList.add('inrange');
        if (k === a) cell.classList.add('edge-a');
        if (k === b) cell.classList.add('edge-b');
        if (k === draft.from || k === draft.to) cell.classList.add('pick');
      }
    } else {
      if (staying.length) cell.classList.add('has');
      if (k === focus) cell.classList.add('focus');
    }

    /* Who is here, as dots. Four fit across a day on a phone; beyond that the
       count takes a dot's place, so every cell stays exactly one row tall. */
    const dots = document.createElement('span');
    dots.className = 'dots';
    const shown = staying.length > 4 ? 3 : staying.length;
    staying.slice(0, shown).forEach(p => {
      const dot = document.createElement('i');
      dot.className = 'dot';
      dot.style.background = colourOf(p.icon);
      dots.appendChild(dot);
    });
    if (staying.length > shown){
      const more = document.createElement('i');
      more.className = 'more';
      more.textContent = '+' + (staying.length - shown);
      dots.appendChild(more);
    }
    cell.appendChild(dots);

    /* The big calendar (calendar.html) has room to say more: a head count, the
       faces themselves, and a mark on any day somebody needs collecting. CSS
       decides which of dots and faces shows at which width. */
    const lifts = staying.filter(p => p.from === k && p.pickupFrom);
    if (rich){
      const FACES = 14;
      const faces = staying.slice(0, staying.length > FACES ? FACES - 1 : FACES);
      cell.insertAdjacentHTML('beforeend',
        (staying.length ? '<span class="n-here">' + staying.length + ' here</span>' : '') +
        '<span class="faces">' + faces.map(p =>
          '<i style="background:' + colourOf(p.icon) + '">' + iconOf(p.icon) + '</i>').join('') +
        (staying.length > faces.length ? '<b>+' + (staying.length - faces.length) + '</b>' : '') + '</span>' +
        (lifts.length ? '<span class="lift-pin" aria-hidden="true"></span>' : ''));
    }

    cell.setAttribute('aria-label',
      DOWL[dowIdx(d)] + ' ' + d.getUTCDate() + ' ' + MONL[d.getUTCMonth()] +
      (staying.length ? ': ' + staying.map(p => p.name).join(', ') : '') +
      (rich && lifts.length ? '. ' + lifts.length + ' to collect' : ''));

    grid.appendChild(cell);
  });

  for (let i = dowIdx(END); i < 6; i++) grid.appendChild(blank());
}

function renderWho(){
  const el = $('who');
  if (!el) return;            // calendar.html has a whole panel instead
  if (mode === 'picking'){ el.textContent = ''; return; }
  if (!focus){ el.textContent = people.length ? 'Tap a day to see who’s here.' : ''; return; }
  const d = D(focus);
  const staying = people.filter(p => here(p, focus));
  el.innerHTML = '<b>' + DOW[dowIdx(d)] + ' ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + '</b> · ' +
    (staying.length ? staying.map(p => esc(p.name)).join(', ') : 'nobody yet');
}

function spanLabel(p){
  const f = D(p.from), t = D(p.to);
  // Otherwise a malformed date renders as "NaN undefined" on the chip. Real
  // input cannot produce one — <input type="date"> and iso() are both
  // zero-padded — but records arriving from the server are not ours to trust.
  if (isNaN(f) || isNaN(t)) return 'dates unclear';
  return f.getUTCMonth() === t.getUTCMonth()
    ? f.getUTCDate() + '–' + t.getUTCDate() + ' ' + MON[t.getUTCMonth()]
    : f.getUTCDate() + ' ' + MON[f.getUTCMonth()] + ' – ' + t.getUTCDate() + ' ' + MON[t.getUTCMonth()];
}

function renderFolk(){
  const el = $('folk');
  el.innerHTML = '';
  if (mode === 'picking') return;
  /* Named but dateless — created from the kitty when they paid for a shop, and
     not yet on the calendar. Shown here so they can be tapped to add their
     dates; kept out of the presence chart, which only knows real stays. */
  const undated = Sync.people().filter(p => p && p.name && !(p.from && p.to));
  /* The chips live inside a disclosure that is collapsed once there are dated
     people, so the bar chart leads. While nobody has dates the chart is absent,
     so open it and keep the first-run nudge (below) in plain sight. */
  const wrap = $('folkWrap');
  // Force it open only while nobody has dates (so the first-run nudge shows).
  // Once there are dates, leave it alone, so a manual open survives a re-render
  // rather than snapping shut the moment somebody taps a day on the calendar.
  if (wrap && !people.length) wrap.open = true;
  if (!people.length && !undated.length){
    el.innerHTML = '<p class="empty">Nobody has added their dates yet. Tap <b>Add your dates</b> below to be the first.</p>';
    return;
  }
  const chip = (p, when, todo) => {
    const b = document.createElement('button');
    b.className = 'chip' + (todo ? ' todo' : '');
    b.type = 'button';
    b.dataset.id = p.id;
    const icon = p.icon || ICONS[0][0];
    b.innerHTML = '<span class="av" style="background:'+colourOf(icon)+'">'+iconOf(icon)+'</span>' +
                  '<span>'+esc(p.name)+'</span><span class="dates'+(todo ? ' todo' : '')+'">'+when+'</span>';
    el.appendChild(b);
  };
  people.forEach(p => chip(p, spanLabel(p), false));
  undated.forEach(p => chip(p, 'Please add your dates', true));
}

/* ------------------------------------------------- presence chart
   Same `people` array as the calendar — two views of one source of truth,
   so they can never disagree. */
function renderChart(){
  const wrap = $('chartWrap'), empty = $('chartEmpty'), peakEl = $('peak');
  if (people.length < 2 || mode === 'picking'){
    wrap.hidden = true; peakEl.hidden = true;
    empty.hidden = !(people.length < 2 && mode !== 'picking');
    return;
  }
  wrap.hidden = false; empty.hidden = true;
  wrap.style.setProperty('--days', DAYS.length);

  const counts = DAY_KEYS.map(k => people.filter(p => here(p, k)).length);
  const peak = Math.max(...counts);
  const tk = todayLocal();

  // Weekend shading, and a line down today while the trip is on.
  $('cols').innerHTML = '<span></span>' + DAYS.map((d,i) => {
    const cls = (dowIdx(d) >= 5 ? 'we ' : '') + (DAY_KEYS[i] === tk ? 'today' : '');
    return '<i class="'+cls.trim()+'"></i>';
  }).join('');

  const busiest = counts.map((c,i) => c === peak ? i : -1).filter(i => i >= 0);
  const first = DAYS[busiest[0]];
  peakEl.hidden = !(peak > 1);
  peakEl.innerHTML = 'Busiest: <b>' + peak + ' round the table</b> on ' +
    DOWL[dowIdx(first)] + ' ' + first.getUTCDate() + ' ' + MONL[first.getUTCMonth()] +
    (busiest.length > 1 ? ', and ' + (busiest.length - 1) + ' other day' + (busiest.length > 2 ? 's' : '') + ' like it' : '') + '.';

  $('scale').innerHTML = '<span></span>' + DAYS.map((d,i) =>
    '<i class="'+(counts[i] === peak && peak > 0 ? 'hot ' : '')+(DAY_KEYS[i] === tk ? 'today' : '')+'"><b>'+d.getUTCDate()+'</b>'+DOW[dowIdx(d)].slice(0,2)+'</i>'
  ).join('');

  $('tally').innerHTML = '<span class="sp">Heads</span>' + counts.map(c =>
    '<u class="'+(c === peak && peak > 0 ? 'hot' : '')+'" style="height:'+Math.max(2, Math.round(c / peak * 30))+'px"></u>'
  ).join('');

  $('bars').innerHTML = people.map(p => {
    /* Clamp to the fortnight rather than dropping out of it. A date outside the
       trip gives indexOf === -1, and the old Math.max(from, -1) collapsed a
       stay that ran past the last day into a single-day stub at the start.
       People really do book a night either side, and the trip dates can move
       under records that were entered before they did. */
    const last = DAYS.length - 1;
    const at = (iso, fallbackEarly) => {
      const i = DAY_KEYS.indexOf(iso);
      if (i >= 0) return i;
      return iso < DAY_KEYS[0] ? 0 : (fallbackEarly ? 0 : last);
    };
    const from = at(p.from, true);
    const to   = Math.max(from, at(p.to, false));
    const c    = colourOf(p.icon);
    return '<div class="prow" style="--days:'+DAYS.length+'">' +
      '<span class="nm"><i style="background:'+c+'">'+iconOf(p.icon)+'</i><span>'+esc(p.name)+'</span></span>' +
      '<span class="stay" style="background:'+c+';grid-column:'+(from+2)+' / span '+(to-from+1)+'"></span></div>';
  }).join('');

  updateChartFade();
}

/* The soft edge fade that tells you the chart scrolls sideways, and which way.
   Set from the scroll position: a fade on the right while there is more
   fortnight off that edge, on the left once you have scrolled into it, and
   neither when it all fits (a short trip, or a wide screen). See styles.css. */
function updateChartFade(){
  const w = $('chartWrap');
  if (w.hidden) return;
  const max = w.scrollWidth - w.clientWidth;
  w.classList.toggle('fade-l', w.scrollLeft > 1);
  w.classList.toggle('fade-r', w.scrollLeft < max - 1);
}

/* ---------------------------------------------------------------- sheet */
function renderPicker(){
  $('picker').innerHTML = ICONS.map(([slug,c]) => {
    const on = draft && draft.icon === slug;
    return '<button type="button" class="ic-btn" data-icon="'+slug+'" aria-pressed="'+on+'" aria-label="'+slug+'"'+
      (on ? ' style="background:'+c+'"' : '') + '>' + iconOf(slug) + '</button>';
  }).join('');
}

function nights(p){
  const n = Math.round((D(p.to) - D(p.from)) / 86400000);
  return spanLabel(p) + ', ' + n + (n === 1 ? ' night' : ' nights');
}

function renderSheet(){
  const open = mode === 'picking';
  $('sheet').classList.toggle('open', open);
  document.body.classList.toggle('picking', open);
  if (!open){ document.body.style.removeProperty('--sheet-h'); return; }
  $('sheetTitle').textContent = draft.id ? 'Your dates' : 'Add your dates';
  $('remove').hidden = !draft.id;
  $('hint').textContent =
    !draft.from        ? 'Pick the day you arrive, below or on the calendar.' :
    !draft.to          ? 'Now the day you leave.' :
    !draft.name.trim() ? 'Add your name to save.' :
                         nights(draft) + '. Change either date, or tap the calendar again.';
  /* Kept in step with the calendar, which is the other way in to the same two
     values. Assigning the same string back is a no-op, so this is safe to run
     on every render, including while a native picker is open. */
  $('dFrom').value = draft.from || '';
  $('dTo').value   = draft.to   || '';
  $('save').disabled = !(draft.name.trim() && draft.from && draft.to);
}

/* Deliberately NOT the page's iso() — that goes via toISOString() and is UTC,
   so between midnight and 1am BST it returns yesterday. This is the one place
   that matters: a band whose whole job is to say who is cooking *tonight*. */
function todayLocal(){
  const n = new Date(), p = v => String(v).padStart(2, '0');
  return n.getFullYear() + '-' + p(n.getMonth() + 1) + '-' + p(n.getDate());
}
/* DOWL here is Monday-first (the calendar grid needs it that way), so it must
   be indexed through dowIdx, never with getUTCDay(). */
const longNight  = day => DOWL[dowIdx(D(day))] + ' ' + D(day).getUTCDate() + ' ' + MON[D(day).getUTCMonth()];
const shortNight = day => DOW[dowIdx(D(day))] + ' ' + D(day).getUTCDate() + ' ' + MON[D(day).getUTCMonth()];

/* "about four-ish" — a time from a phone, written the way somebody would say
   it. 16:00 becomes 4pm, 16:30 becomes 4.30pm (a dot, not a colon: UK). */
function sayTime(hhmm){
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return '';
  const h = +m[1], mins = m[2];
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + (mins === '00' ? '' : '.' + mins) + suffix;
}

/* The next three days that actually have somebody arriving, counting from
   today. Three *calendar* days would be blank for the next year and then blank
   again on any quiet day mid-trip; three days with pickups in them is the same
   thing during the week that matters and useful the rest of the time. */
function nextLifts(list, todayISO, limitDays){
  const wanted = list
    .filter(p => p.pickupFrom && p.from && p.from >= todayISO)
    .sort((a, b) => a.from.localeCompare(b.from) ||
                    String(a.pickupAt).localeCompare(String(b.pickupAt)) ||
                    a.name.localeCompare(b.name));
  const days = [];
  for (const p of wanted) {
    let d = days.find(x => x.day === p.from);
    if (!d) {
      if (days.length === limitDays) break;
      d = { day: p.from, people: [] };
      days.push(d);
    }
    d.people.push(p);
  }
  return days;
}

/* ---------------------------------------------------------------- events */
$('grid').addEventListener('click', e => {
  const cell = e.target.closest('.day');
  if (!cell) return;
  const k = cell.dataset.d;
  if (mode !== 'picking'){ focus = (focus === k) ? null : k; render(); return; }
  if (!draft.from || draft.to){ draft.from = k; draft.to = null; hover = null; }
  else if (k < draft.from){ draft.to = draft.from; draft.from = k; }
  else { draft.to = k; }
  render();
});

$('grid').addEventListener('pointerover', e => {
  if (mode !== 'picking' || !draft.from || draft.to) return;
  const cell = e.target.closest('.day');
  if (!cell || cell.dataset.d === hover) return;
  hover = cell.dataset.d;
  renderGrid();
});

/* Put the calendar in the strip of screen the sheet doesn't cover.
   Deliberately no autofocus on the name field: on a phone the keyboard would
   swallow the very thing you are being asked to tap.

   The old version only ever scrolled DOWN, when the grid's bottom fell behind
   the sheet. Opening the sheet from the button at the foot of the page left the
   calendar off the top of the screen instead, and nothing brought it back — you
   got a sheet saying "tap the day you arrive" above a photograph. This centres
   the calendar in the free strip, moving whichever way it has to. */
function clearOfSheet(){
  requestAnimationFrame(() => {
    const h = $('sheet').offsetHeight;
    document.body.style.setProperty('--sheet-h', (h + 24) + 'px');
    const cal = document.querySelector('.cal');
    if (!cal) return;
    const room = window.innerHeight - h - 14;      // strip left above the sheet
    const r = cal.getBoundingClientRect();
    // 12px off the top at minimum, so a tall calendar starts at the top of the
    // strip rather than being centred with its first row cut off.
    const want = Math.max(12, (room - r.height) / 2);
    const delta = r.top - want;
    if (Math.abs(delta) > 8) window.scrollBy({ top: delta, behavior:'smooth' });
  });
}

/* The families already in use, first spelling wins. Folded on case and trimmed,
   so "Ritchie" and "ritchie " don't become two families that never add up. */
function familyNames(){
  const seen = new Map();
  for (const p of people) {
    const h = (p.household || '').trim();
    if (h && !seen.has(h.toLowerCase())) seen.set(h.toLowerCase(), h);
  }
  return [...seen.values()];
}

function renderHouses(){
  const chosen = draft.household === undefined ? '' : draft.household;
  const chip = (val, text, extra) =>
    `<button type="button" class="who-chip${extra || ''}${chosen === val ? ' on' : ''}" data-hh="${esc(val)}">${text}</button>`;
  $('fHouse').innerHTML =
    chip('', 'Cavalier seul <span class="gloss">just me</span>') +
    familyNames().map(h => chip(h, esc(h))).join('') +
    chip('__new', '<span class="plus">＋</span>New family', ' newp');
  $('fHouseName').hidden = chosen !== '__new';
}

/* The realistic ways in. Bergerac and Bordeaux are the airports people
   actually fly to; Angoulême and Périgueux are the TGV/train arrivals; Ribérac
   is the local one for anyone already in France. "Somewhere else" is a text box
   rather than a longer list nobody reads. */
const LIFT_FROM = ['Bergerac', 'Bordeaux', 'Angoulême', 'Limoges', 'Périgueux', 'Ribérac'];

function renderLift(){
  const wants = Boolean(draft.pickupFrom || draft.wantsLift);
  [...$('fLift').children].forEach(b => b.classList.toggle('on', (b.dataset.lift === 'yes') === wants));
  $('fLiftWhere').hidden = !wants;
  if (!wants) return;

  const from = draft.pickupFrom || '';
  const known = LIFT_FROM.includes(from);
  // Anything not in the list — including a place typed last time and loaded
  // back — is "somewhere else" with the box already filled in.
  const custom = Boolean(from) && !known && from !== '__other';
  const showBox = from === '__other' || custom;

  const chip = (val, text, extra, on) =>
    `<button type="button" class="who-chip${extra || ''}${on ? ' on' : ''}" data-from="${esc(val)}">${text}</button>`;
  $('fFrom').innerHTML =
    LIFT_FROM.map(x => chip(x, esc(x), '', from === x)).join('') +
    chip('__other', '<span class="plus">＋</span>Somewhere else', ' newp', showBox);

  $('fFromOther').hidden = !showBox;
  if (custom) $('fFromOther').value = from;
  $('fAt').value = draft.pickupAt || '';
}

$('fLift').addEventListener('click', e => {
  const b = e.target.closest('.who-chip');
  if (!b) return;
  draft.wantsLift = b.dataset.lift === 'yes';
  if (!draft.wantsLift) { draft.pickupFrom = ''; draft.pickupAt = ''; }
  renderLift();
});

$('fFrom').addEventListener('click', e => {
  const b = e.target.closest('.who-chip');
  if (!b) return;
  draft.pickupFrom = b.dataset.from;
  renderLift();
  if (draft.pickupFrom === '__other') $('fFromOther').focus();
});
$('fFromOther').addEventListener('input', () => { draft.pickupFrom = '__other'; });
$('fAt').addEventListener('change', () => { draft.pickupAt = $('fAt').value; });

function startDraft(d){
  draft = d; mode = 'picking'; hover = null; focus = null;
  renderPicker(); renderHouses(); render();
  $('name').value = d.name;
  $('fHouseName').value = '';
  $('fFromOther').value = '';
  renderLift();
  clearOfSheet();
}

$('fHouse').addEventListener('click', e => {
  const b = e.target.closest('.who-chip');
  if (!b) return;
  draft.household = b.dataset.hh;
  renderHouses();
  if (draft.household === '__new') $('fHouseName').focus();
});

$('add').addEventListener('click', () => {
  startDraft({ name:'', icon: ICONS[people.length % ICONS.length][0], from:null, to:null,
               household:'', pickupFrom:'', pickupAt:'' });
});

/* Open somebody's dates for editing. Anything carrying a data-id can call it:
   the chips under the calendar, and the rows in calendar.html's day panel. */
function editPerson(id){
  // Dateless people (added from the kitty) are not in `people`, so fall back to
  // the raw list to find them — tapping their chip is how they add their dates.
  const p = people.find(x => x.id === id)
         || Sync.people().find(x => x && x.id === id);
  if (p) startDraft({ id:p.id, name:p.name, icon:p.icon || ICONS[0][0], from:p.from || null, to:p.to || null,
                      pickupFrom: p.pickupFrom || '', pickupAt: p.pickupAt || '',
                      household: (p.household || '').trim() });
}

$('folk').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (chip) editPerson(chip.dataset.id);
});

$('picker').addEventListener('click', e => {
  const b = e.target.closest('.ic-btn');
  if (!b) return;
  draft.icon = b.dataset.icon;
  renderPicker(); renderGrid();
});

$('name').addEventListener('input', e => { draft.name = e.target.value; renderSheet(); });
$('name').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });

/* ------------------------------------------------------------ typed dates
   The same two values the calendar sets, reachable without tapping a grid
   behind a half-screen sheet. The trip bounds both fields, so the native
   picker cannot offer a day the page has no column for; a value typed on a
   desktop keyboard is clamped rather than refused, since a silently ignored
   field looks broken.

   'change', not 'input': typing a year on a desktop fires input at "0002",
   which would swap the dates around under the person's hands mid-keystroke. */
$('dFrom').min = $('dTo').min = TRIP.start;
$('dFrom').max = $('dTo').max = TRIP.end;

function setEnd(which, raw){
  if (!draft) return;
  const v = raw ? (raw < TRIP.start ? TRIP.start : raw > TRIP.end ? TRIP.end : raw) : null;
  draft[which] = v;
  // Filling in "leave" first is a reasonable way to work, not a mistake.
  if (draft.from && draft.to && draft.from > draft.to){
    const t = draft.from; draft.from = draft.to; draft.to = t;
  }
  hover = null;
  render();
}
$('dFrom').addEventListener('change', e => setEnd('from', e.target.value));
$('dTo').addEventListener('change', e => setEnd('to', e.target.value));
/* Tapping the field opens the native calendar on every device that supports
   it, not only the small icon — the same treatment as the kitty's date. */
for (const id of ['dFrom', 'dTo'])
  $(id).addEventListener('click', () => { try { $(id).showPicker(); } catch {} });

$('cancel').addEventListener('click', () => { mode='idle'; draft=null; hover=null; render(); });

/* Tapping away closes the dates sheet too — but NOT with a scrim, unlike the
   kitty and rota sheets. This is the one sheet you use while looking at what
   is behind it: the calendar is part of the input, and covering it would break
   the only way to pick your dates. So instead: anything outside the sheet, the
   calendar and the action bar counts as Cancel. Listens on pointerdown rather
   than click, so a drag that starts on the hero and ends on the sheet doesn't
   dismiss it. */
/* Tap-away closes the dates sheet, but it must be a genuine TAP. This sheet is
   used while looking at the calendar behind it, so a finger going down to pan
   or scroll the page must not bin a half-finished set of dates. We remember
   where a candidate tap started, and only cancel if the finger barely moved by
   the time it lifts. */
let awayStart = null;
const inSafeZone = t => t.closest('#sheet, .cal, #grid, .bar, #folk');
document.addEventListener('pointerdown', e => {
  awayStart = null;
  if (mode !== 'picking') return;
  // The "Take yourself off?" confirm sits on top while still in picking mode
  // and brings its own dismissal (scrim, buttons, Escape → closeRemove). While
  // it is up this handler stands down completely, or a tap meant for it reaches
  // through and cancels the edit underneath.
  if ($('rmSheet').classList.contains('open')) return;
  if (inSafeZone(e.target)) return;
  awayStart = { x: e.clientX, y: e.clientY };
});
document.addEventListener('pointerup', e => {
  const s = awayStart; awayStart = null;
  if (!s || mode !== 'picking') return;
  if ($('rmSheet').classList.contains('open')) return;
  if (inSafeZone(e.target)) return;
  if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < 10) $('cancel').click();
});

$('save').addEventListener('click', () => {
  if (!draft) return;   // a fast second tap arrives after the sheet closed
  // "__new" means whatever they typed in the box; anything else is either an
  // existing family or '' for nobody. Never null — '' is the one absent value.
  const house = draft.household === '__new'
    ? $('fHouseName').value.trim()
    : (draft.household || '').trim();
  // "__other" means whatever is in the box. A pickup with no place named is
  // not a pickup — store nothing rather than a time attached to nowhere.
  let liftFrom = draft.pickupFrom === '__other'
    ? $('fFromOther').value.trim()
    : (draft.pickupFrom || '').trim();
  let liftAt = liftFrom ? (draft.pickupAt || '').trim() : '';

  const rec = {
    id: draft.id || Sync.newId(),
    name: draft.name.trim(), icon: draft.icon, from: draft.from, to: draft.to,
    household: house,
    pickupFrom: liftFrom, pickupAt: liftAt
  };
  // Saves locally at once and queues for the server; the entry is safe even if
  // the line is down.
  people = Sync.savePerson(rec);
  mode='idle'; draft=null; hover=null; focus=rec.from;
  render();
});

/* Removing someone is `on delete set null` on the expense, so their spending
   survives — the kitty already renders an orphaned payer as "someone who has
   left". What is genuinely lost is the link between the two, and there is no
   undo, so the wording names the money rather than hiding it. */
function openRemove(){
  if (!draft || !draft.id) return;
  const mine = Sync.expenses().filter(e => e.paidBy === draft.id && e.entryType !== 'payin');
  const spent = mine.reduce((sum, e) => sum + (typeof e.amountLocal === 'number' ? e.amountLocal : 0), 0);
  const who = draft.name.trim() || 'you';
  $('rmBody').innerHTML = mine.length
    ? `Takes <b>${esc(who)}</b> off the calendar. The <b>${mine.length} ${mine.length === 1 ? 'spend' : 'spends'}</b> ` +
      `logged against ${esc(who)}, <b>€${spent.toFixed(2)}</b>, stay in the kitty, but they'll stop showing a name. ` +
      `There's no undo.`
    : `Takes <b>${esc(who)}</b> off the calendar. Nothing is in the kitty under that name, so nothing else changes. ` +
      `You can always add yourself again.`;
  $('rmSheet').classList.add('open');
  $('rmScrim').classList.add('open');
  // This confirm sits over the open dates sheet. Trap Tab within it and land on
  // "Stay", so the destructive button is never the default. Focus goes back to
  // "Remove me" on close.
  Focus.trap($('rmSheet'), $('rmCancel'));
}
function closeRemove(){
  $('rmSheet').classList.remove('open');
  $('rmScrim').classList.remove('open');
  Focus.release();
}

$('remove').addEventListener('click', openRemove);
$('rmCancel').addEventListener('click', closeRemove);
$('rmScrim').addEventListener('click', closeRemove);   // tapping away is a cancel

$('rmGo').addEventListener('click', () => {
  Sync.removePerson(draft.id);
  people = Sync.people();
  closeRemove();
  mode='idle'; draft=null; hover=null; focus=null;
  render();
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  // The confirm is on top, so it takes Escape first. Any ambiguous dismissal
  // of a destructive question has to mean cancel.
  if ($('rmSheet').classList.contains('open')) closeRemove();
  else if (mode === 'picking') $('cancel').click();
});
