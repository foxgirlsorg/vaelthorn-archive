// Businesses: continental chains, national chains, regional chains that trade only in
// one or two provinces (old realms keep their own firms), and the rules for naming the
// independent shops, pubs and cafés that make up most of every town.

export const CHAINS = [
  // continental: in Esteloria and its neighbours
  { id: 'aster', name: 'Aster', type: 'fuel', scope: 'continental', note: 'Fuel stations in 11 countries', web: 'aster-energy.com', w: 3 },
  { id: 'brava', name: 'Brava Coffee', type: 'cafe', scope: 'continental', note: 'Coffee houses in 9 countries', web: 'bravacoffee.com', w: 2, minPop: 20000 },
  { id: 'kalder', name: 'Kalder Hotel', type: 'hotel', scope: 'continental', note: 'Hotels in 14 countries', web: 'kalderhotels.com', w: 2, minPop: 40000 },
  { id: 'marelli', name: 'Marelli', type: 'supermarket', scope: 'continental', note: 'Supermarkets in 7 countries', web: 'marelli.com', w: 2, minPop: 8000 },
  { id: 'halcyon', name: 'Halcyon Bank', type: 'bank', scope: 'continental', note: 'Banking in 12 countries', web: 'halcyonbank.com', w: 1.5, minPop: 30000 },
  { id: 'valumax', name: 'ValuMax', type: 'hypermarket', scope: 'continental', note: 'Hypermarkets in 8 countries', web: 'valumax.com', w: 3, minPop: 10000 },
  { id: 'pickgo', name: 'Pick & Go', type: 'convenience', scope: 'continental', note: 'Convenience stores in 6 countries', web: 'pickandgo.com', w: 2, minPop: 3000 },
  // national (Esteloria)
  { id: 'estmart', name: 'Estmart', type: 'supermarket', scope: 'national', country: 'est', note: '1,240 stores across Esteloria', web: 'estmart.est', w: 5, minPop: 1500 },
  { id: 'estmega', name: 'Estmart Mega', type: 'hypermarket', scope: 'national', country: 'est', note: 'Out-of-town hypermarkets across Esteloria', web: 'estmart.est', w: 4, minPop: 10000 },
  { id: 'corner24', name: 'Corner 24', type: 'convenience', scope: 'national', country: 'est', note: 'Convenience stores open late across Esteloria', web: 'corner24.est', w: 4, minPop: 800 },
  { id: 'post', name: 'Republic Post', type: 'post', scope: 'national', country: 'est', note: '2,900 post offices across Esteloria', web: 'post.est', w: 6 },
  { id: 'civic', name: 'Civic Pharmacy', type: 'pharmacy', scope: 'national', country: 'est', note: '860 pharmacies across Esteloria', web: 'civicpharmacy.est', w: 4, minPop: 2000 },
  { id: 'fernley', name: "Fernley's", type: 'bakery', scope: 'national', country: 'est', note: '410 bakeries across Esteloria', web: 'fernleys.est', w: 2, minPop: 5000 },
  { id: 'bramble', name: 'Bramble Books', type: 'books', scope: 'national', country: 'est', note: '120 bookshops across Esteloria', web: 'bramblebooks.est', w: 2, minPop: 40000 },
  { id: 'halverts', name: "Halvert's", type: 'department', scope: 'national', country: 'est', note: 'Department stores in 38 Estelorian cities', web: 'halverts.est', w: 3, minPop: 80000 },
  { id: 'kestrel', name: 'Kestrel Hardware', type: 'hardware', scope: 'national', country: 'est', note: '300 stores across Esteloria', web: 'kestrelhardware.est', w: 2, minPop: 6000 },
  { id: 'nsb', name: 'National Savings Bank', type: 'bank', scope: 'national', country: 'est', note: '650 branches across Esteloria', web: 'nsb.est', w: 4, minPop: 4000 },
  { id: 'crown', name: 'Crown Cinemas', type: 'cinema', scope: 'national', country: 'est', note: '64 cinemas across Esteloria', web: 'crowncinemas.est', w: 3, minPop: 40000 },
  { id: 'tollway', name: 'Tollway Diner', type: 'restaurant', scope: 'national', country: 'est', note: '90 roadside diners across Esteloria', web: 'tollway.est', w: 1, minPop: 5000 },
  // regional: trade only in one or two provinces
  { id: 'dalescoop', name: 'Dales Co-operative', type: 'supermarket', scope: 'regional', provinces: ['Northern Dales'], note: 'Only in the Northern Dales', w: 6 },
  { id: 'corvsav', name: 'Corvenne Savings Bank', type: 'bank', scope: 'regional', provinces: ['Corvenne', 'Lower Halve'], note: 'Only in Corvenne and Lower Halve', w: 5 },
  { id: 'lumbake', name: 'Lumiria Bakehouse', type: 'bakery', scope: 'regional', provinces: ['Lumiria', 'Westmarch'], note: 'Only in Lumiria and Westmarch', w: 6 },
  { id: 'kestout', name: 'Kestmark Outfitters', type: 'outdoor', scope: 'regional', provinces: ['Kestmark'], note: 'Only in Kestmark', w: 5 },
  { id: 'arddairy', name: 'Ardmere Dairies', type: 'convenience', scope: 'regional', provinces: ['Ardmere'], note: 'Only in Ardmere', w: 6 },
  { id: 'southern', name: 'Southern Reach Stores', type: 'supermarket', scope: 'regional', provinces: ['Southern Reach', 'Duncarrow'], note: 'Only in Southern Reach and Duncarrow', w: 6 },
  { id: 'capcafe', name: 'Capital Café', type: 'cafe', scope: 'regional', provinces: ['Aurenhal Capital District'], note: 'Only in the capital', w: 5 },
  { id: 'halvewine', name: 'Halve Valley Wines', type: 'wine', scope: 'regional', provinces: ['Lower Halve', 'Corvenne'], note: 'Only along the lower Halve', w: 4 },
  { id: 'eastmarket', name: "Eastern Farmers' Market", type: 'supermarket', scope: 'regional', provinces: ['Eastern Province'], note: 'Only in the Eastern Province', w: 6 },
  { id: 'midmill', name: 'Midmarch Mills', type: 'bakery', scope: 'regional', provinces: ['Midmarch'], note: 'Only in Midmarch', w: 6 },
  { id: 'westales', name: 'Westmarch Ales', type: 'pub', scope: 'regional', provinces: ['Westmarch'], note: 'Pubs only in Westmarch', w: 5 },
  // the neighbours' own national chains
  { id: 'marchedore', name: 'Marché Doré', type: 'supermarket', scope: 'national', country: 'var', note: 'Supermarkets across Varsenne', w: 6 },
  { id: 'banquevar', name: 'Banque de Varsenne', type: 'bank', scope: 'national', country: 'var', note: 'Banking across Varsenne', w: 5 },
  { id: 'fjellkjop', name: 'Fjellkjøp', type: 'supermarket', scope: 'national', country: 'nor', note: 'Supermarkets across Norrhald', w: 6 },
  { id: 'dobra', name: 'Dobra Market', type: 'supermarket', scope: 'national', country: 'mir', note: 'Supermarkets across Mirova', w: 6 },
  { id: 'mercsol', name: 'Mercado Sol', type: 'supermarket', scope: 'national', country: 'alc', note: 'Supermarkets across Alcora', w: 6 },
  { id: 'bergkauf', name: 'Bergkauf', type: 'supermarket', scope: 'national', country: 'bre', note: 'Supermarkets across Brennland', w: 6 },
];

