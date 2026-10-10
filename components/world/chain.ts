export type Token = "ETH" | "AERO" | "VIRTUAL" | "USDC";

export const tokens: Record<Token, { label: string; usd: number; color: string }> = {
  ETH: { label: "Ether", usd: 3200, color: "#9fb8ff" },
  AERO: { label: "AERO (Aerodrome)", usd: 0.8, color: "#ff6a2a" },
  VIRTUAL: { label: "VIRTUAL (Virtuals)", usd: 1.6, color: "#8b5cf6" },
  USDC: { label: "USDC", usd: 1, color: "#2775ca" },
};

export const hooks = [
  { id: "dynamic", label: "Dynamic Fee", blurb: "Fee drops to 0.05% when the market is calm.", fee: 0.0005 },
  { id: "limit", label: "Limit Order", blurb: "Waits for a 0.5% better price, then fills.", fee: -0.005 },
  { id: "rebate", label: "LP Rebate", blurb: "Half the fee is rebated to you as AERO.", fee: 0.0015 },
] as const;

export const LIQUIDATION_LTV = 0.86;

/** ETH-collateral, USDC-debt lending markets. Thresholds match the live Base markets. */
export type Venue = "morpho" | "aave";
export const venues: Record<Venue, { name: string; lt: number }> = {
  morpho: { name: "Morpho ETH Vault", lt: LIQUIDATION_LTV },
  aave: { name: "Aave V3 ETH Market", lt: 0.83 },
};

export interface Position {
  collateral: number;
  debt: number;
}

/** What a real wallet holds: spendable tokens plus open positions. */
export interface Holdings {
  wallet: Record<Token, number>;
  lp: number;
  vaults: Record<Venue, Position>;
}

export interface TxReceipt {
  hash: string;
  summary: string;
  at: number;
  /** Set when the transaction settled on a real network. */
  explorer?: string;
}

export interface SwapQuote {
  amountOut: number;
  priceImpact: number;
}

/** A Kickoff token the player launched; `raised` is ETH in its bonding curve. */
export interface Spark {
  name: string;
  ticker: string;
  token: string;
  curve: string;
  held: number;
  raised: number;
}

export type Side = "buy" | "sell";

/** Kickoff's live curve: 1T supply, priced from a 0.5 ETH virtual reserve, ~4% kept by fees on each trade. */
const SPARK_SUPPLY = 1e12;
const SPARK_SEED_ETH = 0.5;
const SPARK_FEE = 0.04;

function sparkOut(raised: number, side: Side, amount: number) {
  const eth = SPARK_SEED_ETH + raised;
  const k = SPARK_SEED_ETH * SPARK_SUPPLY;
  return side === "buy" ? (k / eth - k / (eth + amount)) * (1 - SPARK_FEE) : Math.min(raised, eth - k / (k / eth + amount * (1 - SPARK_FEE)));
}

/**
 * Everything the game asks of "the chain". The mock below settles instantly-ish
 * against local state; a real adapter (wagmi/viem on Base) can implement the
 * same surface and the rest of the game will not notice.
 */
export interface ChainAdapter {
  readonly network: string;
  quote(from: Token, to: Token, amountIn: number): SwapQuote;
  swap(from: Token, to: Token, amountIn: number): Promise<TxReceipt & { amountOut: number }>;
  addLiquidity(eth: number, sky: number): Promise<TxReceipt & { lp: number }>;
  vote(gauge: string, veAmount: number): Promise<TxReceipt>;
  launchAgent(name: string, persona: string): Promise<TxReceipt & { ticker: string }>;
  launchToken(name: string): Promise<TxReceipt & { ticker: string; supply: number }>;
  /** Kickoff: deploy a Spark token, optionally buying `devBuy` ETH of it in the same transaction. */
  launchSpark(name: string, ticker: string, devBuy: number): Promise<TxReceipt & { spark: Spark }>;
  quoteSpark(spark: Spark, side: Side, amount: number): Promise<number>;
  tradeSpark(spark: Spark, side: Side, amount: number): Promise<TxReceipt & { spark: Spark; amountOut: number }>;
  swapWithHook(hook: string, from: Token, to: Token, amountIn: number): Promise<TxReceipt & { amountOut: number }>;
  supply(venue: Venue, eth: number): Promise<TxReceipt>;
  borrow(venue: Venue, cash: number): Promise<TxReceipt>;
  repay(venue: Venue, cash: number): Promise<TxReceipt>;
  flashLoan(amountEth: number, route: string[]): Promise<TxReceipt & { profit: number }>;
  /** Real adapters only: the connected wallet's balances and positions, which replace simulated ones. */
  holdings?(): Promise<Holdings>;
  /** Real adapters only. */
  send?(to: string, token: Token, amount: number): Promise<TxReceipt>;
}

