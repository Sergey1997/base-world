"use client";

import { useTexture } from "@react-three/drei";
import { DoubleSide, SRGBColorSpace } from "three";

/** Official mark or portrait as a world-space disc. */
export function BrandDisc({ src, radius = 0.5 }: { src: string; radius?: number }) {
  const tex = useTexture(src);
  tex.colorSpace = SRGBColorSpace;
  return (
    <mesh>
      <circleGeometry args={[radius, 48]} />
      <meshBasicMaterial map={tex} toneMapped={false} side={DoubleSide} />
    </mesh>
  );
}
