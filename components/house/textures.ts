/**
 * Shared material library.
 * The main surfaces (floor tiles, wood, plaster, bathroom tiles) use real 1K
 * PBR maps from Poly Haven (public/textures, see loadPbrTextures). Everything
 * else, and the first frames before those load, uses textures drawn on a
 * canvas at runtime. UVs in the scene are in FEET, so each texture's `repeat`
 * is set to 1 / (feet covered by one image).
 */
import * as THREE from "three";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size: number, h = size) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas not supported");
  return { c, ctx };
}

function shade(hex: string, amt: number) {
  const col = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  col.getHSL(hsl);
  col.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amt)));
  return `#${col.getHexString()}`;
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const r = rng(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

let maxAniso = 4;
export function setMaxAnisotropy(v: number) {
  maxAniso = Math.min(8, Math.max(1, v));
}

function toTexture(c: HTMLCanvasElement, feetU: number, feetV = feetU, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / feetU, 1 / feetV);
  t.anisotropy = maxAniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

/* ------------------------------------------------------------------ */
/* Texture painters                                                    */
/* ------------------------------------------------------------------ */

/** Large-format vitrified tiles (2 ft) with subtle marble veining + grout. */
export function vitrifiedTiles(base: string, grout: string, seed = 1) {
  const S = 1024;
  const { c, ctx } = canvas(S);
  const r = rng(seed);
  const tile = S / 2; // 2 x 2 tiles per canvas -> 4 ft
  for (let ty = 0; ty < 2; ty++) {
    for (let tx = 0; tx < 2; tx++) {
      ctx.fillStyle = shade(base, (r() - 0.5) * 0.025);
      ctx.fillRect(tx * tile, ty * tile, tile, tile);
      // soft clouds
      for (let k = 0; k < 14; k++) {
        const g = ctx.createRadialGradient(
          tx * tile + r() * tile, ty * tile + r() * tile, 0,
          tx * tile + r() * tile, ty * tile + r() * tile, 60 + r() * 160,
        );
        g.addColorStop(0, shade(base, (r() - 0.5) * 0.06) + "66");
        g.addColorStop(1, base + "00");
        ctx.fillStyle = g;
        ctx.fillRect(tx * tile, ty * tile, tile, tile);
      }
      // veins
      ctx.save();
      ctx.beginPath();
      ctx.rect(tx * tile, ty * tile, tile, tile);
      ctx.clip();
      for (let v = 0; v < 3; v++) {
        ctx.strokeStyle = shade(base, -0.12 - r() * 0.06) + "55";
        ctx.lineWidth = 0.6 + r() * 1.4;
        ctx.beginPath();
        let x = tx * tile + r() * tile;
        let y = ty * tile;
        ctx.moveTo(x, y);
        while (y < (ty + 1) * tile) {
          x += (r() - 0.5) * 26;
          y += 10 + r() * 18;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  noise(ctx, S, S, 6, seed + 7);
  ctx.fillStyle = grout;
  for (let i = 0; i <= 2; i++) {
    ctx.fillRect(i * tile - 2, 0, 4, S);
    ctx.fillRect(0, i * tile - 2, S, 4);
  }
  return toTexture(c, 4);
}

/** Warm wood grain (doors, TV slats, wardrobe, bed). */
export function woodGrain(base: string, seed = 2) {
  const W = 512;
  const H = 1024;
  const { c, ctx } = canvas(W, H);
  const r = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 220; i++) {
    const x = r() * W;
    ctx.strokeStyle = shade(base, (r() - 0.55) * 0.14) + "aa";
    ctx.lineWidth = 0.5 + r() * 2.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    const amp = 2 + r() * 6;
    const freq = 0.004 + r() * 0.01;
    for (let y = 0; y <= H; y += 16) ctx.lineTo(x + Math.sin(y * freq + i) * amp, y);
    ctx.stroke();
  }
  // a few knots
  for (let k = 0; k < 3; k++) {
    const x = r() * W;
    const y = r() * H;
    for (let ring = 10; ring > 0; ring--) {
      ctx.strokeStyle = shade(base, -0.05 - ring * 0.006) + "88";
      ctx.beginPath();
      ctx.ellipse(x, y, ring * 2.2, ring * 5.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  noise(ctx, W, H, 8, seed + 3);
  return toTexture(c, 2, 4);
}

/** Speckled black-galaxy style granite. */
export function granite(base = "#1d1d20", seed = 3) {
  const S = 512;
  const { c, ctx } = canvas(S);
  const r = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  const cols = ["#3a3a3f", "#55555c", "#8b8b92", "#c9c6bd", "#0b0b0c", "#6b5a3e"];
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = cols[Math.floor(r() * cols.length)];
    const s = r() < 0.92 ? 1 + r() * 2 : 3 + r() * 4;
    ctx.globalAlpha = 0.4 + r() * 0.6;
    ctx.fillRect(r() * S, r() * S, s, s);
  }
  ctx.globalAlpha = 1;
  return toTexture(c, 3);
}

/** Matte plaster (neutral, tinted by material.color for paint swatches). */
export function plaster(seed = 4) {
  const S = 512;
  const { c, ctx } = canvas(S);
  const r = rng(seed);
  ctx.fillStyle = "#f4f4f4";
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 400; i++) {
    const g = ctx.createRadialGradient(r() * S, r() * S, 0, r() * S, r() * S, 20 + r() * 60);
    const v = 230 + Math.floor(r() * 25);
    g.addColorStop(0, `rgba(${v},${v},${v},0.25)`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  noise(ctx, S, S, 10, seed);
  return toTexture(c, 6);
}

/** Glossy ceramic tiles (bathroom walls / kitchen backsplash). */
export function ceramicTiles(base: string, grout: string, tileW: number, tileH: number, seed = 5, gloss = true) {
  const S = 512;
  const { c, ctx } = canvas(S);
  const r = rng(seed);
  const cols = Math.round(2 / tileW);
  const rows = Math.round(2 / tileH);
  const tw = S / cols;
  const th = S / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      ctx.fillStyle = shade(base, (r() - 0.5) * 0.05);
      ctx.fillRect(x * tw, y * th, tw, th);
      if (gloss) {
        const g = ctx.createLinearGradient(x * tw, y * th, x * tw + tw, y * th + th);
        g.addColorStop(0, "rgba(255,255,255,0.10)");
        g.addColorStop(0.5, "rgba(255,255,255,0)");
        g.addColorStop(1, "rgba(0,0,0,0.05)");
        ctx.fillStyle = g;
        ctx.fillRect(x * tw, y * th, tw, th);
      }
    }
  }
  noise(ctx, S, S, 5, seed);
  ctx.fillStyle = grout;
  for (let x = 0; x <= cols; x++) ctx.fillRect(x * tw - 2, 0, 4, S);
  for (let y = 0; y <= rows; y++) ctx.fillRect(0, y * th - 2, S, 4);
  return toTexture(c, 2);
}

/** Random-coursed natural stone cladding. */
export function stoneCladding(seed = 6) {
  const S = 1024;
  const { c, ctx } = canvas(S);
  const r = rng(seed);
  ctx.fillStyle = "#3b342c";
  ctx.fillRect(0, 0, S, S);
  const palette = ["#9b8668", "#7f6c55", "#b49e7c", "#8d8476", "#a89276", "#6f6252", "#c2ae8e"];
  let y = 0;
  while (y < S) {
    const rowH = 40 + r() * 50;
    let x = -r() * 80;
    while (x < S) {
      const w = 70 + r() * 160;
      ctx.fillStyle = palette[Math.floor(r() * palette.length)];
      ctx.fillRect(x + 3, y + 3, w - 6, rowH - 6);
      const g = ctx.createLinearGradient(x, y, x, y + rowH);
      g.addColorStop(0, "rgba(255,255,255,0.12)");
      g.addColorStop(1, "rgba(0,0,0,0.18)");
      ctx.fillStyle = g;
      ctx.fillRect(x + 3, y + 3, w - 6, rowH - 6);
      x += w;
    }
    y += rowH;
  }
  noise(ctx, S, S, 22, seed);
  return toTexture(c, 4);
}

export function asphalt(seed = 7) {
  const S = 512;
  const { c, ctx } = canvas(S);
  ctx.fillStyle = "#3a3c40";
  ctx.fillRect(0, 0, S, S);
  noise(ctx, S, S, 40, seed);
  return toTexture(c, 8);
}

export function grass(seed = 8) {
  const S = 512;
  const { c, ctx } = canvas(S);
  const r = rng(seed);
  ctx.fillStyle = "#4f6b34";
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    ctx.strokeStyle = r() > 0.5 ? "#5f7f3c" : "#40592a";
    ctx.beginPath();
    const x = r() * S;
    const y = r() * S;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 5);
    ctx.stroke();
  }
  return toTexture(c, 6);
}

export function pavers(seed = 9) {
  const S = 512;
  const { c, ctx } = canvas(S);
  const r = rng(seed);
  ctx.fillStyle = "#5c5550";
  ctx.fillRect(0, 0, S, S);
  const n = 8;
  const s = S / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = shade((x + y) % 3 === 0 ? "#9a8f84" : "#b3a798", (r() - 0.5) * 0.06);
      ctx.fillRect(x * s + 3, y * s + 3, s - 6, s - 6);
    }
  }
  noise(ctx, S, S, 16, seed);
  return toTexture(c, 4);
}

export function concrete(seed = 10) {
  const S = 512;
  const { c, ctx } = canvas(S);
  ctx.fillStyle = "#bdb8b0";
  ctx.fillRect(0, 0, S, S);
  noise(ctx, S, S, 26, seed);
  return toTexture(c, 6);
}

/** Geometric rug with a border. */
export function rugPattern(seed = 11) {
  const S = 512;
  const { c, ctx } = canvas(S);
  const r = rng(seed);
  ctx.fillStyle = "#d9cbb5";
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = "#7d5a44";
  ctx.lineWidth = 14;
  ctx.strokeRect(22, 22, S - 44, S - 44);
  ctx.lineWidth = 4;
  ctx.strokeRect(46, 46, S - 92, S - 92);
  ctx.strokeStyle = "#a9876a";
  ctx.lineWidth = 3;
  for (let i = 80; i < S - 80; i += 36) {
    ctx.beginPath();
    ctx.moveTo(i, 80);
    ctx.lineTo(i + 18, S / 2);
    ctx.lineTo(i, S - 80);
    ctx.stroke();
  }
  noise(ctx, S, S, 24, seed);
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = `rgba(0,0,0,${r() * 0.05})`;
    ctx.fillRect(r() * S, r() * S, 2, 2);
  }
  return toTexture(c, 3.3, 2.7);
}

