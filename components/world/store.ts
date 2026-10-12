import { Vector3 } from "three";
import { create } from "zustand";
import { persist, type PersistStorage } from "zustand/middleware";
import { agentReply, parseBankerIntent, personas } from "./agents";
import { type ChainAdapter, fmt, type Holdings, LIQUIDATION_LTV, mockChain, type Position, type Side, type Spark, type Token, tokens, type TxReceipt, type Venue, venues } from "./chain";
import { type DistrictId, districtById, npcs, orbs, type PanelId, RACE, SPAWN, stations, type Vec3 } from "./config";
import { docById } from "./docs";
import { levelFor, matches, MAX_LEVEL, objectivesMet, type QuestEvent, questById, quests, xpCap } from "./quests";

/** Per-frame values written by the scene and read by the HUD without re-rendering. */
export const live = {
  pos: new Vector3(...SPAWN),
  speed: 0,
  heading: 0,
  camYaw: 0,
  boosting: false,
  dashCharge: 1,
};

/** Swapped for a real adapter by `boot` in online mode; ES live binding keeps every importer in sync. */
export let chain: ChainAdapter = mockChain;

/** Where online saves live. Offline mode keeps using localStorage. */
export interface Cloud {
  load(): Promise<string | null>;
  save(raw: string): void;
  logTx(tx: TxReceipt, kind: string): void;
}
let cloud: Cloud | null = null;

/** Picks the save backend and chain, then loads the save. Nothing is written until this resolves. */
export async function boot(options: { chain?: ChainAdapter; cloud?: Cloud } = {}) {
  chain = options.chain ?? mockChain;
  cloud = options.cloud ?? null;
  await useGame.persist.rehydrate();
  await useGame.getState().sync();
}

const saves: PersistStorage<Persisted> = {
  getItem: async (name) => {
    const raw = cloud ? await cloud.load() : localStorage.getItem(name);
    return raw ? JSON.parse(raw) : null;
  },
  setItem: (name, value) => {
    if (!useGame.persist.hasHydrated()) return;
    const raw = JSON.stringify(value);
    if (cloud) cloud.save(raw);
    else localStorage.setItem(name, raw);
  },
  removeItem: (name) => {
    if (!cloud) localStorage.removeItem(name);
  },
};

type QuestStatus = "locked" | "available" | "active" | "done";
interface QuestState {
  status: QuestStatus;
  progress: Record<string, string[]>;
}

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: "quest" | "reward" | "info" | "level" | "fail";
}

export interface LaunchedAgent {
  name: string;
  ticker: string;
  persona: string;
  color: string;
}

export interface ChatMessage {
  from: "me" | "agent";
  text: string;
}

interface Persisted {
  xp: number;
  wallet: Record<Token, number>;
  lp: number;
  veAero: number;
  votes: Record<string, number>;
  quests: Record<string, QuestState>;
  tracked: string | null;
  badges: string[];
  agents: LaunchedAgent[];
  deployed: { name: string; ticker: string }[];
  sparks: Spark[];
  vaults: Record<Venue, Position>;
  txs: TxReceipt[];
  bestRace: number | null;
  docs: string[];
}

interface GameState extends Persisted {
  started: boolean;
  nearby: string | null;
  dialog: string | null;
  panel: PanelId | null;
  logOpen: boolean;
  mapOpen: boolean;
  district: DistrictId | null;
  toasts: Toast[];
  race: { running: boolean; next: number; start: number };
  pending: boolean;
  chats: Record<string, ChatMessage[]>;
  /** The connected wallet's real holdings (online mode); when set, DeFi panels act on these instead of game balances. */
  real: Holdings | null;

