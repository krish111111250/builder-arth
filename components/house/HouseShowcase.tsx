"use client";

/* ================================================================== */
/* CONFIG                                                              */
/* ================================================================== */

/**
 * WhatsApp number for the "WhatsApp Enquiry" button.
 * Digits only, with country code, no "+" (example format: 91XXXXXXXXXX).
 * Left empty, the button opens WhatsApp with the message ready and the
 * visitor picks the chat.
 */
export const WHATSAPP_NUMBER = "";
const PROJECT_TITLE = "3-Unit 1BHK Row House 3D Plan";

/* ================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  applyFinishPreset,
  applyLighting,
  createMaterialLibrary,
  disposeMaterialLibrary,
  FINISH_PRESETS,
  setMaxAnisotropy,
  type FinishPresetId,
  type MaterialLibrary,
} from "./textures";
import {
  buildRowHouses,
  CEIL_H,
  FLOOR_Y,
  HOUSES,
  houseIndexAt,
  localToWorld,
  roomAt,
  roomSize,
  ROOMS,
  SPAWN_LOCAL,
  unitOriginX,
  UNIT_W,
  type BuiltScene,
  type DoorDef,
} from "./buildHouseUnit";
import WalkControls, { walkInput, type WalkTarget } from "./WalkControls";
import { FurnitureModels, MODEL_KEYS } from "./models";

type Mode = "walk" | "orbit";
type Lighting = "evening" | "day";
type OrbitPresetId = "cutaway" | "front" | "back" | "top";

interface CamGoal {
  pos: [number, number, number];
  target: [number, number, number];
  nonce: number;
}

const ORBIT_PRESETS: { id: OrbitPresetId; label: string; roofOpen: boolean; pos: [number, number, number]; target: [number, number, number] }[] = [
  { id: "cutaway", label: "All 3 Cutaway", roofOpen: true, pos: [30, 50, 44], target: [0, 2, 0] },
  { id: "front", label: "Front Elevation", roofOpen: false, pos: [0, 10, 64], target: [0, 8, 10] },
  { id: "back", label: "Back Elevation", roofOpen: false, pos: [0, 14, -56], target: [0, 7, -6] },
  { id: "top", label: "Top Floor Plan", roofOpen: true, pos: [0, 82, 0.01], target: [0, 0, 0] },
];

function houseFocus(i: number): Omit<CamGoal, "nonce"> {
  const cx = unitOriginX(i) + UNIT_W / 2;
  return { pos: [cx + 15, 38, 32], target: [cx, 2, 0] };
}

function yawToward(fx: number, fz: number, tx: number, tz: number) {
  return Math.atan2(-(tx - fx), -(tz - fz));
}

function spawnFor(i: number, nonce: number): WalkTarget {
  const p = localToWorld(i, SPAWN_LOCAL.lx, SPAWN_LOCAL.d);
  const l = localToWorld(i, SPAWN_LOCAL.lookLx, SPAWN_LOCAL.lookD);
  return { x: p.x, z: p.z, yaw: yawToward(p.x, p.z, l.x, l.z), pitch: -0.08, instant: true, nonce };
}

const LIGHTING = {
  day: { bg: "#bcd3e6", hemi: 1.0, sky: "#e3f0ff", groundCol: "#7d6a52", sun: 3.0, sunCol: "#fff3e0", sunPos: [40, 70, 50] as const, env: 0.55, interior: 7, interiorCol: "#fff6ec", porch: 0, exposure: 1.0 },
  evening: { bg: "#1a2131", hemi: 0.22, sky: "#4a5b84", groundCol: "#2a2018", sun: 0.45, sunCol: "#ff9a5c", sunPos: [-55, 16, 45] as const, env: 0.1, interior: 42, interiorCol: "#ffb978", porch: 30, exposure: 1.15 },
};

/* ================================================================== */
/* 3D pieces                                                           */
/* ================================================================== */

function EnvironmentSetup({ lighting }: { lighting: Lighting }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const rt = pmrem.fromScene(room, 0.04);
    scene.environment = rt.texture;
    return () => {
      scene.environment = null;
      rt.dispose();
      pmrem.dispose();
      room.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    };
  }, [gl, scene]);
  useEffect(() => {
    const L = LIGHTING[lighting];
    scene.environmentIntensity = L.env;
    scene.background = new THREE.Color(L.bg);
    scene.fog = new THREE.Fog(L.bg, 140, 360);
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = L.exposure;
  }, [lighting, scene, gl]);
  return null;
}

