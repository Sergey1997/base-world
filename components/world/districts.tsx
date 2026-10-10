"use client";

import { Billboard, Sparkles, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { CuboidCollider, CylinderCollider, RigidBody } from "@react-three/rapier";
import { useLayoutEffect, useMemo, useRef } from "react";
import { AdditiveBlending, Color, DoubleSide, type Group, type InstancedMesh, type Mesh, Object3D } from "three";
import { BrandDisc } from "./brand";
import { type DistrictDef, districtById, districts, palette, RACE, stations, SUMMIT, type Vec3 } from "./config";
import { windowMaterial } from "./environment";
import { useGame } from "./store";

export const FONT = "/world/Unbounded.ttf";

const glow = (hex: string, k = 2.5) => new Color(hex).multiplyScalar(k);
const station = (id: string) => stations.find((s) => s.id === id)!.position;

export function Districts() {
  return (
    <>
      <Plaza />
      <Summit />
      <Aerodrome />
      <Virtuals />
      {districts
        .filter((d) => d.look)
        .map((d) => (
          <ProtocolDistrict key={d.id} d={d} />
        ))}
    </>
  );
}

export function Sign({ position, text, sub, color, size = 4, logo }: { position: Vec3; text: string; sub?: string; color: string; size?: number; logo?: string }) {
  return (
    <Billboard position={position} lockX lockZ>
      {logo && (
        <group position={[0, size * 0.85, 0]}>
          <BrandDisc src={logo} radius={size * 0.55} />
        </group>
      )}
      <Text font={FONT} fontSize={size} letterSpacing={-0.02} anchorY="bottom" outlineWidth={size * 0.04} outlineColor="#020616">
        {text}
        <meshBasicMaterial color={glow(color, 1.6)} toneMapped={false} />
      </Text>
      {sub && (
        <Text font={FONT} fontSize={size * 0.3} position={[0, -size * 0.35, 0]} anchorY="top" color="#dce8ff" outlineWidth={size * 0.015} outlineColor="#020616">
          {sub}
        </Text>
      )}
    </Billboard>
  );
}

function Spin({ speed = 0.4, axis = "y", children, ...props }: { speed?: number; axis?: "x" | "y" | "z"; children: React.ReactNode; position?: Vec3; rotation?: Vec3 }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation[axis] += dt * speed;
  });
  return (
    <group ref={ref} {...props}>
      {children}
    </group>
  );
}

