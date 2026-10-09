"use client";

import { useEffect, useRef, useState } from "react";
import { bankerPrompts, suggestedPrompts } from "./agents";
import { fmt, type Token, tokens } from "./chain";
import { districts, npcs, palette, RACE, roads, stations } from "./config";
import { Panel } from "./panels";
import { levelFor, questById, quests } from "./quests";
import { districtName, live, rewardText, useGame, waypoint } from "./store";
import styles from "./world.module.css";

/** Runs `cb` every animation frame; for HUD readouts that follow `live` without re-rendering. */
function useTicker(cb: () => void) {
  const fn = useRef(cb);
  fn.current = cb;
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      fn.current();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}

const completedAt: Record<string, number> = {};
useGame.subscribe((s, prev) => {
  for (const id in s.quests) if (s.quests[id].status === "done" && prev.quests[id]?.status !== "done") completedAt[id] = performance.now();
});

export function Hud() {
  const started = useGame((s) => s.started);
  const dialog = useGame((s) => s.dialog);
  const panel = useGame((s) => s.panel);
  const logOpen = useGame((s) => s.logOpen);
  if (!started) return <Intro />;
  return (
    <div className={styles.hud}>
      <Status />
      <Minimap />
      <Tracker />
      <RaceTimer />
      <Speedometer />
      <Prompt />
      <Toasts />
      <div className={styles.help}>WASD move · Shift boost · Q dash · Space jump ×2 · E interact · J quests · drag to look</div>
      {dialog && <Dialog key={dialog} id={dialog} />}
      {panel && <Panel key={panel} id={panel} />}
      {logOpen && <QuestLog />}
    </div>
  );
}

function Intro() {
  const start = useGame((s) => s.start);
  const xp = useGame((s) => s.xp);
  return (
    <div className={styles.intro}>
      <div className={styles.introCard}>
        <h1>BASE WORLD</h1>
        <p>A fast, stylized open world for the Base ecosystem. Explore protocol districts, take on quests and talk to AI agents — every onchain action is simulated.</p>
        <div className={styles.controls}>
          {[
            ["WASD", "Move"],
            ["Shift", "Boost (hoverboard)"],
            ["Q", "Dash"],
            ["Space", "Jump / double jump"],
            ["E", "Talk · use terminals"],
            ["J / Tab", "Quest log"],
            ["Drag · Wheel", "Look · zoom"],
            ["Esc", "Close"],
          ].map(([k, v]) => (
            <div key={k}>
              <kbd>{k}</kbd>
              <span>{v}</span>
            </div>
          ))}
        </div>
        <button className={styles.primary} onClick={start} autoFocus>
          {xp > 0 ? "Continue" : "Play"}
        </button>
      </div>
    </div>
  );
}

function Status() {
  const xp = useGame((s) => s.xp);
  const wallet = useGame((s) => s.wallet);
  const lp = useGame((s) => s.lp);
  const veSky = useGame((s) => s.veSky);
  const district = useGame((s) => s.district);
  const { level, progress } = levelFor(xp);
  return (
    <div className={styles.status}>
      <div className={styles.level}>
        <div className={styles.badge}>{level}</div>
        <div>
          <div className={styles.levelLabel}>
            Level {level} · {xp} XP
          </div>
          <div className={styles.bar}>
            <i style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      </div>
      <div className={styles.wallet}>
        {(Object.keys(wallet) as Token[]).map((t) => (
          <span key={t} style={{ color: tokens[t].color }}>
            {fmt(wallet[t])} <small>{t}</small>
          </span>
        ))}
        {lp > 0 && (
          <span>
            {fmt(lp)} <small>LP</small>
          </span>
        )}
        {veSky > 0 && (
          <span>
            {fmt(veSky)} <small>veSKY</small>
          </span>
        )}
      </div>
      {district && <div className={styles.district}>{districtName(district)}</div>}
    </div>
  );
}

const MAP = 200;
const MAP_RANGE = 220;

