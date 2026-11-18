# small-sites
Small sites

## Sites

- [math-drill/](math-drill/): a mobile-first timed arithmetic game. Plain HTML, CSS and JavaScript with no build step: serve the folder with any static HTTP server (e.g. `python3 -m http.server`) or open `index.html` directly.

## Adding a site

Each top-level folder with an `index.html` is published at
`https://dasanchez.github.io/small-sites/<folder>/` and listed under "Small sites"
on the Projects page. The [dasanchez.github.io](https://github.com/dasanchez/dasanchez.github.io)
build pulls this repo in daily, or when its workflow is run by hand.

Conventions:

- The site must be static and self-contained, with **relative** asset paths, because it's served from a subpath.
- `<title>` in `index.html` becomes the card name. If it's missing, the folder name is used.
- `<meta name="description" content="...">` in `index.html` becomes the card description.
- Folders starting with `.` or `_` are skipped.
