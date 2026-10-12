"use client";

import { type ConnectedWallet, useFundWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type Address, createPublicClient, createWalletClient, custom, http } from "viem";
import { base } from "viem/chains";
import { connectPvp, type PvpLink } from "@/components/battle/link";
import { fmt, type Token, tokens } from "@/components/world/chain";
import { WorldClient } from "@/components/world/client";
import { Loader } from "@/components/world/loader";
import { MAX_TX_USD, baseChain } from "@/components/world/onchain";
import { holdings, type Cloud, useGame } from "@/components/world/store";
import { AccountSettings } from "./account";
import { Avatar } from "./avatar";
import { connectCloud } from "./cloud";
import { colorFor, Others, type Peer, supabase, useMultiplayer, usePeers } from "./multiplayer";
import { ENTER, PRIVY_ID } from "./privy";
import styles from "./online.module.css";

const RPC = process.env.NEXT_PUBLIC_BASE_RPC_URL || undefined;

export default function Online() {
  if (!PRIVY_ID) return <Screen title="Online mode isn't configured" body="Set NEXT_PUBLIC_PRIVY_APP_ID in .env.local and restart the dev server." />;
  return <Gate />;
}

function Gate() {
  const { ready, authenticated, user, connectWallet } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  if (!ready) return <Screen title="Connecting…" />;
  if (!authenticated) return <GoHome />;
  const wallet = wallets.find((w) => w.address.toLowerCase() === user?.wallet?.address?.toLowerCase()) ?? wallets[0];
  if (!wallet)
    return walletsReady && user?.wallet?.walletClientType !== "privy" ? (
      <Screen title="Reconnect your wallet" body={`Your account uses ${short(user?.wallet?.address ?? "an external wallet")}. Connect it to keep playing.`} action={{ label: "Connect wallet", onClick: () => connectWallet() }} />
    ) : (
      <Screen title="Creating your wallet…" />
    );
  return <Session key={wallet.address} wallet={wallet} />;
}

function GoHome() {
  const router = useRouter();
  useEffect(() => {
    const wait = sessionStorage.getItem(ENTER) ? 4000 : 1600;
    const t = window.setTimeout(() => {
      sessionStorage.removeItem(ENTER);
      router.replace("/");
    }, wait);
    return () => clearTimeout(t);
  }, [router]);
  return <Screen title="Connecting…" />;
}

interface Live {
  me: Peer;
  look: { avatar: string | null; seed: number };
  cloud: Cloud;
  flush: () => Promise<void>;
  chain: ReturnType<typeof baseChain>;
  pvp: PvpLink;
}

/** Wires staked duels to this session: authed API calls, the wallet, and private duel topics. */
function duelLink(account: Address, wallet: ReturnType<typeof createWalletClient>, cloud: Cloud, getToken: () => Promise<string | null>): PvpLink {
  return {
    account,
    wallet,
    chain: createPublicClient({ chain: base, transport: http(RPC) }),
    async api(path, init) {
      const r = await fetch(path, {
        method: init?.method ?? "GET",
        headers: { Authorization: `Bearer ${await getToken()}`, "content-type": "application/json" },
        body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      });
      if (r.status === 204) return null as never;
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.error ?? `Request failed (${r.status})`);
      return data;
    },
    listen(topic, on) {
      const channel = supabase().channel(`duel:${topic}`);
      channel.on("broadcast", { event: "*" }, (m) => on(m.event, (m.payload ?? {}) as Record<string, unknown>)).subscribe();
      return () => void supabase().removeChannel(channel);
    },
    logTx: (hash, summary) => cloud.logTx({ hash, summary, at: Date.now(), explorer: `https://basescan.org/tx/${hash}` }, "duel"),
  };
}

/** Mounted once per wallet: loads the cloud save and wires the wallet into a real Base adapter. */
function Session({ wallet }: { wallet: ConnectedWallet }) {
  const { user, getAccessToken } = usePrivy();
  const id = user!.id;
  const [session, setSession] = useState<Live | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deps] = useState(() => ({ wallet, getAccessToken }));
  useEffect(() => sessionStorage.removeItem(ENTER), []);
  useEffect(() => {
    const address = deps.wallet.address as Address;
    Promise.all([connectCloud(deps.getAccessToken, address), deps.wallet.getEthereumProvider()])
      .then(([{ cloud, name, avatar, seed, flush }, provider]) => {
        const client = createWalletClient({ account: address, chain: base, transport: custom(provider) });
        setSession({ me: { id, name, color: colorFor(id) }, look: { avatar, seed }, cloud, flush, chain: baseChain(client, address, RPC), pvp: duelLink(address, client, cloud, deps.getAccessToken) });
      })
      .catch((e: Error) => setError(e.message));
  }, [deps, id]);
  if (error) return <Screen title="Couldn't start online mode" body={error} action={{ label: "Back to menu", onClick: () => location.assign("/") }} />;
  if (!session) return <Screen title="Loading your save…" />;
  return <World session={session} wallet={wallet} />;
}

