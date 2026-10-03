// Place-name generator, one style per country. Deterministic from the seed.
import { rng } from './noise.mjs';

const STYLES = {
  est: {
    pre: ['Ald', 'Ash', 'Bar', 'Bex', 'Brack', 'Bram', 'Bran', 'Brin', 'Cal', 'Carr', 'Chell', 'Cold', 'Corr', 'Crow', 'Dray', 'Dun', 'Eld', 'Elm', 'Fair', 'Fen', 'Ferr', 'Gal', 'Gil', 'Glen', 'Hail', 'Har', 'Hart', 'Hen', 'Hob', 'Hol', 'Iron', 'Ivy', 'Kel', 'Kest', 'Kirk', 'Lang', 'Lark', 'Lea', 'Lind', 'Mal', 'Mar', 'Mill', 'Moor', 'Nor', 'Oak', 'Orm', 'Pen', 'Quen', 'Rath', 'Raven', 'Red', 'Rook', 'Rush', 'Salt', 'Sand', 'Sel', 'Stan', 'Stone', 'Strat', 'Tarn', 'Thorp', 'Tod', 'Ul', 'Vell', 'Wen', 'West', 'Whit', 'Wold', 'Yar', 'Brey', 'Cad', 'Dew', 'Elder', 'Farl', 'Gorse', 'Hay', 'Kyle', 'Lam', 'Mew', 'Nash', 'Ock', 'Pip', 'Rid', 'Sow', 'Tad', 'Wad', 'Cran', 'Ebb', 'Fox', 'Gran', 'Heath', 'Laver', 'Marl', 'Shep', 'Sedge', 'Thurl', 'Wil', 'Breck', 'Cleve', 'Derr', 'Esk', 'Frith', 'Garth', 'Hask', 'Ings', 'Kell', 'Loft', 'Mosk', 'Nab', 'Pick', 'Ross', 'Skel', 'Stav', 'Toll', 'Upp', 'Wray'],
    suf: ['by', 'ford', 'ley', 'ton', 'ham', 'wick', 'mere', 'dale', 'holt', 'stead', 'combe', 'worth', 'field', 'well', 'brook', 'bridge', 'gate', 'moor', 'hurst', 'thorpe', 'den', 'ing', 'wood', 'cott', 'bury', 'stow', 'side', 'more', 'well', 'thwaite', 'ness', 'low', 'hope', 'shaw', 'ridge', 'cliffe', 'over', 'leigh', 'field', 'ton', 'ley', 'by'],
    two: [['Upper ', ''], ['Lower ', ''], ['Little ', ''], ['', ' Cross'], ['', ' Green'], ['', ' End'], ['Great ', ''], ['', ' Heath'], ['', ' Abbey'], ['St. ', "'s"]],
    coastal: ['mouth', 'haven', 'sea', 'port', 'ness'],
  },
  nor: {
    pre: ['Ås', 'Bjørk', 'Hals', 'Kvit', 'Sol', 'Ul', 'Vest', 'Nord', 'Rød', 'Lang', 'Fjell', 'Grå', 'Sand', 'Ek', 'Tor', 'Hav', 'Stor', 'Lill', 'Ber', 'Hol', 'Skog', 'Vass', 'Rog', 'Eid', 'Mo', 'Ørn', 'Brek', 'Djup', 'Kal', 'Sel', 'Tjern', 'Vik', 'Os', 'Hamar', 'Rus'],
    suf: ['vik', 'heim', 'by', 'dal', 'stad', 'holm', 'sund', 'ås', 'nes', 'berg', 'rud', 'vang', 'set', 'mo', 'li', 'myr', 'fjord', 'haug', 'sæter', 'land'],
    two: [['Øvre ', ''], ['Nedre ', ''], ['', ' Bru']],
  },
  var: {
    pre: ['Mont', 'Beau', 'Clair', 'Val', 'Ver', 'Roc', 'Bel', 'Fon', 'Mar', 'Sen', 'Lur', 'Cour', 'Aub', 'Vill', 'Bois', 'Cham', 'Lan', 'Pré', 'Gran', 'Mir', 'Sau', 'Tour', 'Var', 'Esp', 'Cast', 'Lav', 'Riv', 'Font'],
    suf: ['ac', 'ville', 'court', 'mont', 'ières', 'elle', 'ais', 'enne', 'ay', 'ignac', 'oux', 'ans', 'eil', 'erre', 'ange', 'ard', 'ier', 'aine', 'ot', 'ès'],
    two: [['Saint-', ''], ['', '-sur-Ireyn'], ['La ', ''], ['', '-le-Haut'], ['Bourg-', '']],
  },
  mir: {
    pre: ['Bel', 'Mir', 'Star', 'Nov', 'Kras', 'Vel', 'Dobr', 'Lip', 'Brez', 'Gor', 'Zar', 'Slav', 'Rad', 'Bor', 'Dub', 'Hrad', 'Kam', 'Les', 'Mok', 'Pol', 'Rus', 'Sok', 'Topol', 'Vrb', 'Zlat', 'Jas', 'Kos'],
    suf: ['ovo', 'ice', 'ska', 'grad', 'in', 'ec', 'ava', 'any', 'ov', 'ina', 'nik', 'ovac', 'ište', 'ane', 'ow', 'iny'],
    two: [['Stara ', ''], ['Nova ', ''], ['Gornja ', ''], ['Donja ', '']],
  },
  alc: {
    pre: ['Val', 'Alca', 'Cas', 'Mon', 'Torr', 'Ber', 'Med', 'Sal', 'Al', 'Ram', 'Lor', 'Pal', 'Fuen', 'Esc', 'Bel', 'Cor', 'Mar', 'Oli', 'Ter', 'Vill', 'Agu', 'Car', 'Hin', 'Mora'],
    suf: ['ejo', 'al', 'illa', 'osa', 'ares', 'ena', 'ón', 'eda', 'ilo', 'era', 'ino', 'uela', 'ar', 'ago', 'ete', 'ia', 'anca', 'ado'],
    two: [['San ', ''], ['Santa ', ''], ['Villa', ''], ['', ' del Monte'], ['', ' de la Sierra']],
  },
  bre: {
    pre: ['Alt', 'Neu', 'Ober', 'Kalt', 'Roth', 'Weiß', 'Brenn', 'Hoh', 'Lind', 'Eich', 'Stein', 'Wald', 'Mühl', 'Berg', 'Hag', 'Kirch', 'Lau', 'Mar', 'Rein', 'Schön', 'Tann', 'Wolf', 'Dorn', 'Grün', 'Hirsch'],
    suf: ['dorf', 'burg', 'hausen', 'stein', 'feld', 'wald', 'brück', 'heim', 'bach', 'au', 'berg', 'rode', 'stedt', 'hof', 'tal', 'ingen', 'weiler', 'kirchen'],
    two: [['Groß ', ''], ['Klein ', ''], ['Bad ', ''], ['', ' am See']],
  },
};