  start(): void;
  sync(): Promise<void>;
  emit(e: QuestEvent): void;
  accept(id: string): void;
  track(id: string): void;
  toast(t: Omit<Toast, "id">): void;
  dismiss(id: number): void;
  interact(): void;
  close(): void;
  toggleLog(): void;
  toggleMap(): void;
  toggleDocs(): void;
  readDoc(id: string): void;
  setNearby(id: string | null): void;
  setDistrict(id: DistrictId | null): void;
  passRing(index: number): void;
  failRace(reason: string): void;
  swap(from: Token, to: Token, amount: number): Promise<void>;
  addLiquidity(eth: number): Promise<void>;
  vote(gauge: string, amount: number): Promise<void>;
  launchAgent(name: string, persona: string): Promise<void>;
  launchSpark(name: string, ticker: string, devBuy: number): Promise<void>;
  tradeSpark(token: string, side: Side, amount: number): Promise<void>;
  hookSwap(hook: string, from: Token, to: Token, amount: number): Promise<void>;
  supply(venue: Venue, eth: number): Promise<void>;
  borrow(venue: Venue, cash: number): Promise<void>;
  repay(venue: Venue, cash: number): Promise<void>;
  send(to: string, token: Token, amount: number): Promise<boolean>;
  flashLoan(route: string[]): Promise<void>;
  /** Battleground win: XP only; staked winnings are paid by the escrow contract. */
  winDuel(xp: number, body: string): void;
  chat(agentId: string, text: string): void;
  reset(): void;
}

export const LAUNCH_COST = 100;

function initialQuests(): Record<string, QuestState> {
  return Object.fromEntries(
    quests.map((q) => [q.id, { status: q.requires.length ? "locked" : "available", progress: {} } as QuestState]),
  );
}

/** Fills in quests added after a save was written, unlocking any whose requirements are already done. */
function hydrateQuests(saved?: Record<string, QuestState>): Record<string, QuestState> {
  const next = { ...initialQuests(), ...saved };
  for (const q of quests) {
    if (saved?.[q.id]) continue;
    const ready = q.requires.every((r) => next[r]?.status === "done");
    next[q.id] = { status: !q.requires.length || ready ? (q.auto ? "active" : "available") : "locked", progress: {} };
  }
  return next;
}

const initial: Persisted = {
  xp: 0,
  wallet: { ETH: 0.5, AERO: 0, VIRTUAL: 0, USDC: 0 },
  lp: 0,
  veAero: 0,
  votes: {},
  quests: initialQuests(),
  tracked: null,
  badges: [],
  agents: [],
  deployed: [],
  sparks: [],
  vaults: { morpho: { collateral: 0, debt: 0 }, aave: { collateral: 0, debt: 0 } },
  txs: [],
  bestRace: null,
  docs: [],
};

export function healthFactor(v: Position, extraDebt = 0, lt = LIQUIDATION_LTV) {
  const debt = v.debt + extraDebt;
  return debt <= 0 ? Infinity : (v.collateral * tokens.ETH.usd * lt) / debt;
}

/** Balances the DeFi panels spend: the real wallet online, game balances offline. */
export const holdings = (s: GameState): Holdings => s.real ?? s;

