"use client";

import { useEffect, useState } from "react";
import { personas } from "./agents";
import { fmt, hooks, type Side, type Token, tokens, type Venue, venues } from "./chain";
import { useShallow } from "zustand/react/shallow";
import type { PanelId } from "./config";
import { docById, docs } from "./docs";
import { quests } from "./quests";
import { chain, healthFactor, holdings, LAUNCH_COST, useGame } from "./store";
import styles from "./world.module.css";

const TOKENS = Object.keys(tokens) as Token[];
const GAUGES = ["ETH/AERO", "AERO/VIRTUAL", "ETH/USDC", "VIRTUAL/USDC"];
const GROUPS: PanelId[][] = [
  ["swap", "pool", "vote"],
  ["flash", "aave"],
];
/** Panels that spend the connected wallet in online mode; the rest stay simulated. */
const REAL: PanelId[] = ["swap", "pool", "lend", "aave", "kickoff"];

const logos: Record<PanelId, string> = {
  swap: "/world/brands/aerodrome.png",
  pool: "/world/brands/aerodrome.png",
  vote: "/world/brands/aerodrome.png",
  launch: "/world/brands/virtuals.png",
  lend: "/world/brands/morpho.png",
  hooks: "/world/brands/uniswap.png",
  flash: "/world/brands/aave.png",
  aave: "/world/brands/aave.png",
  kickoff: "/world/brands/kickoff.png",
  docs: "/world/brands/base.png",
};

const titles: Record<PanelId, [string, string]> = {
  swap: ["Swap Terminal", "Aerodrome · route any pair"],
  pool: ["Liquidity Pool", "Aerodrome · ETH/AERO"],
  vote: ["Gauge Voting Booth", "Aerodrome · lock AERO, steer emissions"],
  launch: ["Agent Launchpad", "Virtuals · bring an agent to life"],
  lend: [venues.morpho.name, "Morpho · supply, borrow, repay"],
  hooks: ["Uniswap Hook", "Uniswap · swaps with custom rules"],
  flash: ["Aave Flash Loan", "Aave · one block, no collateral"],
  aave: [venues.aave.name, "Aave V3 · supply ETH, borrow USDC"],
  kickoff: ["Kickoff Launchpad", "Kickoff · launch a Spark, trade the curve"],
  docs: ["Base Docs", "The short version of docs.base.org"],
};

