import { ImageResponse } from "next/og";

export const ogSize = { width: 1200, height: 630 };
export const ogAlt = "Base World — a 3D open world on Base";
export const ogType = "image/png";

/** Default fonts only — Unbounded is a variable TTF and Satori crashes on it during prerender. */
export function ogImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          padding: 80,
          background: "#050b24",
          color: "#fff",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 88,
            height: 88,
            marginBottom: 32,
            borderRadius: 20,
            background: "#0052ff",
          }}
        />
        <div style={{ display: "flex", fontSize: 72, fontWeight: 700 }}>BASE WORLD</div>
        <div style={{ display: "flex", marginTop: 20, fontSize: 28, color: "#b7c6ee" }}>Quests, agents, and DeFi — on Base.</div>
      </div>
    ),
    ogSize,
  );
}
