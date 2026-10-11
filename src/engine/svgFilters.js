// Filtros SVG referenciados por ctx.filter = 'url(#id)' — matriz de cor (tint) e nitidez.
const NS = 'http://www.w3.org/2000/svg';

export class SvgFilters {
  constructor() {
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('width', '0');
    this.svg.setAttribute('height', '0');
    this.svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    this.defs = document.createElementNS(NS, 'defs');
    this.svg.appendChild(this.defs);
    document.body.appendChild(this.svg);
    this.ids = new Set();
  }

  add(id, build) {
    if (this.ids.has(id)) return id;
    const f = document.createElementNS(NS, 'filter');
    f.setAttribute('id', id);
    f.setAttribute('color-interpolation-filters', 'sRGB');
    f.setAttribute('x', '0');
    f.setAttribute('y', '0');
    f.setAttribute('width', '100%');
    f.setAttribute('height', '100%');
    build(f);
    this.defs.appendChild(f);
    this.ids.add(id);
    return id;
  }

  matrix(r, g, b) {
    const k = (x) => Math.round(x * 1000);
    return this.add(`cm_${k(r)}_${k(g)}_${k(b)}`, (f) => {
      const m = document.createElementNS(NS, 'feColorMatrix');
      m.setAttribute('type', 'matrix');
      m.setAttribute('values', `${r} 0 0 0 0  0 ${g} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`);
      f.appendChild(m);
    });
  }

  // após grayscale(1) (R=G=B=Y): R' = c1 + (c2 - c1)·Y em cada canal
  duotone(c1, c2) {
    const k = (x) => Math.round(x * 1000);
    return this.add(`duo_${c1.map(k).join('_')}_${c2.map(k).join('_')}`, (f) => {
      const m = document.createElementNS(NS, 'feColorMatrix');
      m.setAttribute('type', 'matrix');
      const row = (i) => `${c2[i] - c1[i]} 0 0 0 ${c1[i]}`;
      m.setAttribute('values', `${row(0)}  ${row(1)}  ${row(2)}  0 0 0 1 0`);
      f.appendChild(m);
    });
  }

  kernel(a) {
    const v = Math.round(a * 100) / 100;
    return this.add(`sh_${Math.round(v * 100)}`, (f) => {
      const m = document.createElementNS(NS, 'feConvolveMatrix');
      m.setAttribute('order', '3');
      m.setAttribute('kernelMatrix', `0 ${-v} 0 ${-v} ${1 + 4 * v} ${-v} 0 ${-v} 0`);
      m.setAttribute('divisor', '1');
      m.setAttribute('preserveAlpha', 'true');
      m.setAttribute('edgeMode', 'duplicate');
      f.appendChild(m);
    });
  }
}

let shared = null;
export function sharedSvg() {
  if (!shared) shared = new SvgFilters();
  return shared;
}
