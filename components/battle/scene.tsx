"use client";

import { Sparkles, Stars } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { AdditiveBlending, Color, DoubleSide, type Group, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial } from "three";
import { type Beat, type ClassId, classes, Duel, type SideId } from "./engine";
import { current, fightTime, useBattle } from "./store";

const X = 2.5;

/** One replay per frame, shared by every object in the scene. */
const frame: { duel: Duel; t: number } = { duel: new Duel(["knight", "knight"]), t: 0 };

/** How each skill looks when it lands. */
const LOOK: Record<string, { kind: "melee" | "bolt" | "burst"; color: string; size?: number }> = {
  slash: { kind: "melee", color: "#ffd27a" },
  crush: { kind: "melee", color: "#ffb547", size: 1.6 },
  bash: { kind: "melee", color: "#fff1c9" },
  frost: { kind: "bolt", color: "#7fe9ff" },
  fireball: { kind: "bolt", color: "#ff7a2f", size: 1.9 },
  counter: { kind: "burst", color: "#c58bff" },
  stab: { kind: "melee", color: "#d9b8ff" },
  evis: { kind: "melee", color: "#b07cff", size: 1.5 },
  kick: { kind: "melee", color: "#e7d6ff" },
};

/** The most recent beat matching `test` within `ms` of now. */
function last(test: (b: Beat) => boolean, ms: number) {
  const { duel, t } = frame;
  for (let i = duel.beats.length - 1; i >= 0; i--) {
    const b = duel.beats[i];
    if (t - b.t > ms) return null;
    if (b.t <= t && test(b)) return b;
  }
  return null;
}

