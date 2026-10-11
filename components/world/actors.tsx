"use client";

import { Billboard, Html, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, Color, DoubleSide, type Group, type Mesh, type MeshBasicMaterial, Vector3 } from "three";
import { districts, jumpPads, type NpcDef, npcs, orbs, palette, RACE, type StationDef, stations, type Vec3 } from "./config";
import { BrandDisc } from "./brand";
import { FONT } from "./districts";
import { MAX_LEVEL, npcLevel, objectivesMet, type Objective, quests } from "./quests";
import { live, useGame, waypoint } from "./store";
import styles from "./world.module.css";

const glow = (hex: string, k = 2.5) => new Color(hex).multiplyScalar(k);
const tmp = new Vector3();

export const RING_RADIUS = 4.5;
const REACH = 5;
const LABEL_RANGE = 48;

export function Actors() {
  return (
    <>
      <Npcs />
      {stations.map((s) => (
        <Kiosk key={s.id} s={s} />
      ))}
      <Orbs />
      <RaceRings />
      <JumpPads />
      <LaunchedAgents />
      <Waypoint />
      <Interactions />
    </>
  );
}

/** The first unfinished objective of the tracked quest, if it is active. */
function currentObjective(s: ReturnType<typeof useGame.getState>): Objective | null {
  const id = s.tracked;
  if (!id || s.quests[id]?.status !== "active") return null;
  const q = quests.find((x) => x.id === id)!;
  return q.objectives.find((o) => (s.quests[id].progress[o.id]?.length ?? 0) < (o.count ?? 1)) ?? null;
}

function isTarget(o: Objective | null, n: NpcDef) {
  if (!o) return false;
  if (o.event === "talk") return o.match === n.id || !!(o.match && n.tags?.includes(o.match));
  return o.at === n.position;
}

function Npcs() {
  const status = useGame((s) => s.quests);
  const marks = useMemo(() => {
    const offer = new Set<string>();
    const turnIn = new Set<string>();
    for (const q of quests) {
      const st = status[q.id];
      if (!st) continue;
      if (st.status === "available") offer.add(q.giver);
      if (st.status === "active" && objectivesMet(q, st.progress)) turnIn.add(q.giver);
    }
    return { offer, turnIn };
  }, [status]);
  const objective = useGame(currentObjective);
  return (
    <>
      {npcs.map((n) => (
        <Npc key={n.id} n={n} mark={marks.turnIn.has(n.id) ? "?" : marks.offer.has(n.id) ? "!" : null} target={isTarget(objective, n)} />
      ))}
    </>
  );
}

/** Hides a nameplate once the player is far away, with hysteresis so the edge doesn't flicker. */
function useFade(ref: React.RefObject<HTMLDivElement | null>, at: Vec3, range = LABEL_RANGE) {
  const shown = useRef(false);
  useFrame(() => {
    const el = ref.current;
    if (!el) return;
    const d = tmp.set(...at).distanceTo(live.pos);
    const next = shown.current ? d < range + 12 : d < range;
    if (next === shown.current) return;
    shown.current = next;
    el.style.visibility = next ? "visible" : "hidden";
    el.style.opacity = next ? "1" : "0";
  });
}

function Npc({ n, mark, target }: { n: NpcDef; mark: "!" | "?" | null; target: boolean }) {
  const body = useRef<Group>(null);
  const label = useRef<HTMLDivElement>(null);
  const agent = n.kind === "agent";
  const head = agent ? 2.2 : 2.6;
  const lvl = npcLevel(n);
  useFade(label, n.position);

  useFrame(({ clock }) => {
    const g = body.current;
    if (!g) return;
    const t = clock.elapsedTime + n.position[0] * 0.1;
    if (agent) {
      g.position.y = Math.sin(t * 1.8) * 0.35;
      g.rotation.y += 0.01;
      return;
    }
    const dx = live.pos.x - n.position[0];
    const dz = live.pos.z - n.position[2];
    if (dx * dx + dz * dz < 600) {
      const turn = Math.atan2(dx, dz) - g.rotation.y;
      g.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * 0.08;
    }
    g.position.y = Math.sin(t * 2) * 0.03;
  });

  return (
    <group position={n.position}>
      <group ref={body}>{agent ? <Robot n={n} /> : <Human n={n} />}</group>
      {mark && <Marker y={head + 1.6} glyph={mark} />}
      {target && <Diamond y={head + (mark ? 3.2 : 1.7)} />}
      <Html ref={label} position={[0, head + 0.7, 0]} center zIndexRange={[10, 0]} pointerEvents="none" style={{ visibility: "hidden", opacity: 0 }}>
        <div className={styles.nameplate} data-kind={n.kind} data-max={lvl >= MAX_LEVEL || undefined}>
          <b>
            <em>{lvl}</em>
            {n.name}
          </b>
          <span>&lt;{n.title}&gt;</span>
        </div>
      </Html>
    </group>
  );
}

