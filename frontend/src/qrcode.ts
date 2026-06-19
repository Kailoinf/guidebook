// QR 码生成器 —— 纯 TypeScript，0 依赖，输出 SVG data URL
// 基于 ISO/IEC 18004:2015，byte 模式，版本 1-10，纠错 M

// GF(2^8) exp/log 表，α=2，原始多项式 0x11D
const E = new Uint8Array(512), L = new Uint8Array(256);
{ let x = 1; for (let i = 0; i < 255; i++) { E[i] = E[i + 255] = x; L[x] = i; x <<= 1; if (x & 256) x ^= 0x11D; } }
const gm = (a: number, b: number) => a && b ? E[L[a] + L[b]] : 0;

// Reed-Solomon 生成多项式
function gp(d: number): Uint8Array {
  const g = new Uint8Array(d + 1); g[0] = 1;
  for (let i = 0; i < d; i++) {
    const a = E[i];
    for (let j = i; j >= 0; j--) g[j + 1] ^= gm(g[j], a);
  }
  return g;
}

// Reed-Solomon 纠错码字
function ec(data: Uint8Array, n: number): Uint8Array {
  const g = gp(n), r = new Uint8Array(n);
  for (let i = 0; i < data.length; i++) {
    const fb = data[i] ^ r[0];
    for (let j = 0; j < n - 1; j++) r[j] = r[j + 1] ^ gm(g[n - 1 - j], fb);
    r[n - 1] = gm(g[0], fb);
  }
  return r;
}

// 版本参数 [total, data, ec, g1Blocks, g1Data, g2Blocks, g2Data]
const V: number[][] = [
  [], [26,16,10,1,16,0,0], [44,28,16,1,28,0,0], [70,44,26,1,44,0,0],
  [100,64,36,2,32,0,0], [134,86,48,2,43,0,0], [172,108,64,4,27,0,0],
  [196,124,72,4,31,0,0], [242,154,88,2,38,2,39], [292,182,110,3,36,2,37],
  [346,216,130,4,43,1,44],
];
const AP: number[][] = [[], [], [6,18], [6,22], [6,26], [6,30], [6,34], [6,22,38], [6,24,42], [6,26,46], [6,28,50]];

// byte 模式编码
function enc(text: string, dw: number, ver: number): Uint8Array {
  const bytes = new TextEncoder().encode(text), bits: number[] = [];
  bits.push(0, 1, 0, 0); // 模式 0100
  const cl = ver <= 9 ? 8 : 16;
  for (let i = cl - 1; i >= 0; i--) bits.push((bytes.length >> i) & 1);
  for (const b of bytes) for (let j = 7; j >= 0; j--) bits.push((b >> j) & 1);
  const tl = Math.min(4, dw * 8 - bits.length);
  for (let i = 0; i < tl; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const r = new Uint8Array(dw);
  for (let i = 0, pt = 0; i < dw; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      const idx = i * 8 + j;
      b <<= 1;
      if (idx < bits.length) b |= bits[idx];
      else { b |= (pt ? 0x11 : 0xEC) >> (7 - j) & 1; if (j === 7) pt ^= 1; }
    }
    r[i] = b;
  }
  return r;
}

// 矩阵类
class Mx {
  s: number; d: Uint8Array; f: Uint8Array;
  constructor(s: number) { this.s = s; this.d = new Uint8Array(s * s); this.f = new Uint8Array(s * s); }
  p(x: number, y: number, v: number, isF = true) {
    if (x >= 0 && x < this.s && y >= 0 && y < this.s) { this.d[y * this.s + x] = v; if (isF) this.f[y * this.s + x] = 1; }
  }
  isF(x: number, y: number) { return x < 0 || x >= this.s || y < 0 || y >= this.s || this.f[y * this.s + x] === 1; }