export function fabric(base: string, seed = 12) {
  const S = 256;
  const { c, ctx } = canvas(S);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < S; i += 3) {
    ctx.fillStyle = i % 6 === 0 ? "#000" : "#fff";
    ctx.fillRect(i, 0, 1, S);
    ctx.fillRect(0, i, S, 1);
  }
  ctx.globalAlpha = 1;
  noise(ctx, S, S, 10, seed);
  return toTexture(c, 1.5);
}

/* ------------------------------------------------------------------ */
/* Finish presets                                                      */
/* ------------------------------------------------------------------ */

export type FinishPresetId = "ivory-teak" | "greige-walnut" | "sage-oak";

export interface FinishPreset {
  id: FinishPresetId;
  name: string;
  wall: string;
  floorBase: string;
  floorGrout: string;
  wood: string;
  /** multiplies the real oak veneer photo texture */
  woodTint: string;
  /** multiplies the real floor tile photo texture */
  floorTint: string;
  cabinet: string;
  sofa: string;
  swatch: [string, string];
}

export const FINISH_PRESETS: FinishPreset[] = [
  {
    id: "ivory-teak",
    name: "Warm Ivory & Teak",
    wall: "#f3ead8",
    floorBase: "#ece2cf",
    floorGrout: "#cdbfa6",
    wood: "#8a5a2e",
    woodTint: "#c4a184",
    floorTint: "#ffffff",
    cabinet: "#efe6d6",
    sofa: "#b9a58b",
    swatch: ["#f3ead8", "#8a5a2e"],
  },
  {
    id: "greige-walnut",
    name: "Modern Greige & Walnut",
    wall: "#d9d2c7",
    floorBase: "#cfcac2",
    floorGrout: "#a9a39a",
    wood: "#5b3d29",
    woodTint: "#7d6250",
    floorTint: "#d3cfca",
    cabinet: "#5f6266",
    sofa: "#7d7a76",
    swatch: ["#d9d2c7", "#5b3d29"],
  },
  {
    id: "sage-oak",
    name: "Soft Sage & Oak",
    wall: "#cfdac6",
    floorBase: "#e6e1d5",
    floorGrout: "#c3bcab",
    wood: "#b88d5c",
    woodTint: "#fff1de",
    floorTint: "#f3efe6",
    cabinet: "#9fb39a",
    sofa: "#8f9e86",
    swatch: ["#cfdac6", "#b88d5c"],
  },
];

