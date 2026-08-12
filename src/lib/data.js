export const categories = [
  'All',
  'Decrees',
  'Correspondence',
  'Dossiers',
  'Incident Records',
  'Intercepts',
  'News Articles'
];

const documentList = [
  {
    id: 'irelyn-county-news',
    code: 'LOCAL NEWS',
    title: 'Explosion, Gunfire Reported Near Route 9 River Bridge | Ireyn Valley Courier',
    category: 'News Articles',
    embed: 'docs/ireyn_valley_courier_article/index.html',
    thumb: 'docs/thumbs/ireyn_valley_courier_article.jpg',
    originalDate: '2013-11-14',
    published: '2026-08-07',
    teaser:
      'Suppressed by government order roughly 4 hours after publication. The Courier issued no retraction and never informed readers. Restored to the public record following the dissolution of the TPF Research and Detainment Division.',
    related: []
  },
  {
    id: 'decree-01',
    code: 'DECREE NO. 1',
    title: 'Royal Decree — Founding of the Purifying Flame',
    category: 'Decrees',
    pages: ['docs/decree-01.jpg'],
    originalDate: '1482',
    published: '2024-12-24',
    teaser:
      "Edmund III's founding order establishing a sanctioned order to hunt, try, and execute elves, beastfolk, and 'abominations' across Esteloria.",
    related: []
  },
  {
    id: 'duval-letter',
    code: 'FIELD LETTER',
    title: 'Duval’s Letter — The Fall of Lumiria',
    category: 'Correspondence',
    pages: ['docs/duval-letter.jpg'],
    originalDate: '29 Aug 1513',
    published: '2024-12-24',
    teaser:
      "The Purifying Flame's field commander reports the capital of Lumiria captured and 'purified' to the crown.",
    related: [
      {
        label: 'Illustration — SHATTERED DREAMS',
        url: 'https://aibooru.online/posts/132719'
      },
      {
        label: "Illustration — Elizabeth's death",
        url: 'https://aibooru.online/posts/98937'
      }
    ]
  },
  {
    id: 'presidential-decree',
    code: 'DECREE NO. 1934/56',
    title: "President's Decree — Reformation into TPF",
    category: 'Decrees',
    pages: ['docs/presidential-decree-p1.jpg', 'docs/presidential-decree-p2.jpg'],
    originalDate: '14 Mar 1934',
    published: '2024-12-24',
    teaser:
      'The Purifying Flame is folded into the state as the TPF Research and Detainment Division, with authority over every state body but the Secret Service and confidentiality written into law.',
    related: []
  },
  {
    id: 'dossier-eimi',
    code: 'FORM NO. 23 — SUBJECT 36',
    title: 'Dossier — Eimi',
    category: 'Dossiers',
    pages: ['docs/dossier-eimi.jpg'],
    originalDate: 'Filed 2008',
    published: '2024-03-03',
    teaser:
      'Extraordinary regenerative capability, with a documented exception: chemical burns from hydrofluoric acid do not heal.',
    related: [{ id: 'record-376016' }, { id: 'record-378241-report' }]
  },
  {
    id: 'dossier-yue',
    code: 'FORM NO. 23 — SUBJECT 37',
    title: 'Dossier — Yue',
    category: 'Dossiers',
    pages: ['docs/dossier-yue.jpg'],
    originalDate: 'Filed 2008',
    published: '2024-03-03',
    teaser:
      'Logged strength roughly ten times human baseline. A standing ketamine order is noted for sedation.',
    related: [
      { id: 'record-375906' },
      { id: 'record-376015' },
      { id: 'record-376016' }
    ]
  },
  {
    id: 'dossier-aina',
    code: 'FORM NO. 23 — SUBJECT 38',
    title: 'Dossier — Aina',
    category: 'Dossiers',
    pages: ['docs/dossier-aina.jpg'],
    originalDate: 'Filed 2008',
    published: '2024-03-03',
    teaser:
      'Escaped during collection. The search was suspended once she crossed the border, where TPF jurisdiction ended.',
    related: [
      { id: 'record-378241-report' },
      { id: 'record-378241-attachment' },
      {
        label: "Illustration — Aina's escape",
        url: 'https://aibooru.online/posts/37245'
      }
    ]
  },
  {
    id: 'record-375906',
    code: 'RECORD NO. 375906',
    title: 'New Year\'s eve incident.',
    category: 'Incident Records',
    pages: ['docs/record-375906.jpg'],
    originalDate: '1 Jan 2013',
    published: '2024-03-03',
    teaser:
      "A New Year's Eve incident involving Subject 37, logged by TPF as a personnel discipline matter.",
    related: [
        { id: 'dossier-yue' },
        { id: 'record-376015' },
        {
          label: "Illustration — Photo from the confiscated camera [NSFW]",
          url: 'https://aibooru.online/posts/38957'
        }
    ]
  },
  {
    id: 'record-376015',
    code: 'RECORD NO. 376015',
    title: 'The Aftermath of New Year\'s Eve incident',
    category: 'Incident Records',
    pages: ['docs/record-376015.jpg'],
    originalDate: '23 Mar 2013',
    published: '2024-03-03',
    teaser:
      "Subject 37's deteriorating condition is confirmed as pregnancy. A termination is scheduled for 25 March.",
    related: [
      { id: 'dossier-yue' },
      { id: 'record-375906' },
      { id: 'record-376016' }
    ]
  },
  {
    id: 'record-376016',
    code: 'RECORD NO. 376016',
    title: 'Subjects 36 and 37 Break Out of the Facility',
    category: 'Incident Records',
    pages: ['docs/record-376016.jpg'],
    originalDate: '26 Mar 2013',
    published: '2024-03-03',
    teaser:
      "TPF's own account of the night Subjects 36 and 37 left the facility. 56 dead, 94 injured, no search parties dispatched.",
    related: [
      { id: 'dossier-eimi' },
      { id: 'dossier-yue' },
      { id: 'record-376015' },
      { id: 'record-378241-report' },
    ]
  },
  {
    id: 'record-378241-report',
    code: 'RECORD NO. 378241',
    title: 'Follow-Up Report — The Network Behind the Escape',
    category: 'Intercepts',
    pages: [
      'docs/record-378241-report-p1.jpg',
      'docs/record-378241-report-p2.jpg'
    ],
    originalDate: '14 Sep 2013',
    published: '2026-08-06',
    teaser:
      'TPF Cyber Division names Vaelthorn for the first time, six months after the escape, and concedes the network had been working against the facility for years.',
    related: [
      { id: 'record-378241-attachment' },
      { id: 'record-376016' },
      { id: 'dossier-aina' },
      { id: 'dossier-eimi' },
      { id: 'dossier-yue' },
    ]
  },
  {
    id: 'record-378241-attachment',
    code: 'ATTACHMENT A',
    title: 'Recovered Correspondence — Lyne and Aina',
    category: 'Intercepts',
    pages: [
      'docs/record-378241-attachment-p1.jpg',
      'docs/record-378241-attachment-p2.jpg',
      'docs/record-378241-attachment-p3.jpg'
    ],
    originalDate: '14 Sep 2013',
    published: '2026-08-06',
    teaser:
      'The full recovered thread, timestamped: a plan built around one scheduled dose, a guard shift, and a river crossing at dawn.',
    related: [
      { id: 'record-378241-report' },
      { id: 'dossier-aina' },
      { label: 'Illustration — the drive out', url: 'https://aibooru.online/posts/172298' }
    ]
  },
  {
    id: 'record-379402-report',
    code: 'RECORD NO. 379402',
    title: 'After-Action Report — Armed Engagement at Route 9 River Bridge',
    category: 'Incident Records',
    pages: ['docs/record-379402-report-p1.jpg', 'docs/record-379402-report-p2.jpg'],
    originalDate: '14 Nov 2013',
    published: '2026-08-09',
    teaser:
        'TPF’s account of the Route 9 river bridge ambush. The report concludes that the attack was a deliberate interception and raises the possibility of an internal source providing the attackers with the shipment’s schedule.',
    related: [
      { id: 'irelyn-county-news' }
    ]
  },
  {
    id: 'cc14-session-031-yue',
    code: 'RECORD ID: CC14-2014-031-Y07',
    title: 'Clinical Session Log — Yue, Session 31',
    category: 'Vaelthorn Records',
    pages: ['docs/cc14-session031-yue-p1.jpg','docs/cc14-session031-yue-p2.jpg','docs/cc14-session031-yue-p3.jpg'],
    originalDate: '22 Mar 2014',
    published: '2026-08-09',
    teaser:
        'A verbatim clinical session record from Vaelthorn’s Continuity Care Programme, documenting Session 31 with Yue on 22.03.2014. Published to the public archive at Yue’s request.',
    related: []
  },
   {
    id: 'lyne-journal-1513',
    code: 'JOURNAL FRAGMENT',
    title: 'Lyne\'s Journal Fragment',
    category: 'Vaelthorn Records',
    pages: ['docs/lyne-journal-1513-page-p1.jpg'],
    originalDate: '12 Sep 1513',
    published: '2026-08-12',
    teaser:
      'A private diary entry written by Lyne in the aftermath of Etharion’s fall. With the crown princess Elizabeth dead and the Purifying Flame claiming victory, Lyne resolves to stop running and begin building the network that will become Vaelthorn.',
    related: [
      { id: 'duval-letter' }
    ]
  },
];


export function thumbFor(page) {
  return page.replace('docs/', 'docs/thumbs/');
}

/** A document is either an image scan (`pages`) or an HTML page (`embed`). */
export function isEmbed(doc) {
  return !!doc.embed;
}

/** Turnable page count — embed (HTML) documents are a single scroll. */
export function pageCount(doc) {
  return doc.pages ? doc.pages.length : 1;
}

export const documents = documentList.map((doc) => ({
  ...doc,
  // Card thumbnail: derived from the first scan, or an explicit `thumb`.
  // Embed documents have no scan, so they need `thumb` set (else the card
  // falls back to a placeholder tile).
  thumb: doc.thumb || (doc.pages ? thumbFor(doc.pages[0]) : null)
}));

export const documentsById = Object.fromEntries(documents.map((d) => [d.id, d]));
