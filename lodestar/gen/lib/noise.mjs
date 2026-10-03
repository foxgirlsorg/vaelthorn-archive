import { createNoise2D } from 'simplex-noise';
import alea from 'alea';

export function rng(seed) {
  return alea(seed);
}

export function makeNoise(seed) {
  const n = createNoise2D(alea(seed));
  const fbm = (x, y, oct = 5, lac = 2, gain = 0.5) => {
    let a = 1, f = 1, s = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      s += a * n(x * f, y * f);
      norm += a;
      a *= gain;
      f *= lac;
    }
    return s / norm;
  };
  const ridged = (x, y, oct = 5) => {
    let a = 1, f = 1, s = 0, norm = 0, w = 1;
    for (let i = 0; i < oct; i++) {
      let v = 1 - Math.abs(n(x * f, y * f));
      v *= v * w;
      w = Math.min(1, Math.max(0, v * 2));
      s += a * v;
      norm += a;
      a *= 0.5;
      f *= 2.1;
    }
    return s / norm;
  };
  return { n, fbm, ridged };
}