function Minimap() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useTicker(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const s = useGame.getState();
    const dpr = window.devicePixelRatio || 1;
    if (ctx.canvas.width !== MAP * dpr) ctx.canvas.width = ctx.canvas.height = MAP * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const k = MAP / 2 / MAP_RANGE;
    const c = MAP / 2;
    const px = live.pos.x;
    const pz = live.pos.z;
    const to = (x: number, z: number) => [c + (x - px) * k, c + (z - pz) * k] as const;

    ctx.clearRect(0, 0, MAP, MAP);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, c - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "rgba(5, 11, 36, 0.82)";
    ctx.fillRect(0, 0, MAP, MAP);

    ctx.strokeStyle = "rgba(94, 231, 255, 0.35)";
    ctx.lineWidth = 14 * k;
    ctx.lineCap = "round";
    for (const [ax, az, bx, bz] of roads) {
      ctx.beginPath();
      ctx.moveTo(...to(ax, az));
      ctx.lineTo(...to(bx, bz));
      ctx.stroke();
    }
    for (const d of districts) {
      const [x, y] = to(...d.center);
      ctx.beginPath();
      ctx.arc(x, y, d.radius * k, 0, Math.PI * 2);
      ctx.fillStyle = `${d.color}33`;
      ctx.fill();
      ctx.strokeStyle = `${d.color}aa`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    for (const st of stations) {
      const [x, y] = to(st.position[0], st.position[2]);
      ctx.fillStyle = st.color;
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    const givers = new Set(quests.filter((q) => s.quests[q.id].status === "available").map((q) => q.giver));
    for (const n of npcs) {
      const [x, y] = to(n.position[0], n.position[2]);
      const offer = givers.has(n.id);
      ctx.beginPath();
      ctx.arc(x, y, offer ? 3.5 : 2, 0, Math.PI * 2);
      ctx.fillStyle = offer ? palette.gold : "#dce8ff";
      ctx.fill();
    }

    const wp = waypoint(s, live.pos);
    if (wp) {
      let [x, y] = to(wp.pos[0], wp.pos[2]);
      const dx = x - c;
      const dy = y - c;
      const r = Math.hypot(dx, dy);
      if (r > c - 10) [x, y] = [c + (dx / r) * (c - 10), c + (dy / r) * (c - 10)];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = palette.gold;
      ctx.strokeStyle = "#050b24";
      ctx.lineWidth = 1.5;
      ctx.fillRect(-4.5, -4.5, 9, 9);
      ctx.strokeRect(-4.5, -4.5, 9, 9);
      ctx.restore();
    }

    ctx.translate(c, c);
    ctx.rotate(-live.heading + Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5.5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5.5, 6);
    ctx.closePath();
    ctx.fillStyle = palette.cyan;
    ctx.fill();
    ctx.restore();
  });
  return (
    <div className={styles.minimap}>
      <canvas ref={canvas} style={{ width: MAP, height: MAP }} />
      <span className={styles.north}>N</span>
    </div>
  );
}

function Tracker() {
  const tracked = useGame((s) => s.tracked);
  const state = useGame((s) => (s.tracked ? s.quests[s.tracked] : null));
  if (!tracked || !state || state.status !== "active") return null;
  const q = questById[tracked];
  return (
    <div className={styles.tracker}>
      <div className={styles.kind}>{q.kind}</div>
      <h3>{q.title}</h3>
      <ul>
        {q.objectives.map((o) => {
          const n = state.progress[o.id]?.length ?? 0;
          const need = o.count ?? 1;
          return (
            <li key={o.id} data-done={n >= need || undefined}>
              {o.label}
              {need > 1 && ` ${n}/${need}`}
            </li>
          );
        })}
      </ul>
      <small>J — quest log</small>
    </div>
  );
}

