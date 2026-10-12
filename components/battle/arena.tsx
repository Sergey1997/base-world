"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { formatEther, parseEther } from "viem";
import { fmt, tokens } from "@/components/world/chain";
import { MAX_TX_USD } from "@/components/world/onchain";
import { holdings, useGame } from "@/components/world/store";
import styles from "@/components/world/world.module.css";
import { type Beat, CLASS_IDS, classes, type Duel, GCD, LIMIT, type SideId } from "./engine";
import { ESCROW, FEE, MAX_STAKE, MIN_STAKE } from "./escrow";
import { pvp } from "./link";
import { Scene } from "./scene";
import { current, fightTime, refundable, useBattle } from "./store";
import css from "./battle.module.css";

const GAS = 0.0003;

export function Arena() {
  const mode = useBattle((s) => s.mode);
  const status = useBattle((s) => s.duel?.status);
  useEffect(() => void useBattle.getState().resume(), []);
  const fighting = mode === "bot" || status === "live" || status === "done";
  return fighting ? <Fight /> : <Lobby />;
}

function Lobby() {
  const close = useGame((s) => s.close);
  const duel = useBattle((s) => s.duel);
  const note = useBattle((s) => s.note);
  const error = useBattle((s) => s.error);
  return (
    <div className={styles.modal} data-wide>
      <header>
        <div className={styles.who}>
          <div className={css.badge} aria-hidden>
            ⚔
          </div>
          <div>
            <h2>Battleground</h2>
            <small>1v1 realtime duels · stake ETH or spar a bot</small>
          </div>
        </div>
        <button className={styles.close} onClick={close} aria-label="Close">
          ×
        </button>
      </header>
      {note && <p className={css.note}>{note}</p>}
      {error && <p className={css.error}>{error}</p>}
      {duel?.status === "queued" ? <Queue /> : duel?.status === "funding" ? <Funding /> : duel?.status === "cancelled" ? <Cancelled /> : <Setup />}
    </div>
  );
}

function Setup() {
  const cls = useBattle((s) => s.cls);
  const pick = useBattle((s) => s.pick);
  const stake = useBattle((s) => s.stake);
  const setStake = useBattle((s) => s.setStake);
  const busy = useBattle((s) => s.busy);
  const fightBot = useBattle((s) => s.fightBot);
  const findOpponent = useBattle((s) => s.findOpponent);
  const eth = useGame((s) => holdings(s).wallet.ETH);
  const online = !!pvp;
  const n = +stake || 0;
  let wei = 0n;
  try {
    wei = parseEther(stake || "0");
  } catch {}
  const why =
    wei < MIN_STAKE
      ? "Minimum stake is 0.00001 ETH"
      : wei > MAX_STAKE
        ? "Maximum stake is 0.02 ETH"
        : n * tokens.ETH.usd > MAX_TX_USD
          ? `Over the $${MAX_TX_USD} limit`
          : n + GAS > eth
            ? "Not enough ETH (keep ~0.0003 for gas)"
            : null;
  return (
    <>
      <div className={css.classes}>
        {CLASS_IDS.map((id) => {
          const c = classes[id];
          return (
            <button key={id} className={css.class} data-active={id === cls || undefined} style={{ "--c": c.color } as React.CSSProperties} onClick={() => pick(id)}>
              <b>{c.name}</b>
              <span className={css.stats}>
                {c.hp} HP · {c.mana} mana · +{c.regen}/s
              </span>
              <small>{c.blurb}</small>
              <ol>
                {c.skills.map((s, i) => (
                  <li key={s.id} title={s.blurb}>
                    <kbd>{i + 1}</kbd> {s.name}
                    <em>{s.cast ? `${s.cast / 1000}s cast` : "instant"}</em>
                  </li>
                ))}
              </ol>
            </button>
          );
        })}
      </div>
      <p className={css.how}>
        Skills fire on <kbd>1</kbd>–<kbd>4</kbd>. Casts show a bar: interrupt them, block them, dodge them. Every press is timed by the server, so a fight can't be faked.
      </p>
      <div className={css.modes}>
        <div className={css.mode}>
          <b>Staked duel</b>
          {!online ? (
            <small>Play online with a wallet to duel other players for ETH.</small>
          ) : !ESCROW ? (
            <small>Staked duels open as soon as the escrow contract is live on Base.</small>
          ) : (
            <>
              <label className={css.stake}>
                <input value={stake} onChange={(e) => setStake(e.target.value)} inputMode="decimal" aria-label="Stake in ETH" />
                <span>ETH</span>
              </label>
              <small>
                Both stake {fmt(n)} ETH. Winner gets {fmt(n * 2 * (1 - FEE))} ETH ({FEE * 100}% fee). {fmt(eth)} ETH in wallet.
              </small>
              <button className={styles.primary} disabled={!!busy || !!why} onClick={() => void findOpponent()}>
                {busy ?? why ?? "Find opponent"}
              </button>
            </>
          )}
        </div>
        <div className={css.mode}>
          <b>Sparring</b>
          <small>A bot with human-like reactions picks a random class. No stake, +30 XP for a win.</small>
          <button className={styles.secondary} onClick={() => fightBot()}>
            Fight a bot
          </button>
        </div>
      </div>
    </>
  );
}

