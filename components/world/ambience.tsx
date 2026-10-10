"use client";

import { Environment as EnvMap, Lightformer } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  type InstancedMesh,
  Matrix4,
  Object3D,
  type Points,
  ShaderMaterial,
  Vector3,
} from "three";
import { sound } from "./audio";
import { districts, palette, roads } from "./config";
import { cityBlocks, rng } from "./environment";

/**
 * Night-city life layered over the static scenery: neon trim, street lamps, hover traffic,
 * sky lanes and plaza fireworks. Everything is instanced and unlit, so it adds glow without
 * adding real lights.
 */
export function Ambience() {
  return (
    <>
      <Reflections />
      <Neon />
      <Streetlights />
      <Traffic />
      <SkyLanes />
      <Fireworks />
    </>
  );
}

/** A tiny procedural studio: gives metal and glass something to reflect without loading an HDRI. */
function Reflections() {
  return (
    <EnvMap frames={1} resolution={64} environmentIntensity={0.28}>
      <Lightformer form="rect" intensity={2} color="#3d7bff" scale={[40, 8, 1]} position={[0, 18, -30]} />
      <Lightformer form="rect" intensity={1.6} color="#ff9a6b" scale={[60, 4, 1]} position={[0, 2, 40]} rotation-y={Math.PI} />
      <Lightformer form="ring" intensity={2.2} color="#5ee7ff" scale={10} position={[-30, 12, 0]} rotation-y={Math.PI / 2} />
      <Lightformer form="rect" intensity={1.4} color="#c86bff" scale={[30, 6, 1]} position={[30, 10, 0]} rotation-y={-Math.PI / 2} />
    </EnvMap>
  );
}

const hdr = (hex: string, k: number) => new Color(hex).multiplyScalar(k);

/** Trim colour follows the nearest protocol district, so neighbourhoods read at a glance. */
function districtTint(x: number, z: number) {
  let best = districts[0];
  let bd = Infinity;
  for (const d of districts) {
    const dd = Math.hypot(x - d.center[0], z - d.center[1]) - d.radius;
    if (dd < bd) [best, bd] = [d, dd];
  }
  return best.color;
}

function Neon() {
  const bars = useMemo(() => {
    const r = rng(42);
    const out: { m: Matrix4; c: Color }[] = [];
    const o = new Object3D();
    const push = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: Color) => {
      o.position.set(x, y, z);
      o.scale.set(sx, sy, sz);
      o.updateMatrix();
      out.push({ m: o.matrix.clone(), c });
    };
    for (const b of cityBlocks().boxes) {
      if (r() < 0.25) continue;
      const c = hdr(districtTint(b.x, b.z), 2.2 + r() * 1.6);
      const t = 0.32;
      const top = b.h + t / 2;
      push(b.x, top, b.z - b.d / 2, b.w + t, t, t, c);
      push(b.x, top, b.z + b.d / 2, b.w + t, t, t, c);
      push(b.x - b.w / 2, top, b.z, t, t, b.d + t, c);
      push(b.x + b.w / 2, top, b.z, t, t, b.d + t, c);
      if (r() < 0.45) {
        const sx = r() < 0.5 ? -1 : 1;
        const sz = r() < 0.5 ? -1 : 1;
        push(b.x + (sx * b.w) / 2, b.h / 2, b.z + (sz * b.d) / 2, t, b.h, t, c);
        push(b.x - (sx * b.w) / 2, b.h / 2, b.z + (sz * b.d) / 2, t, b.h, t, c);
      }
      if (b.h > 30 && r() < 0.5) push(b.x, b.h * (0.35 + r() * 0.4), b.z + b.d / 2 + 0.06, b.w * 0.9, 0.35, 0.05, hdr(palette.cyan, 1.8));
    }
    return out;
  }, []);
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = mesh.current!;
    bars.forEach((b, i) => {
      m.setMatrixAt(i, b.m);
      m.setColorAt(i, b.c);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [bars]);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, bars.length]} frustumCulled={false}>
      <boxGeometry />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

