"use client";

import dynamic from "next/dynamic";
import { type ReactNode, useEffect, useState } from "react";
import { boot } from "./store";
import styles from "./world.module.css";

const Game = dynamic(() => import("./game"), {
  ssr: false,
  loading: () => <div className={styles.loading}>BASE WORLD</div>,
});

/** Loads the save for this mode (local or cloud) before the world mounts, so nothing renders from stale state. */
export function WorldClient({ options, scene, overlay }: { options?: Parameters<typeof boot>[0]; scene?: ReactNode; overlay?: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    boot(options).then(() => setReady(true));
    // Once per mount: online mode remounts with a fresh session instead of re-booting in place.
  }, []);
  if (!ready) return <div className={styles.loading}>BASE WORLD</div>;
  return <Game scene={scene} overlay={overlay} />;
}