function Floor({ center, radius, color, rings = 3, y = 0.06 }: { center: [number, number]; radius: number; color: string; rings?: number; y?: number }) {
  return (
    <group position={[center[0], y, center[1]]}>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[radius, 96]} />
        <meshStandardMaterial color="#1c2f74" roughness={0.8} metalness={0.15} />
      </mesh>
      {Array.from({ length: rings }, (_, i) => {
        const outer = radius * (0.3 + i * 0.22);
        return (
          <mesh key={i} rotation-x={-Math.PI / 2} position-y={0.006}>
            <ringGeometry args={[outer - 0.32, outer, 96]} />
            <meshBasicMaterial color={glow(color, 1.25)} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

function Plaza() {
  const posts = useMemo(() => Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2), []);
  return (
    <group>
      <Floor center={[0, 0]} radius={46} color={palette.base} />
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[2, 3.2]} position={[0, 2, 0]} />
      </RigidBody>
      <mesh position={[0, 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[2.6, 3.2, 4, 32]} />
        <meshStandardMaterial color="#13235a" metalness={0.6} roughness={0.3} />
      </mesh>
      <Spin speed={0.35} position={[0, 12, 0]}>
        <mesh castShadow>
          <torusGeometry args={[7, 0.55, 20, 96]} />
          <meshStandardMaterial color={palette.base} emissive={palette.base} emissiveIntensity={3} toneMapped={false} />
        </mesh>
        <mesh rotation-y={Math.PI / 2}>
          <torusGeometry args={[5.2, 0.25, 16, 80]} />
          <meshBasicMaterial color={glow(palette.cyan, 2)} toneMapped={false} />
        </mesh>
      </Spin>
      <mesh position={[0, 12, 0]}>
        <sphereGeometry args={[2.4, 32, 32]} />
        <meshBasicMaterial color={glow("#5b8cff", 3)} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 12, 0]} color={palette.baseBright} intensity={140} distance={50} />
      <Sparkles count={60} scale={[26, 22, 26]} position={[0, 11, 0]} size={7} speed={0.5} color={palette.cyan} />
      {posts.map((a) => (
        <group key={a} position={[Math.cos(a) * 40, 0, Math.sin(a) * 40]}>
          <mesh position={[0, 2.5, 0]} castShadow>
            <cylinderGeometry args={[0.15, 0.2, 5, 8]} />
            <meshStandardMaterial color="#1b2b66" metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[0, 5.2, 0]}>
            <sphereGeometry args={[0.45, 16, 12]} />
            <meshBasicMaterial color={glow("#9cc2ff", 3)} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <Sign position={[0, 21, 0]} text="BASE WORLD" sub="Base Plaza · gm" color={palette.baseBright} size={5} logo="/world/brands/base.png" />
    </group>
  );
}

function Summit() {
  const { center, radius, height } = SUMMIT;
  return (
    <group position={[center[0], 0, center[1]]}>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[height / 2, radius]} position={[0, height / 2, 0]} />
        <CylinderCollider args={[10, 2.2]} position={[0, height + 10, -12]} />
      </RigidBody>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius + 6, height, 9]} />
        <meshStandardMaterial color="#223b8c" flatShading roughness={0.9} />
      </mesh>
      <Floor center={[0, 0]} radius={radius - 1} color={palette.cyan} y={height + 0.05} rings={2} />
      <mesh position={[0, height + 10, -12]} castShadow>
        <cylinderGeometry args={[1.2, 2.2, 20, 8]} />
        <meshStandardMaterial color="#dce8ff" metalness={0.3} roughness={0.3} />
      </mesh>
      <mesh position={[0, height + 21, -12]}>
        <octahedronGeometry args={[2.4]} />
        <meshBasicMaterial color={glow(palette.cyan, 3)} toneMapped={false} />
      </mesh>
      <mesh position={[0, height + 120, -12]}>
        <cylinderGeometry args={[1.4, 1.4, 200, 16, 1, true]} />
        <meshBasicMaterial color={glow(palette.cyan, 1)} transparent opacity={0.25} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} />
      </mesh>
      <Sign position={[0, height + 26, -12]} text="SUMMIT" sub="Captain Bryan's lookout" color={palette.cyan} />
    </group>
  );
}

function Plane({ color = "#f4f7ff", accent = palette.aero }: { color?: string; accent?: string }) {
  return (
    <group>
      <mesh rotation-x={Math.PI / 2} castShadow>
        <capsuleGeometry args={[1.6, 14, 8, 16]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0, 1]} castShadow>
        <boxGeometry args={[22, 0.35, 3.4]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.3, -7.6]} castShadow>
        <boxGeometry args={[7, 0.3, 1.8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 2.4, -7.4]} castShadow>
        <boxGeometry args={[0.3, 4, 2.4]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.4} />
      </mesh>
      {[-11, 11].map((x) => (
        <mesh key={x} position={[x, 0, 1]}>
          <sphereGeometry args={[0.3, 8, 8]} />
          <meshBasicMaterial color={x < 0 ? glow("#ff3355", 4) : glow("#33ff88", 4)} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function FlyingPlane() {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.035;
    const g = ref.current;
    if (!g) return;
    g.position.set(240 + Math.cos(t) * 150, 70 + Math.sin(t * 2) * 6, -40 + Math.sin(t) * 110);
    g.rotation.set(0, Math.atan2(-Math.sin(t) * 150, Math.cos(t) * 110), -0.35);
  });
  return (
    <group ref={ref}>
      <Plane />
    </group>
  );
}

function RunwayLights() {
  const mesh = useRef<InstancedMesh>(null);
  const lights = useMemo(() => {
    const out: Vec3[] = [];
    for (let x = 135; x <= 355; x += 8) out.push([x, 0.25, -45.5], [x, 0.25, -14.5]);
    return out;
  }, []);
  useLayoutEffect(() => {
    const o = new Object3D();
    lights.forEach((p, i) => {
      o.position.set(...p);
      o.updateMatrix();
      mesh.current!.setMatrixAt(i, o.matrix);
      mesh.current!.setColorAt(i, i % 4 < 2 ? new Color(3, 3, 3.4) : new Color(3.4, 1.4, 0.5));
    });
    mesh.current!.instanceMatrix.needsUpdate = true;
    mesh.current!.computeBoundingSphere();
  }, [lights]);
  const mat = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (mat.current) mat.current.position.x = 135 + ((clock.elapsedTime * 22) % 220);
  });
  return (
    <>
      <instancedMesh ref={mesh} args={[undefined, undefined, lights.length]}>
        <sphereGeometry args={[0.35, 8, 6]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <mesh ref={mat} position={[135, 0.3, -30]}>
        <boxGeometry args={[2, 0.1, 30]} />
        <meshBasicMaterial color={glow(palette.cyan, 1.5)} transparent opacity={0.5} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
    </>
  );
}