export function Scene() {
  const sides = useBattle((s) => s.sides);
  const me = useBattle((s) => s.side);
  const foe = (1 - me) as SideId;
  const shake = useRef(0);
  useFrame(({ camera, clock }) => {
    const s = useBattle.getState();
    frame.duel = current(s);
    frame.t = fightTime(s);
    const big = last((b) => b.kind === "land" && (b.dmg ?? 0) >= 25, 220);
    shake.current = big ? 0.12 * (1 - (frame.t - big.t) / 220) : 0;
    const k = clock.elapsedTime;
    camera.position.set(Math.sin(k * 0.25) * 0.5 + (Math.random() - 0.5) * shake.current, 3.2 + (Math.random() - 0.5) * shake.current, 9.6);
    camera.lookAt(0, 1.3, 0);
  }, -1);
  return (
    <>
      <color attach="background" args={["#050a1e"]} />
      <fog attach="fog" args={["#050a1e", 12, 34]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#7aa2ff", "#1a0b22", 0.6]} />
      <directionalLight position={[3, 9, 6]} intensity={1.5} />
      <pointLight position={[-X, 2.5, 2]} intensity={6} distance={9} color={classes[sides[me]].color} />
      <pointLight position={[X, 2.5, 2]} intensity={6} distance={9} color={classes[sides[foe]].color} />
      <Stars radius={60} depth={30} count={1400} factor={3} fade speed={0.6} />
      <Platform />
      <Fighter side={me} x={-X} />
      <Fighter side={foe} x={X} />
      <Effects me={me} />
      <Sparkles count={50} scale={[14, 4, 6]} position={[0, 2, 0]} size={2} speed={0.3} color="#ff4d6d" opacity={0.5} />
    </>
  );
}

function Platform() {
  const ring = useRef<MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (ring.current) ring.current.opacity = 0.55 + Math.sin(clock.elapsedTime * 2) * 0.15;
  });
  return (
    <group>
      <mesh position={[0, -0.25, 0]} receiveShadow>
        <cylinderGeometry args={[6.4, 6.9, 0.5, 64]} />
        <meshStandardMaterial color="#121a3d" roughness={0.85} metalness={0.15} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}>
        <ringGeometry args={[6.05, 6.35, 96]} />
        <meshBasicMaterial ref={ring} color="#ff4d6d" transparent toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]}>
        <ringGeometry args={[1.1, 1.18, 64]} />
        <meshBasicMaterial color="#5ee7ff" transparent opacity={0.35} toneMapped={false} />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        return (
          <group key={i} position={[Math.cos(a) * 8.2, 0, Math.sin(a) * 8.2 - 2]}>
            <mesh position={[0, 1.6, 0]}>
              <boxGeometry args={[0.5, 3.2, 0.5]} />
              <meshStandardMaterial color="#18224c" roughness={0.7} />
            </mesh>
            <mesh position={[0, 3.35, 0]}>
              <sphereGeometry args={[0.22, 16, 16]} />
              <meshBasicMaterial color={i % 2 ? "#ff4d6d" : "#5ee7ff"} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

const DARK = "#1a2350";
const HURT = new Color("#ff3355");

function Fighter({ side, x }: { side: SideId; x: number }) {
  const cls = useBattle((s) => s.sides[side]);
  const c = classes[cls];
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const arm = useRef<Group>(null);
  const off = useRef<Group>(null);
  const glow = useRef<Mesh>(null);
  const bubble = useRef<Mesh>(null);
  const wall = useRef<Mesh>(null);
  const skin = useRef<MeshStandardMaterial[]>([]);
  const face = x < 0 ? 1 : -1;
  const accent = useRef(new Color()).current.set(c.color);

  useFrame(({ clock }) => {
    const { duel, t } = frame;
    const f = duel.f[side];
    const k = clock.elapsedTime;
    if (!root.current || !body.current || !arm.current || !off.current) return;

    const dead = f.hp <= 0;
    const struck = last((b) => b.kind === "land" && b.by !== side && (b.dmg ?? 0) > 0, 180);
    const swing = last((b) => b.by === side && (b.kind === "land" || b.kind === "miss") && LOOK[b.skill]?.kind === "melee", 320);
    const spell = last((b) => b.by === side && (b.kind === "land" || b.kind === "miss") && LOOK[b.skill]?.kind !== "melee" && !!LOOK[b.skill], 260);
    const dodging = t <= f.dodge;

    const p = swing ? (t - swing.t) / 320 : 0;
    const lunge = swing ? Math.sin(Math.PI * Math.min(1, p)) * 1.1 : 0;
    root.current.position.set(x + face * lunge, 0, dodging ? Math.sin(k * 14) * 0.15 - 0.6 : 0);
    body.current.rotation.z = dead ? 1.45 : struck ? 0.18 : 0;
    body.current.position.y = dead ? 0.38 : Math.sin(k * 3 + side) * 0.04;

    const cast = f.casting;
    const charge = cast ? Math.min(1, (t - cast.start) / (cast.end - cast.start)) : 0;
    const chop = p < 0.25 ? 0.3 + (p / 0.25) * 2.3 : 2.6 - ((p - 0.25) / 0.75) * 2.3;
    const windup = cls === "mage" ? 1 + charge * 0.35 : 1 + charge * 1.6;
    arm.current.rotation.z = cast ? windup : swing ? chop : spell ? 1.4 : 0.25;
    off.current.rotation.z = t <= f.reduce.until ? 1.25 : -0.2;

    if (glow.current) {
      glow.current.scale.setScalar(cast ? 0.4 + charge * 1.1 : spell ? 0.6 : 0.3);
      (glow.current.material as MeshBasicMaterial).opacity = cast ? 0.5 + charge * 0.5 : 0.35;
    }
    if (bubble.current) {
      const on = t <= f.absorb.until && f.absorb.amount > 0;
      bubble.current.visible = on;
      if (on) bubble.current.rotation.y = k;
    }
    if (wall.current) wall.current.visible = t <= f.reduce.until;
    for (const m of skin.current) {
      m.emissive.copy(struck ? HURT : accent);
      m.emissiveIntensity = struck ? 0.9 : 0.12;
      m.opacity = dodging ? 0.35 : 1;
      m.transparent = dodging;
    }
  });

  const mat = (color: string, i: number) => (
    <meshStandardMaterial
      ref={(m) => {
        if (m) skin.current[i] = m;
      }}
      color={color}
      roughness={0.55}
      metalness={0.25}
    />
  );

  return (
    <group ref={root} position={[x, 0, 0]}>
      <group rotation-y={face > 0 ? 0 : Math.PI}>
        <group ref={body}>
          <mesh position={[0, 0.45, 0.18]}>
            <cylinderGeometry args={[0.11, 0.13, 0.9, 10]} />
            {mat(DARK, 0)}
          </mesh>
          <mesh position={[0, 0.45, -0.18]}>
            <cylinderGeometry args={[0.11, 0.13, 0.9, 10]} />
            {mat(DARK, 1)}
          </mesh>
          <mesh position={[0, 1.3, 0]}>
            <capsuleGeometry args={[0.36, 0.62, 6, 14]} />
            {mat(cls === "mage" ? "#243a7a" : cls === "rogue" ? "#2a1d4a" : "#59606f", 2)}
          </mesh>
          <mesh position={[0, 1.3, 0]} scale={[1.02, 0.18, 1.02]}>
            <sphereGeometry args={[0.38, 16, 8]} />
            <meshBasicMaterial color={c.color} toneMapped={false} />
          </mesh>
          <mesh position={[0, 2.08, 0]}>
            <sphereGeometry args={[0.26, 20, 20]} />
            {mat("#f2d0b5", 3)}
          </mesh>
          <Headgear cls={cls} color={c.color} />
          <mesh position={[0.24, 2.1, 0]} scale={[0.2, 0.25, 1.1]}>
            <sphereGeometry args={[0.12, 8, 8]} />
            <meshBasicMaterial color={c.color} toneMapped={false} />
          </mesh>
          <group ref={arm} position={[0, 1.6, 0.46]}>
            <mesh position={[0.18, -0.3, 0]} rotation-z={0.4}>
              <cylinderGeometry args={[0.08, 0.09, 0.62, 8]} />
              {mat(DARK, 4)}
            </mesh>
            <Weapon cls={cls} color={c.color} glow={glow} />
          </group>
          <group ref={off} position={[0, 1.6, -0.46]}>
            <mesh position={[0.15, -0.3, 0]} rotation-z={0.4}>
              <cylinderGeometry args={[0.08, 0.09, 0.62, 8]} />
              {mat(DARK, 5)}
            </mesh>
            {cls === "knight" && (
              <mesh position={[0.42, -0.45, -0.06]}>
                <boxGeometry args={[0.1, 0.8, 0.62]} />
                <meshStandardMaterial color="#8a6a2e" metalness={0.6} roughness={0.35} emissive={c.color} emissiveIntensity={0.15} />
              </mesh>
            )}
            {cls === "rogue" && (
              <mesh position={[0.45, -0.5, 0]} rotation-z={-1.2}>
                <boxGeometry args={[0.05, 0.5, 0.07]} />
                <meshStandardMaterial color="#cfd6ff" metalness={0.9} roughness={0.2} emissive={c.color} emissiveIntensity={0.4} />
              </mesh>
            )}
          </group>
        </group>
        <mesh ref={bubble} position={[0, 1.25, 0]} visible={false}>
          <icosahedronGeometry args={[1.25, 2]} />
          <meshBasicMaterial color="#7fe9ff" transparent opacity={0.22} wireframe blending={AdditiveBlending} toneMapped={false} />
        </mesh>
        <mesh ref={wall} position={[0.9, 1.25, 0]} rotation-y={Math.PI / 2} visible={false}>
          <circleGeometry args={[1.1, 32]} />
          <meshBasicMaterial color="#ffd27a" transparent opacity={0.28} blending={AdditiveBlending} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function Headgear({ cls, color }: { cls: ClassId; color: string }) {
  if (cls === "knight")
    return (
      <mesh position={[0, 2.16, 0]}>
        <cylinderGeometry args={[0.28, 0.3, 0.36, 16, 1, true]} />
        <meshStandardMaterial color="#9aa3b8" metalness={0.8} roughness={0.3} side={DoubleSide} />
      </mesh>
    );
  if (cls === "mage")
    return (
      <mesh position={[0, 2.5, 0]} rotation-z={0.15}>
        <coneGeometry args={[0.34, 0.75, 18]} />
        <meshStandardMaterial color="#1d2f6e" emissive={color} emissiveIntensity={0.25} />
      </mesh>
    );
  return (
    <mesh position={[-0.03, 2.13, 0]} scale={[1.08, 1.05, 1.08]}>
      <sphereGeometry args={[0.28, 18, 18, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
      <meshStandardMaterial color="#1c1233" roughness={0.9} />
    </mesh>
  );
}

function Weapon({ cls, color, glow }: { cls: ClassId; color: string; glow: React.RefObject<Mesh | null> }) {
  if (cls === "knight")
    return (
      <group position={[0.3, -0.6, 0]} rotation-z={-Math.PI / 2}>
        <mesh position={[0, 0.62, 0]}>
          <boxGeometry args={[0.09, 1.15, 0.035]} />
          <meshStandardMaterial color="#e6ecff" metalness={0.95} roughness={0.15} emissive={color} emissiveIntensity={0.25} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.07, 0.07, 0.36]} />
          <meshStandardMaterial color="#c9a14a" metalness={0.8} roughness={0.3} />
        </mesh>
        <mesh ref={glow} position={[0, 1.2, 0]}>
          <sphereGeometry args={[0.18, 12, 12]} />
          <meshBasicMaterial color={color} transparent blending={AdditiveBlending} toneMapped={false} />
        </mesh>
      </group>
    );
  if (cls === "mage")
    return (
      <group position={[0.3, -0.6, 0]} rotation-z={-Math.PI / 2}>
        <mesh position={[0, 0.35, 0]}>
          <cylinderGeometry args={[0.035, 0.045, 1.7, 8]} />
          <meshStandardMaterial color="#5a3b22" roughness={0.8} />
        </mesh>
        <mesh ref={glow} position={[0, 1.28, 0]}>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshBasicMaterial color={color} transparent blending={AdditiveBlending} toneMapped={false} />
        </mesh>
      </group>
    );
  return (
    <group position={[0.3, -0.6, 0]} rotation-z={-Math.PI / 2}>
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[0.05, 0.55, 0.07]} />
        <meshStandardMaterial color="#cfd6ff" metalness={0.9} roughness={0.2} emissive={color} emissiveIntensity={0.4} />
      </mesh>
      <mesh ref={glow} position={[0, 0.6, 0]}>
        <sphereGeometry args={[0.14, 12, 12]} />
        <meshBasicMaterial color={color} transparent blending={AdditiveBlending} toneMapped={false} />
      </mesh>
    </group>
  );
}

const BOLT_MS = 220;
const BURST_MS = 320;

/** Bolts flying, slashes and bursts at the target, sparks on interrupts. */
function Effects({ me }: { me: SideId }) {
  const bolt = useRef<Mesh>(null);
  const burst = useRef<Mesh>(null);
  const arc = useRef<Mesh>(null);
  const cut = useRef<Mesh>(null);
  const xOf = (side: SideId) => (side === me ? -X : X);

  useFrame(() => {
    const { t } = frame;
    const b = last((x) => (x.kind === "land" || x.kind === "miss") && LOOK[x.skill]?.kind === "bolt", BOLT_MS + BURST_MS);
    if (bolt.current) {
      const flying = b && t - b.t < BOLT_MS;
      bolt.current.visible = !!flying;
      if (b && flying) {
        const p = (t - b.t) / BOLT_MS;
        const from = xOf(b.by);
        const to = xOf((1 - b.by) as SideId);
        bolt.current.position.set(from + (to - from) * p, 1.9 - p * 0.5, 0.4);
        bolt.current.scale.setScalar(0.28 * (LOOK[b.skill].size ?? 1));
        (bolt.current.material as MeshBasicMaterial).color.set(LOOK[b.skill].color);
      }
    }
    const hit = last((x) => x.kind === "land" && !!LOOK[x.skill] && (LOOK[x.skill].kind !== "bolt" || t - x.t >= BOLT_MS), BOLT_MS + BURST_MS);
    if (burst.current && arc.current) {
      const start = hit ? hit.t + (LOOK[hit.skill].kind === "bolt" ? BOLT_MS : 0) : 0;
      const p = hit ? (t - start) / BURST_MS : 1;
      const on = !!hit && p >= 0 && p < 1;
      const melee = on && LOOK[hit!.skill].kind === "melee";
      burst.current.visible = on && !melee;
      arc.current.visible = melee;
      if (on) {
        const look = LOOK[hit!.skill];
        const x = xOf((1 - hit!.by) as SideId);
        const size = look.size ?? 1;
        const target = melee ? arc.current : burst.current;
        target.position.set(x, 1.4, 0.3);
        target.scale.setScalar((melee ? 0.9 : 0.4 + p * 1.4) * size);
        if (melee) arc.current.rotation.z = (hit!.by === me ? -1 : 1) * (0.6 + p * 1.8);
        const m = target.material as MeshBasicMaterial;
        m.color.set(look.color);
        m.opacity = 1 - p;
      }
    }
    const c = last((x) => x.kind === "cut", 400);
    if (cut.current) {
      cut.current.visible = !!c;
      if (c) {
        const p = (t - c.t) / 400;
        cut.current.position.set(xOf(c.by), 2.1, 0.4);
        cut.current.scale.setScalar(0.3 + p * 1.6);
        cut.current.rotation.z = p * 3;
        (cut.current.material as MeshBasicMaterial).opacity = 1 - p;
      }
    }
  });

  return (
    <>
      <mesh ref={bolt} visible={false}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial transparent blending={AdditiveBlending} toneMapped={false} />
      </mesh>
      <mesh ref={burst} visible={false}>
        <sphereGeometry args={[1, 20, 20]} />
        <meshBasicMaterial transparent blending={AdditiveBlending} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh ref={arc} visible={false}>
        <torusGeometry args={[0.9, 0.06, 6, 32, Math.PI * 0.9]} />
        <meshBasicMaterial transparent blending={AdditiveBlending} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh ref={cut} visible={false}>
        <torusGeometry args={[0.5, 0.05, 4, 6]} />
        <meshBasicMaterial color="#ffffff" transparent blending={AdditiveBlending} toneMapped={false} depthWrite={false} />
      </mesh>
    </>
  );
}
