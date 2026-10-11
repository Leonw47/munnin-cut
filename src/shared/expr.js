// Interpretador mínimo de expressões no formato do FFmpeg (av_expr).
// Permite escrever uma curva de movimento uma única vez: a string vai direto para o filtro
// do FFmpeg e a mesma string é avaliada aqui para desenhar a prévia.
//
// Suporta: números, variáveis, + - * / ^, parênteses, e as funções
// sin cos tan abs exp sqrt pow min max clip if lt gt lte gte eq mod floor ceil, e PI.

const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, abs: Math.abs, exp: Math.exp, sqrt: Math.sqrt,
  pow: Math.pow, min: Math.min, max: Math.max, floor: Math.floor, ceil: Math.ceil,
  clip: (x, a, b) => (x < a ? a : x > b ? b : x),
  if: (c, a, b = 0) => (c ? a : b),
  lt: (a, b) => (a < b ? 1 : 0), gt: (a, b) => (a > b ? 1 : 0),
  lte: (a, b) => (a <= b ? 1 : 0), gte: (a, b) => (a >= b ? 1 : 0), eq: (a, b) => (a === b ? 1 : 0),
  mod: (a, b) => a - b * Math.floor(a / b),
};
const CONSTS = { PI: Math.PI, E: Math.E };

function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
      out.push({ t: 'n', v: parseFloat(m[0]) });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
      out.push({ t: 'id', v: m[0] });
      i += m[0].length;
    } else if ('+-*/^(),'.includes(c)) { out.push({ t: c }); i++; }
    else throw new Error(`caractere inesperado "${c}" em: ${src}`);
  }
  return out;
}

// Compila a expressão numa função (vars) => número.
export function compile(src) {
  const tk = tokenize(src);
  let p = 0;
  const peek = () => tk[p];
  const eat = (t) => { if (!tk[p] || tk[p].t !== t) throw new Error(`esperado "${t}" em: ${src}`); return tk[p++]; };
  function expr() {
    let a = term();
    while (peek() && (peek().t === '+' || peek().t === '-')) {
      const op = tk[p++].t, l = a, r = term();
      a = op === '+' ? (v) => l(v) + r(v) : (v) => l(v) - r(v);
    }
    return a;
  }
  function term() {
    let a = unary();
    while (peek() && (peek().t === '*' || peek().t === '/')) {
      const op = tk[p++].t, l = a, r = unary();
      a = op === '*' ? (v) => l(v) * r(v) : (v) => l(v) / r(v);
    }
    return a;
  }
  function unary() {
    if (peek() && peek().t === '-') { p++; const a = unary(); return (v) => -a(v); }
    if (peek() && peek().t === '+') { p++; return unary(); }
    return power();
  }
  function power() {
    const a = primary();
    if (peek() && peek().t === '^') { p++; const b = unary(); return (v) => Math.pow(a(v), b(v)); }
    return a;
  }
  function primary() {
    const t = tk[p++];
    if (!t) throw new Error(`fim inesperado em: ${src}`);
    if (t.t === 'n') return () => t.v;
    if (t.t === '(') { const a = expr(); eat(')'); return a; }
    if (t.t === 'id') {
      if (peek() && peek().t === '(') {
        p++;
        const args = [];
        if (peek().t !== ')') { args.push(expr()); while (peek().t === ',') { p++; args.push(expr()); } }
        eat(')');
        const f = FUNCS[t.v];
        if (!f) throw new Error(`função desconhecida ${t.v}`);
        return (v) => f(...args.map((g) => g(v)));
      }
      if (t.v in CONSTS) return () => CONSTS[t.v];
      const name = t.v;
      return (v) => v[name] ?? 0;
    }
    throw new Error(`token inesperado em: ${src}`);
  }
  const fn = expr();
  if (p !== tk.length) throw new Error(`sobra no fim da expressão: ${src}`);
  return fn;
}

const cache = new Map();
export function evalExpr(src, vars) {
  let f = cache.get(src);
  if (!f) { f = compile(src); cache.set(src, f); }
  return f(vars);
}

// Troca uma variável (nome inteiro) por outra expressão, para gerar a versão do FFmpeg.
export function substVar(src, name, repl) {
  return src.replace(new RegExp(`\\b${name}\\b`, 'g'), `(${repl})`);
}
