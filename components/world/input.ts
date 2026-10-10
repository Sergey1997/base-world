"use client";

import { useEffect } from "react";
import { useGame } from "./store";

export const keys = new Set<string>();
/** Keys pressed since the scene last consumed them (edge-triggered actions like jump/dash). */
export const pressed = new Set<string>();

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
};

export function consume(code: string) {
  const hit = pressed.has(code);
  pressed.delete(code);
  return hit;
}

export function useKeyboard() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Escape") return useGame.getState().close();
      if (typing(e)) return;
      if (["Space", "ArrowUp", "ArrowDown", "Tab"].includes(e.code)) e.preventDefault();
      if (!e.repeat) pressed.add(e.code);
      keys.add(e.code);
      const g = useGame.getState();
      if (e.code === "KeyE" && !e.repeat) g.dialog || g.panel || g.mapOpen ? g.close() : g.interact();
      if ((e.code === "KeyJ" || e.code === "Tab") && !e.repeat && g.started) g.toggleLog();
      if (e.code === "KeyB" && !e.repeat && g.started) g.toggleDocs();
      if (e.code === "KeyM" && !e.repeat && g.started) g.toggleMap();
    };
    const up = (e: KeyboardEvent) => keys.delete(e.code);
    const blur = () => keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);
}
