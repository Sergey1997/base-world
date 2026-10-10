"use client";

import { useExportWallet, useFundWallet, usePrivy } from "@privy-io/react-auth";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { base } from "viem/chains";
import { levelFor } from "@/components/world/quests";
import styles from "./account.module.css";
import { Avatar } from "./avatar";
import { PRIVY_ID, Privy } from "./privy";

/** Same key `components/world/audio.ts` reads, so the game picks the choice up on its next load. */
const SOUND = "base-world:sound";

interface Me {
  name: string;
  nickname: string | null;
  defaultName: string;
  avatar: string | null;
  seed: number;
  photo: string | null;
  mode: "auto" | "social" | "upload";
  xp: number;
}

export default function AccountPage() {
  if (!PRIVY_ID) return <Shell>Online mode isn't configured.</Shell>;
  return (
    <Privy>
      <Account />
    </Privy>
  );
}

function Account() {
  const privy = usePrivy();
  const { ready, authenticated, user } = privy;
  const { exportWallet } = useExportWallet();
  const { fundWallet } = useFundWallet();
  const [me, setMe] = useState<Me | null>(null);
  const [nick, setNick] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sound, setSound] = useState(() => localStorage.getItem(SOUND) !== "off");
  const token = useRef(privy.getAccessToken);
  token.current = privy.getAccessToken;

  const api = useCallback(async (init?: RequestInit) => {
    const res = await fetch("/api/profile", { ...init, headers: { Authorization: `Bearer ${await token.current()}`, ...init?.headers } });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
    setMe(body as Me);
    setNick((body as Me).nickname ?? "");
  }, []);

  const linked = user?.linkedAccounts.length ?? 0;
  useEffect(() => {
    if (ready && !authenticated) location.replace("/");
    if (ready && authenticated) api().catch((e: Error) => setError(e.message));
  }, [ready, authenticated, linked, api]);

  const run = (label: string, fn: () => unknown) => async () => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const patch = (body: Partial<{ nickname: string | null; avatar: "auto" | null; seed: number }>) =>
    api({ method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  if (!ready || !authenticated || !user || !me) return <Shell>{error ?? "Loading your account…"}</Shell>;

  const seed = (n: number) => `${user.id}:${n}`;
  const { level, progress } = levelFor(me.xp);
  const embedded = user.wallet?.walletClientType === "privy" ? user.wallet : null;
  const external = user.linkedAccounts.filter((a) => a.type === "wallet" && a.walletClientType !== "privy" && a.chainType === "ethereum") as { address: string }[];
  const methods = user.linkedAccounts.filter((a) => a.type !== "smart_wallet" && !(a.type === "wallet" && a.walletClientType === "privy")).length;
  const canUnlink = methods > 1;
  const address = user.wallet?.address;

  return (
    <Shell>
      <section className={styles.card}>
        <div className={styles.profile}>
          <Avatar className={styles.big} src={me.avatar} seed={seed(me.seed)} size={84} />
          <div className={styles.grow}>
            <h1>{me.name}</h1>
            <p className={styles.sub}>
              Level {level} · {me.xp.toLocaleString()} XP
            </p>
            <div className={styles.meter}>
              <i style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          </div>
        </div>

        <h2>Picture</h2>
        <div className={styles.pics}>
          <button className={styles.pic} data-on={me.mode === "auto" || undefined} disabled={!!busy} onClick={run("punk", () => patch({ avatar: "auto" }))}>
            <Avatar seed={seed(me.seed)} size={52} />
            <span>Avatar</span>
          </button>
          <button className={styles.pic} disabled={!!busy} onClick={run("shuffle", () => patch({ avatar: "auto", seed: me.seed + 1 }))} title="Generate another face">
            <span className={styles.glyph}>↻</span>
            <span>Shuffle</span>
          </button>
          {me.photo ? (
            <button className={styles.pic} data-on={me.mode === "social" || undefined} disabled={!!busy} onClick={run("social", () => patch({ avatar: null }))}>
              <Avatar src={me.photo} seed={seed(me.seed)} size={52} />
              <span>X photo</span>
            </button>
          ) : (
            <button className={styles.pic} disabled={!!busy} onClick={() => privy.linkTwitter()} title="Link X to use your X photo">
              <span className={styles.glyph}>𝕏</span>
              <span>Use X</span>
            </button>
          )}
          <label className={styles.pic} data-on={me.mode === "upload" || undefined} aria-disabled={!!busy || undefined}>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              disabled={!!busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void run("upload", async () => {
                  const photo = await square(file);
                  await api({ method: "POST", headers: { "content-type": photo.type }, body: photo });
                })();
              }}
            />
            {me.mode === "upload" ? <Avatar src={me.avatar} seed={seed(me.seed)} size={52} /> : <span className={styles.glyph}>+</span>}
            <span>{busy === "upload" ? "Uploading…" : "Upload"}</span>
          </label>
        </div>

        <h2>Display name</h2>
        <form
          className={styles.inline}
          onSubmit={(e) => {
            e.preventDefault();
            void run("name", () => patch({ nickname: nick }))();
          }}
        >
          <input value={nick} onChange={(e) => setNick(e.target.value)} placeholder={me.defaultName} maxLength={24} spellCheck={false} />
          <button className={styles.primary} disabled={!!busy || nick.trim() === (me.nickname ?? "")}>
            {busy === "name" ? "Saving…" : "Save"}
          </button>
        </form>
      </section>

      <section className={styles.card}>
        <h2>Sign-in methods</h2>
        <ul className={styles.list}>
          <Method label="X" value={user.twitter?.username && `@${user.twitter.username}`}>
            {user.twitter ? (
              <Unlink disabled={!canUnlink || !!busy} onClick={run("x", () => privy.unlinkTwitter(user.twitter!.subject))} />
            ) : (
              <Link onClick={() => privy.linkTwitter()} />
            )}
          </Method>
          <Method label="Google" value={user.google?.email}>
            {user.google ? <Unlink disabled={!canUnlink || !!busy} onClick={run("google", () => privy.unlinkGoogle(user.google!.subject))} /> : <Link onClick={() => privy.linkGoogle()} />}
          </Method>
          <Method label="Email" value={user.email?.address}>
            {user.email ? <Unlink disabled={!canUnlink || !!busy} onClick={run("email", () => privy.unlinkEmail(user.email!.address))} /> : <Link onClick={() => privy.linkEmail()} />}
          </Method>
          {external.map((w) => (
            <Method key={w.address} label="Wallet" value={short(w.address)} mono>
              <Unlink disabled={!canUnlink || !!busy} onClick={run(w.address, () => privy.unlinkWallet(w.address))} />
            </Method>
          ))}
          <Method label="Wallet" value={external.length ? undefined : null}>
            <Link label={external.length ? "Add another" : "Connect"} onClick={() => privy.linkWallet()} />
          </Method>
        </ul>
        {!canUnlink && <p className={styles.note}>Link another method before removing your only one.</p>}
      </section>

      {address && (
        <section className={styles.card}>
          <h2>Wallet</h2>
          <div className={styles.inline}>
            <code className={styles.address}>{short(address)}</code>
            <button
              className={styles.ghost}
              onClick={() => {
                void navigator.clipboard.writeText(address);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <a className={styles.ghost} href={`https://basescan.org/address/${address}`} target="_blank" rel="noreferrer">
              Basescan ↗
            </a>
          </div>
          {embedded && (
            <div className={styles.inline}>
              <button className={styles.primary} onClick={run("fund", () => fundWallet({ address: embedded.address, options: { chain: base } }))}>
                Add funds
              </button>
              <button className={styles.ghost} onClick={run("export", () => exportWallet({ address: embedded.address }))}>
                Export private key
              </button>
            </div>
          )}
        </section>
      )}

      <section className={styles.card}>
        <h2>Game</h2>
        <ul className={styles.list}>
          <Method label="Sound & music" value={sound ? "On" : "Off"}>
            <button
              className={styles.toggle}
              role="switch"
              aria-checked={sound}
              onClick={() => {
                localStorage.setItem(SOUND, sound ? "off" : "on");
                setSound(!sound);
              }}
            >
              <i />
            </button>
          </Method>
        </ul>
      </section>

      {error && <p className={styles.error}>{error}</p>}

      <button className={styles.danger} onClick={run("logout", async () => {
        await privy.logout();
        location.assign("/");
      })}>
        Sign out
      </button>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <nav className={styles.nav}>
          <a href="/online">← Back to world</a>
          <span>Account</span>
        </nav>
        {children}
      </div>
    </main>
  );
}

function Method({ label, value, mono, children }: { label: string; value?: string | null; mono?: boolean; children: ReactNode }) {
  return (
    <li className={styles.method}>
      <b>{label}</b>
      <span className={mono ? styles.mono : undefined}>{value || (value === null ? "" : "Not linked")}</span>
      {children}
    </li>
  );
}

const Link = ({ onClick, label = "Link" }: { onClick: () => void; label?: string }) => (
  <button className={styles.ghost} onClick={onClick}>
    {label}
  </button>
);

const Unlink = ({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) => (
  <button className={styles.quiet} onClick={onClick} disabled={disabled}>
    Remove
  </button>
);

/** Centre-crops to a 256px square so uploads stay tiny; WebP where the browser can encode it, JPEG otherwise. */
async function square(file: File, size = 256): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Couldn't read that image");
  });
  const s = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - s) / 2, (bitmap.height - s) / 2, s, s, 0, 0, size, size);
  const encode = (type: string, q: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
  const webp = await encode("image/webp", 0.86);
  if (webp?.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg", 0.88);
  if (!jpeg) throw new Error("Couldn't read that image");
  return jpeg;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
