import { after } from "next/server";
import { type Cast, replay } from "@/components/battle/engine";
import { notify, reload, sideOf } from "@/lib/duel";
import { db, handle, HttpError, playerId } from "@/lib/server";

/** Stamps a skill press with the server's clock and appends it to the duel log; the log alone decides the fight. */
export const POST = handle(async (request) => {
  const at = Date.now();
  const me = await playerId(request);
  const { id, skill } = (await request.json().catch(() => ({}))) as { id?: string; skill?: string };
  if (!id || typeof skill !== "string") throw new HttpError(400, "Missing duel or skill");
  const row = await reload(id);
  const by = sideOf(row, me);
  if (row.status !== "live") throw new HttpError(409, "The fight isn't on");
  const t = at - Date.parse(row.started_at!);
  const why = t < 0 ? "not started" : replay([row.a_class, row.b_class!], row.log, t).check(by, skill, t);
  if (why) throw new HttpError(409, why);
  const cast: Cast = { t, by, skill };
  const { data, error } = await db().rpc("duel_cast", { p_id: id, p_cast: cast });
  if (error) throw error;
  if (!data) throw new HttpError(409, "The fight isn't on");
  after(() => notify(row, "cast", { ...cast }));
  return Response.json({ cast });
});