export function Panel({ id }: { id: PanelId }) {
  const close = useGame((s) => s.close);
  const online = useGame((s) => !!s.real);
  const [tab, setTab] = useState(id);
  const [title, sub] = titles[tab];
  const group = GROUPS.find((g) => g.includes(id));
  const network = online && !REAL.includes(tab) ? "simulated · game credits" : chain.network;
  return (
    <div className={styles.modal} data-wide={id === "docs" || undefined}>
      <header>
        <div className={styles.who}>
          <img className={styles.avatar} src={logos[tab]} alt="" />
          <div>
          <h2>{title}</h2>
          <small>{tab === "docs" ? sub : `${sub} · ${network}`}</small>
          </div>
        </div>
        <button className={styles.close} onClick={close} aria-label="Close">
          ×
        </button>
      </header>
      {group && (
        <nav className={styles.tabs}>
          {group.map((t) => (
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
      {tab === "lend" && <Lend venue="morpho" />}
      {tab === "hooks" && <Hooks />}
      {tab === "flash" && <Flash />}
      {tab === "aave" && <Lend venue="aave" />}
      {tab === "kickoff" && <Kickoff />}
      {tab === "docs" && <Docs />}
    </div>
  );
}

/** Doc pages still needed by active quests, tracked quest first. */
function neededDocs(s: ReturnType<typeof useGame.getState>) {
  const order = [...quests].sort((a, b) => Number(b.id === s.tracked) - Number(a.id === s.tracked));
  const out: string[] = [];
  for (const q of order) {
    if (s.quests[q.id]?.status !== "active") continue;
    for (const o of q.objectives) if (o.match?.startsWith("doc:") && !s.quests[q.id].progress[o.id]?.length) out.push(o.match.slice(4));
  }
  return out;
}

const SECTIONS = [...new Set(docs.map((d) => d.section))];

function Docs() {
  const read = useGame((s) => s.docs);
  const needed = useGame(useShallow(neededDocs));
  const [id, setId] = useState(() => needed[0] ?? docs.find((d) => !read.includes(d.id))?.id ?? docs[0].id);
  const page = docById[id];
  return (
    <div className={styles.docs}>
      <nav>
        {SECTIONS.map((section) => (
          <div key={section}>
            <small>{section}</small>
            {docs
              .filter((d) => d.section === section)
              .map((d) => (
                <button key={d.id} data-active={d.id === id || undefined} data-needed={needed.includes(d.id) || undefined} onClick={() => setId(d.id)}>
                  {d.title}
                  {read.includes(d.id) && <span>✓</span>}
                </button>
              ))}
          </div>
        ))}
      </nav>
      <article key={id}>
        <h3>{page.title}</h3>
        <p>{page.summary}</p>
        <ul>
          {page.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        {page.code && (
          <pre>
            <code>{page.code}</code>
          </pre>
        )}
        <a href={page.url} target="_blank" rel="noreferrer">
          Full page on docs.base.org ↗
        </a>
        <QuickCheck id={id} />
      </article>
    </div>
  );
}

function QuickCheck({ id }: { id: string }) {
  const readDoc = useGame((s) => s.readDoc);
  const passed = useGame((s) => s.docs.includes(id));
  const { q, options, answer } = docById[id].check;
  const [pick, setPick] = useState<number | null>(null);
  return (
    <div className={styles.check} data-state={pick === null ? undefined : pick === answer ? "right" : "wrong"}>
      <b>Quick check{passed && " ✓"}</b>
      <span>{q}</span>
      <div className={styles.options}>
        {options.map((o, i) => (
          <button
            key={o}
            data-active={pick === i || undefined}
            onClick={() => {
              setPick(i);
              if (i === answer) readDoc(id);
            }}
          >
            <b>{o}</b>
          </button>
        ))}
      </div>
      {pick !== null && <small>{pick === answer ? "Correct — page mastered." : "Not quite. Skim the page and try again."}</small>}
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
  const wallet = useGame((s) => holdings(s).wallet);
  const swap = useGame((s) => s.swap);
  const [from, setFrom] = useState<Token>("ETH");
  const [to, setTo] = useState<Token>("AERO");
  const [amount, setAmount] = useState(() => (useGame.getState().real ? "0.002" : "0.1"));
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
  const wallet = useGame((s) => holdings(s).wallet);
  const lp = useGame((s) => holdings(s).lp);
  const add = useGame((s) => s.addLiquidity);
  const [amount, setAmount] = useState(() => (useGame.getState().real ? "0.001" : "0.05"));
  const eth = +amount || 0;
  const aero = chain.quote("ETH", "AERO", eth).amountOut / 0.997;
  const ok = eth > 0 && eth <= wallet.ETH && aero <= wallet.AERO;
  const maxEth = Math.min(wallet.ETH, (wallet.AERO * tokens.AERO.usd) / tokens.ETH.usd);
  return (
    <div className={styles.body}>
      <p className={styles.note}>Deposit ETH and AERO in equal value. You earn swap fees and can stake the LP for emissions.</p>
      <Amount value={amount} onChange={setAmount} token="ETH" max={maxEth} />
      <dl className={styles.facts}>
        <dt>Paired AERO</dt>
        <dd>
          {fmt(aero)} AERO <small>(you have {fmt(wallet.AERO)})</small>
        </dd>
        <dt>Your LP</dt>
        <dd>{fmt(lp)}</dd>
      </dl>
      <Submit label={aero > wallet.AERO ? "Not enough AERO — swap first" : "Add liquidity"} disabled={!ok} onClick={() => add(eth)} />
    </div>
  );
}

function Vote() {
  const wallet = useGame((s) => s.wallet);
  const votes = useGame((s) => s.votes);
  const vote = useGame((s) => s.vote);
  const [gauge, setGauge] = useState(GAUGES[0]);
  const [amount, setAmount] = useState(String(Math.floor(wallet.AERO / 2) || 50));
  const n = +amount || 0;
  const total = Object.values(votes).reduce((a, b) => a + b, 0);
  return (
    <div className={styles.body}>
      <p className={styles.note}>Lock AERO into veAERO and vote. Emissions next epoch flow to the gauges with the most votes.</p>
      <div className={styles.options}>
        {GAUGES.map((g) => (
          <button key={g} data-active={g === gauge || undefined} onClick={() => setGauge(g)}>
            <b>{g}</b>
            <small>{total ? `${Math.round(((votes[g] ?? 0) / total) * 100)}% of your votes` : "no votes yet"}</small>
          </button>
        ))}
      </div>
      <Amount value={amount} onChange={setAmount} token="AERO" max={wallet.AERO} />
      <Submit label={n > wallet.AERO ? "Not enough AERO" : `Lock & vote for ${gauge}`} disabled={n <= 0 || n > wallet.AERO} onClick={() => vote(gauge, n)} />
    </div>
  );
}

function Launch() {
  const virt = useGame((s) => s.wallet.VIRTUAL);
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
          {LAUNCH_COST} VIRTUAL <small>(you have {fmt(virt)})</small>
        </dd>
        {agents.length > 0 && (
          <>
            <dt>Your agents</dt>
            <dd>{agents.map((a) => `${a.name} $${a.ticker}`).join(", ")}</dd>
          </>
        )}
      </dl>
      <Submit label={virt < LAUNCH_COST ? "Not enough VIRTUAL" : "Launch agent"} disabled={virt < LAUNCH_COST || !name.trim()} onClick={() => (launch(name, persona), setName(""))} />
    </div>
  );
}

function Kickoff() {
  const eth = useGame((s) => holdings(s).wallet.ETH);
  const real = useGame((s) => !!s.real);
  const sparks = useGame((s) => s.sparks);
  const launch = useGame((s) => s.launchSpark);
  const trade = useGame((s) => s.tradeSpark);
  const [mode, setMode] = useState<"launch" | Side>(sparks.length ? "buy" : "launch");
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [picked, setPicked] = useState(sparks[0]?.token ?? "");
  const [amount, setAmount] = useState(real ? "0.001" : "0.05");
  const [quote, setQuote] = useState(0);
  const spark = sparks.find((s) => s.token === picked) ?? sparks[0];
  const n = +amount || 0;
  const symbol = (ticker || name).replace(/[^a-z0-9]/gi, "").slice(0, ticker ? 10 : 6).toUpperCase();

  useEffect(() => {
    if (mode === "launch" || !spark || !(n > 0)) return void setQuote(0);
    let live = true;
    chain.quoteSpark(spark, mode, n).then((q) => live && setQuote(q), () => live && setQuote(0));
    return () => {
      live = false;
    };
  }, [mode, spark, n]);

  const pick = (m: typeof mode) => {
    setMode(m);
    setAmount(m === "sell" && spark ? String(Math.floor(spark.held / 2)) : real ? "0.001" : "0.05");
  };
  const max = mode === "sell" ? (spark?.held ?? 0) : eth;
  const ok = mode === "launch" ? !!name.trim() && !!symbol && n >= 0 && n <= eth : !!spark && n > 0 && n <= max;

  return (
    <div className={styles.body}>
      <p className={styles.note}>Spark tokens start on a bonding curve: every buy pushes the price up. At 10 ETH market cap they graduate to Aerodrome with locked liquidity.</p>
      <nav className={styles.tabs}>
        {(["launch", "buy", "sell"] as const).map((m) => (
          <button key={m} data-active={m === mode || undefined} disabled={m !== "launch" && !sparks.length} onClick={() => pick(m)}>
            {m}
          </button>
        ))}
      </nav>
      {mode === "launch" ? (
        <>
          <input className={styles.text} value={name} onChange={(e) => setName(e.target.value.slice(0, 24))} placeholder="Token name, e.g. Based Rocket" autoFocus />
          <input className={styles.text} value={ticker} onChange={(e) => setTicker(e.target.value.slice(0, 10))} placeholder={`Ticker${symbol ? ` · $${symbol}` : ", e.g. ROCKET"}`} />
          <Amount value={amount} onChange={setAmount} token="ETH" max={eth} />
          <dl className={styles.facts}>
            <dt>Dev buy</dt>
            <dd>{n > 0 ? `${fmt(n)} ETH in the launch tx` : "none — launch only costs gas"}</dd>
            <dt>Supply</dt>
            <dd>1T · trade fees reflect to holders and pay the creator</dd>
          </dl>
        </>
      ) : (
        <>
          <select className={styles.select} value={spark?.token} onChange={(e) => setPicked(e.target.value)}>
            {sparks.map((s) => (
              <option key={s.token} value={s.token}>
                ${s.ticker} · {s.name}
              </option>
            ))}
          </select>
          <Amount value={amount} onChange={setAmount} token={mode === "buy" ? "ETH" : `$${spark?.ticker}`} max={max} />
          <dl className={styles.facts}>
            <dt>You receive</dt>
            <dd>{mode === "buy" ? `~${fmt(quote)} $${spark?.ticker}` : `~${fmt(quote)} ETH`}</dd>
            <dt>You hold</dt>
            <dd>
              {fmt(spark?.held ?? 0)} ${spark?.ticker}
            </dd>
            <dt>Curve</dt>
            <dd>{fmt(spark?.raised ?? 0)} ETH raised</dd>
          </dl>
        </>
      )}
      <Submit
        label={mode === "launch" ? (n > eth ? "Not enough ETH" : symbol ? `Kick off $${symbol}` : "Name your token") : n > max ? `Not enough ${mode === "buy" ? "ETH" : `$${spark?.ticker}`}` : mode === "buy" ? "Buy on the curve" : "Sell to the curve"}
        disabled={!ok}
        onClick={() => {
          if (mode === "launch") {
            launch(name, symbol, n).then(() => {
              const fresh = useGame.getState().sparks[0];
              if (fresh?.name === name.trim()) (setPicked(fresh.token), setName(""), setTicker(""), setMode("buy"));
            });
          } else if (spark) trade(spark.token, mode, n);
        }}
      />
    </div>
  );
}

function Lend({ venue }: { venue: Venue }) {
  const wallet = useGame((s) => holdings(s).wallet);
  const vault = useGame((s) => holdings(s).vaults[venue]);
  const real = useGame((s) => !!s.real);
  const supply = useGame((s) => s.supply);
  const borrow = useGame((s) => s.borrow);
  const repay = useGame((s) => s.repay);
  const { lt } = venues[venue];
  const [mode, setMode] = useState<"supply" | "borrow" | "repay">(vault.collateral > 0 ? (vault.debt > 0 ? "repay" : "borrow") : "supply");
  const [amount, setAmount] = useState(mode === "supply" ? (real ? "0.002" : "0.2") : real ? "2" : "200");
  const n = +amount || 0;
  const maxBorrow = Math.max(0, (vault.collateral * tokens.ETH.usd * lt) / 1.05 - vault.debt);
  const projected = healthFactor(vault, mode === "borrow" ? n : mode === "repay" ? -Math.min(n, vault.debt) : 0, lt);
  const after = mode === "supply" ? healthFactor({ ...vault, collateral: vault.collateral + n }, 0, lt) : projected;
  const ok = mode === "supply" ? n > 0 && n <= wallet.ETH : mode === "borrow" ? n > 0 && healthFactor(vault, n, lt) >= 1.05 : n > 0 && vault.debt > 0 && wallet.USDC > 0;
  const pick = (m: typeof mode) => {
    setMode(m);
    setAmount(m === "supply" ? (real ? "0.002" : "0.2") : m === "borrow" ? String(+(maxBorrow / 2).toFixed(2)) : String(+Math.min(vault.debt, wallet.USDC).toFixed(2)));
  };
  return (
    <div className={styles.body}>
      <dl className={styles.facts}>
        <dt>Collateral</dt>
        <dd>{fmt(vault.collateral)} ETH</dd>
        <dt>Debt</dt>
        <dd>{fmt(vault.debt)} USDC</dd>
        <dt>Liquidation LTV</dt>
        <dd>{lt * 100}%</dd>
      </dl>
      <Health value={healthFactor(vault, 0, lt)} next={after} />
      <nav className={styles.tabs}>
        {(["supply", "borrow", "repay"] as const).map((m) => (
          <button key={m} data-active={m === mode || undefined} onClick={() => pick(m)}>
            {m}
          </button>
        ))}
      </nav>
      <Amount value={amount} onChange={setAmount} token={mode === "supply" ? "ETH" : "USDC"} max={mode === "supply" ? wallet.ETH : mode === "borrow" ? maxBorrow : Math.min(vault.debt, wallet.USDC)} />
      <Submit
        label={mode === "supply" ? "Supply ETH" : mode === "borrow" ? (vault.collateral ? "Borrow USDC" : "Supply collateral first") : vault.debt ? "Repay" : "Nothing to repay"}
        disabled={!ok}
        onClick={() => (mode === "supply" ? supply(venue, n) : mode === "borrow" ? borrow(venue, n) : repay(venue, n))}
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
  const [to, setTo] = useState<Token>("AERO");
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

const ROUTE = ["Buy AERO on Aerodrome", "Sell AERO for USDC on Uniswap", "Buy ETH with USDC on Morpho"];
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
      flashLoan(["Aerodrome", "Uniswap", "Morpho"]);
    }
  };

  return (
    <div className={styles.body}>
      <p className={styles.note}>
        Borrow 1,000 ETH with no collateral, run the route in order — Aerodrome → Uniswap → Morpho — and repay before the {BLOCK}s block closes.
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
