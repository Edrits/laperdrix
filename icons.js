/* =========================================================================
   icons.js — the one icon set, shared by the landing page and the kitty.

   Lives in its own file so the two pages cannot drift apart. Each icon carries
   its own colour, so choosing a partridge chooses terracotta: one decision for
   the person making a profile rather than two.

   Every <use> that references these needs viewBox="0 0 24 24" on its <svg>,
   or it crops instead of scaling — see icon() below, which does it for you.
   ========================================================================= */

const ICONS = [
  ['partridge','#b0552f'], ['chicken','#7e8a6a'], ['cheese','#d99a3f'],
  ['wine','#8c3f52'],      ['dog','#5c7d7a'],     ['fig','#6a4b7c'],
  ['walnut','#7a6248'],    ['olive','#5f7148'],   ['bread','#c08040'],
  ['tomato','#b34733'],    ['sunflower','#c99a2e'],['hat','#a08a5c'],
  ['boules','#4f6b80'],    ['swim','#3f7f96'],    ['hammock','#8a7a4e'],
  ['steeple','#77706a'],   ['snail','#96683f'],   ['goat','#6d6552']
];

window.ICONS = ICONS;
window.colourOf = slug => (ICONS.find(i => i[0] === slug) || ICONS[0])[1];
window.iconOf = (slug, cls) =>
  '<svg viewBox="0 0 24 24"' + (cls ? ' class="' + cls + '"' : '') + '><use href="#i-' + slug + '"/></svg>';

/* Inject the sprite once, as early as possible, so nothing renders a blank
   <use> while waiting for it. */