function World({ session, wallet }: { session: Live; wallet: ConnectedWallet }) {
  const [settings, setSettings] = useState(false);
  const [look, setLook] = useState(session.look);
  const [name, setName] = useState(session.me.name);
  const me = { ...session.me, name };
  useMultiplayer(me);
  useEffect(() => {
    connectPvp(session.pvp);
    return () => connectPvp(null);
  }, [session.pvp]);
  useEffect(() => {
    if (window.location.hash !== "#settings") return;
    setSettings(true);
    history.replaceState(null, "", "/online");
  }, []);
  return (
    <WorldClient
      options={session}
      scene={<Others />}
      overlay={
        <>
          <WalletBar me={me} look={look} flush={session.flush} wallet={wallet} onSettings={() => setSettings(true)} />
          {settings && (
            <AccountSettings
              onClose={() => setSettings(false)}
              onProfile={(p) => {
                setLook({ avatar: p.avatar, seed: p.seed });
                setName(p.name);
              }}
            />
          )}
        </>
      }
    />
  );
}

function WalletBar({ me, look, flush, wallet, onSettings }: { me: Peer; look: Live["look"]; flush: () => Promise<void>; wallet: ConnectedWallet; onSettings: () => void }) {
  const peers = usePeers();
  const sync = useGame((s) => s.sync);
  const bags = useGame((s) => holdings(s).wallet);
  const eth = bags.ETH;
  const last = useGame((s) => s.txs.find((t) => t.explorer));
  const { fundWallet } = useFundWallet({ onUserExited: () => void sync() });
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const embedded = wallet.walletClientType === "privy";

  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && void sync(), 20_000);
    return () => clearInterval(t);
  }, [sync]);

  return (
    <div className={styles.bar} data-dock="wallet">
      <div className={styles.bags}>
        {(["ETH", "USDC"] as Token[]).map((t) => (
          <span key={t} style={{ color: tokens[t].color }}>
            {fmt(bags[t])} <small>{t}</small>
          </span>
        ))}
      </div>
      <div className={styles.who}>
        <Avatar className={styles.face} src={look.avatar} seed={`${me.id}:${look.seed}`} size={34} />
        <div className={styles.id}>
          <b>{me.name}</b>
          <span>
            <button
              className={styles.addr}
              title="Copy address"
              onClick={() => {
                void navigator.clipboard.writeText(wallet.address);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
            >
              {copied ? "Copied" : short(wallet.address)}
            </button>
            {" · "}
            {peers.length + 1} online
          </span>
        </div>
        <button
          className={styles.icon}
          title="Account & settings"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            void flush();
            onSettings();
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </button>
      </div>
      {embedded && eth < 0.0005 && <p className={styles.hint}>Add a little ETH on Base for gas.</p>}
      <div className={styles.row}>
        {embedded && (
          <button className={styles.action} data-primary onClick={() => fundWallet({ address: wallet.address, options: { chain: base } }).then(() => sync())}>
            Add funds
          </button>
        )}
        <button className={styles.action} data-active={open || undefined} onClick={() => setOpen(!open)}>
          Send
        </button>
      </div>
      {open && <Send onDone={() => setOpen(false)} />}
      {last && (
        <a className={styles.last} href={last.explorer} target="_blank" rel="noreferrer">
          {last.summary} ↗
        </a>
      )}
    </div>
  );
}

const SENDABLE: Token[] = ["ETH", "USDC"];

function Send({ onDone }: { onDone: () => void }) {
  const send = useGame((s) => s.send);
  const pending = useGame((s) => s.pending);
  const wallet = useGame((s) => holdings(s).wallet);
  const [to, setTo] = useState("");
  const [token, setToken] = useState<Token>("USDC");
  const [amount, setAmount] = useState("");
  const n = +amount || 0;
  const valid = /^0x[0-9a-fA-F]{40}$/.test(to.trim());
  const usd = n * tokens[token].usd;
  return (
    <form
      className={styles.send}
      onSubmit={(e) => {
        e.preventDefault();
        void send(to.trim(), token, n).then((ok) => ok && onDone());
      }}
    >
      <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Recipient 0x…" spellCheck={false} autoFocus data-invalid={(to && !valid) || undefined} />
      <div className={styles.row}>
        <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0.0" inputMode="decimal" />
        <select value={token} onChange={(e) => setToken(e.target.value as Token)}>
          {SENDABLE.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <small className={styles.muted}>
        {fmt(wallet[token])} {token} available · max ${MAX_TX_USD}
      </small>
      <button className={styles.primary} disabled={pending || !valid || n <= 0 || n > wallet[token] || usd > MAX_TX_USD}>
        {pending ? "Confirming…" : !to ? "Enter a recipient" : !valid ? "Invalid address" : usd > MAX_TX_USD ? `Over $${MAX_TX_USD}` : `Send ${token}`}
      </button>
    </form>
  );
}

function Screen({ title, body, action }: { title: string; body?: string; action?: { label: string; onClick: () => void } }) {
  if (!body && !action) return <Loader label={title} />;
  return (
    <main className={styles.screen}>
      <div className={styles.card}>
        <a href="/" className={styles.back}>
          ← Menu
        </a>
        <h1>{title}</h1>
        {body && <p>{body}</p>}
        {action && (
          <button className={styles.primary} onClick={action.onClick} autoFocus>
            {action.label}
          </button>
        )}
      </div>
    </main>
  );
}

const short = (a: string) => (a.startsWith("0x") ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