function Sun({ lighting, mobile }: { lighting: Lighting; mobile: boolean }) {
  const L = LIGHTING[lighting];
  const light = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    const cam = l.shadow.camera as THREE.OrthographicCamera;
    cam.left = -42;
    cam.right = 42;
    cam.top = 42;
    cam.bottom = -42;
    cam.near = 1;
    cam.far = 220;
    cam.updateProjectionMatrix();
    l.target.position.set(0, 0, 0);
    l.target.updateMatrixWorld();
  }, []);
  const size = mobile ? 1024 : 2048;
  return (
    <>
      <hemisphereLight args={[L.sky, L.groundCol, L.hemi]} />
      <directionalLight
        ref={light}
        position={[...L.sunPos]}
        intensity={L.sun}
        color={L.sunCol}
        castShadow
        shadow-mapSize-width={size}
        shadow-mapSize-height={size}
        shadow-bias={-0.0004}
        shadow-normalBias={0.06}
      />
    </>
  );
}

/** Warm interior lights, always mounted (no shader recompiles); they follow the active house. */
function InteriorLights({ built, house, lighting }: { built: BuiltScene; house: number; lighting: Lighting }) {
  const L = LIGHTING[lighting];
  const p = built.lights[house];
  const common = { decay: 2, distance: 24, color: L.interiorCol };
  return (
    <>
      <pointLight position={p.living} intensity={L.interior * 1.2} {...common} />
      <pointLight position={p.kitchen} intensity={L.interior * 0.8} {...common} />
      <pointLight position={p.bedroom} intensity={L.interior * 0.9} {...common} />
      <pointLight position={p.bath} intensity={L.interior * 0.45} {...common} />
      <pointLight position={p.porch} intensity={L.porch} decay={2} distance={20} color="#ffb76a" />
    </>
  );
}