/* ------------------------------------------------------------------ */
/* Material library                                                    */
/* ------------------------------------------------------------------ */

export type MatKey =
  | "wall" | "ceiling" | "extLight" | "extAccent" | "cladding" | "plinth"
  | "floor" | "sitout" | "step" | "bathFloor" | "bathWall" | "backsplash" | "utilityFloor"
  | "granite" | "wood" | "trim" | "cabinet" | "sofa" | "cushion" | "rug" | "blanket" | "linen"
  | "steel" | "blackMetal" | "frame" | "glass" | "mirror" | "porcelain" | "appliance" | "screen"
  | "curtain" | "pot" | "leaf" | "soil" | "tank" | "asphalt" | "grass" | "paver" | "concrete"
  | "marking" | "terrace" | "hob" | "tyre" | "scooter"
  | "coveGlow" | "lampShade" | "ledStrip" | "sconce" | "downlight" | "mirrorLight";

export type MaterialLibrary = Record<MatKey, THREE.MeshStandardMaterial>;

/** Emissive materials and their evening intensities. */
export const EMISSIVE_KEYS: Partial<Record<MatKey, { color: string; evening: number; day: number }>> = {
  coveGlow: { color: "#ffb766", evening: 3.2, day: 0 },
  lampShade: { color: "#ffc98a", evening: 2.2, day: 0.15 },
  ledStrip: { color: "#ffd29a", evening: 3.5, day: 0.4 },
  sconce: { color: "#ffbf73", evening: 4.0, day: 0 },
  downlight: { color: "#fff1d6", evening: 3.0, day: 0.3 },
  mirrorLight: { color: "#fff4e0", evening: 2.6, day: 0.6 },
};