  // 7×7 定位图案 + 分隔符
  fdr(cx: number, cy: number) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const ax = Math.abs(dx), ay = Math.abs(dy);
      const v = ax <= 3 && ay <= 3 ? (ax === 3 || ay === 3 || (ax < 2 && ay < 2) ? 1 : 0) : 0;
      this.p(cx + dx, cy + dy, v, true);
    }
  }
  // 5×5 对齐图案
  alg(cx: number, cy: number) {
    if (this.isF(cx, cy)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const ax = Math.abs(dx), ay = Math.abs(dy);
      this.p(cx + dx, cy + dy, ax === 2 || ay === 2 || (ax === 0 && ay === 0) ? 1 : 0, true);
    }
  }
  // 时序图案
  tmg() {
    const s = this.s;
    for (let i = 8; i < s - 8; i++) { this.p(i, 6, i % 2 === 0 ? 1 : 0, true); this.p(6, i, i % 2 === 0 ? 1 : 0, true); }
  }
  // 保留版本/格式信息区域
  rsvVI() { const s = this.s; for (let y = s - 11; y < s; y++) for (let x = 0; x < 6; x++) this.f[y * s + x] = 1; for (let y = 0; y < 6; y++) for (let x = s - 11; x < s; x++) this.f[y * s + x] = 1; }
  rsvFI() {
    const s = this.s;
    for (let i = 0; i <= 8; i++) { if (i !== 6) { this.f[8 * s + i] = 1; this.f[i * s + 8] = 1; } }
    for (let x = s - 8; x < s; x++) this.f[8 * s + x] = 1;
    for (let y = s - 7; y < s; y++) this.f[y * s + 8] = 1;
  }
  // 放置数据位
  pd(bits: number[]) {
    const s = this.s; let idx = 0, up = true;
    for (let c = s - 1; c >= 0; c -= 2) {
      if (c === 6) c--;
      for (let r = up ? s - 1 : 0; up ? r >= 0 : r < s; r += up ? -1 : 1) {
        for (let dc = 0; dc < 2; dc++) {
          const x = c - dc;
          if (x >= 0 && !this.isF(x, r)) { this.p(x, r, idx < bits.length ? bits[idx] : 0, false); idx++; }
        }
      }
      up = !up;
    }
  }
}

// 掩码函数
const MF = [
  (x: number, y: number) => (x + y) % 2 === 0,
  (_x: number, y: number) => y % 2 === 0,
  (x: number, _y: number) => x % 3 === 0,
  (x: number, y: number) => (x + y) % 3 === 0,
  (x: number, y: number) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x: number, y: number) => (x * y) % 2 + (x * y) % 3 === 0,
  (x: number, y: number) => ((x * y) % 2 + (x * y) % 3) % 2 === 0,
  (x: number, y: number) => ((x + y) % 2 + (x * y) % 3) % 2 === 0,
];

function apM(m: Mx, mask: number) {
  const fn = MF[mask], s = m.s;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) if (!m.isF(x, y) && fn(x, y)) m.d[y * s + x] ^= 1;
}

// 掩码评分
function evM(m: Mx): number {
  const s = m.s, d = m.d; let sc = 0;
  // 连续同色（水平/垂直）
  for (let y = 0; y < s; y++) {
    let rh = 0, rv = 0, lh = -1, lv = -1;
    for (let x = 0; x < s; x++) {
      const vh = d[y * s + x], vv = d[x * s + y];
      rh = vh === lh ? rh + 1 : (lh = vh, 1); if (rh === 5) sc += 3; else if (rh > 5) sc++;
      rv = vv === lv ? rv + 1 : (lv = vv, 1); if (rv === 5) sc += 3; else if (rv > 5) sc++;
    }
  }
  // 2×2 块
  for (let y = 0; y < s - 1; y++) for (let x = 0; x < s - 1; x++) {
    const p = y * s + x, v = d[p];
    if (d[p + 1] === v && d[p + s] === v && d[p + s + 1] === v) sc += 3;
  }
  // 1:1:3:1:1 模式
  const p1 = [1,0,1,1,1,0,1,0,0,0,0], p2 = [0,0,0,0,1,0,1,1,1,0,1];
  for (let y = 0; y < s; y++) for (let x = 0; x < s - 10; x++) {
    let m1 = true, m2 = true;
    for (let k = 0; k < 11; k++) { if (d[y * s + x + k] !== p1[k]) m1 = false; if (d[y * s + x + k] !== p2[k]) m2 = false; }
    if (m1 || m2) sc += 40;
  }
  for (let x = 0; x < s; x++) for (let y = 0; y < s - 10; y++) {
    let m1 = true, m2 = true;
    for (let k = 0; k < 11; k++) { if (d[(y + k) * s + x] !== p1[k]) m1 = false; if (d[(y + k) * s + x] !== p2[k]) m2 = false; }
    if (m1 || m2) sc += 40;
  }
  // 黑白比
  let dk = 0; for (let i = 0; i < s * s; i++) dk += d[i];
  sc += Math.abs(Math.floor((dk * 100) / (s * s) / 5) - 10) * 10;
  return sc;
}

