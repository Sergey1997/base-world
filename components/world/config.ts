export type Vec3 = [number, number, number];

export const palette = {
  base: "#0052ff",
  baseBright: "#3d7bff",
  cyan: "#5ee7ff",
  ice: "#dce8ff",
  night: "#050b24",
  ground: "#24336f",
  gold: "#ffd166",
  aero: "#ff6a2a",
  virtuals: "#8b5cf6",
};

export const SPAWN: Vec3 = [0, 2, 28];
export const WORLD_HALF = 420;

export type DistrictId = string;

/**
 * Districts are pure data. Hand-built scenes exist for the plaza, summit, Aerodrome and Virtuals;
 * any district with a `look` is rendered by the generic <ProtocolDistrict />, so a new protocol
 * zone is one entry here plus its NPCs/stations below and its quests in quests.ts.
 */
export interface DistrictDef {
  id: DistrictId;
  name: string;
  center: [number, number];
  radius: number;
  color: string;
  minY?: number;
  /** Road from the plaza edge to the district edge. */
  road?: [number, number, number, number];
  logo?: string;
  look?: { accent: string; sign: string; tagline: string; towers: number; motif: "vault" | "pylon" | "dome" };
}

export const districts: DistrictDef[] = [
  { id: "plaza", name: "Base Plaza", center: [0, 0], radius: 50, color: palette.baseBright, logo: "/world/brands/base.png" },
  { id: "aerodrome", name: "Aerodrome", center: [235, -45], radius: 125, color: palette.aero, logo: "/world/brands/aerodrome.png", road: [40, 0, 150, 0] },
  { id: "virtuals", name: "Virtuals", center: [-215, 140], radius: 80, color: palette.virtuals, logo: "/world/brands/virtuals.png", road: [-35, 25, -175, 115] },
  { id: "summit", name: "Summit Beacon", center: [0, -235], radius: 30, color: palette.cyan, minY: 10, road: [0, -45, 0, -200] },
  {
    id: "morpho",
    name: "Morpho",
    center: [-200, -145],
    radius: 60,
    color: "#2470ff",
    road: [-35, -25, -158, -105],
    logo: "/world/brands/morpho.png",
    look: { accent: "#4d8fff", sign: "MORPHO", tagline: "Curated lending vaults", towers: 7, motif: "vault" },
  },
  {
    id: "bankr",
    name: "Bankr",
    center: [150, 200],
    radius: 55,
    color: "#3dffb0",
    road: [30, 35, 115, 160],
    logo: "/world/brands/bankr.png",
    look: { accent: "#3dffb0", sign: "BANKR", tagline: "Trade by talking", towers: 5, motif: "pylon" },
  },
  {
    id: "uniswap",
    name: "Uniswap",
    center: [-10, 235],
    radius: 50,
    color: "#ff007a",
    road: [0, 50, -6, 185],
    logo: "/world/brands/uniswap.png",
    look: { accent: "#ff4da6", sign: "UNISWAP", tagline: "Swaps with hooks", towers: 6, motif: "dome" },
  },
  {
    id: "aave",
    name: "Aave",
    center: [195, -275],
    radius: 50,
    color: "#b6509e",
    road: [40, -60, 160, -238],
    logo: "/world/brands/aave.png",
    look: { accent: "#d478c0", sign: "AAVE", tagline: "Borrow it. Use it. Return it. One block.", towers: 4, motif: "vault" },
  },
];

export const districtById = Object.fromEntries(districts.map((d) => [d.id, d])) as Record<DistrictId, DistrictDef>;

export const SUMMIT = { center: [0, -235] as [number, number], radius: 30, height: 14 };

export const roads: [number, number, number, number][] = [
  ...districts.flatMap((d) => (d.road ? [d.road] : [])),
  [150, 0, 150, -30],
];

export type NpcKind = "human" | "agent";

export interface NpcDef {
  id: string;
  name: string;
  title: string;
  kind: NpcKind;
  position: Vec3;
  color: string;
  accent: string;
  tags?: string[];
  greeting: string[];
  persona?: string;
  photo?: string;
  twitter?: string;
  ens?: string;
  url?: string;
}

