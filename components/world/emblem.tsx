"use client";

import { Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { AdditiveBlending, Color, type Group, type InstancedMesh, type Mesh, Object3D, type ShaderMaterial } from "three";
import { type EmblemKind, type Vec3 } from "./config";

const glow = (hex: string, k = 2.5) => new Color(hex).multiplyScalar(k);
const rgb = (hex: string) => {
  const c = new Color(hex);
  return [c.r, c.g, c.b] as [number, number, number];
};

function Spin({ speed = 0.4, axis = "y", children }: { speed?: number; axis?: "x" | "y" | "z"; children: React.ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation[axis] += dt * speed;
  });
  return <group ref={ref}>{children}</group>;
}

const ORB_VERT = `varying vec3 vN; varying vec3 vV; varying float vY;
void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = normal.y; gl_Position = projectionMatrix * mv; }`;

const ORB_FRAG = `varying vec3 vN; varying vec3 vV; varying float vY;
uniform vec3 accent; uniform vec3 lift;
void main(){
  vec3 n = normalize(vN);
  vec3 L = normalize(vec3(-0.45, 0.55, 0.75));
  float diff = max(dot(n, L), 0.0);
  float rim = pow(1.0 - max(dot(n, vV), 0.0), 2.6);
  float spec = pow(max(dot(reflect(-L, n), vV), 0.0), 28.0);
  float bands = 0.035 * sin(vY * 18.0);
  gl_FragColor = vec4(accent * (0.28 + 0.9 * diff + bands) + lift * rim * 1.6 + spec, 1.0);
}`;

const HALO_FRAG = `varying vec2 vUv; uniform vec3 accent;
void main(){ float d = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(accent * exp(-d * 4.0) * (1.0 - d), 1.0); }`;

const GHOST_FRAG = `varying vec3 vN; varying vec3 vV; varying float vY;
uniform vec3 accent; uniform vec3 lift; uniform float T;
void main(){
  vec3 n = normalize(vN);
  float rim = pow(1.0 - max(dot(n, vV), 0.0), 1.8);
  float wave = 0.5 + 0.5 * sin(vY * 12.0 + T * 2.2);
  vec3 col = accent * (0.22 + rim * 1.4 + wave * 0.18) + lift * rim;
  gl_FragColor = vec4(col, 0.55 + rim * 0.35);
}`;

function Halo({ color, size = 22 }: { color: string; size?: number }) {
  const [r, g, b] = rgb(color);
  return (
    <Billboard>
      <mesh>
        <planeGeometry args={[size, size]} />
        <shaderMaterial
          vertexShader="varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }"
          fragmentShader={HALO_FRAG}
          uniforms={{ accent: { value: [r * 0.35, g * 0.55, b] } }}
          transparent
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </Billboard>
  );
}

function Orb({ color, lift, radius = 3 }: { color: string; lift: string; radius?: number }) {
  const [ar, ag, ab] = rgb(color);
  const [lr, lg, lb] = rgb(lift);
  return (
    <mesh castShadow>
      <sphereGeometry args={[radius, 48, 32]} />
      <shaderMaterial vertexShader={ORB_VERT} fragmentShader={ORB_FRAG} uniforms={{ accent: { value: [ar, ag, ab] }, lift: { value: [lr, lg, lb] } }} />
    </mesh>
  );
}

function DotRing({ radius, count, color, size = 0.16 }: { radius: number; count: number; color: string; size?: number }) {
  const dots = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const o = new Object3D();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      o.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
      o.updateMatrix();
      dots.current!.setMatrixAt(i, o.matrix);
    }
    dots.current!.instanceMatrix.needsUpdate = true;
  }, [count, radius]);
  return (
    <instancedMesh ref={dots} args={[undefined, undefined, count]}>
      <sphereGeometry args={[size, 10, 8]} />
      <meshBasicMaterial color={glow(color, 2.4)} toneMapped={false} />
    </instancedMesh>
  );
}

function Helix({ color }: { color: string }) {
  const dots = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const o = new Object3D();
    for (let i = 0; i < 36; i++) {
      const t = i / 35;
      const a = t * Math.PI * 6;
      o.position.set(Math.cos(a) * (1.6 + t * 3.4), (t - 0.5) * 8, Math.sin(a) * (1.6 + t * 3.4));
      o.updateMatrix();
      dots.current!.setMatrixAt(i, o.matrix);
    }
    dots.current!.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={dots} args={[undefined, undefined, 36]}>
      <sphereGeometry args={[0.18, 8, 6]} />
      <meshBasicMaterial color={glow(color, 2.2)} toneMapped={false} />
    </instancedMesh>
  );
}

