import { districts, jumpPads, npcs, palette, RACE, stations, type Vec3 } from "./config";

export interface Caption {
  id: string;
  x: number;
  z: number;
  text: string;
  fill?: string;
  kind?: "district" | "pin";
}

export interface PlacedCaption extends Caption {
  ox: number;
  oy: number;
  hw: number;
  hh: number;
}

export function districtOf(p: Vec3) {
  return districts
    .map((d) => ({ d, gap: Math.hypot(p[0] - d.center[0], p[2] - d.center[1]) - d.radius }))
    .filter((x) => x.gap < 25)
    .sort((a, b) => a.gap - b.gap)[0]?.d;
}

export const SHORT_STATION: Record<string, string> = {
  "station-docs": "Docs",
  "station-swap": "Swap",
  "station-pool": "Pool",
  "station-vote": "Vote",
  "station-launch": "Launch",
  "station-lend": "Vault",
  "station-hooks": "Hook",
  "station-flash": "Flash",
};

export const shortName = (name: string) => {
  const parts = name.split(/\s+/);
  return parts[0] === "Captain" || parts[0] === "Curator" ? (parts[1] ?? name) : parts[0];
};

const sizeOf = (item: Caption) => ({
  hw: Math.max(9, item.text.length * (item.kind === "district" ? 3 : 2.3)),
  hh: item.kind === "district" ? 7 : 5,
});

function clusters(items: Caption[], gap: number) {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (Math.hypot(items[i].x - items[j].x, items[i].z - items[j].z) < gap) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, Caption[]>();
  items.forEach((item, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), item]);
  });
  return [...groups.values()];
}

/** Nearby pins share a cluster so their names radiate instead of all dropping underneath. */
export function layoutCaptions(items: Caption[], u: number): PlacedCaption[] {
  const placed: PlacedCaption[] = [];
  const hits = (cx: number, cz: number, hw: number, hh: number) =>
    placed.some((p) => Math.abs(cx - (p.x + p.ox * u)) < (hw + p.hw + 3) * u && Math.abs(cz - (p.z + p.oy * u)) < (hh + p.hh + 3) * u);

  const settle = (item: Caption, angles: number[], reach: number) => {
    const { hw, hh } = sizeOf(item);
    let ox = 0;
    let oy = item.kind === "district" ? 0 : 12;
    outer: for (const extra of [0, 5, 10, 16]) {
      for (const a of angles) {
        const sx = Math.cos(a) * (reach + extra);
        const sy = Math.sin(a) * (reach + extra);
        if (!hits(item.x + sx * u, item.z + sy * u, hw, hh)) {
          ox = sx;
          oy = sy;
          break outer;
        }
      }
    }
    placed.push({ ...item, ox, oy, hw, hh });
  };

  for (const item of items.filter((c) => c.kind === "district")) settle(item, [0], 0);

  for (const group of clusters(
    items.filter((c) => c.kind !== "district"),
    40,
  )) {
    const cx = group.reduce((s, c) => s + c.x, 0) / group.length;
    const cz = group.reduce((s, c) => s + c.z, 0) / group.length;
    const home = districts
      .map((d) => ({ d, gap: Math.hypot(cx - d.center[0], cz - d.center[1]) }))
      .sort((a, b) => a.gap - b.gap)[0]?.d;
    const reach = 13 + Math.max(0, group.length - 1) * 2;
    group.forEach((item, i) => {
      const dx = item.x - (group.length > 1 ? cx : (home?.center[0] ?? 0));
      const dz = item.z - (group.length > 1 ? cz : (home?.center[1] ?? 0));
      const base = Math.hypot(dx, dz) < 2 ? (i / group.length) * Math.PI * 2 : Math.atan2(dz, dx);
      const angles = [0, 1, -1, 2, -2, 3, -3, 4].map((k) => base + (k * Math.PI) / 4);
      settle(item, angles, reach);
    });
  }
  return placed;
}

/** The same names the atlas shows: districts first, then terminals, people and pads. */
export function atlasCaptions(givers: Set<string>): Caption[] {
  return [
    ...districts.map((d) => ({
      id: `d-${d.id}`,
      x: d.center[0],
      z: d.center[1] - Math.min(d.radius * 0.7, 52),
      text: d.name,
      fill: "#f4f7ff",
      kind: "district" as const,
    })),
    ...stations.map((st) => ({ id: st.id, x: st.position[0], z: st.position[2], text: SHORT_STATION[st.id] ?? st.label, kind: "pin" as const })),
    ...npcs
      .filter((n) => {
        if (!(n.kind === "human" || givers.has(n.id))) return false;
        const home = districtOf(n.position);
        return !home || shortName(n.name).toLowerCase() !== home.name.toLowerCase();
      })
      .map((n) => ({ id: n.id, x: n.position[0], z: n.position[2], text: shortName(n.name), fill: givers.has(n.id) ? palette.gold : "#f4f7ff", kind: "pin" as const })),
    ...jumpPads.map((p, i) => ({ id: `pad-${i}`, x: p.position[0], z: p.position[2], text: "Pad", kind: "pin" as const })),
    { id: "race", x: RACE.rings[0][0], z: RACE.rings[0][2], text: "Race", fill: palette.gold, kind: "pin" as const },
  ];
}
