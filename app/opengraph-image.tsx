import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

export const alt = SITE.title;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const [font, icon] = await Promise.all([
    readFile(join(process.cwd(), "public/world/Unbounded.ttf")),
    readFile(join(process.cwd(), "public/icon.png")),
  ]);
  const mark = `data:image/png;base64,${icon.toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          padding: "72px 88px",
          background: "linear-gradient(135deg, #07102c 0%, #050b24 55%, #04183f 100%)",
          color: "#fff",
        }}
      >
        <img src={mark} width={96} height={96} style={{ borderRadius: 22, marginBottom: 36 }} />
        <div style={{ display: "flex", fontSize: 84, fontFamily: "Unbounded", letterSpacing: -2, lineHeight: 0.95 }}>BASE WORLD</div>
        <div style={{ display: "flex", marginTop: 22, fontSize: 28, color: "#b7c6ee" }}>Quests, agents, and DeFi — on Base.</div>
      </div>
    ),
    { ...size, fonts: [{ name: "Unbounded", data: font, weight: 700 }] },
  );
}
