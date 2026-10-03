// A list of places another Lodestar user made and shared. It is not map data: the map
// itself knows nothing about the TPF. The list sits on top of the map the way a friend's
// saved places do, with the owner's own names and notes.
export const LIST = {
  id: 'tpf-sites',
  title: 'TPF sites',
  owner: 'Vaelthorn Archive',
  color: '#7b1fa2',
  updated: '19 Aug 2026', // the latest release on the archive site
  note: 'Every site of the TPF Research and Detainment Division, with what we know of each.',
  // the account's picture: the Vaelthorn Archive site's favicon, on its dark site colour
  avatar: '<svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#1c1b20"/><g transform="translate(4.6 4.4) scale(0.72)"><path d="M7 4h13l5 5v19H7Z" fill="#e8e8e6"/><path d="M20 4l5 5h-5Z" fill="#8e8f8d"/><rect x="10.5" y="12" width="11" height="1.8" fill="#0a0a0b" opacity="0.5"/><rect x="10.5" y="21.5" width="7.5" height="1.8" fill="#0a0a0b" opacity="0.5"/><rect x="4" y="16" width="24" height="3.6" fill="#de6161"/></g></svg>',
};

// the list's items, in the order the owner added them
export function listItems(world) {
  const sites = world.sites.filter((s) => s.tpf);
  return sites.map((s, i) => {
    // made with the first release (3 March 2024), the places added over that month
    const d = 3 + Math.round((i * 25) / sites.length);
    return {
      id: 'site:' + s.id, type: 'site', cat: 'list', name: s.name,
      sub: `${LIST.title} · shared by ${LIST.owner}`,
      x: s.pin ? s.pin[0] : s.x, y: s.pin ? s.pin[1] : s.y, zoom: 7, rank: 2, data: s,
      added: `${d} Mar 2024`,
      note: noteOf(s),
    };
  });
}

// where the archive's own wording does not fit the owner: Vaelthorn never uses TPF Subject
// numbers, and the list never names the files or records the facts come from
const WORDING = {
  'tpf-records': 'Central archive of the Division. Held the Flame\'s files back to the 17th century. Seat of the 2008 disciplinary tribunal.',
  'site41': 'The former state sanatorium at Blackmere, converted for the embryonic-modification protocol. On no map made after 1988. Reached only by the closed branch line from Stenhollow.',
  'eastern-lab': 'Detention and testing site in the forest north of the Ireyn river. Held Yue and Eimi from 2008 until their escape on 25–26.03.2013. Supplied Site 41 with donor material.',
};

// the owner's note: what the archive says, in their own shorthand
function noteOf(s) {
  const parts = [WORDING[s.id] || s.desc];
  if (s.years) parts.push(`In use ${s.years}.`);
  if (s.status) parts.push(s.status.replace(/\.$/, '') + '.');
  return parts.filter(Boolean).join(' ');
}
