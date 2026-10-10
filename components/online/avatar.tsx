"use client";

import { useMemo, useState } from "react";
import { punkUrl } from "./punk";

/** A player's picture: their chosen photo, or the generated portrait from their seed if there is none or it fails to load. */
export function Avatar({ src, seed, size, className }: { src?: string | null; seed: string; size: number; className?: string }) {
  const fallback = useMemo(() => punkUrl(seed), [seed]);
  const [broken, setBroken] = useState<string | null>(null);
  const url = src && broken !== src ? src : fallback;
  return (
    <img
      className={className}
      src={url}
      alt=""
      width={size}
      height={size}
      style={{ imageRendering: url === fallback ? "pixelated" : undefined }}
      onError={() => src && setBroken(src)}
      referrerPolicy="no-referrer"
    />
  );
}
