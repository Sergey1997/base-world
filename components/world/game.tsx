"use client";

import { PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, ToneMapping, Vignette } from "@react-three/postprocessing";
import { Physics } from "@react-three/rapier";
import { ToneMappingMode } from "postprocessing";
import { type ReactNode, Suspense, useState } from "react";
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
  const [dpr, setDpr] = useState(1.25);
  return (
    <div className={styles.root}>
      <Canvas shadows dpr={dpr} camera={{ fov: 60, near: 0.1, far: 2000 }} gl={{ antialias: false, powerPreference: "high-performance" }}>
        {/* Resolution follows the frame rate: 0.85× on struggling GPUs, up to 1.5× when there is headroom. */}
        <PerformanceMonitor factor={0.5} flipflops={3} onChange={({ factor }) => setDpr(Math.round((0.85 + factor * 0.65) * 20) / 20)} onFallback={() => setDpr(0.85)} />
        <Suspense fallback={null}>
          <Physics gravity={[0, -30, 0]}>
            <Environment />
            <Districts />
            <Actors />
            <Player />
          </Physics>
          {scene}
        </Suspense>
        {/* Always mounted: the player's priority-0.5 frame callback disables R3F's own render. */}
        <EffectComposer multisampling={dpr > 1.2 ? 0 : 2}>
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
