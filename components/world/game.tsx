"use client";

import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, ToneMapping, Vignette } from "@react-three/postprocessing";
import { Physics } from "@react-three/rapier";
import { ToneMappingMode } from "postprocessing";
import { Suspense } from "react";
import { Actors } from "./actors";
import { Districts } from "./districts";
import { Environment } from "./environment";
import { Hud } from "./hud";
import { useKeyboard } from "./input";
import { Player } from "./player";
import styles from "./world.module.css";

export default function Game() {
  useKeyboard();
  return (
    <div className={styles.root}>
      <Canvas shadows dpr={[1, 1.75]} camera={{ fov: 60, near: 0.1, far: 2000 }} gl={{ antialias: false, powerPreference: "high-performance" }}>
        <Suspense fallback={null}>
          <Physics gravity={[0, -30, 0]}>
            <Environment />
            <Districts />
            <Actors />
            <Player />
          </Physics>
        </Suspense>
        {/* Always mounted: the player's priority-0.5 frame callback disables R3F's own render. */}
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur luminanceThreshold={1} intensity={0.9} />
          <Vignette offset={0.3} darkness={0.55} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      </Canvas>
      <Hud />
    </div>
  );
}