function Fan({ position, lib }: { position: THREE.Vector3; lib: MaterialLibrary }) {
  const rotor = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (rotor.current) rotor.current.rotation.y += Math.min(dt, 0.05) * 5;
  });
  return (
    <group position={position}>
      <mesh position={[0, -0.45, 0]} material={lib.steel}>
        <cylinderGeometry args={[0.05, 0.05, 0.9, 8]} />
      </mesh>
      <mesh position={[0, -0.05, 0]} material={lib.steel}>
        <cylinderGeometry args={[0.25, 0.25, 0.1, 16]} />
      </mesh>
      <group ref={rotor} position={[0, -1.05, 0]}>
        <mesh material={lib.blackMetal} castShadow>
          <cylinderGeometry args={[0.38, 0.32, 0.32, 20]} />
        </mesh>
        {[0, 1, 2].map((b) => (
          <group key={b} rotation={[0, (b * Math.PI * 2) / 3, 0]}>
            <mesh position={[1.35, 0.02, 0]} rotation={[0.08, 0, 0]} material={lib.wood} castShadow>
              <boxGeometry args={[2.1, 0.04, 0.42]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

function MainDoor({ def, lib, open, onToggle }: { def: DoorDef; lib: MaterialLibrary; open: boolean; onToggle: () => void }) {
  const pivot = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const g = pivot.current;
    if (!g) return;
    const target = open ? def.openAngle : 0;
    g.rotation.y += (target - g.rotation.y) * Math.min(1, dt * 5);
  });
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 8) return;
    onToggle();
  };
  const w = def.width - 0.04;
  return (
    <group ref={pivot} position={def.hinge} rotation={[0, open ? def.openAngle : 0, 0]}>
      <group position={[(def.dir * def.width) / 2, def.height / 2, 0]}>
        <mesh material={lib.wood} castShadow receiveShadow onClick={click}>
          <boxGeometry args={[w, def.height - 0.04, 0.16]} />
        </mesh>
        {/* panel grooves */}
        {[-1.6, 0, 1.6].map((y) => (
          <mesh key={y} position={[0, y, 0.085]} material={lib.frame}>
            <boxGeometry args={[w - 0.5, 0.04, 0.01]} />
          </mesh>
        ))}
        <mesh position={[(def.dir * (w - 0.6)) / 2, 0, 0.12]} material={lib.steel}>
          <boxGeometry args={[0.06, 1.3, 0.06]} />
        </mesh>
        <mesh position={[(def.dir * (w - 0.6)) / 2, 0, -0.12]} material={lib.steel}>
          <boxGeometry args={[0.06, 1.3, 0.06]} />
        </mesh>
      </group>
    </group>
  );
}

function Waypoint({ x, z, y, onGo }: { x: number; z: number; y: number; onGo: () => void }) {
  const ring = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const [hover, setHover] = useState(false);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const s = 1 + Math.sin(t * 3 + x) * 0.12;
    ring.current?.scale.set(s, s, s);
    if (mat.current) mat.current.opacity = (hover ? 0.95 : 0.6) + Math.sin(t * 3 + x) * 0.2;
  });
  const go = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 8) return;
    onGo();
  };
  return (
    <group position={[x, y + 0.08, z]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} renderOrder={5}>
        <ringGeometry args={[0.5, 0.72, 40]} />
        <meshBasicMaterial ref={mat} color="#ffb547" transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={5}>
        <circleGeometry args={[0.22, 24]} />
        <meshBasicMaterial color="#ffd38a" transparent opacity={0.85} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* generous invisible hit area for fingers */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={go}
        onPointerOver={() => {
          setHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "";
        }}
      >
        <circleGeometry args={[1.1, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function RoomLabels({ house, mode }: { house: number; mode: Mode }) {
  return (
    <>
      {ROOMS.map((r) => {
        const p = localToWorld(house, r.label[0], r.label[1]);
        const y = mode === "walk" ? FLOOR_Y + 8.4 : FLOOR_Y + CEIL_H + 1;
        return (
          <Html key={r.key} position={[p.x, y, p.z]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
            <div className="hud-pop whitespace-nowrap rounded-lg bg-black/65 px-2 py-1 text-center leading-tight text-white shadow-lg ring-1 ring-white/15 backdrop-blur-sm">
              <div className="text-[11px] font-semibold">{r.name}</div>
              <div className="text-[10px] text-amber-300">{roomSize(r)}</div>
            </div>
          </Html>
        );
      })}
    </>
  );
}

/** Smoothly moves the orbit camera + target to a preset. Cancelled when the user grabs the view. */
function OrbitRig({ goal }: { goal: CamGoal | null }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const active = useRef(false);
  const goalPos = useRef(new THREE.Vector3());
  const goalTarget = useRef(new THREE.Vector3());

  useEffect(() => {
    if (!goal) return;
    goalPos.current.set(...goal.pos);
    goalTarget.current.set(...goal.target);
    active.current = true;
  }, [goal]);

  useEffect(() => {
    if (!controls) return;
    const stop = () => (active.current = false);
    controls.addEventListener("start", stop);
    return () => controls.removeEventListener("start", stop);
  }, [controls]);

  useFrame((_, dt) => {
    if (!active.current || !controls) return;
    const k = 1 - Math.exp(-Math.min(dt, 0.05) * 4.5);
    camera.position.lerp(goalPos.current, k);
    controls.target.lerp(goalTarget.current, k);
    controls.update();
    if (camera.position.distanceTo(goalPos.current) < 0.05 && controls.target.distanceTo(goalTarget.current) < 0.05) active.current = false;
  });
  return null;
}

/** Keeps a comfortable horizontal field of view on both portrait phones and wide screens. */
function CameraLens({ mode }: { mode: Mode }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  useEffect(() => {
    const hfov = mode === "walk" ? 88 : 62;
    const vfov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(hfov / 2)) / aspect));
    camera.fov = mode === "walk" ? THREE.MathUtils.clamp(vfov, 62, 92) : THREE.MathUtils.clamp(vfov, 42, 80);
    camera.near = mode === "walk" ? 0.1 : 0.5;
    camera.updateProjectionMatrix();
  }, [mode, camera, aspect]);
  return null;
}

interface SceneProps {
  mode: Mode;
  house: number;
  roofOpen: boolean;
  lighting: Lighting;
  presetId: FinishPresetId;
  showLabels: boolean;
  doorsOpen: boolean[];
  toggleDoor: (i: number) => void;
  walkTarget: WalkTarget | null;
  setWalkTarget: (t: WalkTarget) => void;
  camGoal: CamGoal | null;
  onWalkPosition: (x: number, z: number) => void;
  mobile: boolean;
  onReady: () => void;
}

/** Fires once the first frame with the built scene has rendered. */
function ReadySignal({ onReady }: { onReady: () => void }) {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    requestAnimationFrame(() => onReady());
  });
  return null;
}