function Human({ n }: { n: NpcDef }) {
  return (
    <group>
      <mesh position={[0, 1.1, 0]} castShadow>
        <capsuleGeometry args={[0.42, 0.9, 6, 16]} />
        <meshStandardMaterial color={n.color} roughness={0.45} metalness={0.15} />
      </mesh>
      <mesh position={[0, 1.25, 0]}>
        <cylinderGeometry args={[0.44, 0.44, 0.14, 20]} />
        <meshBasicMaterial color={glow(n.accent, 1.6)} toneMapped={false} />
      </mesh>
      <mesh position={[0, 2.15, 0]} castShadow>
        <sphereGeometry args={[0.36, 24, 16]} />
        <meshStandardMaterial color="#f1e2d3" roughness={0.6} />
      </mesh>
      {n.photo ? (
        <group position={[0, 2.18, 0.36]}>
          <BrandDisc src={n.photo} radius={0.28} />
        </group>
      ) : (
        <mesh position={[0, 2.18, 0.2]} scale={[1, 0.45, 0.6]}>
          <sphereGeometry args={[0.26, 16, 12]} />
          <meshStandardMaterial color="#0b1640" emissive={n.accent} emissiveIntensity={1.2} roughness={0.1} />
        </mesh>
      )}
    </group>
  );
}

function Robot({ n }: { n: NpcDef }) {
  return (
    <group>
      <mesh castShadow>
        <icosahedronGeometry args={[0.95, 0]} />
        <meshStandardMaterial color="#0b1640" emissive={n.color} emissiveIntensity={1.1} metalness={0.6} roughness={0.25} flatShading />
      </mesh>
      {[-0.3, 0.3].map((x) => (
        <mesh key={x} position={[x, 0.15, 0.82]}>
          <sphereGeometry args={[0.13, 12, 8]} />
          <meshBasicMaterial color={glow(n.accent, 4)} toneMapped={false} />
        </mesh>
      ))}
      <mesh rotation-x={Math.PI / 2}>
        <torusGeometry args={[1.45, 0.06, 8, 48]} />
        <meshBasicMaterial color={glow(n.color, 2.4)} toneMapped={false} />
      </mesh>
      {n.photo && (
        <group position={[0, 0, 1.05]}>
          <BrandDisc src={n.photo} radius={0.42} />
        </group>
      )}
    </group>
  );
}

function Marker({ y, glyph }: { y: number; glyph: "!" | "?" }) {
  return (
    <Billboard position={[0, y, 0]}>
      <Text font={FONT} fontSize={1.5} anchorY="middle" outlineWidth={0.06} outlineColor="#020616">
        {glyph}
        <meshBasicMaterial color={glow(palette.gold, 2.6)} toneMapped={false} />
      </Text>
    </Billboard>
  );
}

function Diamond({ y }: { y: number }) {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 2;
    ref.current.position.y = y + Math.sin(clock.elapsedTime * 3) * 0.2;
  });
  return (
    <mesh ref={ref} position-y={y}>
      <octahedronGeometry args={[0.45]} />
      <meshBasicMaterial color={glow(palette.cyan, 3)} toneMapped={false} />
    </mesh>
  );
}

