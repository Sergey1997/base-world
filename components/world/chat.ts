"use client";

import { useSyncExternalStore } from "react";
import { type Toast, useGame } from "./store";

export interface Line {
  id: number;
  kind: "say" | "system";
  tone?: Toast["tone"];
  from?: string;
  channel?: "Say" | "World";
  self?: boolean;
  text: string;
}

const EMPTY: Line[] = [];
const MAX = 200;
const COOLDOWN_MS = 800;

let lines: Line[] = [
  { id: 1, kind: "system", tone: "info", text: "Welcome to Base World." },
  { id: 2, kind: "system", tone: "info", text: "Press Enter to chat, Esc to stop typing." },
];
let nextId = 3;
let last = 0;
let me = "You";
let send: ((text: string) => void) | null = null;
const listeners = new Set<() => void>();

/** Latest message per player id, for speech bubbles above their heads. */
export const bubbles = new Map<string, { text: string; at: number }>();

export const useChat = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => lines,
    () => EMPTY,
  );

export function post(line: Omit<Line, "id">) {
  lines = [...lines.slice(1 - MAX), { ...line, id: nextId++ }];
  listeners.forEach((l) => l());
}

/** Online mode plugs the shared channel in here; offline, chat stays local. */
export function connectChat(name: string, sender: (text: string) => void) {
  me = name;
  send = sender;
  return () => {
    if (send !== sender) return;
    send = null;
    me = "You";
  };
}

export const chatShared = () => !!send;

export function say(raw: string) {
  const text = raw.trim().slice(0, 200);
  const now = performance.now();
  if (!text || now - last < COOLDOWN_MS) return false;
  last = now;
  post({ kind: "say", from: me, channel: send ? "World" : "Say", self: true, text });
  send?.(text);
  return true;
}

useGame.subscribe((s, prev) => {
  const t = s.toasts.at(-1);
  if (t && t.id !== prev.toasts.at(-1)?.id) post({ kind: "system", tone: t.tone, text: t.body ? `${t.title} — ${t.body}` : t.title });
});
