"use client";

import { useEffect, useState } from "react";
import { personas } from "./agents";
import { fmt, hooks, LIQUIDATION_LTV, type Token, tokens } from "./chain";
import type { PanelId } from "./config";
import { chain, healthFactor, LAUNCH_COST, useGame, VAULT_NAME } from "./store";
import styles from "./world.module.css";

const TOKENS = Object.keys(tokens) as Token[];
const GAUGES = ["ETH/SKY", "SKY/VIRT", "ETH/CASH", "VIRT/CASH"];
const AERO: PanelId[] = ["swap", "pool", "vote"];

const titles: Record<PanelId, [string, string]> = {
  swap: ["Swap Terminal", "Aeroport · route any pair"],
  pool: ["Liquidity Pool", "Aeroport · ETH/SKY"],
  vote: ["Gauge Voting Booth", "Aeroport · lock SKY, steer emissions"],
  launch: ["Agent Launchpad", "Virtua · bring an agent to life"],
  lend: [VAULT_NAME, "Vault Quarter · supply, borrow, repay"],
  hooks: ["Hook Stall", "Hook Bazaar · swaps with custom rules"],
  flash: ["Flash Loan Counter", "Ghost Bank · one block, no collateral"],
};

export function Panel({ id }: { id: PanelId }) {
  const close = useGame((s) => s.close);
  const [tab, setTab] = useState(id);
  const [title, sub] = titles[tab];
  return (
    <div className={styles.modal}>
      <header>
        <div>
          <h2>{title}</h2>
          <small>
            {sub} · {chain.network}
          </small>
        </div>
        <button className={styles.close} onClick={close} aria-label="Close">
          ×
        </button>
      </header>
      {AERO.includes(id) && (
        <nav className={styles.tabs}>
          {AERO.map((t) => (
            <button key={t} data-active={t === tab || undefined} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </nav>
      )}
      {tab === "swap" && <Swap />}
      {tab === "pool" && <Pool />}
      {tab === "vote" && <Vote />}
      {tab === "launch" && <Launch />}
      {tab === "lend" && <Lend />}
      {tab === "hooks" && <Hooks />}
      {tab === "flash" && <Flash />}
    </div>
  );
}

function Amount({ value, onChange, token, max }: { value: string; onChange: (v: string) => void; token: string; max?: number }) {
  return (
    <label className={styles.amount}>
      <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))} />
      <span>{token}</span>
      {max !== undefined && (
        <button type="button" onClick={() => onChange(String(+max.toFixed(6)))}>
          max {fmt(max)}
        </button>
      )}
    </label>
  );
}

function Pick({ value, onChange, options }: { value: string; onChange: (v: Token) => void; options: Token[] }) {
  return (
    <select className={styles.select} value={value} onChange={(e) => onChange(e.target.value as Token)}>
      {options.map((t) => (
        <option key={t}>{t}</option>
      ))}
    </select>
  );
}