function RaceTimer() {
  const running = useGame((s) => s.race.running);
  const next = useGame((s) => s.race.next);
  const best = useGame((s) => s.bestRace);
  const time = useRef<HTMLSpanElement>(null);
  useTicker(() => {
    const { race } = useGame.getState();
    if (!time.current || !race.running) return;
    const left = RACE.limit - (performance.now() - race.start) / 1000;
    time.current.textContent = Math.max(0, left).toFixed(2);
    time.current.dataset.low = left < 5 ? "1" : "";
  });
  if (!running) return null;
  return (
    <div className={styles.race}>
      <span ref={time} className={styles.raceTime} />
      <small>
        Ring {Math.min(next + 1, RACE.rings.length)}/{RACE.rings.length}
        {best !== null && ` · best ${best.toFixed(2)}s`}
      </small>
    </div>
  );
}

function Speedometer() {
  const speed = useRef<HTMLSpanElement>(null);
  const dash = useRef<HTMLElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useTicker(() => {
    if (!speed.current || !dash.current || !root.current) return;
    speed.current.textContent = String(Math.round(live.speed * 3.6));
    dash.current.style.width = `${live.dashCharge * 100}%`;
    root.current.dataset.boost = live.boosting ? "1" : "";
  });
  return (
    <div ref={root} className={styles.speed}>
      <span ref={speed}>0</span>
      <small>km/h</small>
      <div className={styles.dash}>
        <i ref={dash} />
      </div>
      <small>Dash</small>
    </div>
  );
}

function Prompt() {
  const nearby = useGame((s) => s.nearby);
  const busy = useGame((s) => !!s.dialog || !!s.panel || s.logOpen);
  if (!nearby || busy) return null;
  const npc = npcs.find((n) => n.id === nearby);
  const station = stations.find((s) => s.id === nearby);
  const label = npc ? `Talk to ${npc.name}` : `Use ${station?.label}`;
  return (
    <div className={styles.prompt}>
      <kbd>E</kbd> {label}
    </div>
  );
}

function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismiss);
  return (
    <div className={styles.toasts}>
      {toasts.map((t) => (
        <div key={t.id} className={styles.toast} data-tone={t.tone} onClick={() => dismiss(t.id)}>
          <b>{t.title}</b>
          {t.body && <span>{t.body}</span>}
        </div>
      ))}
    </div>
  );
}

function Dialog({ id }: { id: string }) {
  const npc = npcs.find((n) => n.id === id)!;
  const status = useGame((s) => s.quests);
  const accept = useGame((s) => s.accept);
  const close = useGame((s) => s.close);
  const [justDone] = useState(() =>
    quests.find((q) => performance.now() - (completedAt[q.id] ?? -1e9) < 1500 && q.objectives.some((o) => o.event === "talk" && o.match === id)),
  );
  const [greeting] = useState(() => npc.greeting[Math.floor(Math.random() * npc.greeting.length)]);
  const mine = quests.filter((q) => q.giver === id);
  const offer = mine.find((q) => status[q.id].status === "available");
  const active = mine.find((q) => status[q.id].status === "active" && q.id !== justDone?.id);

  const lines = justDone?.giver === id ? [justDone.done] : [];
  if (offer) lines.push(offer.offer);
  else if (active) lines.push(active.hint);
  if (!lines.length && npc.kind === "human") lines.push(greeting);

  return (
    <div className={styles.modal} data-side={npc.kind === "agent" ? "chat" : undefined}>
      <header>
        <div>
          <h2 style={{ color: npc.color }}>{npc.name}</h2>
          <small>{npc.title}</small>
        </div>
        <button className={styles.close} onClick={close} aria-label="Close">
          ×
        </button>
      </header>
      {lines.map((l, i) => (
        <p key={i} className={styles.line}>
          {l}
        </p>
      ))}
      {justDone && <div className={styles.reward}>{rewardText(justDone.reward)}</div>}
      {offer && (
        <div className={styles.offer}>
          <div>
            <b>{offer.title}</b> · {offer.kind}
            <small>Reward: {rewardText(offer.reward)}</small>
          </div>
          <button className={styles.primary} onClick={() => accept(offer.id)}>
            Accept
          </button>
        </div>
      )}
      {npc.kind === "agent" && <Chat id={id} greeting={npc.greeting[0]} prompts={npc.persona === "banker" ? bankerPrompts : suggestedPrompts} />}
      {npc.kind === "human" && !offer && (
        <button className={styles.secondary} onClick={close}>
          See you around
        </button>
      )}
    </div>
  );
}