function Kiosk({ s }: { s: StationDef }) {
  const label = useRef<HTMLDivElement>(null);
  const screen = useRef<MeshBasicMaterial>(null);
  const base = useMemo(() => new Color(s.color), [s.color]);
  useFade(label, s.position);
  useFrame(({ clock }) => {
    if (screen.current) screen.current.color.copy(base).multiplyScalar(1.3 + Math.sin(clock.elapsedTime * 2.5) * 0.3);
  });
  return (
    <group position={s.position}>
      <mesh position={[0, 0.15, 0]} receiveShadow>
        <cylinderGeometry args={[1.6, 1.8, 0.3, 24]} />
        <meshStandardMaterial color="#0c1a45" metalness={0.5} roughness={0.35} />
      </mesh>
      <mesh position={[0, 1.05, -0.14]} castShadow>
        <boxGeometry args={[0.72, 1.7, 0.28]} />
        <meshStandardMaterial color="#e6eeff" metalness={0.3} roughness={0.35} />
      </mesh>
      <mesh position={[0, 2.25, 0.05]} rotation-x={-0.25} castShadow>
        <boxGeometry args={[1.8, 1.1, 0.12]} />
        <meshStandardMaterial color="#0b1230" />
      </mesh>
      <mesh position={[0, 2.25, 0.12]} rotation-x={-0.25}>
        <planeGeometry args={[1.6, 0.9]} />
        <meshBasicMaterial ref={screen} toneMapped={false} />
      </mesh>
      {s.logo && (
        <group position={[0, 2.25, 0.2]} rotation-x={-0.25}>
          <BrandDisc src={s.logo} radius={0.38} />
        </group>
      )}
      <mesh position={[0, 0.32, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[1.9, 2.15, 48]} />
        <meshBasicMaterial color={glow(s.color, 2)} toneMapped={false} />
      </mesh>
      <Html ref={label} position={[0, 3.4, 0]} center zIndexRange={[10, 0]} pointerEvents="none" style={{ visibility: "hidden", opacity: 0 }}>
        <div className={styles.nameplate} data-kind="station">
          <b>{s.label}</b>
        </div>
      </Html>
    </group>
  );
}

function Orbs() {
  const active = useGame((s) => s.quests.gm.status === "active");
  const got = useGame((s) => s.quests.gm.progress.orbs);
  const group = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (group.current) group.current.children.forEach((c, i) => (c.position.y = Math.sin(clock.elapsedTime * 2 + i) * 0.3));
    if (!active) return;
    const g = useGame.getState();
    const taken = g.quests.gm.progress.orbs ?? [];
    orbs.forEach((p, i) => {
      const id = `orb-${i}`;
      if (!taken.includes(id) && tmp.set(...p).distanceTo(live.pos) < 2.2) g.emit({ type: "collect", id });
    });
  });

  if (!active) return null;
  return (
    <group ref={group}>
      {orbs.map((p, i) =>
        got?.includes(`orb-${i}`) ? (
          <group key={i} />
        ) : (
          <group key={i}>
            <group position={p}>
              <mesh>
                <sphereGeometry args={[0.6, 24, 16]} />
                <meshBasicMaterial color={glow(palette.baseBright, 3.5)} toneMapped={false} />
              </mesh>
              <mesh rotation-x={Math.PI / 2}>
                <torusGeometry args={[1.1, 0.06, 8, 48]} />
                <meshBasicMaterial color={glow(palette.cyan, 2.5)} toneMapped={false} />
              </mesh>
            </group>
          </group>
        ),
      )}
    </group>
  );
}

function RaceRings() {
  const shown = useGame((s) => s.quests.race.status === "active" || s.quests.race.status === "done");
  const next = useGame((s) => s.race.next);
  const running = useGame((s) => s.race.running);
  const yaw = useMemo(
    () =>
      RACE.rings.map((_, i) => {
        const a = RACE.rings[Math.max(0, i - 1)];
        const b = RACE.rings[Math.min(RACE.rings.length - 1, i + 1)];
        return Math.atan2(b[0] - a[0], b[2] - a[2]);
      }),
    [],
  );

  useFrame(() => {
    if (!shown) return;
    const g = useGame.getState();
    const { race } = g;
    if (race.running && (performance.now() - race.start) / 1000 > RACE.limit) return g.failRace(`Time's up at ${RACE.limit}s`);
    if (tmp.set(...RACE.rings[race.next]).distanceTo(live.pos) < RING_RADIUS + 0.5) g.passRing(race.next);
  });

  if (!shown) return null;
  return (
    <>
      {RACE.rings.map((p, i) => {
        const hot = i === next;
        const passed = running && i < next;
        return (
          <group key={i} position={p} rotation-y={yaw[i]}>
            <mesh>
              <torusGeometry args={[RING_RADIUS, hot ? 0.38 : 0.22, 12, 64]} />
              <meshBasicMaterial
                color={hot ? glow(palette.gold, 3.2) : passed ? glow(palette.cyan, 0.6) : glow(palette.cyan, 1.6)}
                transparent={passed}
                opacity={passed ? 0.35 : 1}
                toneMapped={false}
              />
            </mesh>
            {hot && (
              <mesh>
                <circleGeometry args={[RING_RADIUS - 0.3, 48]} />
                <meshBasicMaterial color={glow(palette.gold, 0.6)} transparent opacity={0.12} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} />
              </mesh>
            )}
          </group>
        );
      })}
    </>
  );
}

