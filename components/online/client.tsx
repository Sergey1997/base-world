"use client";

import dynamic from "next/dynamic";
import styles from "@/components/world/world.module.css";

/** Privy, the wallet stack and the 3D world all need a browser; none of it is server-rendered. */
export const OnlineClient = dynamic(() => import("./online"), {
  ssr: false,
  loading: () => <div className={styles.loading}>BASE WORLD</div>,
});