export const npcs: NpcDef[] = [
  {
    id: "jesse",
    name: "Jesse Pollak",
    title: "Head of Base · builder #001",
    kind: "human",
    position: [0, 0, 14],
    color: "#0052ff",
    accent: "#ffffff",
    photo: "/world/brands/jesse.png",
    twitter: "jessepollak",
    ens: "jesse.base.eth",
    url: "https://base.app/profile/jesse",
    greeting: [
      "gm! Every block here was shipped by someone who just kept building.",
      "Stay based, builder. The world gets brighter every time you ship.",
    ],
  },
  {
    id: "devi",
    name: "Devi",
    title: "Builder Guide, Base",
    kind: "human",
    position: [-24, 0, 12],
    color: "#3d7bff",
    accent: "#ffd166",
    photo: "/world/brands/base.png",
    twitter: "base",
    url: "https://docs.base.org",
    greeting: [
      "Builders start at the docs kiosk. Ten minutes of reading saves ten hours of debugging.",
      "Everything on Base is just EVM. If it works on Ethereum, it works here — faster and cheaper.",
    ],
  },
  {
    id: "bryan",
    name: "Captain Bryan",
    title: "Keeper of the Summit",
    kind: "human",
    position: [0, SUMMIT.height, -240],
    color: "#13234f",
    accent: "#5ee7ff",
    greeting: [
      "From up here you can see the whole economy humming. Beautiful, isn't it?",
      "Speed is a feature. Never let anyone tell you otherwise.",
    ],
  },
  {
    id: "al",
    name: "Aero Al",
    title: "Flight Controller, Aerodrome",
    kind: "human",
    position: [215, 0, 4],
    color: "#ff6a2a",
    accent: "#fff2e0",
    photo: "/world/brands/aerodrome.png",
    twitter: "AerodromeFi",
    url: "https://aerodrome.finance",
    greeting: [
      "Tower to builder: skies are clear and liquidity is deep.",
      "Swap, pool, vote. That's how Aerodrome keeps its engines running.",
    ],
  },
  {
    id: "vee",
    name: "Vee",
    title: "Agent Curator, Virtuals",
    kind: "human",
    position: [-195, 0, 118],
    color: "#8b5cf6",
    accent: "#5ee7ff",
    photo: "/world/brands/virtuals.png",
    twitter: "virtuals_io",
    url: "https://www.virtuals.io",
    greeting: [
      "Every agent here was launched by someone with an idea and a little courage.",
      "Talk to them. They're surprisingly opinionated.",
    ],
  },
  {
    id: "agent-nova",
    name: "NOVA-7",
    title: "Market-making agent",
    kind: "agent",
    position: [-228, 2.2, 128],
    color: "#5ee7ff",
    accent: "#8b5cf6",
    tags: ["agent"],
    persona: "trader",
    photo: "/world/brands/virtuals.png",
    twitter: "virtuals_io",
    url: "https://www.virtuals.io",
    greeting: ["Spreads are tight, vibes are tighter. Ask me anything about markets."],
  },
  {
    id: "agent-muse",
    name: "MUSE",
    title: "Generative artist agent",
    kind: "agent",
    position: [-206, 2.2, 162],
    color: "#ff6bd6",
    accent: "#5ee7ff",
    tags: ["agent"],
    persona: "artist",
    photo: "/world/brands/virtuals.png",
    twitter: "virtuals_io",
    url: "https://www.virtuals.io",
    greeting: ["I paint with gradients and gas fees. What should I make for you?"],
  },
  {
    id: "agent-sage",
    name: "SAGE",
    title: "Research agent",
    kind: "agent",
    position: [-240, 2.2, 104],
    color: "#9dff8a",
    accent: "#3d7bff",
    tags: ["agent"],
    persona: "sage",
    photo: "/world/brands/virtuals.png",
    twitter: "virtuals_io",
    url: "https://www.virtuals.io",
    greeting: ["I read every block so you don't have to. Curious about something?"],
  },
  {
    id: "gekko",
    name: "Gekko",
    title: "Yield agent, Virtuals",
    kind: "agent",
    position: [-210, 2.4, 138],
    color: "#d4af37",
    accent: "#3dffb0",
    tags: ["agent"],
    persona: "gekko",
    photo: "/world/brands/gekko.png",
    twitter: "Gekko_Agent",
    url: "https://www.gekkoterminal.xyz",
    greeting: [
      "Greed is good, but smart greed is better. I'm Gekko — I hunt yield on Morpho so you don't have to.",
    ],
  },
  {
    id: "bankr",
    name: "Bankr",
    title: "Wallet & trading agent",
    kind: "agent",
    position: [150, 2.4, 192],
    color: "#3dffb0",
    accent: "#0052ff",
    tags: ["banker"],
    persona: "banker",
    photo: "/world/brands/bankr.png",
    twitter: "bankrbot",
    url: "https://bankr.bot",
    greeting: [
      "Hey! I'm Bankr, your wallet that talks back. Try: \"buy 0.05 ETH of AERO\", \"swap 100 AERO to VIRTUAL\", \"launch a token called BASED\" or \"portfolio\".",
    ],
  },
  {
    id: "mira",
    name: "Curator Mira",
    title: "Vault Curator, Morpho",
    kind: "human",
    position: [-188, 0, -128],
    color: "#2470ff",
    accent: "#ffffff",
    photo: "/world/brands/morpho.png",
    twitter: "MorphoLabs",
    url: "https://morpho.org",
    greeting: ["Every vault here has a curator watching the risk. Tonight, that's me.", "Keep your health factor above 1 and you'll sleep fine."],
  },
  {
    id: "hana",
    name: "Hana Hooks",
    title: "Hooksmith, Uniswap",
    kind: "human",
    position: [4, 0, 218],
    color: "#ff007a",
    accent: "#ffe0f4",
    photo: "/world/brands/uniswap.png",
    twitter: "Uniswap",
    url: "https://uniswap.org",
    greeting: ["Every stall here bends the swap rules a little differently.", "A hook is just a promise: 'before and after you trade, I'll do this.'"],
  },
  {
    id: "gus",
    name: "Gus the Ghost",
    title: "Night Teller, Aave",
    kind: "human",
    position: [180, 0, -258],
    color: "#b6509e",
    accent: "#ede9fe",
    photo: "/world/brands/aave.png",
    twitter: "aave",
    url: "https://aave.com",
    greeting: ["Boo. Sorry — habit. Want to borrow a fortune for exactly one block?", "Flash loans are the only loans I trust: they always come back."],
  },
];

