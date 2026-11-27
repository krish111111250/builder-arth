/**
 * Central model loader.
 *
 * - One GLTFLoader + DRACOLoader for the whole app. The Draco decoder is served
 *   from /public/draco (same origin, works offline and under the Pages sub-path).
 * - Every URL is downloaded and parsed once. Each house gets a cheap clone that
 *   shares geometry, textures and materials with the original.
 * - fitObject() scales any model into a target box in feet, centres it, and
 *   puts its lowest point exactly on the floor (or its top on the ceiling).
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { ASSET_MANIFEST, modelUrl, publicUrl, type AssetKey } from "../config/assetManifest";

let loader: GLTFLoader | null = null;

function getLoader() {
  if (!loader) {
    const draco = new DRACOLoader();
    draco.setDecoderPath(publicUrl("draco/"));
    loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
  }
  return loader;
}

const cache = new Map<string, Promise<THREE.Object3D | null>>();

/**
 * Loads a .glb/.gltf once and caches it. Resolves to null (never rejects) if the
 * file is missing or broken, so the caller can fall back to a procedural model.
 */
export function loadModel(url: string): Promise<THREE.Object3D | null> {
  let p = cache.get(url);
  if (!p) {
    p = getLoader()
      .loadAsync(url)
      .then((gltf) => {
        gltf.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.castShadow = true;
          m.receiveShadow = true;
        });
        return gltf.scene as THREE.Object3D;
      })
      .catch((err) => {
        console.warn(`[modelLoader] could not load ${url}, using fallback`, err);
        return null;
      });
    cache.set(url, p);
  }
  return p;
}

/** Deep clone that shares geometry/materials (and keeps skinned meshes working). */
export function cloneAsset(src: THREE.Object3D) {
  return skeletonClone(src);
}

export interface FitSpec {
  /** target size in feet: across the front, front-to-back, and height */
  width: number;
  depth: number;
  height: number;
  /** floor point (vAlign "bottom") or ceiling point (vAlign "top") in world feet */
  position: THREE.Vector3;
  /** yaw so the model's +Z front faces the room */
  rotationY: number;
  /** House 2 is a mirror image of the plan */
  mirror?: boolean;
  /** "back": push the model against the back of its box (wall-mounted items) */
  align?: "center" | "back";
  /** "top": hang from position (fans, pendants) */
  vAlign?: "bottom" | "top";
  /** extra yaw applied before measuring (from the manifest) */
  rotationOffset?: number;
  /** soft dark patch under the item so it looks grounded */
  contactShadow?: boolean;
}

let shadowMat: THREE.MeshBasicMaterial | null = null;
let shadowGeo: THREE.PlaneGeometry | null = null;

function contactShadowParts() {
  if (!shadowMat || !shadowGeo) {
    const S = 128;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const ctx = c.getContext("2d")!;
    // rounded-rectangle falloff: dark core, soft edge
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = Math.abs((x + 0.5) / S - 0.5) * 2;
        const v = Math.abs((y + 0.5) / S - 0.5) * 2;
        const d = Math.pow(Math.pow(u, 4) + Math.pow(v, 4), 0.25); // superellipse
        const a = Math.pow(1 - THREE.MathUtils.smoothstep(d, 0.15, 1), 1.6);
        const i = (y * S + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
        img.data[i + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      map: tex,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      toneMapped: false,
    });
    shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  }
  return { mat: shadowMat, geo: shadowGeo };
}

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();

/**
 * Wraps `model` (not cloned) in groups that scale it uniformly to fit
 * width × depth × height, centre it on X/Z and sit its bottom on the floor.
 */
export function fitObject(model: THREE.Object3D, spec: FitSpec) {
  const turn = new THREE.Group();
  turn.rotation.y = spec.rotationOffset ?? 0;
  turn.add(model);
  turn.updateMatrixWorld(true);
  _box.setFromObject(turn);
  _box.getSize(_size);
  _box.getCenter(_center);

  const k = Math.min(
    spec.width / Math.max(_size.x, 1e-4),
    spec.depth / Math.max(_size.z, 1e-4),
    spec.height / Math.max(_size.y, 1e-4),
  );
  const w = _size.x * k;
  const d = _size.z * k;
  const zShift = spec.align === "back" ? (d - spec.depth) / 2 : 0;

  const fit = new THREE.Group();
  fit.scale.setScalar(k);
  fit.position.set(-_center.x * k, spec.vAlign === "top" ? -_box.max.y * k : -_box.min.y * k, -_center.z * k + zShift);
  fit.add(turn);

  const outer = new THREE.Group();
  outer.position.copy(spec.position);
  outer.rotation.y = spec.rotationY;
  if (spec.mirror) outer.scale.x = -1;
  outer.add(fit);

  if (spec.contactShadow && spec.vAlign !== "top") {
    const { mat, geo } = contactShadowParts();
    const s = new THREE.Mesh(geo, mat);
    s.scale.set(w * 1.05 + 0.6, 1, d * 1.05 + 0.6);
    s.position.set(0, 0.006, zShift);
    s.renderOrder = 1;
    s.raycast = () => {};
    outer.add(s);
  }
  return { object: outer, scale: k, size: new THREE.Vector3(w, _size.y * k, d) };
}

/**
 * Loads a manifest model by name and places it, e.g.
 *   placeAsset("sofa", 7, 3, 3, new THREE.Vector3(x, floorY, z), Math.PI / 2)
 * Resolves to null if the slot has no file (draw the procedural fallback instead).
 */
export async function placeAsset(
  modelName: AssetKey,
  targetWidthFt: number,
  targetDepthFt: number,
  targetHeightFt: number,
  position: THREE.Vector3,
  rotationY: number,
  opts: Partial<FitSpec> = {},
) {
  const url = modelUrl(modelName);
  const src = url ? await loadModel(url) : null;
  if (!src) return null;
  return fitObject(cloneAsset(src), {
    width: targetWidthFt,
    depth: targetDepthFt,
    height: targetHeightFt,
    position,
    rotationY,
    rotationOffset: ASSET_MANIFEST[modelName].rotationOffset,
    contactShadow: true,
    ...opts,
  }).object;
}
