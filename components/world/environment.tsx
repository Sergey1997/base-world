"use client";

import { Grid, Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BackSide,
  Color,
  type DirectionalLight,
  type InstancedMesh,
  type Material,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from "three";
import { Ambience } from "./ambience";
import { districts, jumpPads, palette, roads, WORLD_HALF } from "./config";
import { live } from "./store";

export const SUN_DIR = new Vector3(0.55, 0.32, -0.77).normalize();
export const FOG = "#8a93d8";

export function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function segDist(x: number, z: number, [ax, az, bx, bz]: [number, number, number, number]) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (ax + t * dx), z - (az + t * dz));
}

/** True when nothing (district, road, pad) claims this spot, so scenery may go there. */
export function isFree(x: number, z: number, margin: number) {
  if (districts.some((d) => Math.hypot(x - d.center[0], z - d.center[1]) < d.radius + margin)) return false;
  if (roads.some((r) => segDist(x, z, r) < 10 + margin)) return false;
  if (jumpPads.some((p) => Math.hypot(x - p.position[0], z - p.position[2]) < 12 + margin)) return false;
  return Math.abs(x) < WORLD_HALF - 20 && Math.abs(z) < WORLD_HALF - 20;
}

export function Environment() {
  return (
    <>
      <color attach="background" args={[FOG]} />
      <fog attach="fog" args={[FOG, 160, 760]} />
      <SkyDome />
      <Sun />
      <hemisphereLight args={["#bcd2ff", "#4a3768", 0.7]} />
      <Ground />
      <Roads />
      <City />
      <Trees />
      <Mountains />
      <Clouds />
      <Ambience />
      <Sparkles count={120} scale={[600, 60, 600]} position={[0, 30, 0]} size={3} speed={0.08} opacity={0.28} color="#ffd9b8" />
    </>
  );
}

function SkyDome() {
  const uniforms = useMemo(
    () => ({
      uSun: { value: SUN_DIR },
      uZenith: { value: new Color("#0a1f66") },
      uMid: { value: new Color("#3b63d1") },
      uHorizon: { value: new Color(FOG) },
      uGlow: { value: new Color("#ffad85") },
    }),
    [],
  );
  const ref = useRef<Object3D>(null);
  useFrame(({ camera }) => ref.current?.position.copy(camera.position));
  return (
    <mesh ref={ref} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[900, 48, 24]} />
      <shaderMaterial
        side={BackSide}
        depthWrite={false}
        fog={false}
        uniforms={uniforms}
        vertexShader={`varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`}
        fragmentShader={`
          uniform vec3 uSun, uZenith, uMid, uHorizon, uGlow; varying vec3 vDir;
          float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
          void main(){
            float h = clamp(vDir.y, -1.0, 1.0);
            vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.25, h));
            col = mix(col, uZenith, smoothstep(0.25, 0.9, h));
            float sun = max(dot(vDir, uSun), 0.0);
            col += uGlow * pow(sun, 4.0) * 0.7 * (1.0 - smoothstep(0.0, 0.5, h));
            col += vec3(1.0,0.85,0.7) * pow(sun, 900.0) * 2.5;
            vec3 cell = floor(vDir * 420.0);
            float star = step(0.9965, hash(cell)) * smoothstep(0.25, 0.7, h);
            col += vec3(0.8,0.9,1.0) * star * 1.4;
            gl_FragColor = vec4(col, 1.0);
          }`}
      />
    </mesh>
  );
}

function Sun() {
  const light = useRef<DirectionalLight>(null);
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    l.position.copy(live.pos).addScaledVector(SUN_DIR, 140);
    l.target.position.copy(live.pos);
    l.target.updateMatrixWorld();
  });
  return (
    <directionalLight
      ref={light}
      color="#ffd3ad"
      intensity={2.2}
      castShadow
      shadow-mapSize={[1024, 1024]}
      shadow-camera-left={-60}
      shadow-camera-right={60}
      shadow-camera-top={60}
      shadow-camera-bottom={-60}
      shadow-camera-near={10}
      shadow-camera-far={300}
      shadow-bias={-0.0004}
      shadow-normalBias={0.05}
    />
  );
}

