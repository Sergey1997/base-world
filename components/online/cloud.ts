import type { Cloud } from "@/components/world/store";

const EVERY_MS = 2500;

/**
 * Saves to Supabase through /api/save. Writes are throttled and skipped when nothing persisted changed;
 * the last pending save is flushed with `keepalive` when the tab is hidden or closed.
 */
export async function connectCloud(getToken: () => Promise<string | null>, wallet: string) {
  let token = await getToken();
  const headers = () => ({ Authorization: `Bearer ${token}`, "content-type": "application/json" });

  const res = await fetch(`/api/save?wallet=${wallet}`, { headers: headers() });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Couldn't load your save (${res.status})`);
  const { name, save } = (await res.json()) as { name: string; save: unknown };

  const loaded = save ? JSON.stringify(save) : null;
  let written = loaded ?? "";
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async (keepalive = false) => {
    timer = null;
    if (!pending || pending === written) return;
    const body = pending;
    pending = null;
    if (!keepalive) token = (await getToken()) ?? token;
    const r = await fetch("/api/save", { method: "PUT", headers: headers(), body, keepalive }).catch(() => null);
    if (r?.ok) written = body;
    else pending ??= body;
  };

  const hide = () => document.visibilityState === "hidden" && void flush(true);
  document.addEventListener("visibilitychange", hide);
  window.addEventListener("pagehide", () => void flush(true));

  const cloud: Cloud = {
    load: async () => loaded,
    save(raw) {
      pending = raw;
      timer ??= setTimeout(flush, EVERY_MS);
    },
    logTx(tx, kind) {
      void getToken().then((t) =>
        fetch("/api/tx", {
          method: "POST",
          headers: { Authorization: `Bearer ${t ?? token}`, "content-type": "application/json" },
          body: JSON.stringify({ hash: tx.hash, kind, summary: tx.summary }),
        }),
      );
    },
  };
  return { cloud, name, flush: () => flush() };
}
