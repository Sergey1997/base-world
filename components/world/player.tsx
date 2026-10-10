"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { CapsuleCollider, type RapierRigidBody, RigidBody, useRapier } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, type Group, type MeshStandardMaterial, type PerspectiveCamera, MathUtils, Vector3 } from "three";
import { sound } from "./audio";
import { jumpPads, palette, SPAWN } from "./config";
import { consume, keys, pressed } from "./input";
import { live, uiLocked, useGame } from "./store";

const WALK = 13;
const BOOST = 36;
const DASH = 88;
const DASH_TIME = 0.18;
const DASH_COOLDOWN = 1.1;
const JUMP = 13;

const tmp = new Vector3();
const wish = new Vector3();

export function Player() {
  const body = useRef<RapierRigidBody>(null);
  const avatar = useRef<Group>(null);
  const rig = useRef<Group>(null);
  const board = useRef<Group>(null);
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const thrust = useRef<MeshStandardMaterial>(null);
  const { rapier, world } = useRapier();
  const { camera, gl } = useThree();
  const cam = useRef({ yaw: 0, pitch: 0.3, dist: 10, target: new Vector3(...SPAWN), lastMouse: -1e9 });
  const st = useRef({ dash: 0, cooldown: 0, jumps: 0, pad: 0, mach: false, dir: new Vector3(0, 0, -1), air: 0, fall: 0, stride: 0 });

  useEffect(() => {
    const el = gl.domElement;
    let drag = false;
    const down = (e: PointerEvent) => {
      drag = true;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag && document.pointerLockElement !== el) return;
      const c = cam.current;
      c.yaw -= e.movementX * 0.005;
      c.pitch = MathUtils.clamp(c.pitch + e.movementY * 0.004, -0.15, 1.2);
      c.lastMouse = performance.now();
    };
    const up = (e: PointerEvent) => {
      drag = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    const wheel = (e: WheelEvent) => {
      cam.current.dist = MathUtils.clamp(cam.current.dist + e.deltaY * 0.01, 5, 22);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("wheel", wheel, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [gl]);

  useFrame((state, rawDt) => {
    const b = body.current;
    if (!b || !avatar.current || !rig.current || !board.current) return;
    const dt = Math.min(rawDt, 0.05);
    const s = st.current;
    const c = cam.current;
    const locked = uiLocked(useGame.getState());
    if (locked) pressed.clear();

    const t = b.translation();
    const v = b.linvel();
    const hit = world.castRay(new rapier.Ray(t, { x: 0, y: -1, z: 0 }), 1.3, true, undefined, undefined, undefined, b);
    const grounded = !!hit && hit.timeOfImpact < 1.12 && v.y <= 1;
    if (grounded) {
      if (s.air > 0.18) sound.land(-s.fall);
      s.jumps = 0;
      s.air = 0;
      s.fall = 0;
    } else {
      s.air += dt;
      s.fall = Math.min(s.fall, v.y);
    }

    const on = (...codes: string[]) => !locked && codes.some((k) => keys.has(k));
    if (on("ArrowLeft")) c.yaw += 2.4 * dt;
    if (on("ArrowRight")) c.yaw -= 2.4 * dt;
    const fwd = (on("KeyW", "ArrowUp") ? 1 : 0) - (on("KeyS", "ArrowDown") ? 1 : 0);
    const side = (on("KeyD") ? 1 : 0) - (on("KeyA") ? 1 : 0);
    const sy = Math.sin(c.yaw);
    const cy = Math.cos(c.yaw);
    wish.set(-sy * fwd + cy * side, 0, -cy * fwd - sy * side);
    const moving = wish.lengthSq() > 0;
    if (moving) wish.normalize();
    const boosting = moving && on("ShiftLeft", "ShiftRight");

    let { x: vx, y: vy, z: vz } = v;
    s.cooldown -= dt;
    if (consume("KeyQ") && s.cooldown <= 0) {
      s.dash = DASH_TIME;
      s.cooldown = DASH_COOLDOWN;
      s.dir.copy(moving ? wish : tmp.set(Math.sin(live.heading), 0, Math.cos(live.heading)));
      sound.dash();
    }
    if (s.dash > 0) {
      s.dash -= dt;
      vx = s.dir.x * DASH;
      vz = s.dir.z * DASH;
      vy = Math.max(vy, 0.5);
    } else if (grounded || moving) {
      const speed = boosting ? BOOST : WALK;
      const a = 1 - Math.exp(-(grounded ? (boosting ? 6 : 11) : 2.2) * dt);
      vx += (wish.x * speed - vx) * a;
      vz += (wish.z * speed - vz) * a;
    }

    if (consume("Space")) {
      if (grounded) {
        vy = JUMP;
        s.jumps = 1;
        sound.jump();
      } else if (s.jumps < 2) {
        vy = JUMP * 0.92;
        s.jumps = 2;
        sound.doubleJump();
      }
    }

    s.pad -= dt;
    for (const p of jumpPads) {
      if (s.pad > 0 || Math.hypot(t.x - p.position[0], t.z - p.position[2]) > 3.4 || t.y > p.position[1] + 2.6) continue;
      [vx, vy, vz] = p.launch;
      s.pad = 0.8;
      s.jumps = 1;
      sound.pad();
    }

    if (t.y < -25) {
      b.setTranslation({ x: SPAWN[0], y: SPAWN[1] + 4, z: SPAWN[2] }, true);
      vx = vy = vz = 0;
    }
    b.setLinvel({ x: vx, y: vy, z: vz }, true);

    const hspeed = Math.hypot(vx, vz);
    live.pos.set(t.x, t.y, t.z);
    live.speed = hspeed;
    live.boosting = boosting || s.dash > 0;
    live.dashCharge = 1 - Math.max(0, s.cooldown) / DASH_COOLDOWN;
    if (!s.mach && hspeed * 3.6 >= 150) {
      s.mach = true;
      sound.mach();
      useGame.getState().emit({ type: "action", action: "mach" });
    }
    if (hspeed * 3.6 < 100) s.mach = false;

    // Avatar: face travel direction, lean into speed, ride the board when boosting.
    if (hspeed > 1) live.heading = lerpAngle(live.heading, Math.atan2(vx, vz), 1 - Math.exp(-12 * dt));
    avatar.current.rotation.y = live.heading;
    const riding = live.boosting;
    const k = MathUtils.clamp(hspeed / BOOST, 0, 1.4);
    rig.current.rotation.x = MathUtils.lerp(rig.current.rotation.x, riding ? 0.12 + k * 0.18 : k * 0.12, 1 - Math.exp(-8 * dt));
    rig.current.position.y = MathUtils.lerp(rig.current.position.y, riding ? 0.32 + Math.sin(state.clock.elapsedTime * 6) * 0.05 : 0, 1 - Math.exp(-10 * dt));
    const bs = MathUtils.lerp(board.current.scale.x, riding ? 1 : 0.001, 1 - Math.exp(-14 * dt));
    board.current.scale.setScalar(bs);
    const stride = grounded && !riding ? Math.sin(state.clock.elapsedTime * (6 + hspeed * 0.6)) * Math.min(1, hspeed / 6) * 0.7 : riding ? 0.25 : 0.4;
    const foot = Math.sign(stride);
    if (grounded && !riding && hspeed > 2 && foot !== s.stride) sound.step();
    s.stride = foot;
    sound.motion(hspeed, riding, !grounded);
    if (legL.current && legR.current) {
      legL.current.rotation.x = stride;
      legR.current.rotation.x = riding ? -0.25 : -stride;
    }
    if (thrust.current) thrust.current.emissiveIntensity = MathUtils.lerp(thrust.current.emissiveIntensity, riding ? 9 : 1.2, 1 - Math.exp(-10 * dt));

    // Camera: smoothed target, gentle auto-follow when the mouse is idle, FOV and distance stretch with speed.
    avatar.current.getWorldPosition(tmp);
    tmp.y += 1.5;
    c.target.lerp(tmp, 1 - Math.exp(-16 * dt));
    if (performance.now() - c.lastMouse > 1500 && hspeed > 6 && fwd > 0) {
      const diff = angleDiff(Math.atan2(-vx, -vz), c.yaw);
      if (Math.abs(diff) < 1.7) c.yaw += diff * (1 - Math.exp(-1.6 * dt));
    }
    const dist = c.dist + Math.min(k, 1.6) * 3.5;
    camera.position.set(
      c.target.x + Math.sin(c.yaw) * Math.cos(c.pitch) * dist,
      c.target.y + Math.sin(c.pitch) * dist,
      c.target.z + Math.cos(c.yaw) * Math.cos(c.pitch) * dist,
    );
    if (camera.position.y < 0.6) camera.position.y = 0.6;
    if (s.dash > 0) camera.position.addScalar((Math.random() - 0.5) * 0.12);
    camera.lookAt(c.target);
    const pc = camera as PerspectiveCamera;
    const fov = 60 + Math.min(k, 1.6) * 14 + (s.dash > 0 ? 8 : 0);
    if (Math.abs(pc.fov - fov) > 0.05) {
      pc.fov = MathUtils.lerp(pc.fov, fov, 1 - Math.exp(-6 * dt));
      pc.updateProjectionMatrix();
    }
    live.camYaw = c.yaw;
  }, 0.5);

  return (
    <RigidBody ref={body} colliders={false} position={SPAWN} enabledRotations={[false, false, false]} friction={0} ccd canSleep={false}>
      <CapsuleCollider args={[0.5, 0.5]} friction={0} />
      <group ref={avatar} position={[0, -1, 0]}>
        <group ref={rig}>
          <Avatar legL={legL} legR={legR} thrust={thrust} />
        </group>
        <group ref={board} scale={0.001}>
          <Hoverboard />
        </group>
      </group>
      <SpeedTrail />
    </RigidBody>
  );
}

function Avatar({ legL, legR, thrust }: { legL: React.RefObject<Group | null>; legR: React.RefObject<Group | null>; thrust: React.RefObject<MeshStandardMaterial | null> }) {
  return (
    <group>
      <mesh position={[0, 1.25, 0]} castShadow>
        <capsuleGeometry args={[0.36, 0.55, 6, 16]} />
        <meshStandardMaterial color={palette.ice} roughness={0.35} metalness={0.1} />
      </mesh>
      <mesh position={[0, 1.3, 0.02]} castShadow>
        <cylinderGeometry args={[0.375, 0.375, 0.16, 20]} />
        <meshStandardMaterial color={palette.base} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.95, 0]} castShadow>
        <sphereGeometry args={[0.32, 24, 16]} />
        <meshStandardMaterial color={palette.ice} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.97, 0.16]} scale={[1, 0.62, 0.7]}>
        <sphereGeometry args={[0.25, 24, 16]} />
        <meshStandardMaterial color="#0b1640" emissive={palette.cyan} emissiveIntensity={1.6} roughness={0.1} metalness={0.6} />
      </mesh>
      <mesh position={[0, 1.35, -0.38]} castShadow>
        <boxGeometry args={[0.5, 0.6, 0.22]} />
        <meshStandardMaterial color={palette.base} roughness={0.5} />
      </mesh>
      {[-0.13, 0.13].map((x) => (
        <mesh key={x} position={[x, 1.08, -0.5]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.07, 0.09, 0.08, 12]} />
          <meshStandardMaterial ref={x < 0 ? thrust : undefined} color="#000" emissive={palette.cyan} emissiveIntensity={1.2} toneMapped={false} />
        </mesh>
      ))}
      {[
        [-0.17, legL],
        [0.17, legR],
      ].map(([x, ref]) => (
        <group key={x as number} position={[x as number, 0.75, 0]} ref={ref as React.RefObject<Group | null>}>
          <mesh position={[0, -0.36, 0]} castShadow>
            <capsuleGeometry args={[0.13, 0.42, 4, 10]} />
            <meshStandardMaterial color="#1a2a5c" roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Hoverboard() {
  return (
    <group position={[0, 0.18, 0]}>
      <RoundedBox args={[0.7, 0.1, 1.8]} radius={0.05} smoothness={3} castShadow>
        <meshStandardMaterial color={palette.base} roughness={0.25} metalness={0.4} />
      </RoundedBox>
      <mesh position={[0, -0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.55, 1.6]} />
        <meshBasicMaterial color={[0.4, 1.8, 2.6]} toneMapped={false} />
      </mesh>
    </group>
  );
}

const TRAIL = 90;

/** Additive streaks spat out behind the player while boosting; positions live in world space. */
function SpeedTrail() {
  const geo = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(TRAIL * 3), 3));
    g.setAttribute("color", new BufferAttribute(new Float32Array(TRAIL * 3), 3));
    return g;
  }, []);
  const life = useMemo(() => new Float32Array(TRAIL), []);
  const head = useRef(0);
  const points = useRef<Group>(null);

  useFrame((_, dt) => {
    points.current?.parent?.getWorldPosition(tmp);
    if (points.current) points.current.position.set(-tmp.x, -tmp.y, -tmp.z);
    const pos = geo.attributes.position.array as Float32Array;
    const col = geo.attributes.color.array as Float32Array;
    const spawn = live.boosting ? Math.ceil(live.speed / 12) : 0;
    for (let n = 0; n < spawn; n++) {
      const i = head.current++ % TRAIL;
      pos[i * 3] = tmp.x + (Math.random() - 0.5) * 1.2;
      pos[i * 3 + 1] = tmp.y - 0.8 + Math.random() * 0.6;
      pos[i * 3 + 2] = tmp.z + (Math.random() - 0.5) * 1.2;
      life[i] = 1;
    }
    for (let i = 0; i < TRAIL; i++) {
      life[i] = Math.max(0, life[i] - dt * 2.2);
      const l = life[i] * life[i];
      col[i * 3] = 0.3 * l;
      col[i * 3 + 1] = 1.2 * l;
      col[i * 3 + 2] = 2.4 * l;
      pos[i * 3 + 1] += dt * 0.6;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  });

  return (
    <group ref={points}>
      <points geometry={geo} frustumCulled={false}>
        <pointsMaterial size={0.35} vertexColors transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </points>
    </group>
  );
}

function angleDiff(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function lerpAngle(a: number, b: number, t: number) {
  return a + angleDiff(b, a) * t;
}