function Ground() {
  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[WORLD_HALF + 300, 1, WORLD_HALF + 300]} position={[0, -1, 0]} />
        {[
          [WORLD_HALF, 0, 0.5, WORLD_HALF],
          [-WORLD_HALF, 0, 0.5, WORLD_HALF],
          [0, WORLD_HALF, WORLD_HALF, 0.5],
          [0, -WORLD_HALF, WORLD_HALF, 0.5],
        ].map(([x, z, hx, hz], i) => (
          <CuboidCollider key={i} args={[hx, 40, hz]} position={[x, 40, z]} />
        ))}
      </RigidBody>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[1600, 1600]} />
        <meshStandardMaterial color={palette.ground} roughness={0.92} metalness={0.05} />
      </mesh>
      <Grid
        position={[0, 0.02, 0]}
        infiniteGrid
        cellSize={6}
        sectionSize={24}
        cellThickness={0.6}
        sectionThickness={1.1}
        cellColor="#22346e"
        sectionColor="#3a5bb8"
        fadeDistance={260}
        fadeStrength={1.4}
        followCamera
      />
    </>
  );
}

/** Circular district floors that sit above the road mesh and must hide its markings. */
function roadPads() {
  return districts
    .filter((d) => d.id === "plaza" || d.id === "virtuals" || d.look)
    .map((d) => ({
      x: d.center[0],
      z: d.center[1],
      r: d.id === "plaza" ? 46 : d.id === "virtuals" ? 72 : d.radius - 4,
    }));
}

function circleHits(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, r: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const fx = ax - cx;
  const fz = az - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-8) return [];
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  const s = Math.sqrt(disc);
  return [(-b - s) / (2 * a), (-b + s) / (2 * a)].filter((t) => t >= -0.02 && t <= 1.02).sort((p, q) => p - q);
}

/** Keep a ribbon of width `half*2` outside every pad (or tucked under it when `padInset` is negative). */
function clipRoad(ax: number, az: number, bx: number, bz: number, pads: { x: number; z: number; r: number }[], half: number, padInset: number) {
  let t0 = 0;
  let t1 = 1;
  for (const p of pads) {
    const r = Math.max(1, p.r - padInset);
    const er = Math.sqrt(Math.max(0, r * r - half * half));
    const hits = circleHits(ax, az, bx, bz, p.x, p.z, er);
    if ((ax - p.x) ** 2 + (az - p.z) ** 2 < er * er && hits.length) t0 = Math.max(t0, hits[0]);
    if ((bx - p.x) ** 2 + (bz - p.z) ** 2 < er * er && hits.length) t1 = Math.min(t1, hits[hits.length - 1]);
  }
  if (t1 - t0 < 0.04) return null;
  return [ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1] as const;
}

function grow(ax: number, az: number, bx: number, bz: number, extra: number) {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 1) return [ax, az, bx, bz] as const;
  const ux = (bx - ax) / len;
  const uz = (bz - az) / len;
  return [ax - ux * extra, az - uz * extra, bx + ux * extra, bz + uz * extra] as const;
}

function Roads() {
  const pads = useMemo(roadPads, []);
  return (
    <>
      {roads.map(([ax, az, bx, bz], i) => {
        const bed = clipRoad(...grow(ax, az, bx, bz, 4), pads, 7, -2);
        const mark = clipRoad(...grow(ax, az, bx, bz, 1), pads, 6.8, 1.2);
        if (!bed) return null;
        const [x0, z0, x1, z1] = bed;
        return (
          <group key={i}>
            <group position={[(x0 + x1) / 2, 0.05, (z0 + z1) / 2]} rotation-y={Math.atan2(x1 - x0, z1 - z0)}>
              <mesh rotation-x={-Math.PI / 2} receiveShadow>
                <planeGeometry args={[14, Math.hypot(x1 - x0, z1 - z0)]} />
                <meshStandardMaterial color="#0a1230" roughness={0.7} metalness={0.2} />
              </mesh>
            </group>
            {mark && (
              <group position={[(mark[0] + mark[2]) / 2, 0.054, (mark[1] + mark[3]) / 2]} rotation-y={Math.atan2(mark[2] - mark[0], mark[3] - mark[1])}>
                {[-6.6, 6.6].map((x) => (
                  <mesh key={x} position={[x, 0, 0]} rotation-x={-Math.PI / 2}>
                    <planeGeometry args={[0.35, Math.hypot(mark[2] - mark[0], mark[3] - mark[1])]} />
                    <meshBasicMaterial color={[0.4, 1.4, 3]} toneMapped={false} />
                  </mesh>
                ))}
                <mesh rotation-x={-Math.PI / 2}>
                  <planeGeometry args={[0.25, Math.hypot(mark[2] - mark[0], mark[3] - mark[1])]} />
                  <meshBasicMaterial color="#c9d8ff" transparent opacity={0.35} />
                </mesh>
              </group>
            )}
          </group>
        );
      })}
    </>
  );
}

/** Shared clock for scenery shaders; ticked once per frame by <City />. */
export const sceneTime = { value: 0 };

