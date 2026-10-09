"use client";

import dynamic from "next/dynamic";
import styles from "./world.module.css";

const Game = dynamic(() => import("./game"), {
  ssr: false,
  loading: () => <div className={styles.loading}>BASE WORLD</div>,
});

export function WorldClient() {
  return <Game />;
}
