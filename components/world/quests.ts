import type { Token } from "./chain";
import type { DistrictId, Vec3 } from "./config";
import { jumpPads, npcs, stations } from "./config";

export type QuestEvent =
  | { type: "talk"; npc: string; tags?: string[] }
  | { type: "reach"; zone: DistrictId }
  | { type: "collect"; id: string }
  | { type: "action"; action: string }
  | { type: "race" };

export type Waypoint = Vec3 | "orbs" | "race";

export interface Objective {
  id: string;
  label: string;
  event: QuestEvent["type"];
  match?: string;
  count?: number;
  at?: Waypoint;
}

export interface QuestDef {
  id: string;
  title: string;
  kind: "Collect" | "Explore" | "Time Trial" | "Protocol" | "Social" | "Stunt" | "Builder";
  giver: string;
  summary: string;
  offer: string;
  hint: string;
  done: string;
  requires: string[];
  auto?: boolean;
  grant?: Partial<Record<Token, number>>;
  objectives: Objective[];
  /** Base World points only; tokens are never handed out as rewards. */
  reward: { xp: number; badge?: string };
}

const at = (id: string): Vec3 => {
  const n = npcs.find((x) => x.id === id) ?? stations.find((x) => x.id === id);
  if (!n) throw new Error(`Unknown waypoint ${id}`);
  return n.position;
};