/** Lit-window facades computed from world position, so any box size gets correctly scaled windows. */
export function windowMaterial() {
  const m = new MeshStandardMaterial({ roughness: 0.55, metalness: 0.25 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sceneTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos; varying vec3 vWNormal;")
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\n#ifdef USE_INSTANCING\nmat4 wm = modelMatrix * instanceMatrix;\n#else\nmat4 wm = modelMatrix;\n#endif\nvWPos = (wm * vec4(transformed, 1.0)).xyz; vWNormal = normalize(mat3(wm) * objectNormal);",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime; varying vec3 vWPos; varying vec3 vWNormal;\nfloat whash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        vec3 n = abs(vWNormal);
        float side = 1.0 - n.y;
        vec2 g = vec2(vWPos.x * n.z + vWPos.z * n.x, vWPos.y) / vec2(2.8, 3.6);
        vec2 c = fract(g);
        float win = step(0.22, c.x) * step(c.x, 0.78) * step(0.28, c.y) * step(c.y, 0.78);
        // Each window re-rolls on its own slow clock, so the city keeps switching lights on and off.
        float phase = floor(uTime / 18.0 + whash(floor(g) * 3.1) * 7.0);
        float lit = step(0.5, whash(floor(g) + floor(vWPos.xz / 40.0) + phase * 0.37));
        vec3 wc = mix(vec3(0.45, 0.75, 1.6), vec3(1.7, 1.15, 0.6), step(0.7, whash(floor(g) * 1.7)));
        totalEmissiveRadiance += side * win * lit * wc * step(2.0, vWPos.y) * 0.95;`,
      );
  };
  return m;
}

export interface Block {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  c: Color;
}

let cityCache: { boxes: Block[]; caps: Block[] } | null = null;

/** The procedural skyline; deterministic, shared by the buildings and their neon trim. */
export function cityBlocks() {
  if (cityCache) return cityCache;
  const r = rng(7);
  const boxes: Block[] = [];
  const tints = ["#eef2ff", "#9fb4f5", "#4f74e3", "#ffc9a8", "#8fd9cc", "#c9b4ff", "#ffe6b0"].map((c) => new Color(c));
  for (let gx = -340; gx <= 340; gx += 28) {
    for (let gz = -340; gz <= 340; gz += 28) {
      const x = gx + (r() - 0.5) * 10;
      const z = gz + (r() - 0.5) * 10;
      const dist = Math.hypot(x, z);
      const w = 9 + r() * 10;
      const d = 9 + r() * 10;
      if (dist < 70 || r() < 0.42 || !isFree(x, z, Math.max(w, d) * 0.7)) continue;
      const h = 8 + r() * 26 + 70 * Math.exp(-dist / 140) * r();
      boxes.push({ x, z, w, d, h, c: tints[Math.floor(r() * tints.length)] });
    }
  }
  const caps = boxes.filter(() => r() < 0.45);
  return (cityCache = { boxes, caps });
}

function City() {
  const { boxes, caps } = cityBlocks();
  useFrame(({ clock }) => (sceneTime.value = clock.elapsedTime));
  const mesh = useRef<InstancedMesh>(null);
  const capMesh = useRef<InstancedMesh>(null);
  const material = useMemo(windowMaterial, []);

  useLayoutEffect(() => {
    const o = new Object3D();
    boxes.forEach((b, i) => {
      o.position.set(b.x, b.h / 2, b.z);
      o.scale.set(b.w, b.h, b.d);
      o.updateMatrix();
      mesh.current!.setMatrixAt(i, o.matrix);
      mesh.current!.setColorAt(i, b.c);
    });
    const glow = [new Color(0.3, 1.1, 2.2), new Color(2.2, 0.9, 0.4), new Color(1.6, 0.6, 2.2)];
    caps.forEach((b, i) => {
      o.position.set(b.x, b.h + 0.4, b.z);
      o.scale.set(b.w * 0.6, 0.8, b.d * 0.6);
      o.updateMatrix();
      capMesh.current!.setMatrixAt(i, o.matrix);
      capMesh.current!.setColorAt(i, glow[i % 3]);
    });
    for (const m of [mesh.current!, capMesh.current!]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }, [boxes, caps]);

  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        {boxes.map((b, i) => (
          <CuboidCollider key={i} args={[b.w / 2, b.h / 2, b.d / 2]} position={[b.x, b.h / 2, b.z]} />
        ))}
      </RigidBody>
      <instancedMesh ref={mesh} args={[undefined, material as Material, boxes.length]} castShadow receiveShadow>
        <boxGeometry />
      </instancedMesh>
      <instancedMesh ref={capMesh} args={[undefined, undefined, caps.length]}>
        <boxGeometry />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </>
  );
}

function Trees() {
  const trees = useMemo(() => {
    const r = rng(21);
    const out: { x: number; z: number; s: number }[] = [];
    for (let i = 0; i < 900 && out.length < 320; i++) {
      const x = (r() - 0.5) * 760;
      const z = (r() - 0.5) * 760;
      if (isFree(x, z, 4)) out.push({ x, z, s: 0.8 + r() * 1.1 });
    }
    return out;
  }, []);
  const crown = useRef<InstancedMesh>(null);
  const trunk = useRef<InstancedMesh>(null);
  const leaves = useMemo(() => {
    const m = new MeshStandardMaterial({ flatShading: true, roughness: 0.7 });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = sceneTime;
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;").replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec2 seed = instanceMatrix[3].xz * 0.07;
        float sway = sin(uTime * 1.4 + seed.x + seed.y) * 0.18 + sin(uTime * 3.1 + seed.y * 2.0) * 0.05;
        transformed.xz += sway * max(position.y + 1.0, 0.0) * vec2(1.0, 0.6);`,
      );
    };
    return m;
  }, []);
  useLayoutEffect(() => {
    const o = new Object3D();
    const greens = ["#2fbf71", "#7bd85a", "#1fa58a", "#f2a65a", "#e86f8a"].map((c) => new Color(c));
    trees.forEach((t, i) => {
      o.position.set(t.x, 3.2 * t.s, t.z);
      o.scale.setScalar(t.s);
      o.updateMatrix();
      crown.current!.setMatrixAt(i, o.matrix);
      crown.current!.setColorAt(i, greens[i % greens.length]);
      o.position.set(t.x, 0.9 * t.s, t.z);
      o.updateMatrix();
      trunk.current!.setMatrixAt(i, o.matrix);
    });
    crown.current!.instanceMatrix.needsUpdate = true;
    trunk.current!.instanceMatrix.needsUpdate = true;
    crown.current!.computeBoundingSphere();
    trunk.current!.computeBoundingSphere();
  }, [trees]);
  return (
    <>
      <instancedMesh ref={crown} args={[undefined, leaves, trees.length]} castShadow>
        <icosahedronGeometry args={[2, 0]} />
      </instancedMesh>
      <instancedMesh ref={trunk} args={[undefined, undefined, trees.length]} castShadow>
        <cylinderGeometry args={[0.22, 0.32, 1.8, 6]} />
        <meshStandardMaterial color="#2b2f55" roughness={0.9} />
      </instancedMesh>
    </>
  );
}