function Aerodrome() {
  const terminal = useMemo(windowMaterial, []);
  const pool = station("station-pool");
  const vote = station("station-vote");
  return (
    <group>
      {/* runway + apron */}
      <mesh position={[245, 0.07, -30]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[232, 32]} />
        <meshStandardMaterial color="#0b0f24" roughness={0.75} />
      </mesh>
      {Array.from({ length: 16 }, (_, i) => (
        <mesh key={i} position={[142 + i * 14, 0.09, -30]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[7, 0.8]} />
          <meshBasicMaterial color="#e9eef9" />
        </mesh>
      ))}
      <mesh position={[235, 0.065, 18]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[130, 40]} />
        <meshStandardMaterial color="#1b2550" roughness={0.6} metalness={0.2} />
      </mesh>
      <RunwayLights />

      {/* terminal */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[60, 8, 11]} position={[235, 8, 52]} />
        <CylinderCollider args={[17, 3]} position={[335, 17, 25]} />
        <CuboidCollider args={[15, 9, 16]} position={[160, 9, -150]} />
        <CuboidCollider args={[15, 9, 16]} position={[205, 9, -150]} />
      </RigidBody>
      <mesh position={[235, 8, 52]} castShadow receiveShadow material={terminal}>
        <boxGeometry args={[120, 16, 22]} />
      </mesh>
      <mesh position={[235, 16.6, 52]} castShadow>
        <boxGeometry args={[124, 1.2, 26]} />
        <meshStandardMaterial color="#f2f5ff" roughness={0.3} />
      </mesh>
      <mesh position={[235, 17.4, 39]}>
        <boxGeometry args={[124, 0.4, 0.4]} />
        <meshBasicMaterial color={glow(palette.aero, 3)} toneMapped={false} />
      </mesh>
      <Sign position={[235, 19, 46]} text="AERODROME" sub="The liquidity layer of Base · swap · pool · vote" color={palette.aero} size={6} logo="/world/brands/aerodrome.png" />

      {/* epoch board */}
      <group position={[300, 7, 34]}>
        <mesh>
          <boxGeometry args={[22, 12, 0.6]} />
          <meshStandardMaterial color="#060a1c" emissive="#0a1440" />
        </mesh>
        <EpochBoard />
      </group>

      {/* control tower */}
      <group position={[335, 0, 25]}>
        <mesh position={[0, 17, 0]} castShadow>
          <cylinderGeometry args={[2.2, 3, 34, 16]} />
          <meshStandardMaterial color="#e8eefc" roughness={0.4} />
        </mesh>
        <mesh position={[0, 36, 0]} castShadow>
          <cylinderGeometry args={[6.5, 5, 5, 12]} />
          <meshStandardMaterial color="#0d1a40" emissive={palette.cyan} emissiveIntensity={0.9} metalness={0.8} roughness={0.1} />
        </mesh>
        <mesh position={[0, 39, 0]}>
          <coneGeometry args={[7, 2.5, 12]} />
          <meshStandardMaterial color="#f2f5ff" />
        </mesh>
        <Spin speed={0.55} position={[0, 41.4, 0]}>
          <mesh position={[0.9, 0, 0]}>
            <boxGeometry args={[1.8, 0.6, 0.6]} />
            <meshBasicMaterial color={glow(palette.aero, 5)} toneMapped={false} />
          </mesh>
        </Spin>
      </group>

      {/* hangars and parked planes */}
      {[160, 205].map((x) => (
        <group key={x} position={[x, 0, -150]}>
          <mesh rotation-x={Math.PI / 2} position-y={0} castShadow receiveShadow>
            <cylinderGeometry args={[15, 15, 32, 24, 1, false, -Math.PI / 2, Math.PI]} />
            <meshStandardMaterial color="#cfd9f5" metalness={0.5} roughness={0.35} side={DoubleSide} />
          </mesh>
          <mesh position={[0, 15.2, 0]}>
            <boxGeometry args={[0.6, 0.6, 32]} />
            <meshBasicMaterial color={glow(palette.aero, 2.5)} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <group position={[290, 2.4, -150]} rotation-y={0.6}>
        <Plane />
      </group>
      <group position={[335, 2.4, -145]} rotation-y={-0.4}>
        <Plane color="#dce8ff" accent={palette.base} />
      </group>
      <FlyingPlane />

      {/* protocol props: liquidity pool and vote booth */}
      <group position={[pool[0], 0, pool[2] + 8]}>
        <mesh position-y={0.4}>
          <cylinderGeometry args={[7, 7.4, 0.8, 48]} />
          <meshStandardMaterial color="#e6eeff" roughness={0.3} />
        </mesh>
        <mesh position-y={0.82} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[6.4, 48]} />
          <meshStandardMaterial color="#0a5bd8" emissive={palette.cyan} emissiveIntensity={0.7} metalness={0.2} roughness={0.05} />
        </mesh>
        <Spin speed={0.8} position={[0, 3, 0]}>
          <mesh position={[3.2, 0, 0]}>
            <sphereGeometry args={[1, 24, 16]} />
            <meshStandardMaterial color="#cfd8ff" metalness={1} roughness={0.15} />
          </mesh>
          <mesh position={[-3.2, 0, 0]}>
            <sphereGeometry args={[1, 24, 16]} />
            <meshBasicMaterial color={glow(palette.aero, 2.5)} toneMapped={false} />
          </mesh>
        </Spin>
        <Sparkles count={40} scale={[12, 4, 12]} position={[0, 2, 0]} size={6} color={palette.cyan} />
      </group>
      <group position={[vote[0], 0, vote[2] + 6]}>
        {[-4, 0, 4].map((x, i) => (
          <mesh key={x} position={[x, 2 + i, 0]} castShadow>
            <boxGeometry args={[2.6, 4 + i * 2, 2.6]} />
            <meshStandardMaterial color={["#3d7bff", palette.aero, palette.gold][i]} emissive={["#3d7bff", palette.aero, palette.gold][i]} emissiveIntensity={0.35} />
          </mesh>
        ))}
      </group>
      <RaceGates />
    </group>
  );
}

function EpochBoard() {
  const votes = useGame((s) => s.votes);
  const total = Object.values(votes).reduce((a, b) => a + b, 0);
  const top = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  return (
    <group position={[0, 0, 0.4]}>
      <Text font={FONT} fontSize={1.4} position={[0, 3.6, 0]} color={palette.aero}>
        EPOCH 142
      </Text>
      <Text font={FONT} fontSize={0.8} position={[0, 1.4, 0]} color="#dce8ff">
        {total > 0 ? `Your votes: ${Math.round(total)} veAERO` : "Lock AERO · vote · earn"}
      </Text>
      <Text font={FONT} fontSize={0.8} position={[0, -0.6, 0]} color={palette.cyan}>
        {top ? `Leading gauge: ${top[0]}` : "Leading gauge: ETH/AERO"}
      </Text>
      <Text font={FONT} fontSize={0.6} position={[0, -3, 0]} color="#8fa6e8">
        Emissions follow the votes
      </Text>
    </group>
  );
}

function RaceGates() {
  const [a, b] = [RACE.rings[0], RACE.rings[RACE.rings.length - 1]];
  return (
    <>
      <Sign position={[a[0] - 6, 12, a[2]]} text="RUNWAY RUSH" sub={`${RACE.rings.length} rings · ${RACE.limit}s`} color={palette.cyan} size={2.6} />
      <mesh position={[b[0], 0.1, b[2]]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[5, 5.6, 48]} />
        <meshBasicMaterial color={glow(palette.gold, 2)} toneMapped={false} />
      </mesh>
    </>
  );
}

function Virtuals() {
  const d = districtById.virtuals;
  const towers = useMemo(() => {
    const out: { x: number; z: number; h: number; c: string }[] = [];
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + 0.3;
      if (Math.abs(Math.atan2(Math.sin(a - 5.62), Math.cos(a - 5.62))) < 0.35) continue;
      out.push({ x: d.center[0] + Math.cos(a) * 60, z: d.center[1] + Math.sin(a) * 60, h: 26 + ((i * 37) % 40), c: i % 2 ? palette.virtuals : palette.cyan });
    }
    return out;
  }, [d]);
  const pad = station("station-launch");
  return (
    <group>
      <Floor center={d.center} radius={72} color={palette.virtuals} />
      <RigidBody type="fixed" colliders={false}>
        {towers.map((t, i) => (
          <CuboidCollider key={i} args={[4, t.h / 2, 4]} position={[t.x, t.h / 2, t.z]} />
        ))}
      </RigidBody>
      {towers.map((t, i) => (
        <group key={i} position={[t.x, t.h / 2, t.z]}>
          <mesh castShadow>
            <boxGeometry args={[8, t.h, 8]} />
            <meshStandardMaterial color="#120a2e" metalness={0.7} roughness={0.25} />
          </mesh>
          <lineSegments>
            <edgesGeometry args={[undefined]} />
            <lineBasicMaterial color={glow(t.c, 3)} toneMapped={false} />
          </lineSegments>
          <TowerEdges h={t.h} color={t.c} />
        </group>
      ))}
      <Spin speed={0.5} position={[d.center[0], 24, d.center[1]]}>
        <mesh>
          <torusKnotGeometry args={[5, 1.1, 160, 16]} />
          <meshStandardMaterial color="#1a0b3a" emissive={palette.virtuals} emissiveIntensity={2.2} metalness={0.6} roughness={0.2} />
        </mesh>
      </Spin>
      <group position={[pad[0], 0, pad[2]]}>
        <mesh rotation-x={-Math.PI / 2} position-y={0.12}>
          <ringGeometry args={[5, 6.2, 64]} />
          <meshBasicMaterial color={glow(palette.virtuals, 3)} toneMapped={false} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position-y={0.1}>
          <circleGeometry args={[5, 64]} />
          <meshStandardMaterial color="#1a0b3a" emissive={palette.virtuals} emissiveIntensity={0.5} />
        </mesh>
        <mesh position-y={30}>
          <cylinderGeometry args={[4.6, 5.6, 60, 32, 1, true]} />
          <meshBasicMaterial color={glow(palette.virtuals, 0.8)} transparent opacity={0.18} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} />
        </mesh>
      </group>
      <Sparkles count={70} scale={[120, 30, 120]} position={[d.center[0], 14, d.center[1]]} size={6} speed={0.4} color={palette.virtuals} />
      <Sign position={[d.center[0] + 10, 34, d.center[1] - 10]} text="VIRTUALS" sub="The agent economy" color={palette.virtuals} size={6} logo="/world/brands/virtuals.png" />
    </group>
  );
}