// what each kind of place is, for icons, colours, chips and hours
export const TYPES = {
  restaurant: { label: 'Restaurant', cat: 'food', icon: 'restaurant', hours: [[12, 0], [22, 30]] },
  cafe: { label: 'Café', cat: 'food', icon: 'cafe', hours: [[7, 30], [18, 0]] },
  pub: { label: 'Pub', cat: 'food', icon: 'pub', hours: [[11, 0], [23, 0]] },
  bakery: { label: 'Bakery', cat: 'food', icon: 'bakery', hours: [[6, 30], [17, 0]] },
  supermarket: { label: 'Supermarket', cat: 'grocery', icon: 'cart', hours: [[8, 0], [21, 0]] },
  hypermarket: { label: 'Hypermarket', cat: 'grocery', icon: 'cart', hours: [[8, 0], [22, 0]] },
  convenience: { label: 'Convenience store', cat: 'grocery', icon: 'cart', hours: [[7, 0], [23, 0]] },
  butcher: { label: 'Butcher', cat: 'grocery', icon: 'cart', hours: [[8, 0], [17, 30]] },
  greengrocer: { label: 'Greengrocer', cat: 'grocery', icon: 'cart', hours: [[8, 0], [18, 0]] },
  clothes: { label: 'Clothing store', cat: 'shop', icon: 'shop', hours: [[9, 30], [18, 0]] },
  books: { label: 'Bookshop', cat: 'shop', icon: 'shop', hours: [[9, 0], [18, 30]] },
  hardware: { label: 'Hardware store', cat: 'shop', icon: 'shop', hours: [[8, 0], [18, 0]] },
  jeweller: { label: 'Jeweller', cat: 'shop', icon: 'shop', hours: [[10, 0], [18, 0]] },
  florist: { label: 'Florist', cat: 'shop', icon: 'shop', hours: [[8, 30], [17, 30]] },
  department: { label: 'Department store', cat: 'shop', icon: 'shop', hours: [[9, 30], [20, 0]] },
  outdoor: { label: 'Outdoor equipment', cat: 'shop', icon: 'shop', hours: [[9, 0], [18, 0]] },
  wine: { label: 'Wine merchant', cat: 'shop', icon: 'shop', hours: [[10, 0], [19, 0]] },
  newsagent: { label: 'Newsagent', cat: 'shop', icon: 'shop', hours: [[6, 0], [19, 0]] },
  pharmacy: { label: 'Pharmacy', cat: 'health', icon: 'pharmacy', hours: [[8, 30], [19, 0]] },
  doctor: { label: 'Doctor', cat: 'health', icon: 'doctor', hours: [[8, 0], [18, 0]], weekdays: true },
  dentist: { label: 'Dentist', cat: 'health', icon: 'doctor', hours: [[8, 30], [17, 30]], weekdays: true },
  hospital: { label: 'Hospital', cat: 'health', icon: 'hospital', open24: true },
  school: { label: 'School', cat: 'education', icon: 'school', hours: [[8, 0], [16, 0]], weekdays: true },
  library: { label: 'Library', cat: 'education', icon: 'library', hours: [[10, 0], [19, 0]] },
  bank: { label: 'Bank', cat: 'money', icon: 'bank', hours: [[9, 0], [16, 30]], weekdays: true },
  post: { label: 'Post office', cat: 'money', icon: 'post', hours: [[9, 0], [17, 30]] },
  fuel: { label: 'Fuel station', cat: 'fuel', icon: 'fuel', hours: [[6, 0], [22, 0]] },
  hotel: { label: 'Hotel', cat: 'hotel', icon: 'hotel', open24: true },
  church: { label: 'Church', cat: 'worship', icon: 'church', hours: [[8, 0], [19, 0]] },
  townhall: { label: 'Town hall', cat: 'civic', icon: 'townhall', hours: [[9, 0], [17, 0]], weekdays: true },
  police: { label: 'Police station', cat: 'civic', icon: 'police', open24: true },
  fire: { label: 'Fire station', cat: 'civic', icon: 'fire', open24: true },
  museum: { label: 'Museum', cat: 'culture', icon: 'museum', hours: [[10, 0], [17, 0]] },
  cinema: { label: 'Cinema', cat: 'culture', icon: 'cinema', hours: [[13, 0], [23, 30]] },
  sports: { label: 'Sports centre', cat: 'leisure', icon: 'sports', hours: [[7, 0], [22, 0]] },
};