function Mountains() {
  const peaks = useMemo(() => {
    const r = rng(3);
    return Array.from({ length: 34 }, (_, i) => {
      const a = (i / 34) * Math.PI * 2 + r() * 0.1;
      const d = 520 + r() * 120;
      return { x: Math.cos(a) * d, z: Math.sin(a) * d, h: 90 + r() * 160, w: 70 + r() * 80 };
    });
  }, []);
  return (
    <>
      {peaks.map((p, i) => (
        <mesh key={i} position={[p.x, p.h / 2 - 2, p.z]}>
          <coneGeometry args={[p.w, p.h, 5]} />
          <meshStandardMaterial color="#3a3f8f" flatShading roughness={1} />
        </mesh>
      ))}
    </>
  );
}

function Clouds() {
  const puffs = useMemo(() => {
    const r = rng(11);
    const out: { x: number; y: number; z: number; s: number }[] = [];
    for (let c = 0; c < 26; c++) {
      const cx = (r() - 0.5) * 900;
      const cz = (r() - 0.5) * 900;
      const cy = 140 + r() * 70;
      for (let p = 0; p < 5; p++) out.push({ x: cx + (r() - 0.5) * 50, y: cy + r() * 8, z: cz + (r() - 0.5) * 24, s: 14 + r() * 16 });
    }
    return out;
  }, []);
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const o = new Object3D();
    puffs.forEach((p, i) => {
      o.position.set(p.x, p.y, p.z);
      o.scale.set(p.s * 1.4, p.s * 0.6, p.s);
      o.updateMatrix();
      mesh.current!.setMatrixAt(i, o.matrix);
    });
    mesh.current!.instanceMatrix.needsUpdate = true;
    mesh.current!.computeBoundingSphere();
  }, [puffs]);
  useFrame(({ clock }) => {
    if (mesh.current) mesh.current.position.x = Math.sin(clock.elapsedTime * 0.02) * 80;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, puffs.length]}>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial color="#ffe9f0" emissive="#ffb3a1" emissiveIntensity={0.18} flatShading transparent opacity={0.9} fog={false} />
    </instancedMesh>
  );
}