export const quests: QuestDef[] = [
  {
    id: "gm",
    title: "gm, Builder",
    kind: "Collect",
    giver: "jesse",
    summary: "Collect the six Base orbs scattered around the plaza.",
    offer: "gm, new builder! This plaza runs on tiny sparks of energy we call Base orbs. Six of them drifted off overnight. Mind gathering them up? Hold Shift to boost — you'll be fast.",
    hint: "The orbs glow blue. One floats a little higher than the rest, so jump with Space.",
    done: "Look at that, the beacon is humming again. You're a natural.",
    requires: [],
    objectives: [{ id: "orbs", label: "Collect Base orbs", event: "collect", match: "orb", count: 6, at: "orbs" }],
    reward: { xp: 150 },
  },
  {
    id: "speed",
    title: "Speed of Base",
    kind: "Stunt",
    giver: "jesse",
    summary: "Break 150 km/h. Boost with Shift, then dash with Q.",
    offer: "Here's a secret: boosting is fast, but dashing while boosting is faster. Hit 150 km/h and I'll be impressed.",
    hint: "Hold Shift to boost, then tap Q to dash forward.",
    done: "Blink and you'd miss it. Fast blocks, fast builders.",
    requires: ["gm"],
    objectives: [{ id: "mach", label: "Reach 150 km/h", event: "action", match: "mach" }],
    reward: { xp: 120 },
  },
  {
    id: "summit",
    title: "Meet the Captain",
    kind: "Explore",
    giver: "jesse",
    summary: "Ride the jump pad up to the Summit Beacon and find Captain Bryan.",
    offer: "Captain Bryan watches over the city from the Summit Beacon, due north. The road takes you there — the jump pad at the end takes you up. He's got bigger plans for you.",
    hint: "Follow the north road. Step onto the glowing jump pad to reach the summit.",
    done: "Bryan's expecting you.",
    requires: ["gm"],
    objectives: [
      { id: "reach", label: "Reach the Summit Beacon", event: "reach", match: "summit", at: jumpPads[0].position },
      { id: "talk", label: "Talk to Captain Bryan", event: "talk", match: "bryan", at: at("bryan") },
    ],
    reward: { xp: 200 },
  },
  {
    id: "race",
    title: "Runway Rush",
    kind: "Time Trial",
    giver: "bryan",
    summary: "Fly through all 8 Aerodrome rings in under 26 seconds.",
    offer: "The Aerodrome runway has a ring course nobody's cleared this week. Eight rings, twenty-six seconds. Boost, dash, jump — whatever it takes.",
    hint: "The first ring starts the clock. Chain boost and dash, and jump for the high rings.",
    done: "Under the limit! The tower will be talking about that one for a while.",
    requires: ["summit"],
    objectives: [{ id: "run", label: "Finish the ring course in time", event: "race", at: "race" }],
    reward: { xp: 300 },
  },
  {
    id: "aero",
    title: "Clear for Takeoff",
    kind: "Protocol",
    giver: "al",
    summary: "Swap, provide liquidity and vote at Aerodrome.",
    offer: "Welcome to Aerodrome! Our engines run on liquidity. Swap some ETH for AERO at the terminal, drop a pair into the pool, then lock what's left and vote for a gauge. That's the flywheel.",
    hint: "Swap Terminal → Liquidity Pool → Gauge Voting Booth. They're all on the apron.",
    done: "Flywheel spinning! Emissions flow where the votes go — and you just steered them.",
    requires: ["summit"],
    objectives: [
      { id: "swap", label: "Swap ETH for AERO", event: "action", match: "swap", at: at("station-swap") },
      { id: "pool", label: "Add ETH/AERO liquidity", event: "action", match: "liquidity", at: at("station-pool") },
      { id: "vote", label: "Lock & vote for a gauge", event: "action", match: "vote", at: at("station-vote") },
    ],
    reward: { xp: 350 },
  },
  {
    id: "agents",
    title: "Agents Awaken",
    kind: "Social",
    giver: "vee",
    summary: "Chat with two AI agents, then launch one of your own.",
    offer: "Virtuals is where agents are born. Chat with a couple of the locals to see what they're like, then head to the launchpad and bring your own agent to life. Here's some VIRTUAL to cover the launch.",
    hint: "Agents float around the district. The launchpad is the big glowing ring.",
    done: "Your agent's already making friends. Welcome to Virtuals.",
    requires: ["summit"],
    grant: { VIRTUAL: 200 },
    objectives: [
      { id: "chat", label: "Chat with AI agents", event: "talk", match: "agent", count: 2, at: at("agent-nova") },
      { id: "launch", label: "Launch your own agent", event: "action", match: "launch", at: at("station-launch") },
    ],
    reward: { xp: 350 },
  },
  {
    id: "gekko",
    title: "Smart Greed",
    kind: "Social",
    giver: "gekko",
    summary: "Get a yield brief from Gekko, then scout the Morpho vaults he watches.",
    offer: "The name's Gekko. Money never sleeps and neither do I. Ask me for a yield brief, then go look at Morpho — that's where the smart greed lives.",
    hint: "Chat with Gekko about yield or Morpho, then head southwest to Morpho.",
    done: "Now you get it. Greed is good — smart greed is better.",
    requires: ["gm"],
    objectives: [
      { id: "brief", label: "Ask Gekko for a yield brief", event: "action", match: "chat-yield", at: at("gekko") },
      { id: "scout", label: "Scout Morpho vaults", event: "reach", match: "morpho", at: at("station-lend") },
    ],
    reward: { xp: 280 },
  },
  {
    id: "bank",
    title: "Just Ask Bankr",
    kind: "Protocol",
    giver: "bankr",
    summary: "Trade, check your bags and launch a token — all by chatting with Bankr.",
    offer: "Wallets with buttons are so last cycle. Just tell me what you want. Buy something, peek at your portfolio, then launch a token of your own. I'll handle the rest.",
    hint: "Talk to Bankr and type commands like \"buy 0.05 ETH of AERO\", \"portfolio\" or \"launch a token called BASED\".",
    done: "See? Your wallet just became a conversation.",
    requires: ["gm"],
    objectives: [
      { id: "trade", label: "Buy or swap by chat", event: "action", match: "chat-trade", at: at("bankr") },
      { id: "bags", label: "Ask for your portfolio", event: "action", match: "chat-portfolio", at: at("bankr") },
      { id: "launch", label: "Launch a token by chat", event: "action", match: "chat-launch", at: at("bankr") },
    ],
    reward: { xp: 300 },
  },
  {
    id: "lend",
    title: "Curate Your Yield",
    kind: "Protocol",
    giver: "mira",
    summary: "Supply ETH to a Morpho vault, borrow USDC against it, then repay.",
    offer: "Morpho holds more value than the rest of the city combined. Supply some ETH to my vault, borrow a little USDC against it, then pay it back. Keep your health factor above 1 — the liquidation sirens are loud.",
    hint: "Use the Morpho Vault terminal: Supply → Borrow → Repay.",
    done: "Textbook. Collateral safe, debt cleared, yield accruing. You'd make a fine curator.",
    requires: ["gm"],
    objectives: [
      { id: "supply", label: "Supply ETH to the vault", event: "action", match: "supply", at: at("station-lend") },
      { id: "borrow", label: "Borrow USDC", event: "action", match: "borrow", at: at("station-lend") },
      { id: "repay", label: "Repay your loan", event: "action", match: "repay", at: at("station-lend") },
    ],
    reward: { xp: 350 },
  },
  {
    id: "hooks",
    title: "Hooked",
    kind: "Protocol",
    giver: "hana",
    summary: "Swap through two different hooks at Uniswap.",
    offer: "Plain swaps are fine. Swaps with hooks are better. Try two different stalls — a dynamic fee, a limit order, a rebate, whatever catches your eye.",
    hint: "Open the Uniswap Hook and swap with two different hooks.",
    done: "Now you know: a hook can turn a swap into almost anything.",
    requires: ["gm"],
    objectives: [{ id: "two", label: "Swap with different hooks", event: "action", match: "hook", count: 2, at: at("station-hooks") }],
    reward: { xp: 250 },
  },
  {
    id: "flash",
    title: "The One-Block Heist",
    kind: "Time Trial",
    giver: "gus",
    summary: "Borrow 1,000 ETH, run the arbitrage route and repay — all inside one block.",
    offer: "Here's the trick: borrow a thousand ETH, swap it round the route, and pay it back before the block closes. Miss the window and the whole thing never happened. Fancy it?",
    hint: "At the Aave Flash Loan counter, hit the route steps in order before the timer runs out.",
    done: "Borrowed, used, returned — and a little extra for you. Nobody saw a thing. Boo.",
    requires: ["gm"],
    objectives: [{ id: "heist", label: "Complete a flash loan", event: "action", match: "flash", at: at("station-flash") }],
    reward: { xp: 300 },
  },
  {
    id: "kickoff",
    title: "Kick It Off",
    kind: "Protocol",
    giver: "kip",
    summary: "Launch a Spark token on Kickoff, buy more on its bonding curve, then take some profit.",
    offer: "Got a name in your head? Turn it into a token. Launch a Spark at the pad, buy a little more on the curve so the price climbs, then sell a slice. That's the whole game — until it graduates.",
    hint: "Open the Kickoff Launchpad: Launch → Buy → Sell.",
    done: "Launched, pumped, trimmed. You've got the instincts. See you at graduation.",
    requires: ["gm"],
    objectives: [
      { id: "launch", label: "Launch a Spark token", event: "action", match: "spark-launch", at: at("station-kickoff") },
      { id: "buy", label: "Buy on the bonding curve", event: "action", match: "spark-buy", at: at("station-kickoff") },
      { id: "sell", label: "Sell some of your Spark", event: "action", match: "spark-sell", at: at("station-kickoff") },
    ],
    reward: { xp: 300 },
  },
  {
    id: "hello",
    title: "Hello, Base",
    kind: "Builder",
    giver: "devi",
    summary: "Read the Quickstart at the Base Docs kiosk: connect, fund, send.",
    offer: "Want to build here, not just play? Start where every builder starts: the Quickstart. Connect to the network, fund an address, send a transaction. The kiosk next to me has the short version — pass the quick check on each page.",
    hint: "Open the Base Docs kiosk (or press B anywhere) and pass the quick checks on the three Quickstart pages.",
    done: "Chain ID 8453, a funded wallet and a sub-second transaction. You're officially dangerous.",
    requires: [],
    objectives: [
      { id: "connect", label: "Read: Connect to Base", event: "action", match: "doc:connect", at: at("station-docs") },
      { id: "funds", label: "Read: Get Funds", event: "action", match: "doc:funds", at: at("station-docs") },
      { id: "tx", label: "Read: Make a Transaction", event: "action", match: "doc:transaction", at: at("station-docs") },
    ],
    reward: { xp: 200 },
  },
  {
    id: "build-defi",
    title: "Ship a DeFi App",
    kind: "Builder",
    giver: "devi",
    summary: "Read Integrate DeFi, then try trading and lending yourself like your users would.",
    offer: "Most apps on Base plug into DeFi instead of rebuilding it: swaps, lending, borrowing, earn vaults. Read the guide, then go feel the user flow — swap at Aerodrome and supply to a Morpho vault.",
    hint: "Read Integrate DeFi at the docs kiosk, swap at the Aerodrome terminal, then supply ETH at the Morpho Vault.",
    done: "You just walked the exact flow your users will. Ship it with confidence.",
    requires: ["hello"],
    objectives: [
      { id: "read", label: "Read: Integrate DeFi", event: "action", match: "doc:defi", at: at("station-docs") },
      { id: "swap", label: "Swap tokens at Aerodrome", event: "action", match: "swap", at: at("station-swap") },
      { id: "supply", label: "Supply to a Morpho vault", event: "action", match: "supply", at: at("station-lend") },
    ],
    reward: { xp: 350 },
  },
  {
    id: "build-money",
    title: "Money on Base",
    kind: "Builder",
    giver: "devi",
    summary: "Learn how Base issues stablecoins, tokenizes assets and takes payments — then launch a token by chat.",
    offer: "Base is the chain for global finance: stablecoins, tokenized assets and payments are native primitives. Read those three pages, then issue a token of your own — Bankr can do it in one sentence.",
    hint: "Read Issue a Stablecoin, Tokenize Assets and Accept Payments, then tell Bankr \"launch a token called …\".",
    done: "Issued, tokenized, paid. That's a fintech in an afternoon.",
    requires: ["hello"],
    objectives: [
      { id: "stable", label: "Read: Issue a Stablecoin", event: "action", match: "doc:stablecoin", at: at("station-docs") },
      { id: "rwa", label: "Read: Tokenize Assets", event: "action", match: "doc:tokenize", at: at("station-docs") },
      { id: "pay", label: "Read: Accept Payments", event: "action", match: "doc:payments", at: at("station-docs") },
      { id: "launch", label: "Launch a token with Bankr", event: "action", match: "chat-launch", at: at("bankr") },
    ],
    reward: { xp: 350 },
  },
  {
    id: "build-agents",
    title: "Build with Agents",
    kind: "Builder",
    giver: "devi",
    summary: "Hook your AI coding assistant up to Base docs, then launch an agent at Virtuals.",
    offer: "Your AI assistant codes better when it can read the docs. Learn how to plug the Base docs MCP server into Cursor or Claude Code — then go launch an agent of your own. I'll cover the VIRTUAL.",
    hint: "Read Build with AI Agents at the docs kiosk, then launch an agent at the Virtuals launchpad.",
    done: "An assistant that reads the docs and an agent that lives onchain. The future builds itself — with a little help.",
    requires: ["hello"],
    grant: { VIRTUAL: 100 },
    objectives: [
      { id: "read", label: "Read: Build with AI Agents", event: "action", match: "doc:agents", at: at("station-docs") },
      { id: "launch", label: "Launch an agent at Virtuals", event: "action", match: "launch", at: at("station-launch") },
    ],
    reward: { xp: 300 },
  },
  {
    id: "ship",
    title: "Ship It",
    kind: "Builder",
    giver: "devi",
    summary: "Finish the docs — bridging, private transactions, funding — and report to Jesse Pollak.",
    offer: "Last stretch. Learn how value moves in and out, how enterprises keep payments private, and where Base funds teams like yours. Then go tell Jesse what you're building.",
    hint: "Read Bridge to Base, Private Transactions and Get Funded, then talk to Jesse Pollak at the plaza.",
    done: "Jesse heard all about it. Apply to Base Batches — we'd love to see you at demo day.",
    requires: ["build-defi", "build-money", "build-agents"],
    objectives: [
      { id: "bridge", label: "Read: Bridge to Base", event: "action", match: "doc:bridge", at: at("station-docs") },
      { id: "private", label: "Read: Private Transactions", event: "action", match: "doc:private", at: at("station-docs") },
      { id: "funding", label: "Read: Get Funded", event: "action", match: "doc:funding", at: at("station-docs") },
      { id: "jesse", label: "Tell Jesse Pollak what you're building", event: "talk", match: "jesse", at: at("jesse") },
    ],
    reward: { xp: 500, badge: "Shipped on Base" },
  },
  {
    id: "based",
    title: "Stay Based",
    kind: "Explore",
    giver: "jesse",
    summary: "Return to Jesse Pollak at Base Plaza.",
    offer: "",
    hint: "Jesse Pollak is waiting at the plaza beacon.",
    done: "Summit, Aerodrome, Morpho, Virtuals, Bankr — you've seen what this world can do. You're officially a Based Builder. Now go build something.",
    requires: ["race", "aero", "lend", "agents", "bank"],
    auto: true,
    objectives: [{ id: "talk", label: "Talk to Jesse Pollak", event: "talk", match: "jesse", at: at("jesse") }],
    reward: { xp: 500, badge: "Based Builder" },
  },
];