// Never generate a name that collides with canon operation code names or people.
const BLOCK = new Set(`firestep dryfall sallyport rampart salient gunmetal ashfall palehorse drover blackacre longknife boneset deadfall gravelight coldiron pitchfork harrow nettle marrow hangfire glacis defilade revetment haywire vespers palisade woodwight meridian emberwell lantern misfire ossuary scorchline ashgrove lychgate saltmarsh millrace drawdown hollow thornfall aurenhal corvenne halveth merrowgate duncarrow ostrey ireyn stenhollow blackmere thornholt etharion lumiria wren sorrel orr frey`.split(' '));

export function makeNamer(seed) {
  const r = rng(seed);
  const used = new Set();
  const pick = (a) => a[Math.floor(r() * a.length)];
  function base(st, coastal) {
    let p = pick(st.pre), s = coastal && st.coastal && r() < 0.5 ? pick(st.coastal) : pick(st.suf);
    // avoid doubled letters across the join that read badly (e.g. "Kirkk")
    if (p[p.length - 1] === s[0] && p.length > 2) p = p.slice(0, -1);
    return p + s;
  }
  return function name(lang = 'est', { coastal = false, allowTwo = true } = {}) {
    const st = STYLES[lang] || STYLES.est;
    for (let tries = 0; tries < 200; tries++) {
      let n = base(st, coastal);
      if (allowTwo && st.two && r() < 0.09) {
        const [a, b] = pick(st.two);
        n = a + n + b;
      }
      const key = n.toLowerCase();
      if (used.has(key) || BLOCK.has(key)) continue;
      used.add(key);
      return n;
    }
    return base(st, coastal) + ' ' + Math.floor(r() * 90 + 10);
  };
}

export function reserveNames(namer, names) {
  // mark canon names as used so no generated place copies them
  for (const n of names) BLOCK.add(n.toLowerCase());
}
