import { base } from "viem/chains";
import { formatEther, type Hash, parseEther, zeroAddress } from "viem";
import { create } from "zustand";
import type { DuelView } from "@/lib/duel";
import { HUMAN, decide } from "./bot";
import { type Cast, type ClassId, CLASS_IDS, COUNTDOWN, classes, replay, type SideId } from "./engine";
import { DEFAULT_STAKE, duelKey, ESCROW, escrowAbi, SETTLE_WINDOW_S } from "./escrow";
import { pvp } from "./link";

export type Mode = "bot" | "pvp";

interface BattleState {
  cls: ClassId;
  stake: string;
  /** Null in the lobby. */
  mode: Mode | null;
  sides: [ClassId, ClassId];
  side: SideId;
  names: [string, string];
  log: Cast[];
  /** Local wall-clock ms at which the fight's t = 0. */
  startAt: number;
  duel: DuelView | null;
  /** Onchain state of the current staked duel, as last read. */
  chainDuel: { paidA: boolean; paidB: boolean; closed: boolean } | null;
  busy: string | null;
  error: string | null;
  note: string | null;

  pick(cls: ClassId): void;
  setStake(stake: string): void;
  fightBot(note?: string): void;
  findOpponent(): Promise<void>;
  leaveQueue(): Promise<void>;
  press(index: number): void;
  stakeIn(): Promise<void>;
  claim(): Promise<void>;
  refund(): Promise<void>;
  exit(): void;
  /** Resumes a duel the player left mid-way (reload, closed panel). */
  resume(): Promise<void>;
}

/** Fight time in ms: negative during the countdown. */
export const fightTime = (s: Pick<BattleState, "startAt">) => Date.now() - s.startAt;

let offset = 0;
let timers: ReturnType<typeof setInterval>[] = [];
let unlisten: (() => void) | null = null;

const stop = () => {
  timers.forEach(clearInterval);
  timers = [];
  unlisten?.();
  unlisten = null;
};

const say = (e: unknown) => {
  const err = e as { shortMessage?: string; message?: string };
  const text = err?.shortMessage ?? err?.message ?? "Something went wrong";
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
};

/** Merges server casts into the local log, keeping one copy of each. */
const merge = (log: Cast[], incoming: Cast[]) => {
  const seen = new Set(log.map((c) => `${c.t}:${c.by}:${c.skill}`));
  const fresh = incoming.filter((c) => !seen.has(`${c.t}:${c.by}:${c.skill}`));
  return fresh.length ? [...log, ...fresh] : log;
};

