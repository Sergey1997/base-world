/**
 * Deterministic 48×48 pixel bust portraits. Same seed → same face.
 * Head-and-shoulders in the family of Base profile pictures: circular crop,
 * jacket-or-shirt, not a CryptoPunk and not a Jesse clone.
 */

const SIZE = 48;

const BACKDROPS = ["#8a9aaa", "#7d8c9a", "#6b7c8d", "#9aa8b5", "#5c6b7a", "#a8b4c0", "#8b7d6e", "#6e7a6e", "#7a8494"];
const SKINS = ["#f6e0c8", "#f3d2b3", "#e8c39e", "#d4a574", "#c68642", "#b07a4a", "#8d5524", "#5c3317"];
const HAIRS = ["#1a1a1a", "#0d0d0d", "#2b1d14", "#3d2314", "#4a3020", "#6b4423", "#8b5a2b", "#5a2d0c", "#c9b896", "#d4d4d4"];
const JACKETS = ["#d8c4a4", "#c4b08c", "#2c3a4f", "#1c1c1c", "#3d5a3a", "#6b2c2c", "#4a3f35", "#0052ff", "#8a9aaa", "#c45c26"];
const KNITS = ["#2a4a3a", "#3d2a2a", "#2c3a4f", "#5a4638", "#1c1c1c", "#6b3a1a", "#3d5a8a"];
const SHIRTS = ["#f7f4ee", "#e8eef6", "#dce3ea", "#f0e6d2"];

function rng(text: string) {
  let a = 2166136261;
  for (const c of text) a = Math.imul(a ^ c.charCodeAt(0), 16777619);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `#${[n >> 16, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, "0")).join("")}`;
}

function pick<T>(r: () => number, list: readonly T[]) {
  return list[Math.floor(r() * list.length)];
}

function weighted(r: () => number, table: Record<string, number>) {
  let x = r() * Object.values(table).reduce((a, b) => a + b, 0);
  for (const [key, w] of Object.entries(table)) if ((x -= w) < 0) return key;
  return Object.keys(table)[0];
}

function inCircle(x: number, y: number) {
  const u = (x + 0.5) / SIZE - 0.5;
  const v = (y + 0.5) / SIZE - 0.5;
  return u * u + v * v <= 0.25;
}

type Grid = (string | null)[][];

function put(g: Grid, x: number, y: number, c: string) {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi >= 0 && yi >= 0 && xi < SIZE && yi < SIZE && inCircle(xi, yi)) g[yi][xi] = c;
}

function oval(g: Grid, cx: number, cy: number, rx: number, ry: number, c: string, keep?: (x: number, y: number) => boolean) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const u = (x + 0.5 - cx) / rx;
      const v = (y + 0.5 - cy) / ry;
      if (u * u + v * v <= 1 && (!keep || keep(x, y))) put(g, x, y, c);
    }
}

function bar(g: Grid, x0: number, y0: number, x1: number, y1: number, c: string) {
  for (let y = Math.round(y0); y <= Math.round(y1); y++) for (let x = Math.round(x0); x <= Math.round(x1); x++) put(g, x, y, c);
}

function torso(g: Grid, cx: number, from: number, color: string) {
  for (let y = from; y < SIZE; y++) {
    const t = (y - from) / Math.max(1, SIZE - 1 - from);
    const half = 7 + t * 18;
    bar(g, cx - half, y, cx + half, y, color);
  }
}