const woodCache = new Map<string, THREE.Texture>();
const floorCache = new Map<string, THREE.Texture>();

export function createMaterialLibrary(): MaterialLibrary {
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);
  const plasterTex = plaster();
  const lib: MaterialLibrary = {
    wall: std({ map: plasterTex, color: FINISH_PRESETS[0].wall, roughness: 0.92 }),
    ceiling: std({ map: plasterTex, color: "#fbfaf7", roughness: 0.95 }),
    extLight: std({ map: plasterTex, color: "#efe9de", roughness: 0.9 }),
    extAccent: std({ map: plasterTex, color: "#4a4d52", roughness: 0.85 }),
    cladding: std({ map: stoneCladding(), roughness: 0.85 }),
    plinth: std({ map: stoneCladding(61), color: "#9a9188", roughness: 0.9 }),
    floor: std({ roughness: 0.22, metalness: 0 }),
    sitout: std({ map: granite("#4a3a30", 31), roughness: 0.35 }),
    step: std({ map: granite("#2b2523", 33), roughness: 0.3 }),
    bathFloor: std({ map: ceramicTiles("#8f8a84", "#6f6a64", 1, 1, 41, false), roughness: 0.6 }),
    bathWall: std({ map: ceramicTiles("#e9e6e1", "#c9c3bb", 1, 2, 42), roughness: 0.18 }),
    backsplash: std({ map: ceramicTiles("#2f5d62", "#e8e2d8", 0.25, 0.5, 43), roughness: 0.15 }),
    utilityFloor: std({ map: ceramicTiles("#a39a90", "#857c72", 1, 1, 44, false), roughness: 0.75 }),
    granite: std({ map: granite(), roughness: 0.18, metalness: 0.05 }),
    wood: std({ roughness: 0.55 }),
    // door casings / frames: same wood, nudged toward the camera in the depth test
    trim: std({ roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    cabinet: std({ color: FINISH_PRESETS[0].cabinet, roughness: 0.35 }),
    sofa: std({ map: fabric("#ffffff"), color: FINISH_PRESETS[0].sofa, roughness: 0.95 }),
    cushion: std({ map: fabric("#c4733a", 13), roughness: 0.95 }),
    rug: std({ map: rugPattern(), roughness: 1 }),
    blanket: std({ map: fabric("#9c4a3a", 14), roughness: 0.95 }),
    linen: std({ color: "#f7f4ee", roughness: 0.9 }),
    steel: std({ color: "#c9ccd0", metalness: 0.85, roughness: 0.28 }),
    blackMetal: std({ color: "#1f2124", metalness: 0.6, roughness: 0.45 }),
    frame: std({ color: "#2b2d30", metalness: 0.5, roughness: 0.4 }),
    glass: std({ color: "#bcd6e0", transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, depthWrite: false }),
    mirror: std({ color: "#dfe7ea", metalness: 1, roughness: 0.04 }),
    porcelain: std({ color: "#fbfbfa", roughness: 0.12 }),
    appliance: std({ color: "#d4d6d8", metalness: 0.6, roughness: 0.3 }),
    screen: std({ color: "#0b0c0e", roughness: 0.08, metalness: 0.2 }),
    curtain: std({ map: fabric("#e7dcc8", 15), roughness: 1, side: THREE.DoubleSide }),
    pot: std({ color: "#a65b3a", roughness: 0.8 }),
    leaf: std({ color: "#3f7a3a", roughness: 0.7 }),
    soil: std({ color: "#3b2a1e", roughness: 1 }),
    tank: std({ color: "#1c1d1f", roughness: 0.6 }),
    asphalt: std({ map: asphalt(), roughness: 0.95 }),
    grass: std({ map: grass(), roughness: 1 }),
    paver: std({ map: pavers(), roughness: 0.9 }),
    concrete: std({ map: concrete(), roughness: 0.95 }),
    marking: std({ color: "#f2f0e6", roughness: 0.8 }),
    terrace: std({ map: ceramicTiles("#b9aa98", "#8f8274", 1, 1, 45, false), roughness: 0.85 }),
    hob: std({ color: "#08090a", roughness: 0.06, metalness: 0.3 }),
    tyre: std({ color: "#151515", roughness: 0.9 }),
    scooter: std({ color: "#b3262c", roughness: 0.3, metalness: 0.3 }),
    coveGlow: std({ color: "#fff3e0", roughness: 1 }),
    lampShade: std({ color: "#f6e7cf", roughness: 1 }),
    ledStrip: std({ color: "#fff2dc", roughness: 1 }),
    sconce: std({ color: "#f8e9d0", roughness: 1 }),
    downlight: std({ color: "#ffffff", roughness: 1 }),
    mirrorLight: std({ color: "#ffffff", roughness: 1 }),
  };
  for (const [k, v] of Object.entries(EMISSIVE_KEYS)) {
    const m = lib[k as MatKey];
    m.emissive = new THREE.Color(v!.color);
    m.emissiveIntensity = v!.evening;
  }
  applyFinishPreset(lib, FINISH_PRESETS[0]);
  return lib;
}

export function applyFinishPreset(lib: MaterialLibrary, p: FinishPreset) {
  lib.wall.color.set(p.wall);
  lib.cabinet.color.set(p.cabinet);
  lib.sofa.color.set(p.sofa);
  lib.floor.userData.preset = p;

  // once the real photo textures are in, presets only re-tint them
  if (lib.wood.userData.pbr) {
    lib.wood.color.set(p.woodTint);
    lib.trim.color.set(p.woodTint);
    lib.floor.color.set(p.floorTint);
    return;
  }

  let wood = woodCache.get(p.wood);
  if (!wood) {
    wood = woodGrain(p.wood, p.wood.length * 13);
    woodCache.set(p.wood, wood);
  }
  lib.wood.map = wood;
  lib.wood.needsUpdate = true;
  lib.trim.map = wood;
  lib.trim.needsUpdate = true;

  const fk = p.floorBase + p.floorGrout;
  let floor = floorCache.get(fk);
  if (!floor) {
    floor = vitrifiedTiles(p.floorBase, p.floorGrout, fk.length * 7 + p.id.length);
    floorCache.set(fk, floor);
  }
  lib.floor.map = floor;
  lib.floor.needsUpdate = true;
}

export function applyLighting(lib: MaterialLibrary, mode: "evening" | "day") {
  for (const [k, v] of Object.entries(EMISSIVE_KEYS)) {
    lib[k as MatKey].emissiveIntensity = mode === "evening" ? v!.evening : v!.day;
  }
}

export function disposeMaterialLibrary(lib: MaterialLibrary) {
  const seen = new Set<THREE.Texture>();
  for (const m of Object.values(lib)) {
    if (m.map && !seen.has(m.map)) seen.add(m.map);
    m.dispose();
  }
  // shared caches for wood/floor survive so swatches stay instant
  seen.forEach((t) => {
    if (![...woodCache.values(), ...floorCache.values()].includes(t)) t.dispose();
  });
}

/* ------------------------------------------------------------------ */
/* Real PBR maps (Poly Haven, CC0)                                     */
/* ------------------------------------------------------------------ */

interface PbrSet {
  /** folder in /public holding diff.jpg, rough.jpg, nor.jpg */
  dir: string;
  /** real-world size of one image, in feet */
  feet: number;
  mats: MatKey[];
  /** keep the existing colour map (plaster: paint colour comes from material.color) */
  diffuse?: boolean;
  roughness?: number;
  normalScale?: number;
}

/**
 * Loads the 1K diffuse/roughness/normal JPGs and swaps them onto the main
 * materials. Uses THREE.DefaultLoadingManager, so the loading bar counts them.
 * `url` turns a public path into a URL that works under the GitHub Pages sub-path.
 */
export function loadPbrTextures(lib: MaterialLibrary, url: (p: string) => string, maxAnisotropy: number) {
  const loader = new THREE.TextureLoader();
  const sets: PbrSet[] = [
    { dir: "textures/floorTile", feet: 4.92, mats: ["floor"], roughness: 0.55, normalScale: 0.6 },
    { dir: "textures/wood", feet: 6.0, mats: ["wood", "trim"], roughness: 0.9, normalScale: 0.5 },
    // plaster: keep the light canvas colour map so paint swatches stay true; use the real relief + roughness
    { dir: "textures/plaster", feet: 6.56, mats: ["wall", "ceiling", "extLight", "extAccent"], diffuse: false, roughness: 1, normalScale: 0.25 },
    { dir: "textures/bathWall", feet: 4.17, mats: ["bathWall"], roughness: 0.6, normalScale: 0.8 },
    { dir: "textures/bathFloor", feet: 5.9, mats: ["bathFloor"], roughness: 1, normalScale: 0.8 },
  ];
  const loaded: THREE.Texture[] = [];
  const load = (path: string, srgb: boolean, feet: number) => {
    const t = loader.load(url(path));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / feet, 1 / feet);
    t.anisotropy = Math.min(8, maxAnisotropy);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    loaded.push(t);
    return t;
  };
  for (const s of sets) {
    const diff = s.diffuse === false ? null : load(`${s.dir}/diff.jpg`, true, s.feet);
    const rough = load(`${s.dir}/rough.jpg`, false, s.feet);
    const nor = load(`${s.dir}/nor.jpg`, false, s.feet);
    for (const k of s.mats) {
      const m = lib[k];
      if (diff) m.map = diff;
      m.roughnessMap = rough;
      m.roughness = s.roughness ?? 1;
      m.normalMap = nor;
      m.normalScale.setScalar(s.normalScale ?? 1);
      m.userData.pbr = true;
      m.needsUpdate = true;
    }
  }
  const p = lib.floor.userData.preset as FinishPreset | undefined;
  if (p) applyFinishPreset(lib, p);
  return () => loaded.forEach((t) => t.dispose());
}