function useClock(ms = 250) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function Queue() {
  const duel = useBattle((s) => s.duel)!;
  const leave = useBattle((s) => s.leaveQueue);
  const fightBot = useBattle((s) => s.fightBot);
  const [since] = useState(Date.now);
  const now = useClock();
  return (
    <div className={css.wait}>
      <div className={css.spinner} />
      <b>Looking for an opponent at {formatEther(BigInt(duel.stake))} ETH</b>
      <small>{clock(now - since)} · if nobody shows up in 2 minutes you'll spar a bot instead</small>
      <div className={styles.row}>
        <button className={styles.secondary} onClick={() => void leave()}>
          Leave queue
        </button>
        <button
          className={styles.secondary}
          onClick={() => {
            void leave().then(() => fightBot());
          }}
        >
          Spar a bot now
        </button>
      </div>
    </div>
  );
}

function Funding() {
  const duel = useBattle((s) => s.duel)!;
  const chainDuel = useBattle((s) => s.chainDuel);
  const busy = useBattle((s) => s.busy);
  const stakeIn = useBattle((s) => s.stakeIn);
  const now = useClock();
  const foe = (1 - duel.side) as SideId;
  const paid = chainDuel ? [chainDuel.paidA, chainDuel.paidB] : [false, false];
  const eth = formatEther(BigInt(duel.stake));
  return (
    <div className={css.wait}>
      <b>
        Opponent found: {duel.names[foe] ?? "Player"} · {classes[duel.classes[foe] ?? "knight"].name}
      </b>
      <div className={css.paid}>
        <span data-ok={paid[duel.side] || undefined}>You {paid[duel.side] ? "staked ✓" : "haven't staked"}</span>
        <span data-ok={paid[foe] || undefined}>Opponent {paid[foe] ? "staked ✓" : "staking…"}</span>
      </div>
      <small>Both stakes must land in {clock((duel.deadline ?? 0) - now)}, or each can take theirs back.</small>
      {!paid[duel.side] && (
        <button className={styles.primary} disabled={!!busy} onClick={() => void stakeIn()}>
          {busy ?? `Stake ${eth} ETH`}
        </button>
      )}
      {paid[duel.side] && <div className={css.spinner} />}
    </div>
  );
}

function Cancelled() {
  const duel = useBattle((s) => s.duel)!;
  const chainDuel = useBattle((s) => s.chainDuel);
  const busy = useBattle((s) => s.busy);
  const refund = useBattle((s) => s.refund);
  const exit = useBattle((s) => s.exit);
  useClock(1000);
  const mine = chainDuel && (duel.side === 0 ? chainDuel.paidA : chainDuel.paidB);
  return (
    <div className={css.wait}>
      <b>The duel didn&apos;t start: both stakes didn&apos;t land in time.</b>
      {mine && !chainDuel.closed ? (
        <>
          <small>Your {formatEther(BigInt(duel.stake))} ETH is safe in the escrow.</small>
          <button className={styles.primary} disabled={!!busy || !refundable(duel, chainDuel)} onClick={() => void refund()}>
            {busy ?? (refundable(duel, chainDuel) ? "Refund my stake" : "Refund opens in a few seconds…")}
          </button>
        </>
      ) : (
        <small>{mine ? "Your stake was refunded." : "No ETH was moved."}</small>
      )}
      <button className={styles.secondary} onClick={exit}>
        Back
      </button>
    </div>
  );
}

/* ---------- the fight ---------- */

