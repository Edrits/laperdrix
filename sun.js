/* =========================================================================
   The sun at La Perdrix.

   Sunrise and sunset at the house, from the standard sunrise equation — pure
   arithmetic, no network, good to a minute or two, which is all a sentence
   about the evening needs. Feeds the "now at La Perdrix" line in the hero;
   the words themselves live in index.html with the rest of the page's copy.

   Times are worked out for the HOUSE's calendar day and shown on the house's
   clock (Europe/Paris), wherever the phone happens to be.
   ========================================================================= */
(function(){
  const LAT = 45.218, LON = 0.346;          // St Martin de Ribérac, near enough
  const TZ  = 'Europe/Paris';
  const rad = Math.PI / 180;
  const sin = d => Math.sin(d * rad), cos = d => Math.cos(d * rad);

  /* The house's calendar day containing `when`, as YYYY-MM-DD. */
  function houseDay(when){
    const p = {};
    new Intl.DateTimeFormat('en-GB', { timeZone:TZ, year:'numeric', month:'2-digit', day:'2-digit' })
      .formatToParts(when).forEach(x => { p[x.type] = x.value; });
    return p.year + '-' + p.month + '-' + p.day;
  }

  /* Sunrise and sunset on the house's day containing `when`. */
  function times(when){
    const noon = Date.parse(houseDay(when) + 'T12:00:00Z');
    const n  = Math.round(noon / 86400000 + 2440587.5 - 2451545 + 0.0008);
    const J  = n - LON / 360;                                   // mean solar noon
    const M  = (357.5291 + 0.98560028 * J) % 360;               // mean anomaly
    const C  = 1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M);
    const L  = (M + C + 180 + 102.9372) % 360;                  // ecliptic longitude
    const Jt = 2451545 + J + 0.0053 * sin(M) - 0.0069 * sin(2 * L);
    const sd = sin(L) * sin(23.4397);                           // declination
    const cd = Math.cos(Math.asin(sd));
    const w  = Math.acos((sin(-0.833) - sin(LAT) * sd) / (cos(LAT) * cd)) / rad;
    const at = j => new Date((j - 2440587.5) * 86400000);
    return { rise: at(Jt - w / 360), set: at(Jt + w / 360) };
  }

  /* hh:mm at the house. */
  function clock(when){
    return new Intl.DateTimeFormat('en-GB', { timeZone:TZ, hour:'2-digit', minute:'2-digit', hour12:false }).format(when);
  }

  window.Sun = { times, clock };
})();
