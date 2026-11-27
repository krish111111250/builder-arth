"use client";

/**
 * Furniture and fixtures for all 3 houses.
 *
 * Each anchor from buildHouseUnit gets the slot's .glb (if public/models/<key>.glb
 * exists, see src/config/assetManifest.ts) or the curved procedural fallback.
 * Either way it goes through fitObject(): scaled into the anchor's box, centred,
 * flush on the floor, with a soft contact shadow. Loaded models are fetched once
 * and cloned for each house; House 2 gets a mirrored copy.
 */
import { Suspense, use, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { ASSET_MANIFEST, modelUrl } from "../../src/config/assetManifest";
import { cloneAsset, fitObject, loadModel } from "../../src/utils/modelLoader";
import { proceduralTemplate } from "./proceduralAssets";
import type { ModelAnchor } from "./buildHouseUnit";
import type { MaterialLibrary } from "./textures";

function place(src: THREE.Object3D, a: ModelAnchor, fromFile: boolean) {
  return fitObject(fromFile ? cloneAsset(src) : src.clone(), {
    width: a.size[0],
    depth: a.size[1],
    height: a.size[2],
    position: a.position,
    rotationY: a.rotationY,
    mirror: a.mirror,
    align: a.align,
    vAlign: a.vAlign,
    rotationOffset: fromFile ? ASSET_MANIFEST[a.key].rotationOffset : 0,
    contactShadow: a.contactShadow,
  }).object;
}

function Spinner({ object }: { object: THREE.Object3D }) {
  useFrame((_, dt) => {
    object.rotation.y += Math.min(dt, 0.05) * 5;
  });
  return null;
}

function AssetInstance({ anchor, lib, loader }: { anchor: ModelAnchor; lib: MaterialLibrary; loader: Promise<THREE.Object3D | null> | null }) {
  const loaded = loader ? use(loader) : null;
  const obj = useMemo(() => {
    const src = loaded ?? proceduralTemplate(anchor.key, lib);
    return src ? place(src, anchor, !!loaded) : null;
  }, [loaded, anchor, lib]);
  if (!obj) return null;
  // the model is centred on its anchor, so spinning the outer group turns a fan on its own axis
  return (
    <>
      <primitive object={obj} />
      {anchor.spin && <Spinner object={obj} />}
    </>
  );
}

export function FurnitureModels({ anchors, lib, roofVisible }: { anchors: ModelAnchor[]; lib: MaterialLibrary; roofVisible: boolean }) {
  return (
    <>
      {anchors.map((a, i) => {
        if (a.hideWithRoof && !roofVisible) return null;
        const url = modelUrl(a.key);
        return (
          <Suspense key={`${a.house}-${a.key}-${i}`} fallback={null}>
            <AssetInstance anchor={a} lib={lib} loader={url ? loadModel(url) : null} />
          </Suspense>
        );
      })}
    </>
  );
}