function Scene(p: SceneProps) {
  const gl = useThree((s) => s.gl);
  const lib = useMemo(() => {
    setMaxAnisotropy(gl.capabilities.getMaxAnisotropy());
    return createMaterialLibrary();
  }, [gl]);
  const built = useMemo(() => buildRowHouses(lib, MODEL_KEYS), [lib]);

  useEffect(() => () => {
    built.dispose();
    disposeMaterialLibrary(lib);
  }, [built, lib]);

  useEffect(() => {
    const preset = FINISH_PRESETS.find((f) => f.id === p.presetId) ?? FINISH_PRESETS[0];
    applyFinishPreset(lib, preset);
  }, [p.presetId, lib]);

  useEffect(() => applyLighting(lib, p.lighting), [p.lighting, lib]);

  const roofVisible = !(p.mode === "orbit" && p.roofOpen);
  const extraBoxes = useMemo(() => built.doors.filter((_, i) => !p.doorsOpen[i]).map((d) => d.closedBox), [built, p.doorsOpen]);

  const goTo = (roomKey: string) => {
    const r = ROOMS.find((x) => x.key === roomKey)!;
    const w = localToWorld(p.house, r.waypoint[0], r.waypoint[1]);
    const l = localToWorld(p.house, r.look[0], r.look[1]);
    p.setWalkTarget({ x: w.x, z: w.z, yaw: yawToward(w.x, w.z, l.x, l.z), pitch: -0.12, nonce: Date.now() });
  };

  return (
    <>
      <ReadySignal onReady={p.onReady} />
      <EnvironmentSetup lighting={p.lighting} />
      <CameraLens mode={p.mode} />
      <Sun lighting={p.lighting} mobile={p.mobile} />
      <InteriorLights built={built} house={p.house} lighting={p.lighting} />

      <primitive object={built.ground} />
      <primitive object={built.main} />
      <primitive object={built.roof} visible={roofVisible} />

      {roofVisible && built.fans.map((f, i) => <Fan key={i} position={f} lib={lib} />)}
      {built.doors.map((d, i) => (
        <MainDoor key={i} def={d} lib={lib} open={p.doorsOpen[i]} onToggle={() => p.toggleDoor(i)} />
      ))}
      <FurnitureModels anchors={built.anchors} />

      {p.mode === "walk" &&
        ROOMS.map((r) => {
          const w = localToWorld(p.house, r.waypoint[0], r.waypoint[1]);
          const y = r.key === "sitout" ? FLOOR_Y : FLOOR_Y + 0.03;
          return <Waypoint key={`${p.house}-${r.key}`} x={w.x} z={w.z} y={y} onGo={() => goTo(r.key)} />;
        })}
      {p.showLabels && <RoomLabels house={p.house} mode={p.mode} />}

      <WalkControls
        enabled={p.mode === "walk"}
        collision={built.collision}
        extraBoxes={extraBoxes}
        target={p.walkTarget}
        onPosition={p.onWalkPosition}
      />
      {p.mode === "orbit" && (
        <>
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.08}
            minDistance={8}
            maxDistance={150}
            maxPolarAngle={Math.PI / 2 - 0.04}
            target={[0, 2, 0]}
          />
          <OrbitRig goal={p.camGoal} />
        </>
      )}
    </>
  );
}

/* ================================================================== */
/* UI                                                                  */
/* ================================================================== */

const Icon = {
  walk: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13" cy="4" r="2" /><path d="M9 20l3-6 3 3v4M6 12l3-4 4 1 3 3 3 1" /></svg>
  ),
  orbit: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></svg>
  ),
  sun: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
  ),
  moon: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" /></svg>
  ),
  palette: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22a10 10 0 110-20c5.5 0 10 4 10 8.5 0 3-2.5 4.5-5 4.5h-2a2 2 0 00-1.5 3.3A2 2 0 0112 22z" /><circle cx="7.5" cy="10.5" r="1" /><circle cx="12" cy="7" r="1" /><circle cx="16.5" cy="10.5" r="1" /></svg>
  ),
  ruler: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17L17 3l4 4L7 21z" /><path d="M7 13l2 2M10 10l2 2M13 7l2 2" /></svg>
  ),
  roof: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></svg>
  ),
  whatsapp: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.3-.4.3-.4.7-1.4a.5.5 0 000-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.7 11.8 11.8 0 004.5 4c1.7.7 2.3.8 3.2.7a2.7 2.7 0 001.8-1.3 2.2 2.2 0 00.1-1.3c0-.1-.2-.2-.5-.3z" /></svg>
  ),
  arrow: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 15l6-6 6 6" /></svg>
  ),
};