function TowerEdges({ h, color }: { h: number; color: string }) {
  return (
    <>
      {[-4, 4].flatMap((x) =>
        [-4, 4].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0, z]}>
            <boxGeometry args={[0.25, h, 0.25]} />
            <meshBasicMaterial color={glow(color, 3)} toneMapped={false} />
          </mesh>
        )),
      )}
      {[0.25, 0.5, 0.75].map((f) => (
        <mesh key={f} position={[0, h * (f - 0.5), 0]}>
          <boxGeometry args={[8.1, 0.2, 8.1]} />
          <meshBasicMaterial color={glow(color, 1.5)} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

/** Generic, fully data-driven district: floor, ring of motif buildings, floating emblem and sign. */
export function ProtocolDistrict({ d }: { d: DistrictDef }) {
  const look = d.look!;
  const [cx, cz] = d.center;
  const toPlaza = Math.atan2(-cz, -cx);
  const ringR = d.radius * 0.74;
  const slots = useMemo(() => {
    const out: { x: number; z: number; a: number; h: number }[] = [];
    for (let i = 0; i < look.towers + 2; i++) {
      const a = toPlaza + Math.PI / (look.towers + 2) + (i / (look.towers + 2)) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a - toPlaza), Math.cos(a - toPlaza))) < 0.5) continue;
      out.push({ x: cx + Math.cos(a) * ringR, z: cz + Math.sin(a) * ringR, a, h: 16 + ((i * 53) % 22) });
    }
    return out.slice(0, look.towers);
  }, [cx, cz, ringR, look.towers, toPlaza]);

  return (
    <group>
      <Floor center={d.center} radius={d.radius - 4} color={look.accent} />
      <RigidBody type="fixed" colliders={false}>
        {slots.map((s, i) => (
          <CylinderCollider key={i} args={[s.h / 2, 6]} position={[s.x, s.h / 2, s.z]} />
        ))}
      </RigidBody>
      {slots.map((s, i) => (
        <group key={i} position={[s.x, 0, s.z]} rotation-y={-s.a - Math.PI / 2}>
          <Motif kind={look.motif} h={s.h} color={look.accent} />
        </group>
      ))}
      <Spin speed={0.6} position={[cx, 22, cz]}>
        <mesh>
          <torusGeometry args={[6, 0.6, 16, 64]} />
          <meshBasicMaterial color={glow(look.accent, 2.6)} toneMapped={false} />
        </mesh>
        <mesh rotation-x={Math.PI / 2}>
          <torusGeometry args={[4.4, 0.35, 16, 64]} />
          <meshBasicMaterial color={glow(d.color, 2)} toneMapped={false} />
        </mesh>
        {d.logo ? (
          <BrandDisc src={d.logo} radius={2.6} />
        ) : (
          <mesh>
            <icosahedronGeometry args={[2.4, 0]} />
            <meshStandardMaterial color="#0b1640" emissive={look.accent} emissiveIntensity={1.4} flatShading />
          </mesh>
        )}
      </Spin>
      <Sparkles count={35} scale={[d.radius * 1.6, 22, d.radius * 1.6]} position={[cx, 10, cz]} size={6} speed={0.35} color={look.accent} />
      <Sign position={[cx, 31, cz]} text={look.sign} sub={look.tagline} color={look.accent} size={4} />
    </group>
  );
}