export const useBattle = create<BattleState>()((set, get) => {
  const link = () => {
    if (!pvp) throw new Error("Staked duels need online mode");
    return pvp;
  };

  const readChain = async (d: DuelView) => {
    if (!ESCROW || !pvp) return;
    const [, , , , paidA, paidB, closed] = await pvp.chain.readContract({ address: ESCROW, abi: escrowAbi, functionName: "duels", args: [duelKey(d.id)] });
    if (get().duel?.id === d.id) set({ chainDuel: { paidA, paidB, closed } });
  };

  /** Applies a fresh server view: clock, log and phase. */
  const apply = (d: DuelView | null, sentAt: number) => {
    if (!d) return set({ duel: null });
    const prev = get().duel;
    if (prev?.id === d.id && prev.status === "queued" && d.status === "cancelled") return get().fightBot("Nobody else is queued at that stake right now, so here's a sparring bot. No ETH on this one.");
    const rtt = Date.now() - sentAt;
    offset = d.now + rtt / 2 - Date.now();
    const names: [string, string] = [d.names[0] ?? "Player", d.names[1] ?? "Opponent"];
    set({
      duel: d,
      mode: "pvp",
      side: d.side,
      sides: [d.classes[0], d.classes[1] ?? d.classes[0]],
      names,
      startAt: d.startAt ? d.startAt - offset : get().startAt,
      log: prev?.id === d.id ? merge(get().log, d.log) : d.log,
    });
    if (prev?.id !== d.id || prev.status !== d.status) void readChain(d).catch(() => {});
    if (prev?.id !== d.id) watch(d);
  };

  const refresh = async () => {
    const d = get().duel;
    const sentAt = Date.now();
    const res = await link().api<{ duel: DuelView | null }>(d ? `/api/duel?id=${d.id}` : "/api/duel");
    apply(res.duel, sentAt);
    return res.duel;
  };

  /** Keeps a staked duel in sync: private realtime events for speed, polling as the source of truth. */
  const watch = (d: DuelView) => {
    stop();
    if (d.inbox)
      unlisten = link().listen(d.inbox, (event, payload) => {
        if (event === "cast") set({ log: merge(get().log, [payload as unknown as Cast]) });
        else void refresh().catch(() => {});
      });
    timers.push(
      setInterval(() => {
        const cur = get().duel;
        if (!cur || cur.status === "cancelled" || (cur.status === "done" && get().chainDuel?.closed)) return;
        void refresh().catch(() => {});
      }, 1500),
      setInterval(() => {
        const cur = get().duel;
        if (cur?.status !== "queued") return;
        void link()
          .api<{ duel: DuelView }>("/api/duel/queue", { method: "POST", body: { stake: cur.stake, cls: get().cls } })
          .then((r) => apply(r.duel, Date.now()))
          .catch(() => {});
      }, 5000),
    );
  };

  const tx = async (summary: string, send: () => Promise<Hash>) => {
    const l = link();
    if ((await l.wallet.getChainId()) !== base.id) await l.wallet.switchChain({ id: base.id });
    const hash = await send();
    set({ busy: "Confirming onchain…" });
    const r = await l.chain.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error("Transaction reverted onchain");
    l.logTx(hash, summary);
  };

  const guarded = async (busy: string, fn: () => Promise<void>) => {
    if (get().busy) return;
    set({ busy, error: null });
    try {
      await fn();
    } catch (e) {
      set({ error: say(e) });
    } finally {
      set({ busy: null });
    }
  };

  return {
    cls: "knight",
    stake: DEFAULT_STAKE,
    mode: null,
    sides: ["knight", "knight"],
    side: 0,
    names: ["You", "Bot"],
    log: [],
    startAt: 0,
    duel: null,
    chainDuel: null,
    busy: null,
    error: null,
    note: null,

    pick: (cls) => set({ cls }),
    setStake: (stake) => set({ stake: stake.replace(/[^\d.]/g, "") }),

    fightBot(note) {
      stop();
      const foe = CLASS_IDS[Math.floor(Math.random() * CLASS_IDS.length)];
      set({ mode: "bot", sides: [get().cls, foe], side: 0, names: ["You", `${classes[foe].name} bot`], log: [], startAt: Date.now() + COUNTDOWN, duel: null, chainDuel: null, error: null, note: note ?? null });
      let next = 0;
      timers.push(
        setInterval(() => {
          const s = get();
          const t = fightTime(s);
          if (t < next) return;
          const duel = replay(s.sides, s.log, t);
          if (duel.winner !== null) return stop();
          const skill = decide(duel, 1, t, { react: HUMAN.react + Math.random() * 250, defend: HUMAN.defend });
          if (skill && !duel.check(1, skill, t)) set({ log: [...s.log, { t, by: 1, skill }] });
          next = t + 80 + Math.random() * 160;
        }, 40),
      );
    },

    async findOpponent() {
      await guarded("Finding an opponent…", async () => {
        const wei = parseEther(get().stake || "0");
        const sentAt = Date.now();
        const { duel } = await link().api<{ duel: DuelView }>("/api/duel/queue", { method: "POST", body: { stake: wei.toString(), cls: get().cls } });
        set({ note: null, log: [] });
        apply(duel, sentAt);
      });
    },

    async leaveQueue() {
      stop();
      await link().api("/api/duel/queue", { method: "DELETE" }).catch(() => {});
      set({ mode: null, duel: null, chainDuel: null });
    },

    press(index) {
      const s = get();
      if (!s.mode) return;
      const skill = classes[s.sides[s.side]].skills[index];
      if (!skill) return;
      const t = fightTime(s);
      const duel = replay(s.sides, s.log, t);
      if (duel.check(s.side, skill.id, t)) return;
      if (s.mode === "bot") return set({ log: [...s.log, { t, by: 0, skill: skill.id }] });
      const d = s.duel;
      if (d?.status !== "live") return;
      link()
        .api<{ cast: Cast }>("/api/duel/cast", { method: "POST", body: { id: d.id, skill: skill.id } })
        .then(({ cast }) => set({ log: merge(get().log, [cast]) }))
        .catch(() => {});
    },

    async stakeIn() {
      const d = get().duel;
      const ticket = d?.ticket;
      if (!d || !ticket || !ESCROW) return;
      await guarded("Confirm the stake in your wallet…", async () => {
        const l = link();
        const value = BigInt(ticket.stake);
        await tx(`Staked ${formatEther(value)} ETH on a duel`, () =>
          l.wallet.writeContract({
            account: l.account,
            chain: base,
            address: ESCROW!,
            abi: escrowAbi,
            functionName: "deposit",
            args: [ticket.key, ticket.a, ticket.b, value, BigInt(ticket.deadline), ticket.sig],
            value,
          }),
        );
        await readChain(d);
        await refresh();
      });
    },

    async claim() {
      const d = get().duel;
      if (!d?.result || !ESCROW) return;
      const r = d.result;
      await guarded("Confirm the payout in your wallet…", async () => {
        const l = link();
        const pot = BigInt(d.stake) * 2n;
        const summary = r.winner === zeroAddress ? "Duel drawn: stakes refunded" : `Won ${formatEther(pot - pot / 100n)} ETH in a duel`;
        await tx(summary, () => l.wallet.writeContract({ account: l.account, chain: base, address: ESCROW!, abi: escrowAbi, functionName: "claim", args: [duelKey(d.id), r.winner, r.sig] }));
        await readChain(d);
      });
    },

    async refund() {
      const d = get().duel;
      if (!d || !ESCROW) return;
      await guarded("Confirm the refund in your wallet…", async () => {
        const l = link();
        await tx("Duel stake refunded", () => l.wallet.writeContract({ account: l.account, chain: base, address: ESCROW!, abi: escrowAbi, functionName: "refund", args: [duelKey(d.id)] }));
        await readChain(d);
      });
    },

    exit() {
      stop();
      set({ mode: null, duel: null, chainDuel: null, log: [], error: null, note: null });
    },

    async resume() {
      if (!pvp || get().mode) return;
      const sentAt = Date.now();
      const { duel } = await pvp.api<{ duel: DuelView | null }>("/api/duel").catch(() => ({ duel: null }));
      if (!duel || get().mode) return;
      if (duel.status === "cancelled" || duel.status === "done") {
        if (!ESCROW || (duel.status === "done" && duel.winner !== duel.side && duel.winner !== -1)) return;
        const [, , , , paidA, paidB, closed] = await pvp.chain.readContract({ address: ESCROW, abi: escrowAbi, functionName: "duels", args: [duelKey(duel.id)] });
        const mine = duel.side === 0 ? paidA : paidB;
        if (closed || !mine) return;
      }
      apply(duel, sentAt);
    },
  };
});

/** Whether a staked duel's stakes can be refunded now (never matched in time, or never settled). */
export function refundable(d: DuelView, chainDuel: BattleState["chainDuel"]) {
  if (!chainDuel || chainDuel.closed) return false;
  const mine = d.side === 0 ? chainDuel.paidA : chainDuel.paidB;
  if (!mine || !d.deadline) return false;
  const both = chainDuel.paidA && chainDuel.paidB;
  return Date.now() > d.deadline + (both ? SETTLE_WINDOW_S * 1000 : 0) + 15_000;
}

/** The duel as of now, replayed from the log. */
export const current = (s: Pick<BattleState, "sides" | "log" | "startAt">) => replay(s.sides, s.log, fightTime(s));