export const CAT_COLOR = {
  food: '#e8710a', grocery: '#1a73e8', shop: '#3c78d8', health: '#d93025', education: '#8d6e63', money: '#5f6368',
  fuel: '#607d8b', hotel: '#c2185b', worship: '#7b7f85', civic: '#5f6368', culture: '#0f9d8a', leisure: '#34a853',
};

// how often each kind appears, by how dense the street is
export const MIX = {
  core: { cafe: 14, restaurant: 14, pub: 8, bakery: 6, clothes: 8, books: 3, jeweller: 3, florist: 2, newsagent: 3, hardware: 2, department: 1.5, convenience: 4, pharmacy: 5, bank: 5, post: 1.5, doctor: 2, dentist: 1.5, hotel: 4, museum: 1, library: 0.8, cinema: 0.7, police: 0.3, butcher: 1.5, greengrocer: 1.5, wine: 1 },
  urban: { supermarket: 6, convenience: 4, clothes: 4, hardware: 2, cafe: 6, restaurant: 8, pub: 6, bakery: 4, pharmacy: 4, doctor: 3, dentist: 2, school: 3, bank: 2, post: 1, fuel: 2, hotel: 1, church: 1.5, butcher: 1.5, greengrocer: 1.5, newsagent: 2, sports: 0.8, fire: 0.3, library: 0.5 },
  suburb: { supermarket: 3, convenience: 2, school: 4, fuel: 4, pub: 3, cafe: 1.5, restaurant: 2, bakery: 2, doctor: 2, church: 2, pharmacy: 1.5, sports: 1, hardware: 1 },
};

