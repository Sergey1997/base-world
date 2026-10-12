import { type Address, createPublicClient, http, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { COUNTDOWN, type Cast, type ClassId, LIMIT, replay, type SideId } from "@/components/battle/engine";
import { domain, duelKey, ESCROW, escrowAbi, QUEUE_MS, type Result, resultTypes, type Ticket, ticketTypes } from "@/components/battle/escrow";
import { db, env, HttpError, lazy } from "@/lib/server";

/** A result is only signed once the fight has been over this long, so every cast stamped before the end is in the log. */
const SETTLE_LAG = 1_500;

export interface Row {
  id: string;
  status: "queued" | "funding" | "live" | "done" | "cancelled";
  stake_wei: string;
  a_id: string;
  b_id: string | null;
  a_wallet: string;
  b_wallet: string | null;
  a_class: ClassId;
  b_class: ClassId | null;
  a_inbox: string;
  b_inbox: string | null;
  deadline: string | null;
  started_at: string | null;
  log: Cast[];
  winner: -1 | 0 | 1 | null;
  result_sig: string | null;
  created_at: string;
}

const referee = lazy(() => privateKeyToAccount(env("DUEL_REFEREE_KEY") as `0x${string}`));
const chain = lazy(() => createPublicClient({ chain: base, transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || undefined) }));

export function escrow() {
  if (!ESCROW) throw new HttpError(503, "Staked duels aren't live yet: the escrow contract isn't deployed.");
  return ESCROW;
}

export const inbox = () => crypto.randomUUID();

export const sideOf = (row: Row, player: string): SideId => {
  if (row.a_id === player) return 0;
  if (row.b_id === player) return 1;
  throw new HttpError(404, "Duel not found");
};

/** Pushes an event to the players' private topics; only each player and the server know theirs. */
export async function notify(row: Pick<Row, "a_inbox" | "b_inbox">, event: string, payload: Record<string, unknown>) {
  await Promise.all(
    [row.a_inbox, row.b_inbox].filter(Boolean).map(async (topic) => {
      const channel = db().channel(`duel:${topic}`);
      await channel.httpSend(event, payload).catch((e) => console.error("duel notify", e));
      await db().removeChannel(channel);
    }),
  );
}

async function ticket(row: Row): Promise<Ticket> {
  const message = { id: duelKey(row.id), a: row.a_wallet as Address, b: row.b_wallet as Address, stake: BigInt(row.stake_wei), deadline: BigInt(Math.floor(Date.parse(row.deadline!) / 1000)) };
  const sig = await referee().signTypedData({ domain: domain(escrow()), types: ticketTypes, primaryType: "Ticket", message });
  return { key: message.id, a: message.a, b: message.b, stake: row.stake_wei, deadline: Number(message.deadline), sig };
}

const winnerAddress = (row: Row, winner: -1 | 0 | 1) => (winner === -1 ? zeroAddress : ((winner === 0 ? row.a_wallet : row.b_wallet) as Address));

function result(row: Row): Result | null {
  if (row.winner === null || !row.result_sig) return null;
  return { winner: winnerAddress(row, row.winner), sig: row.result_sig as `0x${string}` };
}

const update = async (id: string, from: Row["status"], patch: Partial<Row>) => {
  const { data, error } = await db().from("duels").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).eq("status", from).select().maybeSingle();
  if (error) throw error;
  return data as Row | null;
};

/**
 * Moves a duel along by what has happened since it was last looked at: the queue expiring, stakes landing onchain,
 * the funding window closing, and the fight ending. Every transition is conditional on the old status, so racing requests agree.
 */
export async function progress(row: Row): Promise<Row> {
  const now = Date.now();
  if (row.status === "queued" && now - Date.parse(row.created_at) > QUEUE_MS) return (await update(row.id, "queued", { status: "cancelled" })) ?? reload(row.id);

  if (row.status === "funding") {
    const [, , , , paidA, paidB] = await chain().readContract({ address: escrow(), abi: escrowAbi, functionName: "duels", args: [duelKey(row.id)] });
    if (paidA && paidB) {
      const next = await update(row.id, "funding", { status: "live", started_at: new Date(now + COUNTDOWN).toISOString() });
      if (!next) return reload(row.id);
      await notify(next, "start", { startAt: Date.parse(next.started_at!) });
      return next;
    }
    if (now > Date.parse(row.deadline!)) {
      const next = await update(row.id, "funding", { status: "cancelled" });
      if (next) await notify(next, "cancelled", {});
      return next ?? reload(row.id);
    }
  }

  if (row.status === "live") {
    const elapsed = now - Date.parse(row.started_at!);
    const fight = replay([row.a_class, row.b_class!], row.log, elapsed);
    if (fight.winner === null || elapsed - fight.end! < SETTLE_LAG) return row;
    const winner = fight.winner === "draw" ? -1 : fight.winner;
    const sig = await referee().signTypedData({
      domain: domain(escrow()),
      types: resultTypes,
      primaryType: "Result",
      message: { id: duelKey(row.id), winner: winnerAddress(row, winner) },
    });
    const next = await update(row.id, "live", { status: "done", winner, result_sig: sig });
    if (!next) return reload(row.id);
    await notify(next, "end", { winner });
    return next;
  }
  return row;
}

export async function reload(id: string) {
  const { data, error } = await db().from("duels").select().eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Duel not found");
  return data as Row;
}

/** Everything one player may see about a duel: their own inbox, never the opponent's. */
export async function view(row: Row, player: string) {
  const side = sideOf(row, player);
  const ids = [row.a_id, row.b_id].filter(Boolean) as string[];
  const { data: people } = await db().from("players").select("id, name, nickname").in("id", ids);
  const name = (id: string | null) => {
    const p = people?.find((x) => x.id === id);
    return p ? (p.nickname ?? p.name) : null;
  };
  return {
    id: row.id,
    status: row.status,
    side,
    stake: row.stake_wei,
    classes: [row.a_class, row.b_class] as [ClassId, ClassId | null],
    names: [name(row.a_id), name(row.b_id)],
    inbox: side === 0 ? row.a_inbox : row.b_inbox,
    deadline: row.deadline ? Date.parse(row.deadline) : null,
    startAt: row.started_at ? Date.parse(row.started_at) : null,
    now: Date.now(),
    log: row.log,
    winner: row.winner,
    ticket: row.status === "funding" ? await ticket(row) : null,
    result: result(row),
    limit: LIMIT,
  };
}

export type DuelView = Awaited<ReturnType<typeof view>>;