export const questById = Object.fromEntries(quests.map((q) => [q.id, q])) as Record<string, QuestDef>;

export function matches(o: Objective, e: QuestEvent): string | null {
  if (o.event !== e.type) return null;
  switch (e.type) {
    case "talk":
      return o.match === e.npc || (o.match && e.tags?.includes(o.match)) ? e.npc : null;
    case "reach":
      return o.match === e.zone ? e.zone : null;
    case "collect":
      return o.match && e.id.startsWith(o.match) ? e.id : null;
    case "action":
      return o.match === e.action || e.action.startsWith(`${o.match}:`) ? e.action : null;
    case "race":
      return "win";
  }
}

export const MAX_LEVEL = 99;
export const xpForLevel = (level: number) => 125 * level * (level + 1);
export const xpCap = xpForLevel(MAX_LEVEL - 1);

export function levelFor(xp: number) {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level)) level++;
  if (level >= MAX_LEVEL) return { level: MAX_LEVEL, progress: 1, next: xpCap, maxed: true };
  const floor = level === 1 ? 0 : xpForLevel(level - 1);
  return { level, progress: (xp - floor) / (xpForLevel(level) - floor), next: xpForLevel(level), maxed: false };
}

/** Named humans are maxed; agents sit in the high 30s–60s so the cap still means something. */
export function npcLevel(n: { id: string; kind: string; level?: number }) {
  if (n.level) return n.level;
  if (n.kind === "human") return MAX_LEVEL;
  let h = 0;
  for (const c of n.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 36 + (h % 28);
}
