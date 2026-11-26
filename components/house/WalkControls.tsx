"use client";

/**
 * First-person walk controls.
 * - Drag anywhere on the canvas (mouse or one finger) to look around.
 * - WASD / arrow keys, or the on-screen pad (via `walkInput`), to walk.
 * - Shift to walk faster on desktop.
 * - Collisions use the 2D AABB world from collision.ts.
 * - `target` teleports (instant) or glides the camera to a point.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { findFreeSpot, moveWithCollision, type AABB, type CollisionWorld } from "./collision";
import { EYE_H, floorHeightAt } from "./buildHouseUnit";

/** Shared input from the on-screen touch pad (values -1..1). */
export const walkInput = { forward: 0, strafe: 0 };

export interface WalkTarget {
  x: number;
  z: number;
  yaw: number;
  pitch?: number;
  instant?: boolean;
  nonce: number;
}

interface Props {
  enabled: boolean;
  collision: CollisionWorld;
  extraBoxes: AABB[];
  target: WalkTarget | null;
  onPosition: (x: number, z: number) => void;
}

const PITCH_LIMIT = 1.25; // ~72 degrees up/down
const WALK_SPEED = 6.5; // feet per second
const euler = new THREE.Euler(0, 0, 0, "YXZ");

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export default function WalkControls({ enabled, collision, extraBoxes, target, onPosition }: Props) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  const pos = useRef({ x: 0, z: 0, y: EYE_H });
  const look = useRef({ yaw: 0, pitch: 0 });
  const keys = useRef(new Set<string>());
  const glide = useRef<null | { fx: number; fz: number; fyaw: number; fpitch: number; tx: number; tz: number; tyaw: number; tpitch: number; t: number; dur: number }>(null);
  const lastReport = useRef({ t: 0, x: NaN, z: NaN });
  const extraRef = useRef(extraBoxes);
  extraRef.current = extraBoxes;

  /* teleport / glide requests */
  useEffect(() => {
    if (!target) return;
    const tp = target.pitch ?? -0.06;
    if (target.instant) {
      const [x, z] = findFreeSpot(collision, target.x, target.z, extraRef.current);
      pos.current.x = x;
      pos.current.z = z;
      pos.current.y = floorHeightAt(x, z) + EYE_H;
      look.current.yaw = target.yaw;
      look.current.pitch = tp;
      glide.current = null;
    } else {
      const dist = Math.hypot(target.x - pos.current.x, target.z - pos.current.z);
      glide.current = {
        fx: pos.current.x,
        fz: pos.current.z,
        fyaw: look.current.yaw,
        fpitch: look.current.pitch,
        tx: target.x,
        tz: target.z,
        tyaw: look.current.yaw + wrapAngle(target.yaw - look.current.yaw),
        tpitch: tp,
        t: 0,
        dur: Math.min(2.2, 0.7 + dist / 14),
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.nonce]);

  /* pointer look + keyboard */
  useEffect(() => {
    if (!enabled) return;
    const el = gl.domElement;
    let activeId: number | null = null;
    let lx = 0;
    let ly = 0;

    const down = (e: PointerEvent) => {
      if (activeId !== null) return;
      activeId = e.pointerId;
      lx = e.clientX;
      ly = e.clientY;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== activeId) return;
      const sens = e.pointerType === "touch" ? 0.0065 : 0.0042;
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
      look.current.yaw -= dx * sens;
      look.current.pitch = THREE.MathUtils.clamp(look.current.pitch - dy * sens, -PITCH_LIMIT, PITCH_LIMIT);
      if (glide.current && Math.hypot(dx, dy) > 2) glide.current = null;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === activeId) activeId = null;
    };
    const kd = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"].includes(e.code)) {
        keys.current.add(e.code);
        if (e.code.startsWith("Arrow")) e.preventDefault();
      }
    };
    const ku = (e: KeyboardEvent) => keys.current.delete(e.code);
    const blur = () => keys.current.clear();

    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", blur);
      keys.current.clear();
    };
  }, [enabled, gl]);

  useFrame((_, rawDt) => {
    if (!enabled) return;
    const dt = Math.min(rawDt, 0.05);
    const k = keys.current;
    let f = walkInput.forward;
    let s = walkInput.strafe;
    if (k.has("KeyW") || k.has("ArrowUp")) f += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) f -= 1;
    if (k.has("KeyD")) s += 1;
    if (k.has("KeyA")) s -= 1;
    // arrow left/right turn (comfortable for keyboard-only users)
    if (k.has("ArrowLeft")) look.current.yaw += dt * 1.8;
    if (k.has("ArrowRight")) look.current.yaw -= dt * 1.8;
    f = THREE.MathUtils.clamp(f, -1, 1);
    s = THREE.MathUtils.clamp(s, -1, 1);

    const g = glide.current;
    if (g && (f !== 0 || s !== 0)) glide.current = null;

    if (glide.current) {
      g!.t += dt / g!.dur;
      const e = ease(Math.min(1, g!.t));
      pos.current.x = THREE.MathUtils.lerp(g!.fx, g!.tx, e);
      pos.current.z = THREE.MathUtils.lerp(g!.fz, g!.tz, e);
      look.current.yaw = THREE.MathUtils.lerp(g!.fyaw, g!.tyaw, e);
      look.current.pitch = THREE.MathUtils.lerp(g!.fpitch, g!.tpitch, e);
      if (g!.t >= 1) glide.current = null;
    } else if (f !== 0 || s !== 0) {
      const run = k.has("ShiftLeft") || k.has("ShiftRight") ? 1.7 : 1;
      const yaw = look.current.yaw;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      let dx = fx * f + rx * s;
      let dz = fz * f + rz * s;
      const len = Math.hypot(dx, dz);
      if (len > 1) {
        dx /= len;
        dz /= len;
      }
      const step = WALK_SPEED * run * dt;
      const [nx, nz] = moveWithCollision(collision, pos.current.x, pos.current.z, dx * step, dz * step, extraRef.current);
      pos.current.x = nx;
      pos.current.z = nz;
    }

    const targetY = floorHeightAt(pos.current.x, pos.current.z) + EYE_H;
    pos.current.y += (targetY - pos.current.y) * Math.min(1, dt * 9);

    camera.position.set(pos.current.x, pos.current.y, pos.current.z);
    euler.set(look.current.pitch, look.current.yaw, 0, "YXZ");
    camera.quaternion.setFromEuler(euler);

    const now = performance.now();
    const lr = lastReport.current;
    if (now - lr.t > 180 && (Math.abs(lr.x - pos.current.x) > 0.05 || Math.abs(lr.z - pos.current.z) > 0.05 || Number.isNaN(lr.x))) {
      lr.t = now;
      lr.x = pos.current.x;
      lr.z = pos.current.z;
      onPosition(pos.current.x, pos.current.z);
    }
  });

  return null;
}