function Motif({ kind, h, color }: { kind: "vault" | "pylon" | "dome"; h: number; color: string }) {
  const accent = glow(color, 2.6);
  if (kind === "vault")
    return (
      <group>
        <mesh position-y={h / 2} castShadow receiveShadow>
          <cylinderGeometry args={[6, 6.4, h, 8]} />
          <meshStandardMaterial color="#d6def5" metalness={0.55} roughness={0.3} flatShading />
        </mesh>
        <mesh position={[0, h * 0.45, 6.1]} castShadow>
          <cylinderGeometry args={[3.2, 3.2, 0.8, 32]} />
          <meshStandardMaterial color="#8b98c4" metalness={0.9} roughness={0.2} />
        </mesh>
        <mesh position={[0, h * 0.45, 6.6]}>
          <torusGeometry args={[3.3, 0.22, 12, 48]} />
          <meshBasicMaterial color={accent} toneMapped={false} />
        </mesh>
        <mesh position={[0, h + 0.3, 0]}>
          <cylinderGeometry args={[6.6, 6.6, 0.6, 8]} />
          <meshBasicMaterial color={accent} toneMapped={false} />
        </mesh>
      </group>
    );
  if (kind === "pylon")
    return (
      <group>
        <mesh position-y={h / 2 + 3} castShadow>
          <boxGeometry args={[5, h + 6, 5]} />
          <meshStandardMaterial color="#071a1a" metalness={0.8} roughness={0.2} />
        </mesh>
        {Array.from({ length: Math.floor(h / 4) }, (_, i) => (
          <mesh key={i} position={[0, 3 + i * 4, 2.6]}>
            <planeGeometry args={[4.2, 1.6]} />
            <meshBasicMaterial color={i % 3 === 1 ? glow("#ff5577", 2.2) : accent} toneMapped={false} />
          </mesh>
        ))}
      </group>
    );
  return (
    <group>
      <mesh position-y={0} castShadow receiveShadow>
        <sphereGeometry args={[6.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#fde7f6" roughness={0.5} />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} rotation-y={(i / 8) * Math.PI * 2} position-y={0.05}>
          <sphereGeometry args={[6.56, 32, 16, 0, Math.PI / 8, 0, Math.PI / 2]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
        </mesh>
      ))}
      <mesh position-y={7.4}>
        <sphereGeometry args={[0.8, 16, 12]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
    </group>
  );
}