const SUR = ['Abbott', 'Barlow', 'Calloway', 'Dunmore', 'Ellery', 'Farrow', 'Gilmore', 'Hartley', 'Inglis', 'Jessop', 'Kendrick', 'Lowther', 'Merriman', 'Norbury', 'Ogden', 'Pryor', 'Quarles', 'Radley', 'Stannard', 'Thackery', 'Underhill', 'Varley', 'Whitlock', 'Yeoman', 'Ashdown', 'Blackwood', 'Cotterill', 'Denholm', 'Elwood', 'Fairbairn', 'Grimshaw', 'Ingram', 'Jarvis', 'Kingsley', 'Lister', 'Mallory', 'Nettleship', 'Pettigrew', 'Rawlings', 'Sutcliffe', 'Tennant', 'Upton', 'Vickers', 'Wainwright', 'Aldridge', 'Bramley', 'Cartwright', 'Dawlish', 'Emmerson', 'Fenwick', 'Garside', 'Hepworth', 'Ibbotson', 'Jowett', 'Kershaw', 'Lumb', 'Moxon', 'Naylor', 'Oddie', 'Pickles', 'Ramsden', 'Shackleton', 'Tetley', 'Uttley', 'Verity', 'Whiteley', 'Archer', 'Bellamy', 'Crofton', 'Darby', 'Eastwood', 'Fawcett', 'Goodall', 'Hebden', 'Ilsley', 'Keighley'];
const SAINTS = ['Brannoc', 'Cuthbert', 'Bede', 'Chad', 'Wilfrid', 'Mungo', 'Petroc', 'Piran', 'Columba', 'Aidan', 'Kenelm', 'Botolph', 'Dunstan', 'Swithun', 'Ethelburga', 'Frideswide', 'Werburgh', 'Elgiva', 'Germoe', 'Tudno', 'Melor', 'Margaret', 'Michael', 'Mary', 'Nicholas', 'Peter', 'Andrew', 'James', 'John', 'Luke', 'Lawrence', 'Giles', 'Leonard', 'Helen', 'Catherine'];
const PUB_A = ['Red', 'White', 'Black', 'Golden', 'Green', 'Blue', 'Old', 'Royal', 'Jolly', 'Three', 'Two', 'Silver', 'Grey', 'Crooked', 'Merry', 'Dun'];
const PUB_B = ['Lion', 'Hart', 'Swan', 'Bell', 'Crown', 'Anchor', 'Plough', 'Wheatsheaf', 'Fleece', 'Boar', 'Stag', 'Horse', 'Bull', 'Ship', 'Fox', 'Hound', 'Oak', 'Rose', 'Star', 'Lamb', 'Ram', 'Cockerel', 'Barrel', 'Keys', 'Mitre', 'Harrier', 'Otter', 'Heron', 'Lantern', 'Wagon'];
const WORDS = ['Juniper', 'Larch', 'Meadow', 'Saffron', 'Clover', 'Bramblewood', 'Copper', 'Linden', 'Hearth', 'Millstone', 'Lark', 'Thistle', 'Amber', 'Willow', 'Fennel', 'Sorrel', 'Quince', 'Tansy', 'Marigold', 'Nutmeg', 'Rosemary', 'Birch', 'Hazel', 'Ivy', 'Pepper', 'Rye', 'Barley', 'Honey', 'Damson', 'Elder'];
const CUISINE = [['Estelorian', ''], ['Varsennais', 'Le '], ['Mirovan', 'Dom '], ['Alcoran', 'Casa '], ['Norrish', ''], ['Brennish', 'Zum ']];

const pick = (a, r) => a[Math.floor(r * a.length) % a.length];

