// Hand-set macro geography. Kilometres, x east, y south. World is 2600 x 2112 km.
// Esteloria is about 1,700 km across: the old kingdom plus the realms the Flame took
// (Lumiria in 1513, and others before it). Neighbours surround it on almost every
// side; its one coast is in the south-west, on the Gulf of Corvenne.
// Canon anchors (bible §1/§8): Aurenhal capital; Halveth in the north dales on the
// river Halve; Merrowgate on the Halve (Mill Weir south of it); Corvenne the port;
// Duncarrow garrison; Ostrey east; Ireyn a small rural county in the east on the
// Ireyn river, with Route 9's bridge and an unregistered crossing to the east;
// Stenhollow on the dales, Blackmere at the end of a closed branch line north of it.

export const S = 1; // design scale used by the generator's distance constants
export const WORLD = { w: 2600, h: 2112 };

// The sea fills the south-west corner, beyond this line (drawn west to south).
export const COAST = [
  [-40, 1150], [60, 1180], [150, 1196], [240, 1240], [312, 1262], [372, 1300], [446, 1330],
  [520, 1372], [586, 1410], [604, 1432], [578, 1462], [534, 1500], [520, 1544], [560, 1592],
  [626, 1636], [700, 1690], [760, 1736], [812, 1790], [862, 1846], [902, 1904], [946, 1980],
  [996, 2060], [1050, 2160],
];

// Mountain and hill belts: polyline, half-width (km), peak height (m).
export const RANGES = [
  { name: 'Grey Fells', pts: [[260, 150], [520, 150], [760, 130], [1100, 118], [1460, 140], [1880, 108], [2300, 60], [2640, 40]], w: 120, h: 2700 },
  { name: 'Halveth Dales', pts: [[760, 380], [900, 410], [1060, 396], [1200, 360]], w: 85, h: 760 },
  { name: 'Kesten Mountains', pts: [[1570, 360], [1470, 500], [1400, 640], [1360, 790]], w: 95, h: 3200 },
  { name: 'Varsenne Heights', pts: [[1960, 240], [2040, 600], [2000, 950], [2080, 1260], [2200, 1500]], w: 120, h: 2500 },
  { name: 'Ostrey Uplands', pts: [[1600, 640], [1700, 780], [1740, 880]], w: 85, h: 1050 },
  { name: 'Mirova Hills', pts: [[1680, 1500], [1880, 1580], [2120, 1720], [2400, 1800]], w: 110, h: 1500 },
  { name: 'Lumiria Highlands', pts: [[400, 420], [470, 560], [490, 720]], w: 80, h: 1250 },
  { name: 'Brenn Range', pts: [[140, 360], [210, 560], [200, 820], [250, 1060]], w: 90, h: 2000 },
  { name: 'Carrow Ridge', pts: [[950, 1300], [1100, 1360], [1250, 1330]], w: 60, h: 650 },
  { name: 'Alcoran Sierra', pts: [[1040, 2010], [1300, 1990], [1560, 2050], [1900, 2080]], w: 110, h: 2300 },
  { name: 'Corvenne Downs', pts: [[420, 1150], [540, 1240], [640, 1290]], w: 60, h: 420 },
];

// Canon rivers, carved into the terrain before drainage so the water follows them.
// source -> mouth. `into` names the river it joins (its mouth then sits on that river).
export const RIVERS = [
  { id: 'halve', name: 'Halve', pts: [[1010, 250], [980, 330], [930, 420], [900, 520], [870, 640], [836, 740], [800, 840], [764, 950], [730, 1040], [706, 1110], [672, 1220], [640, 1320], [600, 1426]], src: 620 },
  { id: 'auren', name: 'Auren', into: 'halve', pts: [[1520, 820], [1400, 846], [1260, 884], [1120, 916], [1000, 934], [900, 962], [810, 992], [748, 1010]], src: 520 },
  { id: 'ireyn', name: 'Ireyn', pts: [[1560, 910], [1630, 968], [1700, 1012], [1790, 1040], [1880, 1058], [1960, 1072], [2100, 1110], [2300, 1150], [2640, 1180]], src: 560 },
];

// Esteloria's outline, clockwise, from the sea west of the coast round to the sea
// south of it. Rounded and roughened by the generator. Lobes and corridors are the
// marks of old annexations: Lumiria in the north-west, the Kestmark corridor into
// the north-east fells, the southern salient; Norrhald, Varsenne and Mirova cut in.
export const OUTLINE = [
  [280, 1320], [240, 1150], [300, 1050], [220, 960], [160, 860], [120, 760], [90, 640], [140, 540], [60, 525], [12, 478], [44, 436], [110, 430],
  [170, 330], [260, 270], [340, 300], [420, 240], [480, 300], [540, 390], [600, 410], [650, 330], [700, 250], [780, 190],
  [880, 230], [960, 180], [1040, 230], [1110, 300], [1200, 330], [1300, 290], [1380, 330], [1470, 280],
  [1540, 180], [1600, 90], [1690, 40], [1760, 70], [1740, 160], [1700, 240], [1720, 330], [1800, 380],
  [1900, 350], [1990, 400], [2030, 500], [1990, 600], [1920, 640], [1800, 650], [1710, 700], [1730, 770], [1810, 800],
  [1920, 830], [2010, 880], [2080, 960], [2060, 1050], [1990, 1100], [2030, 1180], [1960, 1250], [1900, 1340],
  [1820, 1400], [1720, 1390], [1640, 1420], [1600, 1490], [1700, 1540], [1640, 1620], [1560, 1660], [1500, 1760], [1480, 1880],
  [1420, 1960], [1340, 1990], [1280, 1920], [1270, 1820], [1180, 1790], [1090, 1840], [1000, 1880], [930, 1860],
  [860, 1970],
];

// Short lines that split the land outside Esteloria between the neighbours.
// Each starts on (or just inside) the outline and runs off the map.
export const SEPARATORS = {
  norbre: [[175, 335], [80, 300], [-40, 250]],
  norvar: [[1700, 45], [1712, -10], [1730, -60]],
  varmir: [[2028, 1182], [2200, 1250], [2400, 1290], [2660, 1340]],
  miralc: [[1385, 1980], [1395, 2060], [1410, 2170]],
};

export const COUNTRIES = [
  { id: 'est', name: 'Esteloria', label: [1080, 760] },
  { id: 'nor', name: 'Norrhald', label: [1100, 110], lang: 'nor', seed: [1000, 30] },
  { id: 'var', name: 'Varsenne', label: [2200, 700], lang: 'var', seed: [2400, 600] },
  { id: 'mir', name: 'Mirova', label: [1900, 1560], lang: 'mir', seed: [2300, 1700] },
  { id: 'alc', name: 'Alcora', label: [1150, 2000], lang: 'alc', seed: [1100, 2080] },
  { id: 'bre', name: 'Brennland', label: [70, 900], lang: 'bre', seed: [30, 800] },
];

export const SEAS = [
  { name: 'Western Sea', label: [260, 1640], size: 3 },
  { name: 'Gulf of Corvenne', label: [470, 1420], size: 2 },
];
