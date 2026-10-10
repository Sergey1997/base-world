"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { type Group, MathUtils } from "three";
import { bubbles, connectChat, post } from "@/components/world/chat";
import { live } from "@/components/world/store";
import styles from "@/components/world/world.module.css";

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
const LABEL_RANGE = 60;
const BUBBLE_MS = 7000;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let client: SupabaseClient | null = null;
const supabase = () => (client ??= createClient(SUPABASE_URL!, SUPABASE_KEY!, { auth: { persistSession: false } }));

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
    if (!SUPABASE_URL || !SUPABASE_KEY) return console.warn("Multiplayer is off: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY aren't set.");
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
      .on("presence", { event: "join" }, ({ key, newPresences }) => {
        if (key !== me.id && newPresences[0]) post({ kind: "system", tone: "info", text: `${newPresences[0].name} joined Base World.` });
      })
      .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
        poses.delete(key);
        if (key !== me.id && leftPresences[0]) post({ kind: "system", tone: "info", text: `${leftPresences[0].name} left.` });
      })
      .on("broadcast", { event: "pose" }, ({ payload }) => poses.set(payload.id, payload))
      .on("broadcast", { event: "chat" }, ({ payload }) => {
        const text = String(payload.text ?? "").slice(0, 200);
        if (!text) return;
        post({ kind: "say", from: String(payload.name).slice(0, 32), channel: "World", text });
        bubbles.set(payload.id, { text, at: performance.now() });
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track(me);
      });
    const unchat = connectChat(me.name, (text) => void channel.send({ type: "broadcast", event: "chat", payload: { id: me.id, name: me.name, text } }));

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
      unchat();
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
  const label = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLParagraphElement>(null);
  const labeled = useRef(false);
  useFrame((_, dt) => {
    const pose = poses.get(peer.id);
    const g = root.current;
    if (!pose || !g || !body.current) return;
    g.visible = true;
    if (label.current) {
      const d = g.position.distanceTo(live.pos);
      const next = labeled.current ? d < LABEL_RANGE + 12 : d < LABEL_RANGE;
      if (next !== labeled.current) {
        labeled.current = next;
        label.current.style.visibility = next ? "visible" : "hidden";
        label.current.style.opacity = next ? "1" : "0";
      }
    }
    if (bubble.current) {
      const said = bubbles.get(peer.id);
      const text = said && performance.now() - said.at < BUBBLE_MS ? said.text : "";
      if (bubble.current.textContent !== text) bubble.current.textContent = text;
    }
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
      <Html ref={label} position={[0, 1.6, 0]} center zIndexRange={[10, 0]} pointerEvents="none" style={{ visibility: "hidden", opacity: 0 }}>
        <div className={styles.nameplate} data-kind="player">
          <p ref={bubble} className={styles.bubble} />
          <b>{peer.name}</b>
          <span>&lt;Builder&gt;</span>
        </div>
      </Html>
    </group>
  );
}