function Chat({ id, greeting, prompts }: { id: string; greeting: string; prompts: string[] }) {
  const messages = useGame((s) => s.chats[id]);
  const chat = useGame((s) => s.chat);
  const pending = useGame((s) => s.pending);
  const [text, setText] = useState("");
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [messages]);
  const send = (t: string) => {
    if (!t.trim()) return;
    chat(id, t.trim());
    setText("");
  };
  return (
    <div className={styles.chat}>
      <div ref={log} className={styles.messages}>
        <div data-from="agent">{greeting}</div>
        {messages?.map((m, i) => (
          <div key={i} data-from={m.from}>
            {m.text}
          </div>
        ))}
        {pending && <div data-from="agent">…</div>}
      </div>
      <div className={styles.chips}>
        {prompts.map((p) => (
          <button key={p} onClick={() => send(p)} disabled={pending}>
            {p}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Say something…" autoFocus />
        <button className={styles.primary} disabled={pending || !text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

function QuestLog() {
  const status = useGame((s) => s.quests);
  const tracked = useGame((s) => s.tracked);
  const track = useGame((s) => s.track);
  const reset = useGame((s) => s.reset);
  const close = useGame((s) => s.close);
  const badges = useGame((s) => s.badges);
  const best = useGame((s) => s.bestRace);
  const [confirm, setConfirm] = useState(false);
  const done = quests.filter((q) => status[q.id].status === "done").length;
  return (
    <div className={styles.modal} data-wide>
      <header>
        <div>
          <h2>Quest log</h2>
          <small>
            {done}/{quests.length} complete{best !== null && ` · Runway Rush best ${best.toFixed(2)}s`}
            {badges.length > 0 && ` · ${badges.join(", ")}`}
          </small>
        </div>
        <button className={styles.close} onClick={close} aria-label="Close">
          ×
        </button>
      </header>
      <div className={styles.quests}>
        {quests.map((q) => {
          const st = status[q.id];
          const giver = npcs.find((n) => n.id === q.giver)?.name;
          return (
            <div key={q.id} className={styles.quest} data-status={st.status} data-tracked={tracked === q.id || undefined}>
              <div>
                <b>{q.title}</b>
                <small>
                  {q.kind} · {st.status === "locked" ? `Requires ${q.requires.map((r) => questById[r].title).join(", ")}` : st.status === "available" ? `Talk to ${giver}` : st.status === "done" ? "Done" : "Active"}
                </small>
                {st.status !== "locked" && <p>{q.summary}</p>}
                {st.status === "active" && (
                  <ul>
                    {q.objectives.map((o) => {
                      const n = st.progress[o.id]?.length ?? 0;
                      return (
                        <li key={o.id} data-done={n >= (o.count ?? 1) || undefined}>
                          {o.label} {(o.count ?? 1) > 1 && `${n}/${o.count}`}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className={styles.questSide}>
                <small>{rewardText(q.reward)}</small>
                {st.status === "active" && tracked !== q.id && (
                  <button className={styles.secondary} onClick={() => track(q.id)}>
                    Track
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <footer>
        {confirm ? (
          <>
            <span>Wipe all progress?</span>
            <button className={styles.danger} onClick={() => (reset(), setConfirm(false))}>
              Reset
            </button>
            <button className={styles.secondary} onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button className={styles.secondary} onClick={() => setConfirm(true)}>
            Reset progress
          </button>
        )}
      </footer>
    </div>
  );
}
