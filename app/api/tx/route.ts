import { createPublicClient, http, isHash } from "viem";
import { base } from "viem/chains";
import { db, handle, HttpError, playerId } from "@/lib/server";

const chain = createPublicClient({ chain: base, transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || undefined) });

/** Logs a real transaction, but only after confirming onchain that the player's own wallet sent it. */
export const POST = handle(async (request) => {
  const id = await playerId(request);
  const { hash, kind, summary } = (await request.json().catch(() => ({}))) as { hash?: string; kind?: string; summary?: string };
  if (!hash || !isHash(hash)) throw new HttpError(400, "Invalid transaction hash");
  const { data: player } = await db().from("players").select("wallet").eq("id", id).single();
  const tx = await chain.getTransaction({ hash }).catch(() => null);
  if (!tx) throw new HttpError(404, "Transaction not found on Base");
  if (!player?.wallet || tx.from.toLowerCase() !== player.wallet) throw new HttpError(403, "Transaction was not sent by this player's wallet");
  const { error } = await db()
    .from("transactions")
    .upsert({ player_id: id, hash, chain_id: base.id, kind: String(kind ?? "tx").slice(0, 32), summary: String(summary ?? "").slice(0, 280) }, { onConflict: "hash", ignoreDuplicates: true });
  if (error) throw error;
  return new Response(null, { status: 204 });
});
