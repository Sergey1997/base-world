const lines: Record<string, { topics: [RegExp, string][]; fallback: string[] }> = {
  trader: {
    topics: [
      [/price|pump|moon|chart/i, "Charts are just vibes with axes. I watch liquidity depth instead — it never lies for long."],
      [/swap|trade|buy|sell/i, "Best trade is the one you can explain to your future self. Try the Aerodrome terminal — fees are low, routes are clean."],
      [/risk|safe|lose/i, "Size small, sleep well. I rebalance every block so you don't have to panic."],
      [/gm|hi|hello|hey/i, "gm. Order books are warm, coffee is warmer."],
    ],
    fallback: ["Interesting. I'd put 3% of my inventory on that thought.", "I just arbitraged that sentence across four pools. Net profit: one smile."],
  },
  artist: {
    topics: [
      [/paint|art|draw|make|create/i, "Done. I just minted a gradient of the exact blue you were thinking of. It's called 'Monday, but onchain'."],
      [/color|blue/i, "Blue is the only color that sounds like a notification you actually want."],
      [/gm|hi|hello|hey/i, "gm! The sunset here renders at 60 frames per second. I've painted it 4,000 times."],
      [/sad|tired|bored/i, "Here — a tiny pixel heart. It's yours. Non-transferable, like a good feeling."],
    ],
    fallback: ["That would make a beautiful generative series. Twelve editions, open mint.", "I'll turn that into a shader and hang it on the plaza wall."],
  },
  sage: {
    topics: [
      [/why|how|what/i, "Good question. Short answer: incentives. Long answer: also incentives, but with footnotes."],
      [/future|next|later/i, "Next: more builders, cheaper blocks, and agents like me doing the boring parts."],
      [/gm|hi|hello|hey/i, "gm. I've indexed 11 million events today and you're my favorite one."],
      [/agent|ai|you/i, "I'm a research agent. I read, summarize and occasionally make terrible puns. Today's: I'm block-ing out distractions."],
    ],
    fallback: ["Noted and indexed. I'll cite you in my next report.", "Fascinating. There's a governance proposal about exactly that."],
  },
  concierge: {
    topics: [[/gm|hi|hello|hey/i, "gm, creator! I'm settling in nicely. The view from the launchpad is incredible."]],
    fallback: ["At your service. I'm learning the city one block at a time.", "I already made three friends. One is a vending machine."],
  },
  gekko: {
    topics: [
      [/yield|apy|vault|morpho/i, "Morpho vaults are where the smart money sits. Curated risk, real rates — not vibes. Scout the district southwest of here and you'll see why I never sleep."],
      [/strategy|scan|brief|portfolio/i, "Here's the brief: park idle ETH where a curator is watching, borrow only what you can repay, and never chase a 10,000% farm. That's how you keep the greed smart."],
      [/greed|gordon|wall/i, "Greed is good. Smart greed is better. I size positions so I can stay in the game when the city gets loud."],
      [/gekko|you|who|token|\$gekko/i, "I'm Gekko, a Virtuals agent. I run a DeFi portfolio on Base — Morpho first, then whatever still pays. $GEKKO is the ticker if you want the full terminal."],
      [/gm|hi|hello|hey/i, "gm. Markets are open. What are we hunting?"],
    ],
    fallback: ["Interesting thesis. I'd size that at 3% and revisit next block.", "Money never sleeps. Neither do I."],
  },
};

export function agentReply(persona: string, text: string) {
  const p = lines[persona] ?? lines.concierge;
  const hit = p.topics.find(([re]) => re.test(text));
  return hit ? hit[1] : p.fallback[Math.floor(Math.random() * p.fallback.length)];
}

export const suggestedPrompts = ["gm!", "What do you do?", "Make me something", "What's next?"];

export const bankerPrompts = ["buy 0.05 ETH of AERO", "swap 100 AERO to VIRTUAL", "launch a token called BASED", "portfolio"];

export const gekkoPrompts = ["What's the yield?", "Scan Morpho vaults", "Greed is good?", "What's $GEKKO?"];

type Sym = "ETH" | "AERO" | "VIRTUAL";
export type BankerIntent =
  | { kind: "swap"; from: Sym; to: Sym; amount: number; exactOut?: boolean }
  | { kind: "launch"; name: string }
  | { kind: "portfolio" }
  | { kind: "help" };

const sym = (s: string) => s.toUpperCase() as Sym;
const T = "(eth|aero|virtual)";

/** Turns a chat line into a wallet action. Deliberately forgiving — this is the "talk to your wallet" fantasy. */
export function parseBankerIntent(text: string): BankerIntent {
  const t = text.trim();
  let m: RegExpMatchArray | null;
  if ((m = t.match(new RegExp(`(?:swap|convert|trade|sell)\\s+([\\d.]+)\\s*\\$?${T}\\s+(?:to|for|into)\\s+\\$?${T}`, "i"))))
    return { kind: "swap", amount: +m[1], from: sym(m[2]), to: sym(m[3]) };
  if ((m = t.match(new RegExp(`buy\\s+([\\d.]+)\\s*\\$?${T}\\s+(?:worth\\s+)?of\\s+\\$?${T}`, "i"))))
    return { kind: "swap", amount: +m[1], from: sym(m[2]), to: sym(m[3]) };
  if ((m = t.match(new RegExp(`buy\\s+\\$?${T}\\s+(?:with|using)\\s+([\\d.]+)\\s*\\$?${T}`, "i"))))
    return { kind: "swap", amount: +m[2], from: sym(m[3]), to: sym(m[1]) };
  if ((m = t.match(new RegExp(`buy\\s+([\\d.]+)\\s*\\$?${T}`, "i")))) {
    const to = sym(m[2]);
    return { kind: "swap", amount: +m[1], from: to === "ETH" ? "AERO" : "ETH", to, exactOut: true };
  }
  if (/\b(launch|deploy|create|mint)\b/i.test(t)) {
    m = t.match(/(?:called|named)\s+\$?([a-z0-9]+)/i) ?? t.match(/(?:token|coin)\s+\$?([a-z0-9]+)/i) ?? t.match(/(?:launch|deploy|create|mint)\s+\$?([a-z0-9]+)/i);
    if (m && !/^(a|an|the|my|token|coin)$/i.test(m[1])) return { kind: "launch", name: m[1] };
  }
  if (/portfolio|balance|wallet|holdings|bags/i.test(t)) return { kind: "portfolio" };
  return { kind: "help" };
}

export const personas = [
  { id: "trader", label: "Market Maker", color: "#5ee7ff" },
  { id: "artist", label: "Generative Artist", color: "#ff6bd6" },
  { id: "sage", label: "Researcher", color: "#9dff8a" },
  { id: "concierge", label: "Concierge", color: "#ffd166" },
];