const FEE = 0.003;

function fakeHash() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function settle<T>(value: T, ms = 650): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export const mockChain: ChainAdapter = {
  network: "Base World Simnet",
  quote(from, to, amountIn) {
    const amountOut = (amountIn * tokens[from].usd * (1 - FEE)) / tokens[to].usd;
    return { amountOut, priceImpact: Math.min(0.05, (amountIn * tokens[from].usd) / 2_000_000) };
  },
  swap(from, to, amountIn) {
    const { amountOut } = this.quote(from, to, amountIn);
    return settle({ hash: fakeHash(), at: Date.now(), amountOut, summary: `Swapped ${fmt(amountIn)} ${from} → ${fmt(amountOut)} ${to}` });
  },
  addLiquidity(eth, sky) {
    const lp = Math.sqrt(eth * sky);
    return settle({ hash: fakeHash(), at: Date.now(), lp, summary: `Added ${fmt(eth)} ETH + ${fmt(sky)} AERO → ${fmt(lp)} LP` });
  },
  vote(gauge, veAmount) {
    return settle({ hash: fakeHash(), at: Date.now(), summary: `Voted ${fmt(veAmount)} veAERO for ${gauge}` });
  },
  launchAgent(name, persona) {
    const ticker = name.replace(/[^a-z]/gi, "").slice(0, 5).toUpperCase() || "AGENT";
    return settle({ hash: fakeHash(), at: Date.now(), ticker, summary: `Launched agent ${name} ($${ticker}, ${persona})` }, 900);
  },
  launchToken(name) {
    const ticker = name.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase() || "TOKEN";
    const supply = 1_000_000_000;
    return settle({ hash: fakeHash(), at: Date.now(), ticker, supply, summary: `Deployed $${ticker} (${fmt(supply)} supply)` }, 900);
  },
  launchSpark(name, ticker, devBuy) {
    const held = devBuy > 0 ? sparkOut(0, "buy", devBuy) : 0;
    const spark = { name, ticker, token: fakeHash().slice(0, 42), curve: fakeHash().slice(0, 42), held, raised: devBuy };
    return settle({ hash: fakeHash(), at: Date.now(), spark, summary: `Kicked off $${ticker}${devBuy > 0 ? ` with a ${fmt(devBuy)} ETH dev buy` : ""}` }, 900);
  },
  async quoteSpark(spark, side, amount) {
    return sparkOut(spark.raised, side, amount);
  },
  tradeSpark(spark, side, amount) {
    const amountOut = sparkOut(spark.raised, side, amount);
    const next =
      side === "buy"
        ? { ...spark, held: spark.held + amountOut, raised: spark.raised + amount }
        : { ...spark, held: Math.max(0, spark.held - amount), raised: Math.max(0, spark.raised - amountOut) };
    const summary = side === "buy" ? `Bought ${fmt(amountOut)} $${spark.ticker} for ${fmt(amount)} ETH` : `Sold ${fmt(amount)} $${spark.ticker} for ${fmt(amountOut)} ETH`;
    return settle({ hash: fakeHash(), at: Date.now(), spark: next, amountOut, summary: `${summary} on the Kickoff curve` });
  },
  swapWithHook(hook, from, to, amountIn) {
    const fee = hooks.find((h) => h.id === hook)?.fee ?? FEE;
    const amountOut = (amountIn * tokens[from].usd * (1 - fee)) / tokens[to].usd;
    return settle({ hash: fakeHash(), at: Date.now(), amountOut, summary: `${hook} hook: ${fmt(amountIn)} ${from} → ${fmt(amountOut)} ${to}` });
  },
  supply(venue, eth) {
    return settle({ hash: fakeHash(), at: Date.now(), summary: `Supplied ${fmt(eth)} ETH to ${venues[venue].name}` });
  },
  borrow(venue, cash) {
    return settle({ hash: fakeHash(), at: Date.now(), summary: `Borrowed ${fmt(cash)} USDC from ${venues[venue].name}` });
  },
  repay(venue, cash) {
    return settle({ hash: fakeHash(), at: Date.now(), summary: `Repaid ${fmt(cash)} USDC to ${venues[venue].name}` });
  },
  flashLoan(amountEth, route) {
    const profit = amountEth * 0.0009;
    return settle({ hash: fakeHash(), at: Date.now(), profit, summary: `Flash loan ${fmt(amountEth)} ETH via ${route.join(" → ")} · profit ${fmt(profit)} ETH` }, 300);
  },
};

export function fmt(n: number) {
  if (n === 0) return "0";
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (Math.abs(n) >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return n.toLocaleString("en-US", { maximumSignificantDigits: 3 });
}
