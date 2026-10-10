"use client";

import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { type Group, MathUtils } from "three";
import { FONT } from "@/components/world/districts";
import { live } from "@/components/world/store";

export interface Peer {
  id: string;
  name: string;
  color: string;
}

interface Pose {
  x: number;
  y: number;
  z: number;
  h: number;
  b: 0 | 1;
}

const SEND_MS = 150;
const EMPTY: Peer[] = [];

let client: SupabaseClient | null = null;
const supabase = () =>
  (client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  }));

/** Latest pose per peer, written by the socket and read every frame without touching React. */
const poses = new Map<string, Pose>();
let peers: Peer[] = EMPTY;
const listeners = new Set<() => void>();
const setPeers = (next: Peer[]) => {
  peers = next;
  listeners.forEach((l) => l());
};

export const usePeers = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => peers,
    () => EMPTY,
  );

export const colorFor = (id: string) => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 85% 62%)`;
};

/** One shared world: presence says who is here, broadcast carries where they are. */
export function useMultiplayer(me: Peer) {
  useEffect(() => {
    const channel = supabase().channel("base-world", { config: { broadcast: { self: false }, presence: { key: me.id } } });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<Peer>();
        setPeers(
          Object.entries(state)
            .filter(([id]) => id !== me.id)
            .map(([, metas]) => metas[0])
            .filter(Boolean),
        );
      })
      .on("presence", { event: "leave" }, ({ key }) => poses.delete(key))
      .on("broadcast", { event: "pose" }, ({ payload }) => poses.set(payload.id, payload))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track(me);
      });

    let last = "";
    let quietSince = 0;
    const timer = setInterval(() => {
      const p = live.pos;
      const pose = { id: me.id, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), h: +live.heading.toFixed(2), b: live.boosting ? 1 : 0 };
      const key = `${pose.x},${pose.y},${pose.z},${pose.h},${pose.b}`;
      const now = performance.now();
      // Standing still costs nothing; a 3s heartbeat lets late joiners see idle players.
      if (key === last && now - quietSince < 3000) return;
      if (key !== last) last = key;
      quietSince = now;
      void channel.send({ type: "broadcast", event: "pose", payload: pose });
    }, SEND_MS);

    return () => {
      clearInterval(timer);
      void supabase().removeChannel(channel);
      setPeers(EMPTY);
      poses.clear();
    };
  }, [me.id, me.name, me.color]);
}

export function Others() {
  const list = usePeers();
  return list.map((p) => <Remote key={p.id} peer={p} />);
}

function Remote({ peer }: { peer: Peer }) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const seen = useRef(false);
  useFrame((_, dt) => {
    const pose = poses.get(peer.id);
    const g = root.current;
    if (!pose || !g || !body.current) return;
    g.visible = true;
    if (!seen.current) {
      g.position.set(pose.x, pose.y, pose.z);
      seen.current = true;
    }
    const k = 1 - Math.exp(-10 * dt);
    g.position.x += (pose.x - g.position.x) * k;
    g.position.y += (pose.y - g.position.y) * k;
    g.position.z += (pose.z - g.position.z) * k;
    const r = body.current.rotation;
    r.y += Math.atan2(Math.sin(pose.h - r.y), Math.cos(pose.h - r.y)) * k;
    r.x = MathUtils.lerp(r.x, pose.b ? 0.25 : 0, k);
  });
  return (
    <group ref={root} visible={false}>
      <group ref={body} position={[0, -1, 0]}>
        <mesh position={[0, 1.25, 0]} castShadow>
          <capsuleGeometry args={[0.36, 0.55, 6, 12]} />
          <meshStandardMaterial color={peer.color} roughness={0.4} />
        </mesh>
        <mesh position={[0, 1.95, 0]} castShadow>
          <sphereGeometry args={[0.32, 20, 14]} />
          <meshStandardMaterial color="#dce8ff" roughness={0.3} />
        </mesh>
        <mesh position={[0, 1.97, 0.16]} scale={[1, 0.62, 0.7]}>
          <sphereGeometry args={[0.25, 20, 14]} />
          <meshStandardMaterial color="#0b1640" emissive={peer.color} emissiveIntensity={1.4} />
        </mesh>
      </group>
      <Billboard position={[0, 1.7, 0]}>
        <Text font={FONT} fontSize={0.42} color="#ffffff" outlineWidth={0.03} outlineColor="#020616" anchorY="bottom">
          {peer.name}
        </Text>
      </Billboard>
    </group>
  );
}
