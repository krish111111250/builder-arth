"use client";

/**
 * Optional GLB furniture.
 *
 * To swap a procedural piece for a real model:
 *   1. Put the file in /public/models (Draco-compressed .glb is fine).
 *   2. Add an entry below, e.g.  sofa: { url: "/models/sofa.glb", scale: 1 }
 * The procedural version of that piece is skipped automatically and the model
 * is placed at the same anchor in all 3 houses. In House 2 it is mirrored
 * (negative X scale), so an L-sofa or bed flips with the plan.
 * Models should be in feet (or use `scale`; metres -> feet = 3.281), with the
 * origin at floor level and the front facing +Z.
 *
 * The Draco decoder is served locally from /public/draco (no CDN).
 * Model URLs should also start with process.env.NEXT_PUBLIC_BASE_PATH on GitHub Pages.
 */
import { Suspense, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { HOUSES, type FurnitureKey, type ModelAnchor } from "./buildHouseUnit";

export const DRACO_DECODER_PATH = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/draco/`;

export interface ModelConfig {
  url: string;
  scale?: number;
  yOffset?: number;
}

export const FURNITURE_MODELS: Partial<Record<FurnitureKey, ModelConfig>> = {
  // sofa: { url: "/models/sofa.glb", scale: 3.281 },
  // bed: { url: "/models/queen-bed.glb", scale: 3.281 },
};

export const MODEL_KEYS = Object.keys(FURNITURE_MODELS) as FurnitureKey[];

function GlbModel({ cfg, anchor }: { cfg: ModelConfig; anchor: ModelAnchor }) {
  const { scene } = useGLTF(cfg.url, DRACO_DECODER_PATH);
  const clone = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    return c;
  }, [scene]);
  return (
    <primitive
      object={clone}
      position={[anchor.position.x, anchor.position.y + (cfg.yOffset ?? 0), anchor.position.z]}
      rotation={[0, anchor.rotationY, 0]}
      scale={[(HOUSES[anchor.house].mirror ? -1 : 1) * (cfg.scale ?? 1), cfg.scale ?? 1, cfg.scale ?? 1]}
    />
  );
}

export function FurnitureModels({ anchors }: { anchors: ModelAnchor[] }) {
  if (MODEL_KEYS.length === 0) return null;
  return (
    <Suspense fallback={null}>
      {anchors.map((a) => {
        const cfg = FURNITURE_MODELS[a.key];
        return cfg ? <GlbModel key={`${a.house}-${a.key}`} cfg={cfg} anchor={a} /> : null;
      })}
    </Suspense>
  );
}