function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { v: T; node: ReactNode; title?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex rounded-full bg-black/55 p-1 shadow-lg ring-1 ring-white/10 backdrop-blur-md">
      {options.map((o) => (
        <button
          key={String(o.v)}
          role="tab"
          aria-selected={value === o.v}
          title={o.title}
          onClick={() => onChange(o.v)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition sm:text-[13px] ${
            value === o.v ? "bg-white text-neutral-900 shadow" : "text-white/80 hover:text-white"
          }`}
        >
          {o.node}
        </button>
      ))}
    </div>
  );
}

function RoundButton({ onClick, active, title, children }: { onClick: () => void; active?: boolean; title: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`grid h-11 w-11 place-items-center rounded-full shadow-lg ring-1 backdrop-blur-md transition ${
        active ? "bg-amber-400 text-neutral-900 ring-amber-300" : "bg-black/55 text-white ring-white/10 hover:bg-black/70"
      }`}
    >
      {children}
    </button>
  );
}

function PadButton({ dir, children, label }: { dir: "f" | "b" | "l" | "r"; children: ReactNode; label: string }) {
  const set = (on: boolean) => {
    if (dir === "f") walkInput.forward = on ? 1 : 0;
    if (dir === "b") walkInput.forward = on ? -1 : 0;
    if (dir === "l") walkInput.strafe = on ? -1 : 0;
    if (dir === "r") walkInput.strafe = on ? 1 : 0;
  };
  return (
    <button
      aria-label={label}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        set(true);
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onLostPointerCapture={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
      className="grid h-11 w-11 select-none place-items-center rounded-xl bg-black/50 text-white shadow ring-1 ring-white/15 backdrop-blur-md active:bg-amber-400 active:text-neutral-900"
      style={{ touchAction: "none" }}
    >
      {children}
    </button>
  );
}

function WalkPad() {
  useEffect(
    () => () => {
      walkInput.forward = 0;
      walkInput.strafe = 0;
    },
    [],
  );
  return (
    <div className="grid grid-cols-3 grid-rows-2 gap-1.5" style={{ touchAction: "none" }}>
      <div />
      <PadButton dir="f" label="Walk forward">{Icon.arrow}</PadButton>
      <div />
      <PadButton dir="l" label="Step left"><span className="-rotate-90">{Icon.arrow}</span></PadButton>
      <PadButton dir="b" label="Walk back"><span className="rotate-180">{Icon.arrow}</span></PadButton>
      <PadButton dir="r" label="Step right"><span className="rotate-90">{Icon.arrow}</span></PadButton>
    </div>
  );
}

function useIsTouch() {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const upd = () => setTouch(mq.matches);
    upd();
    mq.addEventListener("change", upd);
    return () => mq.removeEventListener("change", upd);
  }, []);
  return touch;
}

/* ================================================================== */
/* Main component                                                      */
/* ================================================================== */

export default function HouseShowcase() {
  const [mode, setMode] = useState<Mode>("walk");
  const [house, setHouse] = useState(0);
  const [roofOpen, setRoofOpen] = useState(true);
  const [lighting, setLighting] = useState<Lighting>("evening");
  const [presetId, setPresetId] = useState<FinishPresetId>("ivory-teak");
  const [showLabels, setShowLabels] = useState(false);
  const [finishesOpen, setFinishesOpen] = useState(false);
  const [doorsOpen, setDoorsOpen] = useState([true, true, true]);
  const [walkTarget, setWalkTarget] = useState<WalkTarget | null>(() => spawnFor(0, 1));
  const [camGoal, setCamGoal] = useState<CamGoal | null>(null);
  const [orbitPreset, setOrbitPreset] = useState<OrbitPresetId | null>("cutaway");
  const [room, setRoom] = useState<string>("living");
  const [hint, setHint] = useState(true);
  const [ready, setReady] = useState(false);
  const touch = useIsTouch();
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setHint(false), 8000);
    return () => clearTimeout(t);
  }, [ready]);

  const onWalkPosition = useCallback((x: number, z: number) => {
    if (modeRef.current !== "walk") return;
    const h = houseIndexAt(x);
    const r = roomAt(h, x, z);
    setHouse((prev) => (prev === h ? prev : h));
    setRoom(r ? r.key : "road");
  }, []);

  const applyOrbitPreset = (id: OrbitPresetId) => {
    const pr = ORBIT_PRESETS.find((o) => o.id === id)!;
    setOrbitPreset(id);
    setRoofOpen(pr.roofOpen);
    setCamGoal({ pos: pr.pos, target: pr.target, nonce: Date.now() });
  };

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    setFinishesOpen(false);
    if (m === "orbit") {
      applyOrbitPreset("cutaway");
    } else {
      setWalkTarget(spawnFor(house, Date.now()));
      setRoom("living");
    }
  };

  const switchHouse = (i: number) => {
    setHouse(i);
    if (mode === "walk") {
      setWalkTarget(spawnFor(i, Date.now()));
      setRoom("living");
    } else {
      setOrbitPreset(null);
      setRoofOpen(true);
      setCamGoal({ ...houseFocus(i), nonce: Date.now() });
    }
  };

  const toggleDoor = useCallback((i: number) => setDoorsOpen((d) => d.map((v, k) => (k === i ? !v : v))), []);

  const roomDef = ROOMS.find((r) => r.key === room);
  const badge =
    mode === "walk"
      ? roomDef
        ? [HOUSES[house].name, roomDef.name, roomSize(roomDef)]
        : [HOUSES[house].name, "Front Road"]
      : [HOUSES[house].name, "1BHK · 15' × 35' plot", roofOpen ? "Roof open" : "Full exterior"];

  const waText = `Hi, I'm interested in the ${PROJECT_TITLE}. I was viewing ${HOUSES[house].name}. Please share the price, availability and site visit details.`;
  const waHref = `https://wa.me/${WHATSAPP_NUMBER.replace(/\D/g, "")}?text=${encodeURIComponent(waText)}`;

  const preset = FINISH_PRESETS.find((f) => f.id === presetId)!;

  return (
    <div className="relative h-full w-full select-none overflow-hidden">
      <Canvas
        shadows="soft"
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 72, near: 0.1, far: 700, position: [0, 7.5, 20] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
        onPointerMissed={() => setFinishesOpen(false)}
      >
        <Scene
          mode={mode}
          house={house}
          roofOpen={roofOpen}
          lighting={lighting}
          presetId={presetId}
          showLabels={showLabels}
          doorsOpen={doorsOpen}
          toggleDoor={toggleDoor}
          walkTarget={walkTarget}
          setWalkTarget={setWalkTarget}
          camGoal={camGoal}
          onWalkPosition={onWalkPosition}
          mobile={touch}
          onReady={() => setReady(true)}
        />
      </Canvas>

      {!ready && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-[#0f1115] text-white/80">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-amber-400" />
          <p className="text-sm tracking-wide">Building the 3 houses…</p>
        </div>
      )}

      {/* ---------- Top bar ---------- */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-2 p-3 sm:p-4" style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
        <div className="flex w-full items-start justify-between gap-2">
          <div className="pointer-events-auto">
            <Segmented
              label="View mode"
              value={mode}
              onChange={switchMode}
              options={[
                { v: "walk", node: <>{Icon.walk}<span>Walk</span></>, title: "Walk inside (first person)" },
                { v: "orbit", node: <>{Icon.orbit}<span>Orbit</span></>, title: "Orbit / cutaway view" },
              ]}
            />
          </div>
          <div className="pointer-events-auto">
            <Segmented
              label="Choose house"
              value={house}
              onChange={switchHouse}
              options={HOUSES.map((h) => ({
                v: h.index,
                title: h.name,
                node: (
                  <>
                    <span className="sm:hidden">{h.short}</span>
                    <span className="hidden sm:inline">{h.name}</span>
                  </>
                ),
              }))}
            />
          </div>
        </div>
        <div key={badge.join("|")} className="hud-pop max-w-full truncate rounded-full bg-black/60 px-4 py-1.5 text-center text-xs text-white shadow-lg ring-1 ring-white/10 backdrop-blur-md sm:text-sm">
          {badge.map((b, i) => (
            <span key={i}>
              {i > 0 && <span className="mx-1.5 text-white/40">·</span>}
              <span className={i === 2 && mode === "walk" ? "font-semibold text-amber-300" : i === 0 ? "font-semibold" : ""}>{b}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ---------- Bottom-left: walk pad / hint / orbit tools ---------- */}
      <div className="absolute bottom-0 left-0 flex max-w-[calc(100%-76px)] flex-col items-start gap-2 p-3 sm:max-w-[calc(100%-220px)] sm:p-4" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        {mode === "walk" && touch && <WalkPad />}
        {mode === "walk" && !touch && hint && (
          <div className="hud-pop rounded-xl bg-black/60 px-3 py-2 text-xs text-white/85 shadow-lg ring-1 ring-white/10 backdrop-blur-md">
            Drag to look · <b>W A S D</b> or arrows to walk · Click a glowing ring to jump to a room
          </div>
        )}
        {mode === "orbit" && (
          <>
            <button
              onClick={() => {
                setRoofOpen((r) => !r);
                setOrbitPreset(null);
              }}
              className="flex items-center gap-2 rounded-full bg-amber-400 px-4 py-2 text-xs font-semibold text-neutral-900 shadow-lg ring-1 ring-amber-300 transition hover:bg-amber-300 sm:text-sm"
            >
              {Icon.roof}
              {roofOpen ? "Show Full Exterior" : "Open Roof (Cutaway)"}
            </button>
            <div className="no-scrollbar flex max-w-full gap-1.5 overflow-x-auto rounded-full bg-black/55 p-1 shadow-lg ring-1 ring-white/10 backdrop-blur-md">
              {ORBIT_PRESETS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => applyOrbitPreset(o.id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    orbitPreset === o.id ? "bg-white text-neutral-900" : "text-white/80 hover:text-white"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ---------- Bottom-right: customizer + WhatsApp ---------- */}
      <div className="absolute bottom-0 right-0 flex flex-col items-end gap-2.5 p-3 sm:p-4" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        <div className="relative flex flex-col gap-2.5">
          {finishesOpen && (
            <div className="hud-pop absolute bottom-0 right-14 w-60 rounded-2xl bg-black/75 p-3 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-md">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/60">Wall paint & floor tiles</div>
              <div className="flex flex-col gap-1.5">
                {FINISH_PRESETS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setPresetId(f.id)}
                    className={`flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-xs transition ${
                      f.id === presetId ? "bg-white/15 ring-1 ring-amber-300" : "hover:bg-white/10"
                    }`}
                  >
                    <span className="flex overflow-hidden rounded-md ring-1 ring-white/30">
                      <span className="h-6 w-4" style={{ background: f.swatch[0] }} />
                      <span className="h-6 w-4" style={{ background: f.floorBase }} />
                      <span className="h-6 w-4" style={{ background: f.swatch[1] }} />
                    </span>
                    <span className="font-medium">{f.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <RoundButton
            title={lighting === "evening" ? "Switch to natural daylight" : "Switch to warm evening lights"}
            onClick={() => setLighting((l) => (l === "evening" ? "day" : "evening"))}
          >
            {lighting === "evening" ? Icon.moon : Icon.sun}
          </RoundButton>
          <RoundButton title={`Finishes: ${preset.name}`} active={finishesOpen} onClick={() => setFinishesOpen((o) => !o)}>
            {Icon.palette}
          </RoundButton>
          <RoundButton title={showLabels ? "Hide room sizes" : "Show room sizes"} active={showLabels} onClick={() => setShowLabels((s) => !s)}>
            {Icon.ruler}
          </RoundButton>
        </div>
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="WhatsApp Enquiry"
          title="WhatsApp Enquiry"
          className="flex h-12 w-12 items-center justify-center gap-2 rounded-full bg-[#25D366] text-sm font-semibold text-white shadow-xl ring-1 ring-black/10 transition hover:brightness-105 sm:h-auto sm:w-auto sm:px-4 sm:py-2.5"
        >
          <span className="scale-125 sm:scale-100">{Icon.whatsapp}</span>
          <span className="hidden sm:inline">WhatsApp Enquiry</span>
        </a>
      </div>
    </div>
  );
}