function Fight() {
  const press = useBattle((s) => s.press);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA") return;
      e.stopImmediatePropagation();
      const n = ["Digit1", "Digit2", "Digit3", "Digit4"].indexOf(e.code);
      if (n >= 0 && !e.repeat) {
        e.preventDefault();
        press(n);
      }
    };
    window.addEventListener("keydown", down, true);
    return () => window.removeEventListener("keydown", down, true);
  }, [press]);
  return (
    <div className={css.fight}>
      <Canvas dpr={[1, 1.5]} camera={{ position: [0, 3.2, 9.6], fov: 42 }} gl={{ antialias: true }}>
        <Scene />
      </Canvas>
      <FightHud />
    </div>
  );
}

function useEveryFrame() {
  const [, tick] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      tick((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}

function FightHud() {
  useEveryFrame();
  const s = useBattle();
  const duel = current(s);
  const t = fightTime(s);
  const me = s.side;
  const foe = (1 - me) as SideId;
  return (
    <div className={css.hud}>
      <div className={css.top}>
        <Plate duel={duel} side={me} name={s.names[me]} t={t} />
        <div className={css.timer}>{t < 0 ? "" : clock(LIMIT - t)}</div>
        <Plate duel={duel} side={foe} name={s.names[foe]} t={t} right />
      </div>
      {s.mode === "bot" && duel.winner === null && (
        <button className={css.leave} onClick={s.exit}>
          Leave
        </button>
      )}
      <Floats beats={duel.beats} t={t} me={me} duel={duel} />
      {t < 0 && <div className={css.count}>{Math.ceil(-t / 1000)}</div>}
      {t >= 0 && t < 700 && <div className={css.count}>FIGHT</div>}
      <Skills duel={duel} t={t} />
      <End duel={duel} />
    </div>
  );
}

function Plate({ duel, side, name, t, right }: { duel: Duel; side: SideId; name: string; t: number; right?: boolean }) {
  const f = duel.f[side];
  const c = classes[f.cls];
  const shield = t <= f.absorb.until ? f.absorb.amount : 0;
  const cast = f.casting;
  const castSkill = cast && c.skills.find((k) => k.id === cast.skill);
  return (
    <div className={css.plate} data-right={right || undefined} style={{ "--c": c.color } as React.CSSProperties}>
      <div className={css.name}>
        <b>{name}</b>
        <span>{c.name}</span>
        {t <= f.reduce.until && <i title="Shield Wall">🛡</i>}
        {shield > 0 && <i title="Ice Barrier">❄ {Math.round(shield)}</i>}
        {t <= f.dodge && <i title="Evade">💨</i>}
      </div>
      <div className={css.hp}>
        <div style={{ width: `${(f.hp / c.hp) * 100}%` }} />
        {shield > 0 && <div className={css.absorb} style={{ width: `${Math.min(1, shield / c.hp) * 100}%` }} />}
        <span>
          {Math.ceil(f.hp)} / {c.hp}
        </span>
      </div>
      <div className={css.mana}>
        <div style={{ width: `${(f.mana / c.mana) * 100}%` }} />
      </div>
      <div className={css.cast} data-on={cast ? true : undefined}>
        {cast && castSkill && (
          <>
            <div style={{ width: `${Math.min(1, (t - cast.start) / (cast.end - cast.start)) * 100}%` }} />
            <span>{castSkill.name}</span>
          </>
        )}
      </div>
    </div>
  );
}

const FLOAT_MS = 1100;

function Floats({ beats, t, me, duel }: { beats: Beat[]; t: number; me: SideId; duel: Duel }) {
  const recent = [];
  for (let i = beats.length - 1; i >= 0 && t - beats[i].t < FLOAT_MS; i--) if (beats[i].kind !== "start") recent.push(beats[i]);
  return (
    <>
      {recent.map((b, i) => {
        const target = b.kind === "cut" ? b.by : ((1 - b.by) as SideId);
        const skill = classes[duel.f[b.by].cls].skills.find((k) => k.id === b.skill);
        const text = b.kind === "miss" ? "Dodged" : b.kind === "cut" ? `${skill?.name ?? ""} interrupted` : b.dmg ? `-${Math.round(b.dmg)}` : b.absorbed ? "Absorbed" : null;
        if (!text) return null;
        return (
          <div key={`${b.t}:${b.by}:${b.skill}:${b.kind}`} className={css.float} data-side={target === me ? "me" : "foe"} data-kind={b.kind} data-big={(b.dmg ?? 0) >= 25 || undefined} style={{ marginLeft: `${((b.t / 7) % 5) * 22 - 44}px` }}>
            {text}
          </div>
        );
      })}
    </>
  );
}

function Skills({ duel, t }: { duel: Duel; t: number }) {
  const side = useBattle((s) => s.side);
  const press = useBattle((s) => s.press);
  const f = duel.f[side];
  return (
    <div className={css.skills}>
      {classes[f.cls].skills.map((k, i) => {
        const ready = Math.max(f.ready[k.id] ?? 0, k.gcd ? f.gcd : 0);
        const left = Math.max(0, ready - t);
        const span = left > 0 && (f.ready[k.id] ?? 0) > (k.gcd ? f.gcd : 0) ? k.cd || GCD : GCD;
        const why = t < 0 ? "wait" : duel.check(side, k.id, t);
        return (
          <button key={k.id} className={css.skill} disabled={!!why} onClick={() => press(i)} title={`${k.name}: ${k.blurb}`} style={{ "--p": left / span } as React.CSSProperties}>
            <kbd>{i + 1}</kbd>
            <b>{k.name}</b>
            <small>
              {k.mana ? `${k.mana} mana` : "free"}
              {k.cast ? ` · ${k.cast / 1000}s` : ""}
            </small>
            {left > 0 && <span className={css.cd}>{(left / 1000).toFixed(1)}</span>}
            {why === "not enough mana" && <span className={css.oom} />}
          </button>
        );
      })}
    </div>
  );
}

function End({ duel }: { duel: Duel }) {
  const s = useBattle();
  const winDuel = useGame((g) => g.winDuel);
  const rewarded = useRef(false);
  const server = s.duel;
  const pvpDone = s.mode === "pvp" && server?.status === "done";
  const outcome = s.mode === "bot" ? duel.winner : pvpDone ? (server!.winner === -1 ? "draw" : server!.winner) : null;
  useEffect(() => {
    if (outcome === null) rewarded.current = false;
    if (outcome === null || outcome !== s.side || rewarded.current) return;
    rewarded.current = true;
    winDuel(s.mode === "bot" ? 30 : 80, s.mode === "bot" ? "Beat the sparring bot" : "Beat a player in a staked duel");
  }, [outcome, s.side, s.mode, winDuel]);
  if (duel.winner === null && outcome === null) return null;
  if (outcome === null)
    return (
      <div className={css.end}>
        <div className={css.endCard}>
          <div className={css.spinner} />
          <b>Confirming the result…</b>
          <small>The server replays every timed press to decide the winner.</small>
        </div>
      </div>
    );
  const won = outcome === s.side;
  const stake = server ? +formatEther(BigInt(server.stake)) : 0;
  const closed = s.chainDuel?.closed;
  const payable = s.mode === "pvp" && server?.result && (won || outcome === "draw") && !closed;
  return (
    <div className={css.end}>
      <div className={css.endCard} data-tone={outcome === "draw" ? "draw" : won ? "win" : "loss"}>
        <h2>{outcome === "draw" ? "Draw" : won ? "Victory" : "Defeat"}</h2>
        {s.mode === "pvp" ? (
          <small>
            {outcome === "draw"
              ? `Both ${fmt(stake)} ETH stakes go back.`
              : won
                ? `You won ${fmt(stake * 2 * (1 - FEE))} ETH.`
                : `Your ${fmt(stake)} ETH stake went to the winner.`}
            {closed && (won || outcome === "draw") ? " Paid out ✓" : ""}
          </small>
        ) : (
          <small>{won ? "+30 XP" : "The bot got you this time."}</small>
        )}
        {s.error && <p className={css.error}>{s.error}</p>}
        <div className={styles.row}>
          {payable && (
            <button className={styles.primary} disabled={!!s.busy} onClick={() => void s.claim()}>
              {s.busy ?? (won ? "Claim winnings" : "Refund stakes")}
            </button>
          )}
          {s.mode === "bot" && (
            <button className={styles.primary} onClick={() => s.fightBot()}>
              Rematch
            </button>
          )}
          <button className={styles.secondary} onClick={s.exit} disabled={!!s.busy}>
            {payable ? "Later" : "Back"}
          </button>
        </div>
      </div>
    </div>
  );
}
