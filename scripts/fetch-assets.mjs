#!/usr/bin/env node
/**
 * Downloads free CC0 assets from Poly Haven (https://polyhaven.com) into /public.
 *
 *   node scripts/fetch-assets.mjs            # fetch everything that is missing
 *   node scripts/fetch-assets.mjs --force    # re-download everything
 *
 * - Models: 1K glTF -> one Draco-compressed .glb with WebP textures (public/models/<key>.glb)
 * - Textures: 1K JPG diffuse + roughness + OpenGL normal (public/textures/<key>/)
 * - HDRIs: 1K .hdr (public/hdri/<key>.hdr)
 *
 * Every Poly Haven ID is checked against the live asset list first, so a
 * renamed or removed asset fails loudly instead of producing a broken URL.
 * The results are committed to the repo, so CI and GitHub Pages never call the API.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
const API = "https://api.polyhaven.com";
const HEADERS = { "User-Agent": "BuilderArth3D/1.0" };
const FORCE = process.argv.includes("--force");
const GLTF_TRANSFORM = ["--yes", "@gltf-transform/cli@4.1.1"];

/** manifest key -> Poly Haven model ID (checked 2026-11 against the live API) */
const MODELS = {
  sofa: "Sofa_01",
  armchair: "modern_arm_chair_01",
  coffeeTable: "modern_coffee_table_01",
  tvUnit: "modern_wooden_cabinet",
  nightstand: "side_table_01",
  ceilingFan: "ceiling_fan",
  plant: "potted_plant_02",
  pendantLamp: "modern_ceiling_lamp_01",
};

/** texture key -> Poly Haven texture ID */
const TEXTURES = {
  floorTile: "marble_01", // polished large-format floor tile
  wood: "oak_veneer_01", // doors, frames, slats (tinted per finish preset)
  plaster: "plastered_wall", // matte interior plaster (relief + roughness only; paint colour is set in code)
  bathWall: "long_white_tiles",
  bathFloor: "anti_skid_tiles",
};

/** HDRI key -> Poly Haven HDRI ID */
const HDRIS = {
  day: "kloofendal_48d_partly_cloudy_puresky",
  dusk: "qwantani_dusk_2_puresky",
};

async function getJSON(url) {
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function download(url, dest) {
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}

const mb = (f) => (statSync(f).size / 1e6).toFixed(2) + " MB";

async function verify(type, ids) {
  const list = await getJSON(`${API}/assets?t=${type}`);
  const missing = ids.filter((id) => !list[id]);
  if (missing.length) throw new Error(`Not on Poly Haven (${type}): ${missing.join(", ")}`);
  return list;
}

async function fetchModel(key, id) {
  const out = join(PUBLIC, "models", `${key}.glb`);
  if (existsSync(out) && !FORCE) return console.log(`skip  models/${key}.glb`);
  const files = await getJSON(`${API}/files/${id}`);
  const g = files.gltf?.["1k"]?.gltf;
  if (!g) throw new Error(`${id} has no 1K glTF`);
  const tmp = mkdtempSync(join(tmpdir(), `ph-${key}-`));
  try {
    const main = join(tmp, "model.gltf");
    await download(g.url, main);
    // the .gltf references its .bin and textures by these relative paths
    for (const [rel, f] of Object.entries(g.include ?? {})) await download(f.url, join(tmp, rel));
    mkdirSync(dirname(out), { recursive: true });
    execFileSync("npx", [
      ...GLTF_TRANSFORM, "optimize", main, out,
      "--compress", "draco",
      "--texture-compress", "webp",
      "--texture-size", "1024",
      "--simplify", "false",
      "--instance", "false",
    ], { stdio: "ignore" });
    console.log(`model models/${key}.glb  <- ${id}  (${mb(out)})`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function fetchTexture(key, id) {
  const dir = join(PUBLIC, "textures", key);
  const files = await getJSON(`${API}/files/${id}`);
  const maps = { diff: "Diffuse", rough: "Rough", nor: "nor_gl" };
  if (key === "plaster") delete maps.diff;
  for (const [name, field] of Object.entries(maps)) {
    const dest = join(dir, `${name}.jpg`);
    if (existsSync(dest) && !FORCE) continue;
    const f = files[field]?.["1k"]?.jpg;
    if (!f) throw new Error(`${id} has no 1K ${field} JPG`);
    await download(f.url, dest);
  }
  console.log(`tex   textures/${key}/  <- ${id}`);
}

async function fetchHdri(key, id) {
  const dest = join(PUBLIC, "hdri", `${key}.hdr`);
  if (existsSync(dest) && !FORCE) return console.log(`skip  hdri/${key}.hdr`);
  const files = await getJSON(`${API}/files/${id}`);
  const f = files.hdri?.["1k"]?.hdr;
  if (!f) throw new Error(`${id} has no 1K HDR`);
  await download(f.url, dest);
  console.log(`hdri  hdri/${key}.hdr  <- ${id}  (${mb(dest)})`);
}

const models = await verify("models", Object.values(MODELS));
const textures = await verify("textures", Object.values(TEXTURES));
const hdris = await verify("hdris", Object.values(HDRIS));

for (const [k, id] of Object.entries(MODELS)) await fetchModel(k, id);
for (const [k, id] of Object.entries(TEXTURES)) await fetchTexture(k, id);
for (const [k, id] of Object.entries(HDRIS)) await fetchHdri(k, id);

const credit = (list, map, kind) =>
  Object.entries(map).map(([k, id]) => `- ${kind} \`${k}\`: ${list[id].name} — https://polyhaven.com/a/${id}`);
writeFileSync(
  join(PUBLIC, "ASSET_CREDITS.md"),
  [
    "# Asset credits",
    "",
    "All assets below are CC0 (public domain) from Poly Haven. Fetched by `scripts/fetch-assets.mjs`.",
    "",
    ...credit(models, MODELS, "Model"),
    ...credit(textures, TEXTURES, "Texture"),
    ...credit(hdris, HDRIS, "HDRI"),
    "",
  ].join("\n"),
);
console.log("done");
