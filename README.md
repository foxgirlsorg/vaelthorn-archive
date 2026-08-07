# The Vaelthorn Archive

> **This is fiction.** Esteloria, the Purifying Flame, the TPF Research and
> Detainment Division and the Vaelthorn network do not exist. Every document on
> this site is a prop written and drawn for an original story; none of it is a
> real record, and no real person, country or organisation is depicted. The
> archive framing — an official state records office publishing a dissolved
> agency's files — is part of the story, not a claim about anything real.

A static site presenting the story's in-universe documents as scanned files:
royal decrees, field correspondence, subject dossiers, incident records and
intercepted communications, released in dated batches by the government that
replaced the TPF in January 2024.

Built with Svelte 5 and Vite. No backend, no tracking, no third-party requests.

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # static output in dist/
```

`dist/` is self-contained and uses relative paths, so it works on any static
host and from a subdirectory.

## The archive

- **Cards** are grouped by release year, newest batch first, with a button to
  reverse the order. Filter by category, or search titles, record numbers and
  descriptions.
- **The viewer** opens on click: scroll or pinch to zoom, drag to pan,
  double-click to toggle 250%, `←`/`→` to turn pages, `+`/`-`/`0` for zoom,
  `Esc` to close. Multi-page documents get page buttons and a thumbnail strip.
- **Links** are deep: the open document and page live in the URL
  (`?doc=record-376016&page=2`), the back button works, and "Copy link" copies
  a link that reopens exactly that page.

## Adding or editing documents

Everything lives in [`src/lib/data.js`](src/lib/data.js). Each entry:

```js
{
  id: 'record-376016',          // also the deep-link slug: ?doc=record-376016
  code: 'RECORD NO. 376016',    // form/record number printed on the document
  title: '…',
  category: 'Incident Records', // must exist in the `categories` array
  pages: ['docs/record-376016.jpg'],  // ONE entry per document; add more paths
                                      // for a multi-page scan (see presidential-decree)
  originalDate: '26 Mar 2013',        // date on the document itself
  published: '2026-07-28',            // ISO — when the archive released it
  teaser: '…',                        // one line on the card
  related: [
    { id: 'record-376015' },                        // link to another document
    { label: 'Illustration — the drive out', url: '#' }  // external art link
  ]
}
```

`originalDate` (in-universe) and `published` (when this archive released it) are
deliberately separate and both shown. Images go in `public/docs/`; paths are
relative (`docs/…`, no leading slash) so the build survives a subdirectory.

### Web (HTML) documents

A document can be a scrollable web page instead of a scan — good for long
transcripts, tables or threaded correspondence. Use `embed` in place of
`pages`:

```js
{
  id: 'some-report',
  code: 'RECORD NO. 000',
  title: '…',
  category: 'Intercepts',
  embed: 'docs/some-report.html',     // instead of `pages`
  thumb: 'docs/thumbs/some-report.jpg', // optional card preview; omit for a placeholder
  originalDate: '…',
  published: '2026-08-06',
  teaser: '…',
  related: []
}
```

- **The HTML file goes in `public/docs/`**, referenced as `docs/<name>.html`.
- **Its assets** (images, fonts) go in **`public/docs/assets/`** and are
  referenced from inside the HTML **relative to the HTML file** — e.g.
  `<img src="assets/seal.png">`, which resolves to `docs/assets/seal.png`.
  Do **not** use a leading slash (`/assets/…`): that breaks when the site is
  served from a subpath like `user.github.io/repo/`. Relative paths always work.
  A working example is the seal in
  [`sample-web-record.html`](public/docs/sample-web-record.html), loaded from
  [`public/docs/assets/sample-seal.svg`](public/docs/assets/sample-seal.svg).
  Make the page self-contained: it is loaded in an `<iframe>`, so it needs its
  own `<style>` and layout.
- Embed documents **scroll as one continuous page** — no zoom, no page turning.
  The viewer measures the page and sizes the frame to it, so on mobile the
  details sit below the page just like a scan.
- **Card preview:** set `thumb` to any image (put it in `public/docs/thumbs/`,
  reference as `docs/thumbs/<name>.jpg`) and it shows on the card exactly like a
  scan's thumbnail. Omit `thumb` and the card shows a document placeholder. Either
  way the card carries a `WEB` badge.

There is a working example: [`public/docs/sample-web-record.html`](public/docs/sample-web-record.html)
and the `sample-web-record` entry in `data.js`. **Delete both once you add real
web records.**

**Placeholders to fill:** the `related` entries with `url: '#'` still need real
art links — on `duval-letter`, `dossier-aina`, `record-376016`,
`record-378241-report` and `record-378241-attachment`.

### Preparing scans

Scans are stored as JPEG at ffmpeg's maximum quality, with a thumbnail beside
each one. Cards and the viewer's page strip load only thumbnails; the full scan
is fetched when the viewer opens.

```bash
ffmpeg -i scan.png -q:v 1 -qmin 1 -qmax 1 public/docs/scan.jpg
ffmpeg -i public/docs/scan.jpg -vf "scale=760:-1:flags=lanczos" -q:v 4 public/docs/thumbs/scan.jpg
```

The thumbnail keeps the same filename as the scan: `thumbFor()` in `data.js`
derives its path by inserting `thumbs/`, so no extra field is needed unless an
entry sets `thumb` explicitly.

## Deployment (GitHub Pages)

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds on every
push to `main` and publishes `dist/`. Set **Settings → Pages → Source** to
**GitHub Actions** once; nothing else is required. `vite.config.js` uses
`base: './'`, so both `user.github.io/repo/` and a custom domain work.

## Project layout

```
public/docs/          full-size scans
public/docs/thumbs/   card and page-strip previews
src/lib/data.js       the archive's contents
src/lib/Lightbox.svelte   zoom/pan viewer, deep linking
src/app.css           theme tokens
```

## License

The **code** is MIT licensed — see [LICENSE](LICENSE).

The **documents, illustrations and story** in `public/docs/` and `src/lib/data.js`
are not covered by that license. They are the author's original creative work,
all rights reserved, and are included here so the site runs. Replace them with
your own if you reuse this project.