export type PanelId = "swap" | "pool" | "vote" | "launch" | "lend" | "hooks" | "flash" | "aave" | "docs";

export interface StationDef {
  id: string;
  label: string;
  panel: PanelId;
  position: Vec3;
  color: string;
  logo?: string;
}

export const stations: StationDef[] = [
  { id: "station-docs", label: "Base Docs", panel: "docs", position: [-14, 0, 22], color: palette.base, logo: "/world/brands/base.png" },
  { id: "station-swap", label: "Swap Terminal", panel: "swap", position: [196, 0, 16], color: palette.aero, logo: "/world/brands/aerodrome.png" },
  { id: "station-pool", label: "Liquidity Pool", panel: "pool", position: [234, 0, 22], color: palette.cyan, logo: "/world/brands/aerodrome.png" },
  { id: "station-vote", label: "Gauge Voting Booth", panel: "vote", position: [272, 0, 16], color: palette.gold, logo: "/world/brands/aerodrome.png" },
  { id: "station-launch", label: "Agent Launchpad", panel: "launch", position: [-242, 0, 150], color: palette.virtuals, logo: "/world/brands/virtuals.png" },
  { id: "station-lend", label: "Morpho Vault", panel: "lend", position: [-210, 0, -150], color: "#4d8fff", logo: "/world/brands/morpho.png" },
  { id: "station-hooks", label: "Uniswap Hook", panel: "hooks", position: [-24, 0, 240], color: "#ff4da6", logo: "/world/brands/uniswap.png" },
  { id: "station-flash", label: "Aave Flash Loan", panel: "flash", position: [205, 0, -282], color: "#d478c0", logo: "/world/brands/aave.png" },
];

export const orbs: Vec3[] = [
  [24, 1.6, 8],
  [-28, 1.6, -6],
  [10, 1.6, -34],
  [-14, 1.6, 40],
  [38, 4.5, -26],
  [-40, 1.6, 30],
];

export const RACE = {
  limit: 26,
  rings: [
    [150, 3, -30],
    [195, 3, -30],
    [240, 3, -30],
    [285, 6, -30],
    [330, 3, -50],
    [325, 3, -100],
    [270, 6, -112],
    [210, 3, -100],
  ] as Vec3[],
};

export const jumpPads: { position: Vec3; launch: Vec3 }[] = [
  { position: [0, 0, -193], launch: [0, 32, -17] },
  { position: [80, 0, -8], launch: [0, 20, 0] },
];