(function injectSprite(){
  const markup = `<svg style="position:absolute;width:0;height:0" aria-hidden="true"><defs>
  <g id="i-partridge" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M15.6 9.4a4.6 4.6 0 0 0-2-.7c-1 0-1.8.5-2.5 1.2-1.6 1.4-4.3 1.8-5.9 3.4-1.6 1.6-1.5 4 .4 5.2 2.2 1.4 6.3 1.2 8.8-.7 2.3-1.8 3.1-4.7 2.3-7z"/>
    <circle cx="16.9" cy="7.4" r="2"/><path d="M18.9 7 21.4 6.4l-2.3 1.7"/><path d="M9.2 18.9v1.8M12.8 18.6v2"/></g>
  <g id="i-chicken" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="14.2" cy="8.2" r="2.4"/><path d="M13.4 5.5c-.3-1.3.3-2.2 1.2-2.5.6 1 .7 1.9.3 2.6"/>
    <path d="M16.6 8.7 19.2 8.1l-2.4 1.6"/>
    <path d="M14.7 10.5c2 1 3.3 2.9 3.3 5.1 0 3-2.6 4.9-5.8 4.9s-5.9-1.9-5.9-4.9c0-2.7 1.9-4.8 4.5-5.4"/>
    <path d="M6.5 14 3.2 12.1l3 3.7"/></g>
  <g id="i-cheese" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3.4 16.8h17.2v-4.4L3.4 16.8z"/><path d="M20.6 12.4 8.8 9.6 3.4 16.8"/><circle cx="14.6" cy="14.6" r=".9"/></g>
  <g id="i-wine" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10.3 2.8h3.4v3.5c0 1 1.9 2.1 1.9 4.3v8.6a1.9 1.9 0 0 1-1.9 1.9h-3.4a1.9 1.9 0 0 1-1.9-1.9v-8.6c0-2.2 1.9-3.3 1.9-4.3z"/><path d="M8.4 13.8h7.2"/></g>
  <g id="i-dog" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7.4 6.2 4.6 4.7c-.8-.4-1.7.2-1.7 1.1v4.9c0 1.3.4 2.5 1.2 3.4"/>
    <path d="M16.6 6.2l2.8-1.5c.8-.4 1.7.2 1.7 1.1v4.9c0 1.3-.4 2.5-1.2 3.4"/>
    <path d="M6.4 11.6c0-3.1 2.5-5.5 5.6-5.5s5.6 2.4 5.6 5.5v2.3c0 3.1-2.5 5.7-5.6 5.7s-5.6-2.6-5.6-5.7z"/>
    <path d="M9.7 11.2h.01M14.3 11.2h.01"/>
    <path d="M12 15.4a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6z"/>
    <path d="M12 15.4v1.6"/></g>
  <g id="i-fig" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 8.6c3.5 0 6 2.8 6 6.2s-2.7 6-6 6-6-2.6-6-6 2.5-6.2 6-6.2z"/><path d="M12 8.6V5.4"/>
    <path d="M12 6.6C10.3 4.7 8.2 4.3 6.8 4.6c0 1.7 1.5 3.3 3.6 3.5"/></g>
  <g id="i-walnut" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12.4" r="7.6"/><path d="M12 4.8v15.2"/>
    <path d="M8.3 7.2c1.5 1.7 1.7 3.7.7 5.5-1 1.8-.8 3.9.6 5.3"/>
    <path d="M15.7 7.2c-1.5 1.7-1.7 3.7-.7 5.5 1 1.8.8 3.9-.6 5.3"/></g>
  <g id="i-olive" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3.6 20c4.2-1.2 8.4-4.9 10.9-9C16.2 8.2 17.9 6 20.4 4.4"/>
    <ellipse cx="10.4" cy="13.4" rx="1.7" ry="2.3" transform="rotate(-38 10.4 13.4)"/>
    <ellipse cx="15.6" cy="8.4" rx="1.7" ry="2.3" transform="rotate(-38 15.6 8.4)"/></g>
  <g id="i-bread" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4.4 17.4 16.6 5.6a2.4 2.4 0 0 1 3.4 3.4L7.8 20.8a2.4 2.4 0 0 1-3.4-3.4z"/>
    <path d="M8.4 13.6 10.2 15.4M11.2 10.8 13 12.6M14 8l1.8 1.8"/></g>
  <g id="i-tomato" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="14.2" r="6.6"/><path d="M12 7.6V5.2"/><path d="M8.6 6.6 12 8.6l3.4-2"/></g>
  <g id="i-sunflower" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3.4"/>
    <path d="M12 3.2v3.2M12 17.6v3.2M3.2 12h3.2M17.6 12h3.2M5.8 5.8l2.3 2.3M15.9 15.9l2.3 2.3M18.2 5.8l-2.3 2.3M8.1 15.9l-2.3 2.3"/></g>
  <g id="i-hat" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7.9 12.6c0-4.1 1.8-7.1 4.1-7.1s4.1 3 4.1 7.1"/>
    <path d="M3.4 13.6c0-1.2 3.9-2.1 8.6-2.1s8.6.9 8.6 2.1-3.9 2.7-8.6 2.7-8.6-1.5-8.6-2.7z"/>
    <path d="M8.1 11.9c1.2-.5 2.5-.7 3.9-.7s2.7.2 3.9.7"/></g>
  <g id="i-boules" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="7.8" cy="15.4" r="4.2"/><circle cx="16.6" cy="16.4" r="3.4"/><circle cx="14.4" cy="7.8" r="1.7"/>
    <path d="M6 13.6 9.6 17.2"/></g>
  <g id="i-swim" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="7.4" r="3.2"/>
    <path d="M2.6 15.6c1.6 0 1.6 1.6 3.1 1.6s1.6-1.6 3.1-1.6 1.6 1.6 3.2 1.6 1.6-1.6 3.1-1.6 1.6 1.6 3.1 1.6 1.6-1.6 3.2-1.6"/>
    <path d="M2.6 19.4c1.6 0 1.6 1.6 3.1 1.6s1.6-1.6 3.1-1.6 1.6 1.6 3.2 1.6 1.6-1.6 3.1-1.6 1.6 1.6 3.1 1.6 1.6-1.6 3.2-1.6"/></g>
  <g id="i-hammock" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3.4 5.4v14.2M20.6 5.4v14.2"/><path d="M3.6 9.2c3.2 6.6 13.6 6.6 16.8 0"/>
    <path d="M6.2 11.8v2.2M9.2 13.6v2.2M12.6 14.2v2.2M15.8 13.4v2.2M18.2 11.6v2.2"/></g>
  <g id="i-steeple" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2.4 7.2 8.2h9.6z"/><path d="M8.2 8.2h7.6v12.2H8.2z"/>
    <path d="M12 11.4a1.7 1.7 0 0 1 1.7 1.7v2.4h-3.4v-2.4A1.7 1.7 0 0 1 12 11.4z"/><path d="M6.2 20.4h11.6"/></g>
  <g id="i-snail" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="14.4" cy="13.4" r="5.4"/><path d="M14.4 13.4a2.3 2.3 0 1 1 2.3 2.3 3.7 3.7 0 0 0 3.1-3.7"/>
    <path d="M9.4 18.8H4.2c-1 0-1.6-.6-1.6-1.5 0-1.4 1.6-2.1 3-2.7"/>
    <path d="M3.4 14.6c-.6-1-1-1.9-1-2.7M5.6 14c0-1 .2-2 .8-2.9"/></g>
  <g id="i-goat" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8.6 8.2C7.4 6.3 5.9 5.1 4.4 4.9c.2 2.1 1 3.8 2.5 5"/>
    <path d="M15.4 8.2c1.2-1.9 2.7-3.1 4.2-3.3-.2 2.1-1 3.8-2.5 5"/>
    <path d="M7.9 9.8c0-1.5 1.8-2.5 4.1-2.5s4.1 1 4.1 2.5v2.7c0 1.6-.8 2.9-1.9 3.7l-.4 3.5h-3.6l-.4-3.5c-1.1-.8-1.9-2.1-1.9-3.7z"/>
    <path d="M10.6 19.4c0 1.4.5 2.4 1.4 2.9.9-.5 1.4-1.5 1.4-2.9"/></g>
</defs></svg>`;
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  host.setAttribute('aria-hidden', 'true');
  host.innerHTML = markup;
  const put = () => document.body.insertBefore(host, document.body.firstChild);
  if (document.body) put(); else document.addEventListener('DOMContentLoaded', put);
})();
