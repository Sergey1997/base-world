import { progress, reload, type Row, sideOf, view } from "@/lib/duel";
import { db, handle, playerId } from "@/lib/server";

const RECENT_MS = 24 * 3600_000;

/** A duel's state for this player (`?id=`), or their current/most recent one. Also moves it along: see `progress`. */
export const GET = handle(async (request) => {
  const me = await playerId(request);
  const id = new URL(request.url).searchParams.get("id");
  let row: Row | null;
  if (id) {
    row = await reload(id);
    sideOf(row, me);
  } else {
    const { data, error } = await db()
      .from("duels")
      .select()
      .or(`a_id.eq."${me}",b_id.eq."${me}"`)
      .gt("created_at", new Date(Date.now() - RECENT_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    row = data as Row | null;
  }
  if (!row) return Response.json({ duel: null });
  return Response.json({ duel: await view(await progress(row), me) });
});
