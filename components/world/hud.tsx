"use client";

import { useEffect, useRef, useState } from "react";
import { bankerPrompts, gekkoPrompts, suggestedPrompts } from "./agents";
import { toggleSound, useSoundOn } from "./audio";
import { fmt, type Token, tokens } from "./chain";
import { districts, jumpPads, npcs, palette, RACE, roads, stations } from "./config";
import { atlasCaptions, layoutCaptions } from "./map-labels";
import { WorldMap } from "./map";
import { Panel } from "./panels";
import { levelFor, questById, quests } from "./quests";
import { districtName, holdings, live, rewardText, useGame, waypoint } from "./store";
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
  const mapOpen = useGame((s) => s.mapOpen);
  if (!started) return <Intro />;
  return (
    <div className={styles.hud}>
      <Status />
      <Minimap />
      <Tracker />
      <RaceTimer />
      <Speedometer />
      <SoundToggle />
      <Prompt />
      <Toasts />
      <div className={styles.help}>WASD move · Shift boost · Q dash · Space jump ×2 · E interact · J quests · M map · B Base docs · drag to look</div>
      {dialog && <Dialog key={dialog} id={dialog} />}
      {panel && <Panel key={panel} id={panel} />}
      {logOpen && <QuestLog />}
      {mapOpen && <WorldMap />}
    </div>
  );
}

