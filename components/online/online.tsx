"use client";

import { type ConnectedWallet, useFundWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { type Address, createWalletClient, custom } from "viem";
import { base } from "viem/chains";
import { fmt, type Token, tokens } from "@/components/world/chain";
import { WorldClient } from "@/components/world/client";
import { MAX_TX_USD, baseChain } from "@/components/world/onchain";
import { holdings, type Cloud, useGame } from "@/components/world/store";
import { connectCloud } from "./cloud";
import { colorFor, Others, type Peer, useMultiplayer, usePeers } from "./multiplayer";
import { ENTER, PRIVY_ID, Privy } from "./privy";
import styles from "./online.module.css";

const RPC = process.env.NEXT_PUBLIC_BASE_RPC_URL || undefined;

export default function Online() {
  if (!PRIVY_ID) return <Screen title="Online mode isn't configured" body="Set NEXT_PUBLIC_PRIVY_APP_ID in .env.local and restart the dev server." />;
  return (
    <Privy>
      <Gate />
    </Privy>
  );
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
  useEffect(() => {
    const wait = sessionStorage.getItem(ENTER) ? 4000 : 1600;
    const t = window.setTimeout(() => {
      sessionStorage.removeItem(ENTER);
      location.replace("/");
    }, wait);
    return () => clearTimeout(t);
  }, []);
  return <Screen title="Connecting…" />;
}

interface Live {
  me: Peer;
  cloud: Cloud;
  flush: () => Promise<void>;
  chain: ReturnType<typeof baseChain>;
}

/** Mounted once per wallet: loads the cloud save and wires the wallet into a real Base adapter. */
function Session({ wallet }: { wallet: ConnectedWallet }) {
  const { user, getAccessToken } = usePrivy();
  const id = user!.id;
  const [session, setSession] = useState<Live | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deps] = useState(() => ({ wallet, getAccessToken }));
  const handle = user?.twitter?.username;
  useEffect(() => sessionStorage.removeItem(ENTER), []);
  useEffect(() => {
    const address = deps.wallet.address as Address;
    Promise.all([connectCloud(deps.getAccessToken, address), deps.wallet.getEthereumProvider()])
      .then(([{ cloud, name, flush }, provider]) => {
        const client = createWalletClient({ account: address, chain: base, transport: custom(provider) });
        setSession({ me: { id, name, color: colorFor(id) }, cloud, flush, chain: baseChain(client, address, RPC) });
      })
      .catch((e: Error) => setError(e.message));
  }, [deps, id]);
  useEffect(() => {
    if (!handle) return;
    setSession((s) => (s && s.me.name !== `@${handle}` ? { ...s, me: { ...s.me, name: `@${handle}` } } : s));
  }, [handle]);
  if (error) return <Screen title="Couldn't start online mode" body={error} action={{ label: "Back to menu", onClick: () => location.assign("/") }} />;
  if (!session) return <Screen title="Loading your save…" />;
  return <World session={session} wallet={wallet} />;
}

function World({ session, wallet }: { session: Live; wallet: ConnectedWallet }) {
  useMultiplayer(session.me);
  return <WorldClient options={session} scene={<Others />} overlay={<WalletBar me={session.me} flush={session.flush} wallet={wallet} />} />;
}

function WalletBar({ me, flush, wallet }: { me: Peer; flush: () => Promise<void>; wallet: ConnectedWallet }) {
  const { logout, user, linkTwitter } = usePrivy();
  const peers = usePeers();
  const sync = useGame((s) => s.sync);
  const eth = useGame((s) => holdings(s).wallet.ETH);
  const last = useGame((s) => s.txs.find((t) => t.explorer));
  const { fundWallet } = useFundWallet({ onUserExited: () => void sync() });
  const [open, setOpen] = useState<"send" | null>(null);
  const [copied, setCopied] = useState(false);
  const embedded = wallet.walletClientType === "privy";
  const twitter = user?.twitter;

  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && void sync(), 20_000);
    return () => clearInterval(t);
  }, [sync]);

  return (
    <div className={styles.bar}>
      <div className={styles.row}>
        <i className={styles.dot} style={{ background: me.color }} />
        <b>{twitter?.username ? `@${twitter.username}` : me.name}</b>
        {twitter?.username ? (
          <a className={styles.chip} href={`https://x.com/${twitter.username}`} target="_blank" rel="noreferrer">
            X
          </a>
        ) : (
          <button className={styles.chip} onClick={() => linkTwitter()} title="Link your X account">
            Link X
          </button>
        )}
        <button
          className={styles.chip}
          title="Copy address"
          onClick={() => {
            void navigator.clipboard.writeText(wallet.address);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? "Copied" : short(wallet.address)}
        </button>
        <span className={styles.net}>Base</span>
      </div>
      <div className={styles.row}>
        <span className={styles.muted}>
          {peers.length ? `${peers.length} other ${peers.length === 1 ? "player" : "players"} online` : "You're the only one here — invite a friend"}
        </span>
      </div>
      {embedded && eth < 0.0005 && <p className={styles.hint}>Your wallet needs a little ETH on Base for gas. Add funds to start trading for real.</p>}
      <div className={styles.row}>
        {embedded && (
          <button className={styles.action} onClick={() => fundWallet({ address: wallet.address, options: { chain: base } }).then(() => sync())}>
            Add funds
          </button>
        )}
        <button className={styles.action} data-active={open === "send" || undefined} onClick={() => setOpen(open === "send" ? null : "send")}>
          Send
        </button>
        <button className={styles.action} onClick={() => flush().then(logout).then(() => location.assign("/"))}>
          Sign out
        </button>
      </div>
      {open === "send" && <Send onDone={() => setOpen(null)} />}
      {last && (
        <a className={styles.last} href={last.explorer} target="_blank" rel="noreferrer">
          Last tx: {last.summary} ↗
        </a>
      )}
    </div>
  );
}

const SENDABLE: Token[] = ["ETH", "USDC", "AERO", "VIRTUAL"];

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
      <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Recipient 0x…" spellCheck={false} autoFocus />
      <div className={styles.row}>
        <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0.0" inputMode="decimal" />
        <select value={token} onChange={(e) => setToken(e.target.value as Token)}>
          {SENDABLE.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <small className={styles.muted}>
        Balance {fmt(wallet[token])} {token} · max ${MAX_TX_USD} per transaction
      </small>
      <button className={styles.primary} disabled={pending || !valid || n <= 0 || n > wallet[token] || usd > MAX_TX_USD}>
        {pending ? "Confirming…" : !to ? "Enter a recipient" : !valid ? "Invalid address" : usd > MAX_TX_USD ? `Over $${MAX_TX_USD}` : `Send ${token}`}
      </button>
    </form>
  );
}

function Screen({ title, body, action }: { title: string; body?: string; action?: { label: string; onClick: () => void } }) {
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