function Waves({ color }: { color: string }) {
  const a = useRef<Mesh>(null);
  const b = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (a.current) a.current.scale.setScalar(1 + ((t * 0.35) % 1) * 1.4);
    if (b.current) b.current.scale.setScalar(1 + (((t * 0.35 + 0.5) % 1) * 1.4));
  });
  return (
    <>
      {[a, b].map((ref, i) => (
        <mesh key={i} ref={ref} rotation-x={Math.PI / 2}>
          <torusGeometry args={[2.4, 0.06, 8, 64]} />
          <meshBasicMaterial color={glow(color, 1.8)} transparent opacity={0.45} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

function GhostOrb({ color, lift }: { color: string; lift: string }) {
  const mat = useRef<ShaderMaterial>(null);
  const [ar, ag, ab] = rgb(color);
  const [lr, lg, lb] = rgb(lift);
  useFrame(({ clock }) => {
    if (mat.current) mat.current.uniforms.T.value = clock.elapsedTime;
  });
  return (
    <mesh scale={[1, 1.35, 1]} castShadow>
      <sphereGeometry args={[2.6, 48, 32]} />
      <shaderMaterial
        ref={mat}
        vertexShader={ORB_VERT}
        fragmentShader={GHOST_FRAG}
        uniforms={{ accent: { value: [ar, ag, ab] }, lift: { value: [lr, lg, lb] }, T: { value: 0 } }}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

/** One WebGL centerpiece per project — shape and motion match the protocol, color comes from the district. */
export function Emblem({ kind, color, position, lift }: { kind: EmblemKind; color: string; position: Vec3; lift?: string }) {
  const rim = lift ?? "#dce8ff";
  const body = useMemo(() => {
    if (kind === "orb")
      return (
        <>
          <Halo color={color} />
          <Orb color={color} lift={rim} />
          <group rotation={[0.2, 0, -0.22]}>
            <Spin speed={0.12}>
              <mesh rotation-x={Math.PI / 2}>
                <torusGeometry args={[7, 0.05, 8, 128]} />
                <meshBasicMaterial color={glow(color, 1.4)} transparent opacity={0.55} toneMapped={false} />
              </mesh>
              <DotRing radius={7} count={36} color={rim} />
            </Spin>
          </group>
        </>
      );
    if (kind === "curve")
      return (
        <>
          <Halo color={color} size={18} />
          <Orb color={color} lift="#fff6b0" radius={1.8} />
          <Spin speed={0.35}>
            <Helix color={color} />
          </Spin>
        </>
      );
    if (kind === "vaults")
      return (
        <>
          <Halo color={color} size={18} />
          <Orb color={color} lift={rim} radius={1.7} />
          {[-2.2, 0, 2.2].map((y, i) => (
            <Spin key={y} speed={0.18 * (i % 2 ? -1 : 1)}>
              <mesh position-y={y} rotation-x={Math.PI / 2}>
                <torusGeometry args={[3.2 + i * 0.35, 0.12, 10, 64]} />
                <meshBasicMaterial color={glow(color, 1.8)} toneMapped={false} />
              </mesh>
            </Spin>
          ))}
        </>
      );
    if (kind === "hooks")
      return (
        <>
          <Halo color={color} size={20} />
          <Orb color={color} lift="#ffe0f4" radius={1.6} />
          {[0, 1, 2].map((i) => (
            <Spin key={i} speed={0.22 + i * 0.05} axis={i === 1 ? "x" : "y"}>
              <mesh rotation={[i === 0 ? 0.6 : 0, i * 0.7, i === 2 ? 0.5 : 0]}>
                <torusGeometry args={[4.2, 0.18, 12, 80]} />
                <meshBasicMaterial color={glow(color, 2)} toneMapped={false} />
              </mesh>
            </Spin>
          ))}
        </>
      );
    if (kind === "ghost")
      return (
        <>
          <Halo color={color} size={20} />
          <GhostOrb color={color} lift={rim} />
          {[-0.45, 0.45].map((x) => (
            <mesh key={x} position={[x, 0.7, 1.7]}>
              <sphereGeometry args={[0.22, 12, 8]} />
              <meshBasicMaterial color={glow("#ede9fe", 3)} toneMapped={false} />
            </mesh>
          ))}
        </>
      );
    if (kind === "wave")
      return (
        <>
          <Halo color={color} size={18} />
          <Orb color={color} lift={rim} radius={1.9} />
          <Waves color={color} />
        </>
      );
    if (kind === "knot")
      return (
        <>
          <Halo color={color} size={20} />
          <Spin speed={0.45}>
            <mesh>
              <torusKnotGeometry args={[2.6, 0.55, 140, 14]} />
              <meshStandardMaterial color="#1a0b3a" emissive={color} emissiveIntensity={2.2} metalness={0.6} roughness={0.2} />
            </mesh>
          </Spin>
        </>
      );
    if (kind === "turbine")
      return (
        <>
          <Halo color={color} size={20} />
          <Orb color={color} lift="#fff2e0" radius={1.7} />
          <Spin speed={1.4}>
            {Array.from({ length: 6 }, (_, i) => (
              <mesh key={i} rotation-y={(i / 6) * Math.PI * 2} position={[2.6, 0, 0]} rotation-z={0.2}>
                <boxGeometry args={[3.4, 0.16, 0.7]} />
                <meshBasicMaterial color={glow(color, 2.1)} toneMapped={false} />
              </mesh>
            ))}
          </Spin>
          <mesh rotation-x={Math.PI / 2}>
            <torusGeometry args={[4.6, 0.08, 8, 80]} />
            <meshBasicMaterial color={glow(color, 1.6)} toneMapped={false} />
          </mesh>
        </>
      );
    return (
      <>
        <Halo color={color} size={16} />
        <Spin speed={0.7}>
          <mesh>
            <octahedronGeometry args={[2.6]} />
            <meshBasicMaterial color={glow(color, 3)} toneMapped={false} />
          </mesh>
        </Spin>
      </>
    );
  }, [kind, color, rim]);

  return <group position={position}>{body}</group>;
}
