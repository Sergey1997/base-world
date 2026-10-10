import { db, handle, HttpError, type Look, look, playerId, profile } from "@/lib/server";

const BUCKET = "avatars";
const MAX_PHOTO = 512 * 1024;
const COLUMNS = "nickname, avatar, avatar_seed, xp:save->state->>xp";
/** Magic bytes, so the bucket only ever holds real images whatever the request claims. */
const SIGNATURES: Record<string, (b: Uint8Array) => boolean> = {
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/webp": (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
};

type Row = Look & { xp: string | null };

/** The account page's view of a player. GET creates the row if they open settings before ever playing. */
async function view(id: string, row?: Row) {
  const derived = await profile(id);
  if (!row) {
    const { data, error } = await db().from("players").upsert({ id, name: derived.name }, { onConflict: "id" }).select(COLUMNS).single();
    if (error) throw error;
    row = data as unknown as Row;
  }
  return {
    ...look(row, derived),
    nickname: row.nickname,
    defaultName: derived.name,
    photo: derived.photo,
    mode: row.avatar === "auto" ? "auto" : row.avatar ? "upload" : derived.photo ? "social" : "auto",
    xp: Number(row.xp) || 0,
  };
}

async function update(id: string, patch: Partial<Look>) {
  const { data: before } = await db().from("players").select("avatar").eq("id", id).single();
  const { data, error } = await db().from("players").update(patch).eq("id", id).select(COLUMNS).single();
  if (error) throw error;
  const old = before?.avatar?.split(`/object/public/${BUCKET}/`)[1];
  if (old && "avatar" in patch && patch.avatar !== before?.avatar) await db().storage.from(BUCKET).remove([old]);
  return view(id, data as unknown as Row);
}

export const GET = handle(async (request) => Response.json(await view(await playerId(request))));

/** Changes the display name or the generated avatar; `avatar: null` goes back to the linked social photo. */
export const PATCH = handle(async (request) => {
  const id = await playerId(request);
  const body = (await request.json().catch(() => null)) as { nickname?: unknown; avatar?: unknown; seed?: unknown } | null;
  if (!body || typeof body !== "object") throw new HttpError(400, "Expected a JSON object");
  const patch: Partial<Look> = {};
  if ("nickname" in body) {
    const name = typeof body.nickname === "string" ? body.nickname.replace(/[\p{Cc}\p{Cf}]/gu, "").trim().slice(0, 24) : "";
    patch.nickname = name || null;
  }
  if ("avatar" in body) {
    if (body.avatar !== null && body.avatar !== "auto") throw new HttpError(400, "avatar must be null or \"auto\"");
    patch.avatar = body.avatar;
  }
  if ("seed" in body) {
    if (!Number.isInteger(body.seed) || (body.seed as number) < 0 || (body.seed as number) > 1e9) throw new HttpError(400, "seed must be a non-negative integer");
    patch.avatar_seed = body.seed as number;
  }
  return Response.json(await update(id, patch));
});

/** Uploads a profile photo (the client already cropped it to a small square) and makes it the avatar. */
export const POST = handle(async (request) => {
  const id = await playerId(request);
  const type = request.headers.get("content-type")?.split(";")[0].trim() ?? "";
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!SIGNATURES[type]?.(bytes)) throw new HttpError(415, "Upload a PNG, JPEG or WebP image");
  if (bytes.byteLength > MAX_PHOTO) throw new HttpError(413, "Photo must be under 512 KB");
  const path = `${id.replace(/[^a-z0-9]+/gi, "-")}/${Date.now()}.${type.split("/")[1]}`;
  const { error } = await db().storage.from(BUCKET).upload(path, bytes, { contentType: type, cacheControl: "31536000" });
  if (error) throw error;
  return Response.json(await update(id, { avatar: db().storage.from(BUCKET).getPublicUrl(path).data.publicUrl }));
});