function Submit({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  const pending = useGame((s) => s.pending);
  return (
    <button className={styles.primary} disabled={pending || disabled} onClick={onClick}>
      {pending ? "Confirming…" : label}
    </button>
  );
}

function Pair({ from, to, setFrom, setTo }: { from: Token; to: Token; setFrom: (t: Token) => void; setTo: (t: Token) => void }) {
  return (
    <div className={styles.row}>
      <Pick value={from} onChange={setFrom} options={TOKENS} />
      <button
        className={styles.flip}
        onClick={() => {
          setFrom(to);
          setTo(from);
        }}
        aria-label="Flip"
      >
        ⇄
      </button>
      <Pick value={to} onChange={setTo} options={TOKENS} />
    </div>
  );
}

function Swap() {
  const wallet = useGame((s) => s.wallet);
  const swap = useGame((s) => s.swap);
  const [from, setFrom] = useState<Token>("ETH");
  const [to, setTo] = useState<Token>("SKY");
  const [amount, setAmount] = useState("0.1");
  const n = +amount || 0;
  const q = chain.quote(from, to, n);
  const ok = n > 0 && n <= wallet[from] && from !== to;
  return (
    <div className={styles.body}>
      <Pair from={from} to={to} setFrom={setFrom} setTo={setTo} />
      <Amount value={amount} onChange={setAmount} token={from} max={wallet[from]} />
      <dl className={styles.facts}>
        <dt>You receive</dt>
        <dd>
          {fmt(q.amountOut)} {to}
        </dd>
        <dt>Price impact</dt>
        <dd>{(q.priceImpact * 100).toFixed(2)}%</dd>
        <dt>Fee</dt>
        <dd>0.30%</dd>
      </dl>
      <Submit label={from === to ? "Pick two tokens" : n > wallet[from] ? `Not enough ${from}` : "Swap"} disabled={!ok} onClick={() => swap(from, to, n)} />
    </div>
  );
}

function Pool() {
  const wallet = useGame((s) => s.wallet);
  const lp = useGame((s) => s.lp);
  const add = useGame((s) => s.addLiquidity);
  const [amount, setAmount] = useState("0.05");
  const eth = +amount || 0;
  const sky = chain.quote("ETH", "SKY", eth).amountOut / 0.997;
  const ok = eth > 0 && eth <= wallet.ETH && sky <= wallet.SKY;
  const maxEth = Math.min(wallet.ETH, (wallet.SKY * tokens.SKY.usd) / tokens.ETH.usd);
  return (
    <div className={styles.body}>
      <p className={styles.note}>Deposit ETH and SKY in equal value. You earn swap fees and can stake the LP for emissions.</p>
      <Amount value={amount} onChange={setAmount} token="ETH" max={maxEth} />
      <dl className={styles.facts}>
        <dt>Paired SKY</dt>
        <dd>
          {fmt(sky)} SKY <small>(you have {fmt(wallet.SKY)})</small>
        </dd>
        <dt>Your LP</dt>
        <dd>{fmt(lp)}</dd>
      </dl>
      <Submit label={sky > wallet.SKY ? "Not enough SKY — swap first" : "Add liquidity"} disabled={!ok} onClick={() => add(eth)} />
    </div>
  );
}

function Vote() {
  const wallet = useGame((s) => s.wallet);
  const votes = useGame((s) => s.votes);
  const vote = useGame((s) => s.vote);
  const [gauge, setGauge] = useState(GAUGES[0]);
  const [amount, setAmount] = useState(String(Math.floor(wallet.SKY / 2) || 50));
  const n = +amount || 0;
  const total = Object.values(votes).reduce((a, b) => a + b, 0);
  return (
    <div className={styles.body}>
      <p className={styles.note}>Lock SKY into veSKY and vote. Emissions next epoch flow to the gauges with the most votes.</p>
      <div className={styles.options}>
        {GAUGES.map((g) => (
          <button key={g} data-active={g === gauge || undefined} onClick={() => setGauge(g)}>
            <b>{g}</b>
            <small>{total ? `${Math.round(((votes[g] ?? 0) / total) * 100)}% of your votes` : "no votes yet"}</small>
          </button>
        ))}
      </div>
      <Amount value={amount} onChange={setAmount} token="SKY" max={wallet.SKY} />
      <Submit label={n > wallet.SKY ? "Not enough SKY" : `Lock & vote for ${gauge}`} disabled={n <= 0 || n > wallet.SKY} onClick={() => vote(gauge, n)} />
    </div>
  );
}

function Launch() {
  const virt = useGame((s) => s.wallet.VIRT);
  const agents = useGame((s) => s.agents);
  const launch = useGame((s) => s.launchAgent);
  const [name, setName] = useState("");
  const [persona, setPersona] = useState(personas[0].id);
  return (
    <div className={styles.body}>
      <input className={styles.text} value={name} onChange={(e) => setName(e.target.value.slice(0, 18))} placeholder="Agent name, e.g. Pixel" autoFocus />
      <div className={styles.options}>
        {personas.map((p) => (
          <button key={p.id} data-active={p.id === persona || undefined} onClick={() => setPersona(p.id)} style={{ borderColor: p.id === persona ? p.color : undefined }}>
            <b style={{ color: p.color }}>{p.label}</b>
          </button>
        ))}
      </div>
      <dl className={styles.facts}>
        <dt>Launch cost</dt>
        <dd>
          {LAUNCH_COST} VIRT <small>(you have {fmt(virt)})</small>
        </dd>
        {agents.length > 0 && (
          <>
            <dt>Your agents</dt>
            <dd>{agents.map((a) => `${a.name} $${a.ticker}`).join(", ")}</dd>
          </>
        )}
      </dl>
      <Submit label={virt < LAUNCH_COST ? "Not enough VIRT" : "Launch agent"} disabled={virt < LAUNCH_COST || !name.trim()} onClick={() => (launch(name, persona), setName(""))} />
    </div>
  );
}

function Lend() {
  const wallet = useGame((s) => s.wallet);
  const vault = useGame((s) => s.vault);
  const supply = useGame((s) => s.supply);
  const borrow = useGame((s) => s.borrow);
  const repay = useGame((s) => s.repay);
  const [mode, setMode] = useState<"supply" | "borrow" | "repay">(vault.collateral > 0 ? (vault.debt > 0 ? "repay" : "borrow") : "supply");
  const [amount, setAmount] = useState(mode === "supply" ? "0.2" : "200");
  const n = +amount || 0;
  const maxBorrow = Math.max(0, (vault.collateral * tokens.ETH.usd * LIQUIDATION_LTV) / 1.05 - vault.debt);
  const projected = healthFactor(vault, mode === "borrow" ? n : mode === "repay" ? -Math.min(n, vault.debt) : 0);
  const after = mode === "supply" ? healthFactor({ ...vault, collateral: vault.collateral + n }) : projected;
  const ok = mode === "supply" ? n > 0 && n <= wallet.ETH : mode === "borrow" ? n > 0 && healthFactor(vault, n) >= 1.05 : n > 0 && vault.debt > 0 && wallet.CASH > 0;
  const pick = (m: typeof mode) => {
    setMode(m);
    setAmount(m === "supply" ? "0.2" : m === "borrow" ? String(Math.floor(maxBorrow / 2)) : String(+Math.min(vault.debt, wallet.CASH).toFixed(2)));
  };
  return (
    <div className={styles.body}>
      <dl className={styles.facts}>
        <dt>Collateral</dt>
        <dd>{fmt(vault.collateral)} ETH</dd>
        <dt>Debt</dt>
        <dd>{fmt(vault.debt)} CASH</dd>
        <dt>Liquidation LTV</dt>
        <dd>{LIQUIDATION_LTV * 100}%</dd>
      </dl>
      <Health value={healthFactor(vault)} next={after} />
      <nav className={styles.tabs}>
        {(["supply", "borrow", "repay"] as const).map((m) => (
          <button key={m} data-active={m === mode || undefined} onClick={() => pick(m)}>
            {m}
          </button>
        ))}
      </nav>
      <Amount value={amount} onChange={setAmount} token={mode === "supply" ? "ETH" : "CASH"} max={mode === "supply" ? wallet.ETH : mode === "borrow" ? maxBorrow : Math.min(vault.debt, wallet.CASH)} />
      <Submit
        label={mode === "supply" ? "Supply ETH" : mode === "borrow" ? (vault.collateral ? "Borrow CASH" : "Supply collateral first") : vault.debt ? "Repay" : "Nothing to repay"}
        disabled={!ok}
        onClick={() => (mode === "supply" ? supply(n) : mode === "borrow" ? borrow(n) : repay(n))}
      />
    </div>
  );
}

function Health({ value, next }: { value: number; next: number }) {
  const pct = (h: number) => (h === Infinity ? 100 : Math.min(100, Math.max(0, ((h - 1) / 2) * 100)));
  const label = (h: number) => (h === Infinity ? "∞" : h.toFixed(2));
  const tone = next < 1.2 ? "danger" : next < 1.6 ? "warn" : "ok";
  return (
    <div className={styles.health} data-tone={tone}>
      <div>
        Health factor <b>{label(value)}</b>
        {next !== value && <span> → {label(next)}</span>}
      </div>
      <div className={styles.bar}>
        <i style={{ width: `${pct(next)}%` }} />
      </div>
    </div>
  );
}

function Hooks() {
  const wallet = useGame((s) => s.wallet);
  const used = useGame((s) => s.quests.hooks.progress.two) ?? [];
  const hookSwap = useGame((s) => s.hookSwap);
  const [hook, setHook] = useState<string>(hooks[0].id);
  const [from, setFrom] = useState<Token>("ETH");
  const [to, setTo] = useState<Token>("SKY");
  const [amount, setAmount] = useState("0.05");
  const n = +amount || 0;
  const ok = n > 0 && n <= wallet[from] && from !== to;
  return (
    <div className={styles.body}>
      <div className={styles.options}>
        {hooks.map((h) => (
          <button key={h.id} data-active={h.id === hook || undefined} onClick={() => setHook(h.id)}>
            <b>
              {h.label}
              {used.includes(`hook:${h.id}`) && " ✓"}
            </b>
            <small>{h.blurb}</small>
          </button>
        ))}
      </div>
      <Pair from={from} to={to} setFrom={setFrom} setTo={setTo} />
      <Amount value={amount} onChange={setAmount} token={from} max={wallet[from]} />
      <Submit label={from === to ? "Pick two tokens" : n > wallet[from] ? `Not enough ${from}` : "Swap with hook"} disabled={!ok} onClick={() => hookSwap(hook, from, to, n)} />
    </div>
  );
}

const ROUTE = ["Buy SKY on Aeroport", "Sell SKY for CASH at Hook Bazaar", "Buy ETH with CASH in Vault Quarter"];
const BLOCK = 8;

function Flash() {
  const flashLoan = useGame((s) => s.flashLoan);
  const pending = useGame((s) => s.pending);
  const [start, setStart] = useState<number | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [left, setLeft] = useState(BLOCK);
  const [result, setResult] = useState<string | null>(null);
  const [shuffled, setShuffled] = useState(ROUTE);

  useEffect(() => {
    if (start === null) return;
    const t = setInterval(() => {
      const l = BLOCK - (performance.now() - start) / 1000;
      setLeft(Math.max(0, l));
      if (l <= 0) {
        setStart(null);
        setResult("Block closed before repayment — the whole loan reverted. Try again.");
      }
    }, 50);
    return () => clearInterval(t);
  }, [start]);

  const step = (s: string) => {
    if (start === null) return;
    if (s !== ROUTE[steps.length]) {
      setStart(null);
      setResult(`Reverted: "${s}" is out of order. Arbitrage only works step by step.`);
      return;
    }
    const next = [...steps, s];
    setSteps(next);
    if (next.length === ROUTE.length) {
      setStart(null);
      setResult("Repaid 1,000 ETH + fee inside the block.");
      flashLoan(["Aeroport", "Hook Bazaar", "Vault Quarter"]);
    }
  };

  return (
    <div className={styles.body}>
      <p className={styles.note}>
        Borrow 1,000 ETH with no collateral, run the route in order — Aeroport → Hook Bazaar → Vault Quarter — and repay before the {BLOCK}s block closes.
      </p>
      {start === null ? (
        <>
          {result && <p className={styles.line}>{result}</p>}
          <button
            className={styles.primary}
            disabled={pending}
            onClick={() => {
              setSteps([]);
              setResult(null);
              setLeft(BLOCK);
              setShuffled([...ROUTE].sort(() => Math.random() - 0.5));
              setStart(performance.now());
            }}
          >
            {pending ? "Settling…" : "Borrow 1,000 ETH"}
          </button>
        </>
      ) : (
        <>
          <div className={styles.health} data-tone={left < 3 ? "danger" : "ok"}>
            <div>
              Block closes in <b>{left.toFixed(1)}s</b> · step {steps.length + 1}/{ROUTE.length}
            </div>
            <div className={styles.bar}>
              <i style={{ width: `${(left / BLOCK) * 100}%` }} />
            </div>
          </div>
          <div className={styles.options}>
            {shuffled.map((s) => (
              <button key={s} data-active={steps.includes(s) || undefined} disabled={steps.includes(s)} onClick={() => step(s)}>
                <b>{s}</b>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