/** Soft radial pool of light on the ground; additive, so overlapping pools brighten naturally. */
const poolMaterial = () =>
  new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexColors: false,
    uniforms: { uColor: { value: new Color("#ffcf96").multiplyScalar(0.9) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(1.0 - d, 0.0), 2.2); gl_FragColor = vec4(uColor * a, a); }`,
  });

function Streetlights() {
  const lamps = useMemo(() => {
    const out: { x: number; z: number; a: number }[] = [];
    for (const [ax, az, bx, bz] of roads) {
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      const a = Math.atan2(bx - ax, bz - az);
      for (let s = 10; s < len - 4; s += 24) {
        const t = s / len;
        const cx = ax + (bx - ax) * t;
        const cz = az + (bz - az) * t;
        for (const side of [-1, 1]) out.push({ x: cx + nx * 8.2 * side, z: cz + nz * 8.2 * side, a: a + (side > 0 ? 0 : Math.PI) });
      }
    }
    return out;
  }, []);
  const pole = useRef<InstancedMesh>(null);
  const head = useRef<InstancedMesh>(null);
  const pool = useRef<InstancedMesh>(null);
  const pools = useMemo(poolMaterial, []);
  useLayoutEffect(() => {
    const o = new Object3D();
    lamps.forEach((l, i) => {
      o.rotation.set(0, 0, 0);
      o.position.set(l.x, 3.2, l.z);
      o.scale.set(1, 1, 1);
      o.updateMatrix();
      pole.current!.setMatrixAt(i, o.matrix);
      o.position.set(l.x, 6.5, l.z);
      o.updateMatrix();
      head.current!.setMatrixAt(i, o.matrix);
      o.position.set(l.x, 0.08, l.z);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.scale.set(13, 13, 1);
      o.updateMatrix();
      pool.current!.setMatrixAt(i, o.matrix);
    });
    for (const m of [pole.current!, head.current!, pool.current!]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }, [lamps]);
  return (
    <>
      <instancedMesh ref={pole} args={[undefined, undefined, lamps.length]} castShadow>
        <cylinderGeometry args={[0.12, 0.18, 6.4, 6]} />
        <meshStandardMaterial color="#1b2b66" metalness={0.8} roughness={0.3} />
      </instancedMesh>
      <instancedMesh ref={head} args={[undefined, undefined, lamps.length]}>
        <sphereGeometry args={[0.38, 12, 8]} />
        <meshBasicMaterial color={hdr("#ffd9a8", 4)} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={pool} args={[undefined, pools, lamps.length]} renderOrder={1}>
        <planeGeometry />
      </instancedMesh>
    </>
  );
}

const CARS_PER_ROAD = 4;

/** Hover cars cruising both lanes of every road, with headlights, tail lights and a glowing beltline. */
function Traffic() {
  const cars = useMemo(() => {
    const r = rng(77);
    const hues = [palette.cyan, palette.aero, palette.virtuals, "#ff4da6", "#3dffb0", palette.gold];
    return roads.flatMap((road, ri) =>
      Array.from({ length: CARS_PER_ROAD }, (_, i) => ({
        road,
        dir: i % 2 ? 1 : -1,
        t: r(),
        speed: 1.6 + r() * 1.2,
        glow: hdr(hues[(ri + i) % hues.length], 2.6),
        bob: r() * 10,
      })),
    );
  }, []);
  const body = useRef<InstancedMesh>(null);
  const cabin = useRef<InstancedMesh>(null);
  const front = useRef<InstancedMesh>(null);
  const back = useRef<InstancedMesh>(null);
  const under = useRef<InstancedMesh>(null);
  const parts = useMemo(
    () => ({
      cabin: new Matrix4().compose(new Vector3(0, 0.42, -0.15), new Object3D().quaternion, new Vector3(1.55, 0.45, 2.1)),
      front: new Matrix4().compose(new Vector3(0, 0.08, 1.95), new Object3D().quaternion, new Vector3(1.35, 0.14, 0.08)),
      back: new Matrix4().compose(new Vector3(0, 0.1, -1.95), new Object3D().quaternion, new Vector3(1.45, 0.12, 0.08)),
      under: new Matrix4().compose(new Vector3(0, -0.22, 0), new Object3D().quaternion, new Vector3(1.5, 0.06, 3.2)),
    }),
    [],
  );

  useLayoutEffect(() => {
    cars.forEach((c, i) => {
      under.current!.setColorAt(i, c.glow);
    });
    if (under.current!.instanceColor) under.current!.instanceColor.needsUpdate = true;
  }, [cars]);

  const o = useMemo(() => new Object3D(), []);
  const m = useMemo(() => new Matrix4(), []);
  useFrame(({ clock }, dt) => {
    const time = clock.elapsedTime;
    cars.forEach((c, i) => {
      const [ax, az, bx, bz] = c.road;
      const len = Math.hypot(bx - ax, bz - az);
      c.t = (c.t + (dt * c.speed) / len) % 1;
      const t = c.dir > 0 ? c.t : 1 - c.t;
      // Fade at the ends of a road so a wrap-around never pops in or out.
      const fade = Math.min(t, 1 - t, 0.08) / 0.08;
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      const lane = 3.2 * c.dir;
      o.position.set(ax + (bx - ax) * t + nx * lane, 0.85 + Math.sin(time * 0.35 + c.bob) * 0.06, az + (bz - az) * t + nz * lane);
      o.rotation.set(0, Math.atan2(bx - ax, bz - az) + (c.dir > 0 ? 0 : Math.PI), 0);
      o.scale.setScalar(fade);
      o.updateMatrix();
      body.current!.setMatrixAt(i, o.matrix);
      cabin.current!.setMatrixAt(i, m.multiplyMatrices(o.matrix, parts.cabin));
      front.current!.setMatrixAt(i, m.multiplyMatrices(o.matrix, parts.front));
      back.current!.setMatrixAt(i, m.multiplyMatrices(o.matrix, parts.back));
      under.current!.setMatrixAt(i, m.multiplyMatrices(o.matrix, parts.under));
    });
    for (const mesh of [body.current!, cabin.current!, front.current!, back.current!, under.current!]) mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={body} args={[undefined, undefined, cars.length]} castShadow frustumCulled={false}>
        <boxGeometry args={[1.7, 0.38, 3.9]} />
        <meshStandardMaterial color="#1a2748" metalness={0.55} roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={cabin} args={[undefined, undefined, cars.length]} castShadow frustumCulled={false}>
        <boxGeometry />
        <meshStandardMaterial color="#2a3d72" metalness={0.35} roughness={0.25} />
      </instancedMesh>
      <instancedMesh ref={front} args={[undefined, undefined, cars.length]} frustumCulled={false}>
        <boxGeometry />
        <meshBasicMaterial color={hdr("#f2f6ff", 4)} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={back} args={[undefined, undefined, cars.length]} frustumCulled={false}>
        <boxGeometry />
        <meshBasicMaterial color={hdr("#ff2a4d", 3.5)} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={under} args={[undefined, undefined, cars.length]} frustumCulled={false}>
        <boxGeometry />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/** Air-taxi beacons orbiting the skyline on a few altitude lanes, blinking like aircraft lights. */
function SkyLanes() {
  const lights = useMemo(() => {
    const r = rng(9);
    return Array.from({ length: 70 }, (_, i) => ({
      radius: 90 + r() * 240,
      y: 45 + Math.floor(r() * 4) * 14,
      a: r() * Math.PI * 2,
      speed: (0.003 + r() * 0.004) * (i % 2 ? 1 : -1),
      blink: r() * 6,
      c: hdr([palette.cyan, "#ff4da6", palette.gold, "#ffffff"][i % 4], 4),
    }));
  }, []);
  const mesh = useRef<InstancedMesh>(null);
  const o = useMemo(() => new Object3D(), []);
  const dim = useMemo(() => new Color(0.25, 0.3, 0.45), []);
  useFrame((_, dt) => {
    lights.forEach((l, i) => {
      l.a += l.speed * dt;
      o.position.set(Math.cos(l.a) * l.radius, l.y, Math.sin(l.a) * l.radius);
      o.updateMatrix();
      mesh.current!.setMatrixAt(i, o.matrix);
      mesh.current!.setColorAt(i, (l.a + l.blink) % 4 < 3.2 ? l.c : dim);
    });
    mesh.current!.instanceMatrix.needsUpdate = true;
    if (mesh.current!.instanceColor) mesh.current!.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, lights.length]} frustumCulled={false}>
      <sphereGeometry args={[0.7, 8, 6]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

const SPARKS = 360;
const BURST_LIFE = 2.6;

/** Plaza fireworks in Base colours: a burst every few seconds, simulated on the CPU (cheap at this count). */
function Fireworks() {
  const geo = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(SPARKS * 3), 3));
    g.setAttribute("color", new BufferAttribute(new Float32Array(SPARKS * 3), 3));
    return g;
  }, []);
  const vel = useMemo(() => new Float32Array(SPARKS * 3), []);
  const state = useRef({ age: BURST_LIFE, next: 2, tint: new Color() });
  const points = useRef<Points>(null);
  const hues = useMemo(() => [palette.baseBright, palette.cyan, palette.gold, "#ff4da6", palette.virtuals].map((c) => new Color(c)), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = state.current;
    const pos = geo.attributes.position.array as Float32Array;
    const col = geo.attributes.color.array as Float32Array;
    s.next -= dt;
    if (s.next <= 0) {
      s.next = 4 + Math.random() * 5;
      s.age = 0;
      s.tint.copy(hues[Math.floor(Math.random() * hues.length)]);
      const cx = (Math.random() - 0.5) * 50;
      const cy = 38 + Math.random() * 14;
      const cz = (Math.random() - 0.5) * 50;
      sound.firework(cx, cy, cz);
      for (let i = 0; i < SPARKS; i++) {
        const u = Math.random() * 2 - 1;
        const th = Math.random() * Math.PI * 2;
        const k = Math.sqrt(1 - u * u);
        const sp = 11 + Math.random() * 3;
        vel[i * 3] = k * Math.cos(th) * sp;
        vel[i * 3 + 1] = u * sp;
        vel[i * 3 + 2] = k * Math.sin(th) * sp;
        pos[i * 3] = cx;
        pos[i * 3 + 1] = cy;
        pos[i * 3 + 2] = cz;
      }
    }
    if (s.age > BURST_LIFE) {
      if (points.current) points.current.visible = false;
      return;
    }
    if (points.current) points.current.visible = true;
    s.age += dt;
    const fade = Math.max(0, 1 - s.age / BURST_LIFE);
    const bright = 3.5 * fade * fade;
    const drag = Math.exp(-1.6 * dt);
    for (let i = 0; i < SPARKS; i++) {
      vel[i * 3] *= drag;
      vel[i * 3 + 1] = vel[i * 3 + 1] * drag - 5 * dt;
      vel[i * 3 + 2] *= drag;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const twinkle = 0.6 + Math.random() * 0.4;
      col[i * 3] = s.tint.r * bright * twinkle;
      col[i * 3 + 1] = s.tint.g * bright * twinkle;
      col[i * 3 + 2] = s.tint.b * bright * twinkle;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  });

  return (
    <points ref={points} geometry={geo} frustumCulled={false} visible={false}>
      <pointsMaterial size={0.9} vertexColors transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
    </points>
  );
}
