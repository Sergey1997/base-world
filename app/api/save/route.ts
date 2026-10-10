import { db, handle, HttpError, look, playerId, profile } from "@/lib/server";

const MAX_SAVE = 200_000;

/** Starts an online session: refreshes the player's name and wallet from Privy and returns their save. */
export const GET = handle(async (request) => {
  const id = await playerId(request);
  const claimed = new URL(request.url).searchParams.get("wallet")?.toLowerCase();
  const { name, wallets, photo } = await profile(id);
  const wallet = claimed && wallets.includes(claimed) ? claimed : (wallets[0] ?? null);
  const { data, error } = await db()
    .from("players").upsert({ id, name, wallet }, { onConflict: "id" }).select("save, nickname, avatar, avatar_seed").single();
  if (error) throw error;
  return Response.json({ ...look(data, { name, photo }), wallet, save: data.save });
});

export const PUT = handle(async (request) => {
  const id = await playerId(request);
  const body = await request.text();
  if (body.length > MAX_SAVE) throw new HttpError(413, "Save too large");
  let save: unknown;
  try {
    save = JSON.parse(body);
  } catch {
    throw new HttpError(400, "Save must be JSON");
  }
  if (!save || typeof save !== "object" || !("state" in save)) throw new HttpError(400, "Not a Base World save");
  const { error } = await db().from("players").update({ save, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  return new Response(null, { status: 204 });
});
