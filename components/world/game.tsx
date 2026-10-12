"use client";

import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, ToneMapping, Vignette } from "@react-three/postprocessing";
import { Physics } from "@react-three/rapier";
import { ToneMappingMode } from "postprocessing";
import { type ReactNode, Suspense } from "react";
import { useBattle } from "@/components/battle/store";
import { Actors } from "./actors";
import { useSound } from "./audio";
import { Districts } from "./districts";
import { Environment } from "./environment";
import { Hud } from "./hud";
import { useKeyboard } from "./input";
import { Player } from "./player";
import styles from "./world.module.css";

/** `scene` adds objects to the 3D world (e.g. other players); `overlay` adds UI above the HUD. */
export default function Game({ scene, overlay }: { scene?: ReactNode; overlay?: ReactNode }) {
  useKeyboard();
  useSound();
  const fighting = useBattle((s) => s.mode === "bot" || s.duel?.status === "live" || s.duel?.status === "done");
  return (
    <div className={styles.root}>
      <Canvas frameloop={fighting ? "never" : "always"} shadows dpr={[1, 1.5]} camera={{ fov: 60, near: 0.1, far: 2000 }} gl={{ antialias: false, powerPreference: "high-performance" }}>
        <Suspense fallback={null}>
          <Physics gravity={[0, -30, 0]}>
            <Environment />
            <Districts />
            <Actors />
            <Player />
          </Physics>
          {scene}
        </Suspense>
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur luminanceThreshold={1.15} luminanceSmoothing={0.2} intensity={0.42} />
          <Vignette offset={0.32} darkness={0.42} />
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        </EffectComposer>
      </Canvas>
      <Hud />
      {overlay}
    </div>
  );
}