export function punk(seed: string) {
  const r = rng(seed);
  const g: Grid = Array.from({ length: SIZE }, () => Array<string | null>(SIZE).fill(null));
  const bg = pick(r, BACKDROPS);
  const skin = pick(r, SKINS);
  const hair = pick(r, HAIRS);
  const shirt = pick(r, SHIRTS);
  const ink = shade(skin, 0.32);
  const brow = shade(hair, hair === "#d4d4d4" || hair === "#c9b896" ? 0.5 : 0.8);
  const neck = shade(skin, 0.88);
  const ear = shade(skin, 0.9);
  const lip = shade(skin, 0.7);

  const crop = weighted(r, { bust: 5, close: 2, wide: 1.6 });
  const cx = 23.5;
  const cy = crop === "close" ? 20 : 17.2;
  const rx = crop === "wide" ? 11.4 : crop === "close" ? 11.8 : 10.4;
  const ry = crop === "close" ? 13.4 : 12.2;
  const chin = cy + ry - 0.4;
  const shoulder = crop === "close" ? 35 : 31;
  const style = weighted(r, {
    short: 2.4,
    side: 1.5,
    long: 1.5,
    bangs: 1.3,
    afro: 1.1,
    bun: 1,
    buzz: 0.9,
    bald: 0.55,
    pony: 1,
    wavy: 1.1,
    pixie: 1,
  });
  const knit = weighted(r, { jacket: 3.2, hoodie: 1.4, tee: 1.3, turtle: 1, shirt: 1.2, sweater: 1 });
  const cloth = knit === "jacket" || knit === "shirt" ? pick(r, JACKETS) : pick(r, KNITS);
  const beard = weighted(r, { none: 6.5, stubble: 1.2, goatee: 0.7, full: 0.9, mustache: 0.5 });
  const eyes = weighted(r, { open: 6.5, glasses: 1.8, round: 1 });
  const mouth = weighted(r, { line: 5.5, smile: 2.2, oh: 0.6 });

  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (inCircle(x, y)) g[y][x] = bg;

  torso(g, cx, shoulder, cloth);
  if (knit === "jacket" || knit === "shirt") {
    for (let i = 0; i < 6; i++) {
      bar(g, cx - 2 - i, shoulder + i, cx - 1, shoulder + i, shirt);
      bar(g, cx + 1, shoulder + i, cx + 2 + i, shoulder + i, shirt);
    }
    bar(g, cx - 1, shoulder, cx + 1, shoulder + 1, shirt);
  } else if (knit === "tee") {
    oval(g, cx, shoulder + 1, 4.2, 3, neck, (_x, y) => y >= shoulder);
  } else if (knit === "hoodie") {
    bar(g, cx - 5, shoulder, cx + 5, shoulder + 3, shade(cloth, 0.78));
  } else if (knit === "sweater") {
    bar(g, cx - 6, shoulder, cx + 6, shoulder + 1, shade(cloth, 1.18));
  }

  if (knit === "turtle") bar(g, cx - 5, chin - 1, cx + 5, shoulder + 2, cloth);
  else bar(g, cx - 3, chin - 1, cx + 3, shoulder + 1, neck);

  oval(g, cx - rx - 0.1, cy + 1.4, 2.2, 3.2, ear);
  oval(g, cx + rx + 0.1, cy + 1.4, 2.2, 3.2, ear);
  oval(g, cx, cy, rx, ry, skin);

  if (style !== "bald") {
    const fat = style === "afro" ? 4.6 : style === "wavy" ? 2.2 : 1.5;
    const lift = style === "afro" ? 3.6 : style === "buzz" || style === "pixie" ? 0.3 : 1.6;
    oval(g, cx, cy - 1, rx + fat, ry + lift, hair, (x, y) => {
      if (style === "buzz") return y < cy + 0.5;
      if (style === "pixie") return y < cy + 2.5;
      if (style === "bangs") return y < cy + 1.2 || Math.abs(x - cx) > rx * 0.7;
      return y < cy + 2.2 || Math.abs(x - cx) > rx * 0.68;
    });
    if (style === "side") {
      const left = r() < 0.5 ? -1 : 1;
      oval(g, cx + left * 3, cy - 2, 5.2, 5.5, hair, (_x, y) => y < cy + 1);
    }
    if (style === "bangs") bar(g, cx - rx + 2, cy - 2.5, cx + rx - 2, cy + 0.2, hair);
    if (style === "long" || style === "wavy") {
      for (let y = cy; y < chin + 6; y++) {
        const flare = style === "wavy" && y % 3 === 0 ? 1 : 0;
        bar(g, cx - rx - 1 - flare, y, cx - rx + 2, y, hair);
        bar(g, cx + rx - 2, y, cx + rx + 1 + flare, y, hair);
      }
    }
    if (style === "short") {
      bar(g, cx - rx, cy + 1, cx - rx + 2, cy + 3.5, hair);
      bar(g, cx + rx - 2, cy + 1, cx + rx, cy + 3.5, hair);
    }
    if (style === "bun") oval(g, cx + (r() < 0.4 ? -3 : r() < 0.5 ? 3 : 0), cy - ry - 1.2, 3.8, 3.2, hair);
    if (style === "pony") oval(g, cx + (r() < 0.5 ? -1 : 1) * (rx + 2.2), cy + 5, 2.2, 6.2, hair);
  }

  oval(g, cx, cy + 1.2, rx * 0.82, ry * 0.7, skin, (_x, y) => y > cy - 1.5);

  if (beard === "stubble") oval(g, cx, cy + 6.2, rx * 0.68, ry * 0.42, shade(hair, 1.85), (_x, y) => y > cy + 4.5);
  if (beard === "full") oval(g, cx, cy + 7, rx * 0.7, ry * 0.48, hair, (_x, y) => y > cy + 3.5);
  if (beard === "goatee") {
    bar(g, cx - 1.4, cy + 7, cx + 1.4, chin, hair);
    oval(g, cx, chin, 2.2, 1.8, hair);
  }
  if (beard === "mustache") bar(g, cx - 2.8, cy + 5.6, cx + 2.8, cy + 6.5, hair);

  const eyeY = Math.round(cy + 0.6);
  const gap = rx * 0.4;
  bar(g, cx - gap - 1.3, eyeY - 2.2, cx - gap + 1.3, eyeY - 2.2, brow);
  bar(g, cx + gap - 1.3, eyeY - 2.2, cx + gap + 1.3, eyeY - 2.2, brow);
  put(g, cx - gap, eyeY, ink);
  put(g, cx + gap, eyeY, ink);
  put(g, cx, cy + 3.8, shade(skin, 0.76));
  if (r() < 0.6) put(g, cx, cy + 4.7, shade(skin, 0.82));

  const my = Math.round(cy + 7.4);
  if (mouth === "smile") {
    put(g, cx - 2, my, lip);
    bar(g, cx - 1, my + 1, cx + 1, my + 1, lip);
    put(g, cx + 2, my, lip);
  } else if (mouth === "oh") put(g, cx, my, lip);
  else bar(g, cx - 1.5, my, cx + 1.5, my, lip);

  if (eyes === "glasses" || eyes === "round") {
    const frame = "#1a1a1a";
    const w = eyes === "round" ? 2.5 : 3;
    const h = eyes === "round" ? 2.3 : 2;
    oval(g, cx - gap, eyeY, w, h, frame);
    oval(g, cx + gap, eyeY, w, h, frame);
    oval(g, cx - gap, eyeY, w - 1.05, h - 1.05, shade(bg, 1.12));
    oval(g, cx + gap, eyeY, w - 1.05, h - 1.05, shade(bg, 1.12));
    bar(g, cx - gap + w - 0.5, eyeY, cx + gap - w + 0.5, eyeY, frame);
    put(g, cx - gap, eyeY, ink);
    put(g, cx + gap, eyeY, ink);
  }

  if (r() < 0.22) {
    put(g, cx - rx - 1.2, cy + 3.6, "#d4a017");
    if (r() < 0.55) put(g, cx + rx + 1.2, cy + 3.6, "#d4a017");
  }

  if (knit === "hoodie" && r() < 0.4) {
    const rim = shade(cloth, 0.62);
    oval(g, cx, cy, rx + 3.8, ry + 3.4, rim, (x, y) => {
      const u = (x + 0.5 - cx) / (rx + 0.6);
      const v = (y + 0.5 - cy) / (ry + 0.4);
      return u * u + v * v > 1 && y < cy + 5 && y > cy - ry - 2;
    });
  }

  let rects = "";
  g.forEach((row, y) => {
    for (let x = 0; x < SIZE; ) {
      const fill = row[x];
      let w = 1;
      while (fill && row[x + w] === fill) w++;
      if (fill) rects += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${fill}"/>`;
      x += w;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" shape-rendering="crispEdges">${rects}</svg>`;
}

export const punkUrl = (seed: string) => `data:image/svg+xml;utf8,${encodeURIComponent(punk(seed))}`;
