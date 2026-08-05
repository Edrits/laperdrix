#!/usr/bin/env python3
"""Generate manifest.webmanifest with the partridge icon as inline SVG data URIs.

The glyph is the same partridge from the sprite in index.html, so the home-screen
icon is the app's own mark rather than initials. Written by a script rather than
by hand because percent-encoding a data URI inside JSON by hand is exactly the
sort of thing that silently produces an icon that never renders.
"""
import json, pathlib
from urllib.parse import quote

TERRA = "#b0552f"      # the terracotta of the heads against the wall
INK   = "#f7f3e8"      # limestone, for the glyph itself
LIME  = "#e9e4d7"      # launch splash

# partridge paths, in a 24x24 coordinate space (identical to the sprite)
GLYPH = (
    '<path d="M15.6 9.4a4.6 4.6 0 0 0-2-.7c-1 0-1.8.5-2.5 1.2-1.6 1.4-4.3 1.8-5.9 3.4'
    '-1.6 1.6-1.5 4 .4 5.2 2.2 1.4 6.3 1.2 8.8-.7 2.3-1.8 3.1-4.7 2.3-7z"/>'
    '<circle cx="16.9" cy="7.4" r="2"/>'
    '<path d="M18.9 7 21.4 6.4l-2.3 1.7"/>'
    '<path d="M9.2 18.9v1.8M12.8 18.6v2"/>'
)

def icon(size, scale, dx, dy, radius, stroke):
    """One square icon. radius=0 for maskable, which the OS clips itself."""
    rect = (f'<rect width="{size}" height="{size}"'
            + (f' rx="{radius}"' if radius else "")
            + f' fill="{TERRA}"/>')
    g = (f'<g transform="translate({dx},{dy}) scale({scale})" fill="none" stroke="{INK}"'
         f' stroke-width="{stroke}" stroke-linecap="round" stroke-linejoin="round">{GLYPH}</g>')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}"'
           f' viewBox="0 0 {size} {size}">{rect}{g}</svg>')
    # quote everything except the handful of chars that are safe unencoded in a URI
    return "data:image/svg+xml," + quote(svg, safe="/:=\"'<>?.,-+ ")

manifest = {
    "name": "La Perdrix",
    "short_name": "La Perdrix",
    "description": "The trip, the days, and who's around when.",
    "start_url": ".",
    "scope": ".",
    "display": "standalone",
    "orientation": "portrait",
    "background_color": LIME,
    # A manifest allows only one theme_color. index.html carries per-scheme
    # <meta name="theme-color"> tags which override this in the browser; this
    # value is the fallback used for the launch splash.
    "theme_color": TERRA,
    "icons": [
        # 24 * 5.5 = 132, sitting 30..162 inside 192 — comfortably inset
        {"src": icon(192, 5.5, 30, 26, 42, 1.5),
         "sizes": "192x192", "type": "image/svg+xml", "purpose": "any"},
        {"src": icon(512, 14.7, 80, 70, 112, 1.5),
         "sizes": "512x512", "type": "image/svg+xml", "purpose": "any"},
        # Maskable: the OS may crop to a circle, so the glyph stays inside the
        # central 80% safe zone and the terracotta runs edge to edge.
        {"src": icon(512, 9.7, 140, 132, 0, 1.6),
         "sizes": "512x512", "type": "image/svg+xml", "purpose": "maskable"},
    ],
}

out = pathlib.Path(__file__).resolve().parent.parent / "manifest.webmanifest"
out.write_text(json.dumps(manifest, indent=2) + "\n")
print(f"wrote {out.name}, {len(out.read_text())} bytes, {len(manifest['icons'])} icons")