function JumpPads() {
  const spin = useRef<Group>(null);
  useFrame((_, dt) => spin.current?.children.forEach((c) => (c.rotation.y += dt * 1.5)));
  return (
    <group ref={spin}>
      {jumpPads.map((p, i) => (
        <group key={i} position={p.position}>
          <mesh rotation-x={-Math.PI / 2} position-y={0.1}>
            <circleGeometry args={[3.4, 48]} />
            <meshStandardMaterial color="#0b1640" emissive={palette.cyan} emissiveIntensity={0.6} />
          </mesh>
          {[1.4, 2.4, 3.3].map((r) => (
            <mesh key={r} rotation-x={-Math.PI / 2} position-y={0.14}>
              <ringGeometry args={[r - 0.18, r, 48]} />
              <meshBasicMaterial color={glow(palette.cyan, 2.6)} toneMapped={false} />
            </mesh>
          ))}
          <mesh position-y={6}>
            <cylinderGeometry args={[2.6, 3.4, 12, 32, 1, true]} />
            <meshBasicMaterial color={glow(palette.cyan, 0.9)} transparent opacity={0.16} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function LaunchedAgents() {
  const agents = useGame((s) => s.agents);
  const pad = stations.find((s) => s.id === "station-launch")!.position;
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    ref.current?.children.forEach((c, i) => {
      const a = clock.elapsedTime * (0.5 + i * 0.07) + i * 2.1;
      const r = 8 + (i % 3) * 2.5;
      c.position.set(Math.cos(a) * r, 6 + Math.sin(a * 2) * 1.2 + (i % 3) * 2, Math.sin(a) * r);
      c.rotation.y = -a;
    });
  });
  return (
    <group ref={ref} position={pad}>
      {agents.map((a, i) => (
        <group key={i}>
          <mesh>
            <icosahedronGeometry args={[0.7, 0]} />
            <meshStandardMaterial color="#0b1640" emissive={a.color} emissiveIntensity={1.6} flatShading />
          </mesh>
          <Billboard position={[0, 1.3, 0]}>
            <Text font={FONT} fontSize={0.5} color="#dce8ff" outlineWidth={0.03} outlineColor="#020616">
              {`$${a.ticker}`}
            </Text>
          </Billboard>
        </group>
      ))}
    </group>
  );
}

function Waypoint() {
  const group = useRef<Group>(null);
  const gem = useRef<Mesh>(null);
  const shaft = useRef<MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const s = useGame.getState();
    const wp = s.started ? waypoint(s, live.pos) : null;
    const d = wp ? tmp.set(...wp.pos).distanceTo(live.pos) : 0;
    g.visible = !!wp && d > 8;
    if (!wp || !g.visible) return;
    g.position.set(wp.pos[0], 0, wp.pos[2]);
    if (gem.current) {
      gem.current.rotation.y = clock.elapsedTime * 1.3;
      gem.current.position.y = 3.2 + Math.sin(clock.elapsedTime * 2.1) * 0.22;
    }
    if (shaft.current) shaft.current.opacity = d > 80 ? 0.2 : 0.08;
  });
  return (
    <group ref={group} visible={false}>
      <mesh position-y={22}>
        <cylinderGeometry args={[0.12, 0.38, 40, 8, 1, true]} />
        <meshBasicMaterial
          ref={shaft}
          color={glow(palette.gold, 1.05)}
          transparent
          opacity={0.12}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
          fog={false}
        />
      </mesh>
      <mesh ref={gem}>
        <octahedronGeometry args={[0.5]} />
        <meshBasicMaterial color={glow(palette.gold, 2.2)} toneMapped={false} />
      </mesh>
    </group>
  );
}

const interactables = [
  ...npcs.map((n) => ({ id: n.id, p: n.position })),
  ...stations.map((s) => ({ id: s.id, p: s.position })),
];
const zones = [...districts].sort((a, b) => a.radius - b.radius);

/** Proximity: which NPC/station the E key would open, and which district the player stands in. */
function Interactions() {
  useFrame(() => {
    const g = useGame.getState();
    const { x, y, z } = live.pos;
    let best: string | null = null;
    let bestD = REACH;
    for (const it of interactables) {
      if (Math.abs(y - 1 - it.p[1]) > 4) continue;
      const d = Math.hypot(x - it.p[0], z - it.p[2]);
      if (d < bestD) [best, bestD] = [it.id, d];
    }
    g.setNearby(best);
    const here = g.district;
    const zone = zones.find((d) => {
      const pad = here === d.id ? 10 : 0;
      return Math.hypot(x - d.center[0], z - d.center[1]) < d.radius + pad && (d.minY === undefined || y >= d.minY);
    });
    g.setDistrict(zone?.id ?? null);
  });
  return null;
}
