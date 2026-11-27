/**
 * Asset manifest: one slot per furniture / fixture item.
 *
 * Every slot points at public/models/<key>.glb. If that file exists at build
 * time it is loaded; if not, a curved procedural fallback is drawn instead
 * (see components/house/proceduralAssets.ts). So to upgrade any item:
 *
 *   1. Save the model as public/models/<key>.glb  (e.g. public/models/toilet.glb)
 *   2. Rebuild / redeploy (restart `npm run dev` locally).
 *
 * No code change is needed. The model is auto-scaled to the space the plan
 * gives it, centred, and dropped flush onto the floor. The model's front
 * should face +Z (glTF default). If it faces another way, set
 * `rotationOffset` here (radians, e.g. Math.PI / 2).
 *
 * The list of files in public/models is read in next.config.mjs and passed in
 * as NEXT_PUBLIC_AVAILABLE_MODELS, so missing files never cause a 404.
 */

export type AssetKey =
  | "sofa"
  | "armchair"
  | "coffeeTable"
  | "tvUnit"
  | "flatScreenTv"
  | "queenBed"
  | "nightstand"
  | "lamp"
  | "wardrobe"
  | "toilet"
  | "vanitySink"
  | "fridge"
  | "stove"
  | "chimney"
  | "washingMachine"
  | "ceilingFan"
  | "pendantLamp"
  | "plant";

export interface AssetEntry {
  /** file name inside public/models */
  file: string;
  /** extra yaw (radians) applied before fitting, to turn the model's front to +Z */
  rotationOffset?: number;
  /** where the current file came from (for credits) */
  source?: string;
}

export const ASSET_MANIFEST: Record<AssetKey, AssetEntry> = {
  sofa: { file: "sofa.glb", source: "Poly Haven · Sofa 01 (CC0)" },
  armchair: { file: "armchair.glb", source: "Poly Haven · Modern Arm Chair 01 (CC0)" },
  // long side of this table runs along the model's Z axis, so turn it 90°
  coffeeTable: { file: "coffeeTable.glb", rotationOffset: Math.PI / 2, source: "Poly Haven · Modern Coffee Table 01 (CC0)" },
  tvUnit: { file: "tvUnit.glb", source: "Poly Haven · Modern Wooden Cabinet (CC0)" },
  nightstand: { file: "nightstand.glb", source: "Poly Haven · Side Table 01 (CC0)" },
  ceilingFan: { file: "ceilingFan.glb", source: "Poly Haven · Ceiling Fan (CC0)" },
  pendantLamp: { file: "pendantLamp.glb", source: "Poly Haven · Modern Ceiling Lamp 01 (CC0)" },
  plant: { file: "plant.glb", source: "Poly Haven · Potted Plant 02 (CC0)" },

  // Not available on Poly Haven in a modern style: procedural until a file is dropped in.
  flatScreenTv: { file: "flatScreenTv.glb" },
  queenBed: { file: "queenBed.glb" },
  lamp: { file: "lamp.glb" },
  wardrobe: { file: "wardrobe.glb" },
  toilet: { file: "toilet.glb" },
  vanitySink: { file: "vanitySink.glb" },
  fridge: { file: "fridge.glb" },
  stove: { file: "stove.glb" },
  chimney: { file: "chimney.glb" },
  washingMachine: { file: "washingMachine.glb" },
};

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** URL for any file in /public that works locally and under the GitHub Pages sub-path. */
export const publicUrl = (path: string) => `${BASE_PATH}/${path.replace(/^\.?\//, "")}`;

const AVAILABLE = new Set((process.env.NEXT_PUBLIC_AVAILABLE_MODELS ?? "").split(",").filter(Boolean));

/** Model URL for a slot, or null when no file has been dropped in (use the procedural fallback). */
export function modelUrl(key: AssetKey): string | null {
  const e = ASSET_MANIFEST[key];
  return AVAILABLE.has(e.file) ? publicUrl(`models/${e.file}`) : null;
}

export const TEXTURE_URLS = {
  floorTile: "textures/floorTile",
  wood: "textures/wood",
  plaster: "textures/plaster",
  bathWall: "textures/bathWall",
  bathFloor: "textures/bathFloor",
} as const;

export const HDRI_URLS = {
  day: publicUrl("hdri/day.hdr"),
  evening: publicUrl("hdri/dusk.hdr"),
} as const;