// a name for an independent business of `type` in `town`
export function localName(type, town, street, R) {
  const s = pick(SUR, R(1)), w = pick(WORDS.filter((x) => x !== 'Sorrel'), R(2)), r = R(3);
  // the street without its kind ('Granary Road' -> 'Granary'), for names taken from the street
  const stem = street.replace(/ (Street|Road|Lane|Way|Walk|Row|Gate|Place|Yard|Close|Terrace|Drive|Mews|Passage|Grove|Gardens|Hill|Square|Avenue|Crescent)$/, '');
  const r2 = R(10);
  switch (type) {
    case 'pub': return `The ${pick(PUB_A, R(4))} ${pick(PUB_B, R(5))}${r < 0.25 ? ' Inn' : r < 0.4 ? ' Arms' : ''}`;
    case 'cafe': if (r2 < 0.3) return pick([`${stem} Coffee`, `${stem} Espresso Bar`, `Café on ${street}`, `${stem} Roasters`], R(11));
      return r < 0.35 ? `${s}'s Café` : r < 0.65 ? `Café ${w}` : r < 0.85 ? `The ${w} Coffee House` : `${w} Tea Rooms`;
    case 'restaurant': {
      const [c, pre] = pick(CUISINE, R(6));
      if (r2 < 0.3) return pick([`${stem} Kitchen`, `${stem} Brasserie`, `${pre}${stem}`.trim() + (pre ? '' : ' Grill'), `No. ${1 + Math.floor(R(12) * 90)} ${street}`], R(11));
      return r < 0.3 ? `${s}'s Kitchen` : r < 0.55 ? `The ${w} Bistro` : r < 0.75 ? `${pre}${w}`.trim() + (pre ? '' : ' Grill') : `${w} House`;
    }
    case 'bakery': if (r2 < 0.3) return `${stem} Bakery`;
      return r < 0.5 ? `${s}'s Bakery` : r < 0.8 ? `${town} Bakehouse` : `The ${w} Loaf`;
    case 'butcher': return `${s} Butchers`;
    case 'greengrocer': return `${s}'s Greengrocer`;
    case 'clothes': if (r2 < 0.3) return pick([`${stem} Boutique`, `${s} Tailoring`, `${w} & ${pick(WORDS, R(13))}`], R(11));
      return r < 0.5 ? `${s} & Daughters` : `${w} Outfitters`;
    case 'books': return r < 0.5 ? `${w} Books` : `${s}'s Bookshop`;
    case 'hardware': return `${s} Hardware`;
    case 'jeweller': return `${s} Jewellers`;
    case 'florist': return `${w} Flowers`;
    case 'newsagent': return r < 0.5 ? `${town} News` : `${s}'s Newsagent`;
    case 'supermarket': return `${s}'s Grocery`;
    case 'convenience': return `${s}'s Corner Shop`;
    case 'pharmacy': return `${s} Pharmacy`;
    case 'hospital': return r < 0.55 ? `${town} General Hospital` : r < 0.8 ? `St. ${pick(SAINTS, R(7))}'s Hospital` : `${town} Infirmary`;
    case 'doctor': return r < 0.5 ? `${town} Health Centre` : `${street} Surgery`;
    case 'dentist': return `${street} Dental Practice`;
    case 'school': return r < 0.35 ? `${town} Primary School` : r < 0.6 ? `St. ${pick(SAINTS, R(7))}'s School` : r < 0.8 ? `${street} School` : `${town} Grammar School`;
    case 'library': return `${town} Library`;
    case 'bank': return `${town} Credit Union`;
    case 'post': return `${town} Post Office`;
    case 'fuel': return `${s}'s Garage`;
    case 'hotel': return r < 0.4 ? `Hotel ${town}` : r < 0.7 ? `The ${town} Arms` : `${w} Lodge`;
    case 'church': return r < 0.6 ? `St. ${pick(SAINTS, R(7))}'s Church` : r < 0.85 ? `Church of St. ${pick(SAINTS, R(8))}` : `${town} Chapel`;
    case 'townhall': return `${town} Town Hall`;
    case 'police': return `${town} Police Station`;
    case 'fire': return `${town} Fire Station`;
    case 'museum': return r < 0.5 ? `${town} Museum` : `Museum of ${pick(['the Dales', 'Rail', 'Weaving', 'the River', 'Local History', 'Clocks', 'Printing', 'Mining'], R(9))}`;
    case 'cinema': return `The ${w} Picture House`;
    case 'sports': return `${town} Sports Centre`;
    default: return `${s}'s`;
  }
}