function Intro() {
  const start = useGame((s) => s.start);
  const xp = useGame((s) => s.xp);
  const online = useGame((s) => !!s.real);
  return (
    <div className={styles.intro}>
      <div className={styles.introCard}>
        <h1>BASE WORLD</h1>
        <p>
          A fast, stylized open world for the Base ecosystem. Explore protocol districts, take on quests and talk to AI agents —{" "}
          {online
            ? "swaps, liquidity, Morpho and Aave run on Base mainnet from your wallet (max $50 per transaction); everything else uses game credits."
            : "every onchain action is simulated."}
        </p>
        <div className={styles.controls}>
          {[
            ["WASD", "Move"],
            ["Shift", "Boost (hoverboard)"],
            ["Q", "Dash"],
            ["Space", "Jump / double jump"],
            ["E", "Talk · use terminals"],
            ["J / Tab", "Quest log"],
            ["M", "World map"],
            ["B", "Base docs"],
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
        <a className={styles.menu} href="/">
          ← {online ? "Online" : "Offline"} mode · back to menu
        </a>
      </div>
    </div>
  );
}

function Status() {
  const xp = useGame((s) => s.xp);
  const wallet = useGame((s) => holdings(s).wallet);
  const lp = useGame((s) => holdings(s).lp);
  const veAero = useGame((s) => s.veAero);
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
        {veAero > 0 && (
          <span>
            {fmt(veAero)} <small>veAERO</small>
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
      ctx.fillStyle = `${d.color}22`;
      ctx.fill();
    }
    for (const st of stations) {
      const [x, y] = to(st.position[0], st.position[2]);
      ctx.fillStyle = st.color;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y + 4);
      ctx.arc(x, y - 1.5, 3.2, 0.85, Math.PI - 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    const givers = new Set(quests.filter((q) => s.quests[q.id]?.status === "available").map((q) => q.giver));
    for (const n of npcs) {
      if (n.kind !== "human" && !givers.has(n.id)) continue;
      const [x, y] = to(n.position[0], n.position[2]);
      const offer = givers.has(n.id);
      ctx.beginPath();
      ctx.arc(x, y, offer ? 3.6 : 3, 0, Math.PI * 2);
      ctx.fillStyle = offer ? palette.gold : "#dce8ff";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    for (const p of jumpPads) {
      const [x, y] = to(p.position[0], p.position[2]);
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.strokeStyle = palette.cyan;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    {
      const [x, y] = to(RACE.rings[0][0], RACE.rings[0][2]);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = palette.gold;
      ctx.fill();
    }

    const u = 1 / k;
    const visible = atlasCaptions(givers).filter((c) => Math.hypot(c.x - px, c.z - pz) < MAP_RANGE + 36);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#050b24";
    for (const cap of layoutCaptions(visible, u)) {
      const [x, y] = to(cap.x + cap.ox * u, cap.z + cap.oy * u);
      if (Math.hypot(x - c, y - c) > c - 6) continue;
      ctx.font = cap.kind === "district" ? "700 8px Unbounded, system-ui, sans-serif" : "600 7px system-ui, sans-serif";
      ctx.strokeText(cap.text, x, y);
      ctx.fillStyle = cap.fill ?? "#f4f7ff";
      ctx.fillText(cap.text, x, y);
    }

    const wp = waypoint(s, live.pos);
    if (wp) {
      let [x, y] = to(wp.pos[0], wp.pos[2]);
      const dx = x - c;
      const dy = y - c;
      const r = Math.hypot(dx, dy);
      if (r > c - 14) [x, y] = [c + (dx / r) * (c - 14), c + (dy / r) * (c - 14)];
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(x, y);
      ctx.strokeStyle = palette.gold;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 3]);
      ctx.globalAlpha = 0.8;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = palette.gold;
      ctx.strokeStyle = "#050b24";
      ctx.lineWidth = 1.5;
      ctx.fillRect(-4.5, -4.5, 9, 9);
      ctx.strokeRect(-4.5, -4.5, 9, 9);
      ctx.restore();
      const ly = y + (y > c + 40 ? -12 : 12);
      if (Math.hypot(x - c, ly - c) < c - 6) {
        ctx.font = "700 7px Unbounded, system-ui, sans-serif";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#050b24";
        ctx.fillStyle = palette.gold;
        ctx.strokeText("Next", x, ly);
        ctx.fillText("Next", x, ly);
      }
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
  const open = useGame((s) => s.toggleMap);
  return (
    <button className={styles.minimap} onClick={open} onMouseDown={(e) => e.preventDefault()} title="World map (M)">
      <canvas ref={canvas} style={{ width: MAP, height: MAP }} />
      <span className={styles.north}>N</span>
    </button>
  );
}

function Tracker() {
  const tracked = useGame((s) => s.tracked);
  const state = useGame((s) => (s.tracked ? s.quests[s.tracked] : null));
  const dist = useRef<HTMLSpanElement>(null);
  useTicker(() => {
    if (!dist.current) return;
    const wp = waypoint(useGame.getState(), live.pos);
    dist.current.textContent = wp ? `${Math.round(Math.hypot(wp.pos[0] - live.pos.x, wp.pos[2] - live.pos.z))} m` : "";
  });
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
      <small>
        <span ref={dist} className={styles.trackerDist} />
        J — quest log
      </small>
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

function SoundToggle() {
  const on = useSoundOn();
  return (
    // No focus on click, so Space keeps jumping instead of re-pressing the button.
    <button className={styles.sound} onClick={toggleSound} onMouseDown={(e) => e.preventDefault()} data-on={on ? "1" : ""} title="Sound">
      {on ? "♪ Sound on" : "♪ Muted"}
    </button>
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
  const busy = useGame((s) => !!s.dialog || !!s.panel || s.logOpen || s.mapOpen);
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
  const offer = mine.find((q) => status[q.id]?.status === "available");
  const active = mine.find((q) => status[q.id]?.status === "active" && q.id !== justDone?.id);

  const lines = justDone?.giver === id ? [justDone.done] : [];
  if (offer) lines.push(offer.offer);
  else if (active) lines.push(active.hint);
  if (!lines.length && npc.kind === "human") lines.push(greeting);

  return (
    <div className={styles.modal} data-side={npc.kind === "agent" ? "chat" : undefined}>
      <header>
        <div className={styles.who}>
          {npc.photo && <img className={styles.avatar} src={npc.photo} alt={npc.name} />}
          <div>
            <h2 style={{ color: npc.color }}>{npc.name}</h2>
            <small>{npc.title}</small>
            <div className={styles.socials}>
              {npc.twitter && (
                <a href={`https://x.com/${npc.twitter}`} target="_blank" rel="noreferrer">
                  @{npc.twitter}
                </a>
              )}
              {npc.ens && <span>{npc.ens}</span>}
              {npc.url && (
                <a href={npc.url} target="_blank" rel="noreferrer">
                  {host(npc.url)}
                </a>
              )}
            </div>
          </div>
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
      {npc.kind === "agent" && (
        <Chat
          id={id}
          greeting={npc.greeting[0]}
          prompts={npc.persona === "banker" ? bankerPrompts : npc.persona === "gekko" ? gekkoPrompts : suggestedPrompts}
        />
      )}
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
  const done = quests.filter((q) => status[q.id]?.status === "done").length;
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
          const st = status[q.id] ?? { status: "locked" as const, progress: {} };
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

function host(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
