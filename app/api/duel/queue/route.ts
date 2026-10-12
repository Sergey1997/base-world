import { isClass } from "@/components/battle/engine";
import { FUND_MS, MAX_STAKE, MIN_STAKE, QUEUE_MS } from "@/components/battle/escrow";
import { escrow, inbox, notify, progress, type Row, view } from "@/lib/duel";
import { db, handle, HttpError, playerId } from "@/lib/server";

const ACTIVE = ["queued", "funding", "live"];

/**
 * Finds an opponent at the same stake, or queues the player. Calling it again while queued retries the match:
 * the newer queue entry always joins the older one, so two players queueing at once still find each other.
 */
export const POST = handle(async (request) => {
  const me = await playerId(request);
  escrow();
  const body = (await request.json().catch(() => ({}))) as { stake?: string; cls?: string };
  if (!isClass(body.cls)) throw new HttpError(400, "Pick a class");
  let stake: bigint;
  try {
    stake = BigInt(body.stake ?? "");
  } catch {
    throw new HttpError(400, "Invalid stake");
  }
  if (stake < MIN_STAKE || stake > MAX_STAKE) throw new HttpError(400, "Stake must be between 0.00001 and 0.02 ETH");
  const { data: player } = await db().from("players").select("wallet").eq("id", me).single();
  if (!player?.wallet) throw new HttpError(400, "Connect a wallet first");

  const { data: current } = await db().from("duels").select().or(`a_id.eq."${me}",b_id.eq."${me}"`).in("status", ACTIVE).order("created_at", { ascending: false }).limit(1).maybeSingle();
  let mine = current ? await progress(current as Row) : null;
  if (mine && mine.status !== "queued" && ACTIVE.includes(mine.status)) return Response.json({ duel: await view(mine, me) });
  if (mine?.status !== "queued") mine = null;

  const { data: open, error } = await db()
    .from("duels")
    .select()
    .eq("status", "queued")
    .eq("stake_wei", stake.toString())
    .neq("a_id", me)
    .neq("a_wallet", player.wallet)
    .gt("created_at", new Date(Date.now() - QUEUE_MS).toISOString())
    .lt("created_at", mine?.created_at ?? new Date().toISOString())
    .order("created_at")
    .limit(5);
  if (error) throw error;
  for (const row of open as Row[]) {
    const { data: matched } = await db()
      .from("duels")
      .update({ status: "funding", b_id: me, b_wallet: player.wallet, b_class: body.cls, b_inbox: inbox(), deadline: new Date(Date.now() + FUND_MS).toISOString(), updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "queued")
      .select()
      .maybeSingle();
    if (!matched) continue;
    if (mine) await db().from("duels").update({ status: "cancelled" }).eq("id", mine.id).eq("status", "queued");
    await notify(matched, "matched", {});
    return Response.json({ duel: await view(matched as Row, me) });
  }
  if (mine) return Response.json({ duel: await view(mine, me) });

  const { data: created, error: insertError } = await db()
    .from("duels")
    .insert({ stake_wei: stake.toString(), a_id: me, a_wallet: player.wallet, a_class: body.cls, a_inbox: inbox() })
    .select()
    .single();
  if (insertError) throw insertError;
  return Response.json({ duel: await view(created as Row, me) });
});

/** Leaves the queue. Matched duels can't be left this way; their stakes come back through the contract's refund. */
export const DELETE = handle(async (request) => {
  const me = await playerId(request);
  const { error } = await db().from("duels").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("a_id", me).eq("status", "queued");
  if (error) throw error;
  return new Response(null, { status: 204 });
});