function errorText(e: unknown) {
  const err = e as { shortMessage?: string; message?: string };
  const text = err?.shortMessage ?? err?.message ?? "Something went wrong";
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

let toastId = 0;

export const useGame = create<GameState>()(
  persist(
    (set, get) => {
      const award = (xp: number, tokens: Partial<Record<Token, number>> = {}) => {
        const before = levelFor(get().xp).level;
        const wallet = { ...get().wallet };
        for (const [k, v] of Object.entries(tokens)) wallet[k as Token] += v ?? 0;
        set({ xp: Math.min(xpCap, get().xp + xp), wallet });
        const after = levelFor(get().xp).level;
        if (after > before)
          get().toast({
            tone: "level",
            title: after === MAX_LEVEL ? `Level ${MAX_LEVEL} · MAX` : `Level ${after}`,
            body: after === MAX_LEVEL ? "You've hit the cap. Stay based." : "You're getting more based by the minute.",
          });
      };

      const unlock = () => {
        const qs = { ...get().quests };
        for (const q of quests) {
          if (!qs[q.id] || qs[q.id].status !== "locked" || !q.requires.every((r) => qs[r]?.status === "done")) continue;
          qs[q.id] = { ...qs[q.id], status: q.auto ? "active" : "available" };
          const giver = npcs.find((n) => n.id === q.giver)?.name;
          get().toast(
            q.auto
              ? { tone: "quest", title: `New quest: ${q.title}`, body: q.summary }
              : { tone: "info", title: `${giver} has a quest`, body: q.title },
          );
          if (q.auto && !get().tracked) set({ tracked: q.id });
        }
        set({ quests: qs });
      };

      const complete = (id: string) => {
        const q = questById[id];
        set({ quests: { ...get().quests, [id]: { ...get().quests[id], status: "done" } } });
        get().toast({ tone: "reward", title: `Quest complete: ${q.title}`, body: rewardText(q.reward) });
        award(q.reward.xp);
        if (q.reward.badge) set({ badges: [...get().badges, q.reward.badge] });
        if (get().tracked === id) {
          const next = quests.find((x) => get().quests[x.id]?.status === "active");
          set({ tracked: next?.id ?? null });
        }
        unlock();
      };

      const funds = () => holdings(get()).wallet;

      /** Simulated settlement for a lending action: wallet deltas plus position deltas. */
      const move = (venue: Venue, delta: Partial<Record<Token, number>>, pos: Partial<Position>) => {
        const wallet = { ...get().wallet };
        for (const [k, v] of Object.entries(delta)) wallet[k as Token] += v ?? 0;
        const p = get().vaults[venue];
        const next = { collateral: p.collateral + (pos.collateral ?? 0), debt: Math.max(0, p.debt + (pos.debt ?? 0)) };
        set({ wallet, vaults: { ...get().vaults, [venue]: next } });
      };

      /** Runs one transaction. Real ones are logged to the cloud and refresh holdings; failures toast instead of throwing. */
      const transact = async <T extends TxReceipt>(kind: string, send: () => Promise<T>, title: string): Promise<T | null> => {
        set({ pending: true });
        try {
          const r = await send();
          set({ txs: [r, ...get().txs].slice(0, 20) });
          get().toast({ tone: "info", title, body: r.summary });
          if (r.explorer) {
            cloud?.logTx(r, kind);
            await get().sync();
          }
          return r;
        } catch (e) {
          get().toast({ tone: "fail", title: "Transaction not sent", body: errorText(e) });
          return null;
        } finally {
          set({ pending: false });
        }
      };

      const bankerTurn = async (text: string): Promise<string> => {
        const intent = parseBankerIntent(text);
        const wallet = funds();
        if (intent.kind === "portfolio") {
          get().emit({ type: "action", action: "chat-portfolio" });
          const usd = (Object.keys(wallet) as Token[]).reduce((sum, k) => sum + wallet[k] * tokens[k].usd, 0);
          const deployed = get().deployed.map((d) => `$${d.ticker}`).join(", ");
          const lp = holdings(get()).lp;
          return `You hold ${fmt(wallet.ETH)} ETH, ${fmt(wallet.AERO)} AERO, ${fmt(wallet.VIRTUAL)} VIRTUAL and ${fmt(wallet.USDC)} USDC — about $${fmt(usd)}.${lp ? ` Plus ${fmt(lp)} LP.` : ""}${deployed ? ` Tokens you deployed: ${deployed}.` : ""}`;
        }
        if (intent.kind === "launch") {
          if (get().pending) return "One sec, still settling your last transaction.";
          set({ pending: true });
          const r = await chain.launchToken(intent.name);
          set({ pending: false, deployed: [...get().deployed, { name: intent.name, ticker: r.ticker }], txs: [r, ...get().txs].slice(0, 20) });
          get().toast({ tone: "reward", title: `$${r.ticker} deployed`, body: "Fair launch, simulated liquidity, zero gas." });
          get().emit({ type: "action", action: "chat-launch" });
          return `Done! $${r.ticker} is live with ${fmt(r.supply)} supply and you hold the creator allocation. tx ${short(r.hash)}`;
        }
        if (intent.kind === "swap") {
          if (intent.from === intent.to) return "That's the same token twice — I'll call that a very efficient no-op.";
          const amountIn = intent.exactOut
            ? (intent.amount * tokens[intent.to].usd) / tokens[intent.from].usd / 0.997
            : intent.amount;
          if (!(amountIn > 0)) return "I need an amount bigger than zero for that.";
          if (amountIn > wallet[intent.from])
            return `Not enough ${intent.from}: that needs ${fmt(amountIn)} and you have ${fmt(wallet[intent.from])}. Try a smaller size?`;
          const before = get().txs[0];
          await get().swap(intent.from, intent.to, amountIn);
          const tx = get().txs[0];
          if (tx === before) return "That one didn't go through — check the notification and try again.";
          get().emit({ type: "action", action: "chat-trade" });
          return `Filled. ${tx.summary}. tx ${short(tx.hash)}`;
        }
        return "I can buy, swap, launch tokens and check your portfolio. Try: \"buy 0.05 ETH of AERO\" or \"launch a token called BASED\".";
      };

      return {
        ...initial,
        started: false,
        nearby: null,
        dialog: null,
        panel: null,
        logOpen: false,
        mapOpen: false,
        district: null,
        toasts: [],
        race: { running: false, next: 0, start: 0 },
        pending: false,
        chats: {},
        real: null,

        start: () => {
          set({ started: true, quests: hydrateQuests(get().quests) });
          unlock();
        },
        sync: async () => {
          if (!chain.holdings) return void set({ real: null });
          try {
            set({ real: await chain.holdings() });
          } catch (e) {
            console.warn("Could not read wallet holdings", e);
            get().toast({ tone: "fail", title: "Couldn't read your wallet", body: "Base RPC didn't answer. Balances will refresh after your next action." });
            if (!get().real) set({ real: { wallet: { ETH: 0, AERO: 0, VIRTUAL: 0, USDC: 0 }, lp: 0, vaults: structuredClone(initial.vaults) } });
          }
        },

        emit: (e) => {
          for (const q of quests) {
            const qs = get().quests[q.id];
            if (!qs || qs.status !== "active") continue;
            let changed = false;
            const progress = { ...qs.progress };
            for (const o of q.objectives) {
              const key = matches(o, e);
              const got = progress[o.id] ?? [];
              if (!key || got.includes(key) || got.length >= (o.count ?? 1)) continue;
              progress[o.id] = [...got, key];
              changed = true;
            }
            if (changed) set({ quests: { ...get().quests, [q.id]: { ...qs, progress } } });
            const next = changed ? progress : qs.progress;
            if (objectivesMet(q, next) && e.type === "talk" && e.npc === q.giver) complete(q.id);
          }
        },

        accept: (id) => {
          const q = questById[id];
          set({ quests: { ...get().quests, [id]: { ...get().quests[id], status: "active" } }, tracked: id });
          get().toast({ tone: "quest", title: `Quest accepted: ${q.title}`, body: q.summary });
          if (q.grant) {
            award(0, q.grant);
            get().toast({ tone: "reward", title: "Airdrop received", body: rewardText({ xp: 0, tokens: q.grant }) });
          }
          if (id === "summit" && get().district === "summit") get().emit({ type: "reach", zone: "summit" });
          for (const doc of get().docs) get().emit({ type: "action", action: `doc:${doc}` });
        },

        track: (id) => set({ tracked: id }),

        toast: (t) => {
          const id = ++toastId;
          set({ toasts: [...get().toasts.slice(-3), { ...t, id }] });
          setTimeout(() => get().dismiss(id), 4800);
        },
        dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

        interact: () => {
          const id = get().nearby;
          if (!id || get().dialog || get().panel) return;
          const station = stations.find((s) => s.id === id);
          if (station) return set({ panel: station.panel });
          const npc = npcs.find((n) => n.id === id);
          if (!npc) return;
          set({ dialog: id });
          get().emit({ type: "talk", npc: id, tags: npc.tags });
        },
        close: () => set({ dialog: null, panel: null, logOpen: false, mapOpen: false }),
        toggleLog: () => set({ logOpen: !get().logOpen, dialog: null, panel: null, mapOpen: false }),
        toggleMap: () => set({ mapOpen: !get().mapOpen, dialog: null, panel: null, logOpen: false }),
        toggleDocs: () => set({ panel: get().panel === "docs" ? null : "docs", dialog: null, logOpen: false, mapOpen: false }),
        readDoc: (id) => {
          if (!get().docs.includes(id)) {
            set({ docs: [...get().docs, id] });
            get().toast({ tone: "reward", title: "Doc mastered", body: `${docById[id]?.title ?? id} · +25 XP` });
            award(25);
          }
          get().emit({ type: "action", action: `doc:${id}` });
        },
        winDuel: (xp, body) => {
          get().toast({ tone: "reward", title: "Duel won", body: `${body} · +${xp} XP` });
          award(xp);
        },
        setNearby: (id) => get().nearby !== id && set({ nearby: id }),
        setDistrict: (id) => {
          if (get().district === id) return;
          set({ district: id });
          if (id) {
            get().toast({ tone: "info", title: `Entering ${districtName(id)}` });
            get().emit({ type: "reach", zone: id });
          }
        },

        passRing: (index) => {
          const { race, quests: qs } = get();
          if (qs.race.status === "locked" || qs.race.status === "available" || index !== race.next) return;
          const now = performance.now();
          if (index === 0) {
            set({ race: { running: true, next: 1, start: now } });
            return get().toast({ tone: "info", title: "GO!", body: `${RACE.rings.length} rings · ${RACE.limit}s` });
          }
          if (index < RACE.rings.length - 1) return set({ race: { ...race, next: index + 1 } });
          const time = (now - race.start) / 1000;
          set({ race: { running: false, next: 0, start: 0 } });
          if (time > RACE.limit) return get().failRace(`${time.toFixed(2)}s — limit is ${RACE.limit}s`);
          const best = get().bestRace;
          set({ bestRace: best === null ? time : Math.min(best, time) });
          get().toast({ tone: "reward", title: `Course cleared: ${time.toFixed(2)}s`, body: best !== null && time < best ? "New personal best!" : undefined });
          get().emit({ type: "race" });
        },
        failRace: (reason) => {
          set({ race: { running: false, next: 0, start: 0 } });
          get().toast({ tone: "fail", title: "Too slow!", body: `${reason}. Fly back through ring 1 to retry.` });
        },

        swap: async (from, to, amount) => {
          if (get().pending || amount <= 0 || amount > funds()[from]) return;
          const r = await transact("swap", () => chain.swap(from, to, amount), "Swap confirmed");
          if (!r) return;
          if (!get().real) {
            const wallet = { ...get().wallet, [from]: get().wallet[from] - amount };
            wallet[to] += r.amountOut;
            set({ wallet });
          }
          get().emit({ type: "action", action: "swap" });
        },
        addLiquidity: async (eth) => {
          const aero = chain.quote("ETH", "AERO", eth).amountOut / 0.997;
          if (get().pending || eth <= 0 || eth > funds().ETH || aero > funds().AERO) return;
          const r = await transact("liquidity", () => chain.addLiquidity(eth, aero), "Liquidity added");
          if (!r) return;
          if (!get().real) set({ wallet: { ...get().wallet, ETH: get().wallet.ETH - eth, AERO: get().wallet.AERO - aero }, lp: get().lp + r.lp });
          get().emit({ type: "action", action: "liquidity" });
        },
        vote: async (gauge, amount) => {
          if (get().pending || amount <= 0 || amount > get().wallet.AERO) return;
          set({ pending: true });
          const r = await chain.vote(gauge, amount);
          set({
            wallet: { ...get().wallet, AERO: get().wallet.AERO - amount },
            veAero: get().veAero + amount,
            votes: { ...get().votes, [gauge]: (get().votes[gauge] ?? 0) + amount },
            pending: false,
            txs: [r, ...get().txs].slice(0, 20),
          });
          get().toast({ tone: "info", title: "Vote cast", body: r.summary });
          get().emit({ type: "action", action: "vote" });
        },
        launchAgent: async (name, persona) => {
          if (get().pending || get().wallet.VIRTUAL < LAUNCH_COST || !name.trim()) return;
          set({ pending: true });
          const r = await chain.launchAgent(name.trim(), persona);
          const color = personas.find((p) => p.id === persona)?.color ?? "#ffffff";
          set({
            wallet: { ...get().wallet, VIRTUAL: get().wallet.VIRTUAL - LAUNCH_COST },
            agents: [...get().agents, { name: name.trim(), ticker: r.ticker, persona, color }],
            pending: false,
            txs: [r, ...get().txs].slice(0, 20),
          });
          get().toast({ tone: "reward", title: `${name.trim()} is alive!`, body: `$${r.ticker} is live on the launchpad.` });
          award(60);
          get().emit({ type: "action", action: "launch" });
        },
        launchSpark: async (name, ticker, devBuy) => {
          if (get().pending || !name.trim() || !ticker.trim() || devBuy < 0 || devBuy > funds().ETH) return;
          const r = await transact("spark-launch", () => chain.launchSpark(name.trim(), ticker.trim().toUpperCase(), devBuy), `$${ticker.trim().toUpperCase()} kicked off`);
          if (!r) return;
          set({ sparks: [r.spark, ...get().sparks] });
          if (!get().real) set({ wallet: { ...get().wallet, ETH: get().wallet.ETH - devBuy } });
          award(60);
          get().emit({ type: "action", action: "spark-launch" });
        },
        tradeSpark: async (token, side, amount) => {
          const spark = get().sparks.find((s) => s.token === token);
          if (!spark || get().pending || amount <= 0 || amount > (side === "buy" ? funds().ETH : spark.held)) return;
          const r = await transact(`spark-${side}`, () => chain.tradeSpark(spark, side, amount), side === "buy" ? "Bought on the curve" : "Sold on the curve");
          if (!r) return;
          set({ sparks: get().sparks.map((s) => (s.token === token ? r.spark : s)) });
          if (!get().real) set({ wallet: { ...get().wallet, ETH: get().wallet.ETH + (side === "buy" ? -amount : r.amountOut) } });
          get().emit({ type: "action", action: `spark-${side}` });
        },

        hookSwap: async (hook, from, to, amount) => {
          if (get().pending || amount <= 0 || amount > get().wallet[from] || from === to) return;
          const r = await transact("hook", () => chain.swapWithHook(hook, from, to, amount), "Hooked swap filled");
          if (!r) return;
          const wallet = { ...get().wallet, [from]: get().wallet[from] - amount };
          wallet[to] += r.amountOut;
          if (hook === "rebate") wallet.AERO += (amount * tokens[from].usd * 0.0015) / 2 / tokens.AERO.usd;
          set({ wallet });
          get().emit({ type: "action", action: `hook:${hook}` });
        },
        supply: async (venue, eth) => {
          if (get().pending || eth <= 0 || eth > funds().ETH) return;
          const r = await transact("supply", () => chain.supply(venue, eth), "Collateral supplied");
          if (!r) return;
          if (!get().real) move(venue, { ETH: -eth }, { collateral: eth });
          get().emit({ type: "action", action: venueAction(venue, "supply") });
        },
        borrow: async (venue, cash) => {
          if (get().pending || cash <= 0 || healthFactor(holdings(get()).vaults[venue], cash, venues[venue].lt) < 1.05) return;
          const r = await transact("borrow", () => chain.borrow(venue, cash), "Loan opened");
          if (!r) return;
          if (!get().real) move(venue, { USDC: cash }, { debt: cash });
          get().emit({ type: "action", action: venueAction(venue, "borrow") });
        },
        repay: async (venue, cash) => {
          const amount = Math.min(cash, holdings(get()).vaults[venue].debt, funds().USDC);
          if (get().pending || amount <= 0) return;
          const r = await transact("repay", () => chain.repay(venue, amount), "Loan repaid");
          if (!r) return;
          if (!get().real) move(venue, { USDC: -amount }, { debt: -amount });
          get().emit({ type: "action", action: venueAction(venue, "repay") });
        },
        send: async (to, token, amount) => {
          const send = chain.send;
          if (!send || get().pending || amount <= 0 || amount > funds()[token]) return false;
          const r = await transact("send", () => send(to, token, amount), "Transfer sent");
          if (r) get().emit({ type: "action", action: "send" });
          return !!r;
        },
        flashLoan: async (route) => {
          if (get().pending) return;
          const r = await transact("flash", () => chain.flashLoan(1000, route), "Flash loan settled");
          if (!r) return;
          set({ wallet: { ...get().wallet, ETH: get().wallet.ETH + r.profit } });
          get().emit({ type: "action", action: "flash" });
        },

        chat: (agentId, text) => {
          const npc = npcs.find((n) => n.id === agentId);
          const push = (m: ChatMessage) => set({ chats: { ...get().chats, [agentId]: [...(get().chats[agentId] ?? []), m] } });
          push({ from: "me", text });
          if (npc?.persona === "gekko" && /yield|apy|vault|morpho|strategy|scan|brief|greed|gekko|portfolio/i.test(text)) {
            get().emit({ type: "action", action: "chat-yield" });
          }
          if (npc?.persona === "banker") return void bankerTurn(text).then((reply) => push({ from: "agent", text: reply }));
          setTimeout(() => push({ from: "agent", text: agentReply(npc?.persona ?? "concierge", text) }), 550);
        },

        reset: () => {
          set({ ...initial, quests: initialQuests(), chats: {}, race: { running: false, next: 0, start: 0 }, logOpen: false, mapOpen: false });
          live.pos.set(...SPAWN);
        },
      };
    },
    {
      name: "base-world-save",
      version: 5,
      storage: saves,
      skipHydration: true,
      migrate: (state) => {
        if (!state || typeof state !== "object") return initial;
        const s = state as Persisted & { vault?: Position };
        return { ...initial, ...s, ...normalize(s) };
      },
      merge: (persisted, current) => {
        const s = (persisted && typeof persisted === "object" ? persisted : {}) as Partial<Persisted> & { vault?: Position };
        return { ...current, ...s, ...normalize(s) };
      },
      partialize: (s): Persisted => ({
        xp: s.xp,
        wallet: s.wallet,
        lp: s.lp,
        veAero: s.veAero,
        votes: s.votes,
        quests: s.quests,
        tracked: s.tracked,
        badges: s.badges,
        agents: s.agents,
        deployed: s.deployed,
        sparks: s.sparks,
        vaults: s.vaults,
        txs: s.txs,
        bestRace: s.bestRace,
        docs: s.docs,
      }),
    },
  ),
);

/** Fills fields added after a save was written; v4 saves kept a single Morpho `vault`. */
function normalize(s: Partial<Persisted> & { vault?: Position }) {
  return {
    wallet: { ...initial.wallet, ...s.wallet },
    vaults: { ...initial.vaults, ...(s.vault && { morpho: s.vault }), ...s.vaults },
    quests: hydrateQuests(s.quests),
    docs: s.docs ?? [],
  };
}

const venueAction = (venue: Venue, action: string) => (venue === "morpho" ? action : `${venue}-${action}`);

export const uiLocked = (s: GameState) => !s.started || !!s.dialog || !!s.panel || s.logOpen || s.mapOpen;

export function districtName(id: DistrictId) {
  return districtById[id]?.name ?? id;
}

const short = (hash: string) => `${hash.slice(0, 6)}…${hash.slice(-4)}`;

export function rewardText(r: { xp: number; tokens?: Partial<Record<Token, number>> }) {
  const parts = r.xp ? [`+${r.xp} XP`] : [];
  for (const [k, v] of Object.entries(r.tokens ?? {})) parts.push(`+${v} ${k}`);
  return parts.join(" · ");
}

/** Where the player should head next: tracked objective, else the closest quest giver with something to offer. */
export function waypoint(s: GameState, from: Vector3): { pos: Vec3; label: string } | null {
  const q = s.tracked ? questById[s.tracked] : null;
  if (q && s.quests[q.id]?.status === "active") {
    const o = q.objectives.find((x) => (s.quests[q.id].progress[x.id]?.length ?? 0) < (x.count ?? 1));
    if (o?.at === "orbs") {
      const got = s.quests[q.id].progress[o.id] ?? [];
      const left = orbs.map((p, i) => ({ p, id: `orb-${i}` })).filter((x) => !got.includes(x.id));
      left.sort((a, b) => dist2(a.p, from) - dist2(b.p, from));
      if (left[0]) return { pos: left[0].p, label: "Base orb" };
    } else if (o?.at === "race") {
      return { pos: RACE.rings[s.race.next], label: `Ring ${s.race.next + 1}` };
    } else if (o?.at) {
      return { pos: o.at, label: o.label };
    }
  }
  const givers = quests
    .filter((x) => s.quests[x.id]?.status === "available")
    .map((x) => npcs.find((n) => n.id === x.giver)!)
    .sort((a, b) => dist2(a.position, from) - dist2(b.position, from));
  return givers[0] ? { pos: givers[0].position, label: givers[0].name } : null;
}

function dist2(p: Vec3, v: Vector3) {
  return (p[0] - v.x) ** 2 + (p[2] - v.z) ** 2;
}