// 格式信息 BCH(15,5)，EC level M=0
function fmt(mask: number): number {
  let b = (mask & 7) << 10, d = mask & 7;
  for (let i = 14; i >= 10; i--) { if (b & (1 << i)) b ^= 0x537 << (i - 10); }
  return ((d << 10) | (b & 0x3FF)) ^ 0x5412;
}

function pFmt(m: Mx, f: number) {
  const s = m.s;
  const pos: [number, number][] = [[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[7,8],[8,8],[8,7],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0]];
  for (let i = 0; i < 15; i++) m.p(pos[i][0], pos[i][1], (f >> i) & 1, true);
  m.p(s - 1, 8, (f >> 14) & 1, true);
  for (let i = 0; i < 7; i++) m.p(s - 7 + i, 8, (f >> (13 - i)) & 1, true);
  for (let i = 0; i < 8; i++) m.p(8, s - 1 - i, (f >> (14 - i)) & 1, true);
}

function bld(ver: number, ilv: Uint8Array): Mx {
  const sz = 17 + 4 * ver, m = new Mx(sz);
  m.fdr(3, 3); m.fdr(sz - 4, 3); m.fdr(3, sz - 4);
  if (ver >= 2) { const ps = AP[ver]; for (const cy of ps) for (const cx of ps) m.alg(cx, cy); }
  m.tmg();
  if (ver >= 2) m.p(8, 4 * ver + 9, 1, true);
  if (ver >= 7) m.rsvVI();
  m.rsvFI();
  const bits: number[] = [];
  for (let i = 0; i < ilv.length; i++) for (let j = 7; j >= 0; j--) bits.push((ilv[i] >> j) & 1);
  m.pd(bits);
  return m;
}

function rnd(m: Mx, sc: number): string {
  const s = m.s, dim = s * sc, d = m.d;
  let r = '';
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) if (d[y * s + x]) r += `<rect x="${x * sc}" y="${y * sc}" width="${sc}" height="${sc}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim}" height="${dim}"><rect width="${dim}" height="${dim}" fill="#fff"/>${r}</svg>`;
}

export function generateQrDataUrl(text: string, sc = 8): string {
  if (!text) throw new Error('QR 码内容不能为空');
  const bytes = new TextEncoder().encode(text);
  let ver = 1;
  for (let v = 1; v <= 10; v++) {
    const oh = 4 + (v <= 9 ? 8 : 16) + 4;
    if (Math.ceil((oh + bytes.length * 8) / 8) <= V[v][1]) { ver = v; break; }
  }
  const info = V[ver], dw = info[1], ew = info[2], g1b = info[3], g1d = info[4], g2b = info[5], g2d = info[6];
  const dc = enc(text, dw, ver);
  const blks: Uint8Array[] = [];
  let off = 0;
  for (let i = 0; i < g1b; i++) { blks.push(dc.slice(off, off + g1d)); off += g1d; }
  for (let i = 0; i < g2b; i++) { blks.push(dc.slice(off, off + g2d)); off += g2d; }
  const ers = blks.map(b => ec(b, ew));
  const ilv: number[] = [];
  const mx = Math.max(...blks.map(b => b.length));
  for (let i = 0; i < mx; i++) for (const b of blks) if (i < b.length) ilv.push(b[i]);
  for (let i = 0; i < ew; i++) for (const r of ers) ilv.push(r[i]);

  const m = bld(ver, new Uint8Array(ilv));
  let bm = 0, bs = Infinity;
  for (let mk = 0; mk < 8; mk++) {
    const t = new Mx(m.s); t.d.set(m.d); t.f.set(m.f);
    apM(t, mk); pFmt(t, fmt(mk));
    const sc = evM(t); if (sc < bs) { bs = sc; bm = mk; }
  }
  apM(m, bm); pFmt(m, fmt(bm));
  const svg = rnd(m, sc);
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
