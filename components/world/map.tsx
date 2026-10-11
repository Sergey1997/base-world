"use client";

import { useEffect, useRef, useState } from "react";
import { type DistrictDef, districts, jumpPads, npcs, orbs, palette, RACE, stations, WORLD_HALF } from "./config";
import { atlasCaptions, districtOf, layoutCaptions } from "./map-labels";
import { objectivesMet, questById, quests } from "./quests";
import { districtName, live, rewardText, useGame, waypoint } from "./store";
import styles from "./world.module.css";

const here = (d: DistrictDef) => ({
  stations: stations.filter((s) => districtOf(s.position)?.id === d.id),
  people: npcs.filter((n) => districtOf(n.position)?.id === d.id),
});

const STATION_BLURB: Record<string, string> = {
  "station-docs": "Quickstart, DeFi, agents and funding — pass the checks to earn XP.",
  "station-swap": "Swap ETH for AERO on Aerodrome.",
  "station-pool": "Add ETH/AERO liquidity and earn fees.",
  "station-vote": "Lock AERO and vote for a gauge.",
  "station-launch": "Bring an AI agent to life.",
  "station-lend": "Supply ETH, borrow USDC, watch your health factor.",
  "station-hooks": "Swaps that bend the rules — try two different hooks.",
  "station-flash": "Borrow a fortune, use it, return it. One block.",
  "station-kickoff": "Launch a Spark token, then buy and sell on its bonding curve.",
};

const DISTRICT_BLURB: Record<string, string> = {
  plaza: "The heart of Base World. Meet Jesse, read the docs, collect the orbs.",
  aerodrome: "The flywheel: swap, pool, vote. Home of the Runway Rush.",
  virtuals: "Where agents are born. Chat with them, then launch your own.",
  summit: "Captain Bryan's lookout over the whole economy.",
  morpho: "Curated lending vaults. Collateral in, USDC out.",
  bankr: "A wallet that talks back. Trade, check bags, launch a token.",
  uniswap: "Every stall here bends the swap a little differently.",
  aave: "Flash loans and one-block heists. Borrow it. Use it. Return it.",
  kickoff: "Token launches on a bonding curve that graduate to Aerodrome.",
};

/** The painted atlas covers the populated world, not the empty mountains beyond. */
const HOME = (() => {
  const xs = districts.flatMap((d) => [d.center[0] - d.radius, d.center[0] + d.radius]);
  const zs = districts.flatMap((d) => [d.center[1] - d.radius, d.center[1] + d.radius]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) + 70;
  return { cx: (Math.max(...xs) + Math.min(...xs)) / 2, cz: (Math.max(...zs) + Math.min(...zs)) / 2, span };
})();
const ART = { x: HOME.cx - HOME.span / 2, z: HOME.cz - HOME.span / 2, span: HOME.span };
const MIN_SPAN = 90;
const MAX_SPAN = WORLD_HALF * 2;

type View = typeof HOME;

interface Tip {
  title: string;
  kicker?: string;
  body?: string;
  meta?: string;
  color: string;
  photo?: string;
  x: number;
  z: number;
}

/** Full-screen painted atlas (M): terrain is art, pins are people, hover tells the story. */
export function WorldMap() {
  const s = useGame();
  const [focus, setFocus] = useState<string | null>(null);
  const [view, setView] = useState<View>(HOME);
  const [tip, setTip] = useState<Tip | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const arrow = useRef<SVGGElement>(null);
  const drag = useRef<{ x: number; y: number; view: View } | null>(null);
  /** Markers keep a constant on-screen size at any zoom. */
  const u = view.span / HOME.span;
  const scaleRef = useRef(u);
  scaleRef.current = u;

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      arrow.current?.setAttribute("transform", `translate(${live.pos.x} ${live.pos.z}) rotate(${((Math.PI - live.heading) * 180) / Math.PI}) scale(${scaleRef.current})`);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);

  const clampView = (v: View): View => {
    const span = Math.min(MAX_SPAN, Math.max(MIN_SPAN, v.span));
    const lim = WORLD_HALF - span / 4;
    return { span, cx: Math.max(-lim, Math.min(lim, v.cx)), cz: Math.max(-lim, Math.min(lim, v.cz)) };
  };

  const toWorld = (clientX: number, clientY: number, v = view) => {
    const r = svg.current!.getBoundingClientRect();
    return [v.cx + ((clientX - r.left) / r.width - 0.5) * v.span, v.cz + ((clientY - r.top) / r.height - 0.5) * v.span] as const;
  };

  const zoom = (factor: number, clientX?: number, clientY?: number) =>
    setView((v) => {
      const r = svg.current!.getBoundingClientRect();
      const [wx, wz] = toWorld(clientX ?? r.left + r.width / 2, clientY ?? r.top + r.height / 2, v);
      const span = Math.min(MAX_SPAN, Math.max(MIN_SPAN, v.span * factor));
      const k = span / v.span;
      return clampView({ span, cx: wx + (v.cx - wx) * k, cz: wz + (v.cz - wz) * k });
    });

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom(Math.exp(e.deltaY * 0.0015), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  const flyTo = (x: number, z: number, span = view.span) => setView(clampView({ cx: x, cz: z, span }));

  const givers = new Set(quests.filter((q) => s.quests[q.id]?.status === "available").map((q) => q.giver));
  const offerFor = (id: string) => quests.find((q) => q.giver === id && s.quests[q.id]?.status === "available");
  const turnInFor = (id: string) => quests.find((q) => q.giver === id && s.quests[q.id]?.status === "active" && objectivesMet(q, s.quests[q.id].progress));
  const active = quests.filter((q) => s.quests[q.id]?.status === "active");
  const available = quests.filter((q) => s.quests[q.id]?.status === "available");
  const targets = active.flatMap((q) => {
    const o = q.objectives.find((x) => (s.quests[q.id].progress[x.id]?.length ?? 0) < (x.count ?? 1));
    if (!o?.at || o.at === "orbs") return [];
    const pos = o.at === "race" ? RACE.rings[s.race.next] : o.at;
    return [{ id: q.id, pos, label: o.label }];
  });
  const orbsLeft = s.quests.gm?.status === "active" ? orbs.filter((_, i) => !(s.quests.gm.progress.orbs ?? []).includes(`orb-${i}`)) : [];
  const next = waypoint(s, live.pos);
  const nextDist = next ? Math.round(Math.hypot(next.pos[0] - live.pos.x, next.pos[2] - live.pos.z)) : 0;
  const done = quests.filter((q) => s.quests[q.id]?.status === "done").length;

  const mark = (node: Tip) => ({ "data-tip": JSON.stringify(node) });

  const captions = layoutCaptions(atlasCaptions(givers), u);

  const tipStyle = (() => {
    if (!tip || !svg.current) return undefined;
    const r = svg.current.getBoundingClientRect();
    const stage = svg.current.parentElement!.getBoundingClientRect();
    const x = ((tip.x - (view.cx - view.span / 2)) / view.span) * r.width + (r.left - stage.left);
    const y = ((tip.z - (view.cz - view.span / 2)) / view.span) * r.height + (r.top - stage.top);
    const flipX = x > stage.width - 160;
    const flipY = y < 130;
    return {
      left: Math.max(12, Math.min(stage.width - 12, x)),
      top: Math.max(12, Math.min(stage.height - 12, y)),
      transform: `translate(${flipX ? "-100%" : "-50%"}, ${flipY ? "18px" : "calc(-100% - 16px)"})`,
    };
  })();

  return (
    <div className={styles.worldMap} onClick={(e) => e.target === e.currentTarget && s.close()}>
      <div className={styles.mapStage}>
        <svg
          ref={svg}
          className={styles.mapCanvas}
          viewBox={`${view.cx - view.span / 2} ${view.cz - view.span / 2} ${view.span} ${view.span}`}
          onPointerDown={(e) => {
            if ((e.target as Element).closest("[data-pin]")) return;
            drag.current = { x: e.clientX, y: e.clientY, view };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (d) {
              const px = d.view.span / e.currentTarget.getBoundingClientRect().width;
              setView(clampView({ ...d.view, cx: d.view.cx - (e.clientX - d.x) * px, cz: d.view.cz - (e.clientY - d.y) * px }));
              return;
            }
            const pin = (e.target as Element).closest("[data-tip]");
            if (!pin) {
              setTip(null);
              setFocus(null);
              return;
            }
            const next = JSON.parse(pin.getAttribute("data-tip")!) as Tip;
            if (tip?.title !== next.title || tip.x !== next.x) setTip(next);
            setFocus(pin.getAttribute("data-district"));
          }}
          onPointerLeave={() => {
            if (drag.current) return;
            setTip(null);
            setFocus(null);
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          <defs>
            <clipPath id="map-face">
              <circle r="7" />
            </clipPath>
          </defs>
          <image href="/world/map.webp" x={ART.x} y={ART.z} width={ART.span} height={ART.span} preserveAspectRatio="xMidYMid slice" opacity="0.38" />

          {districts.map((d) => {
            const lit = focus === d.id || tip?.title === d.name;
            const { stations: st, people } = here(d);
            return (
              <g
                key={d.id}
                data-pin
                data-district={d.id}
                style={{ cursor: "pointer" }}
                {...mark({
                  title: d.name,
                  kicker: "District",
                  body: d.look?.tagline ?? DISTRICT_BLURB[d.id],
                  meta: [...st.map((x) => x.label), ...people.filter((n) => n.kind === "human").map((n) => n.name)].join(" · ") || undefined,
                  color: d.color,
                  photo: d.logo,
                  x: d.center[0],
                  z: d.center[1],
                })}
                onClick={() => flyTo(d.center[0], d.center[1], Math.max(d.radius * 3, MIN_SPAN * 1.5))}
              >
                <circle cx={d.center[0]} cy={d.center[1]} r={d.radius} fill={lit ? `${d.color}18` : "transparent"} />
              </g>
            );
          })}

          <polyline points={RACE.rings.map((r) => `${r[0]},${r[2]}`).join(" ")} fill="none" stroke={palette.gold} strokeWidth={1.6 * u} strokeDasharray={`${5 * u} ${7 * u}`} opacity={0.45} />
          {RACE.rings.map((r, i) => (
            <g
              key={i}
              data-pin
              transform={`translate(${r[0]} ${r[2]}) scale(${u})`}
              {...mark({
                title: i === 0 ? "Runway Rush" : `Ring ${i + 1}`,
                kicker: "Time trial",
                body: i === 0 ? `Eight rings · ${RACE.limit}s. Boost, dash, jump.` : "Fly through this ring to keep the clock alive.",
                color: palette.gold,
                x: r[0],
                z: r[2],
              })}
            >
              <circle r="12" fill="transparent" />
              <circle r={i === 0 ? 5 : 3} fill={i === 0 ? palette.gold : "#1a1408"} stroke={palette.gold} strokeWidth="1.8" />
            </g>
          ))}

          {jumpPads.map((p, i) => (
            <g
              key={i}
              data-pin
              transform={`translate(${p.position[0]} ${p.position[2]}) scale(${u})`}
              {...mark({
                title: "Jump pad",
                kicker: "Shortcut",
                body: "Step on to launch. The north pad climbs the Summit Beacon.",
                color: palette.cyan,
                x: p.position[0],
                z: p.position[2],
              })}
            >
              <circle r="14" fill="transparent" />
              <circle r="7" fill="#0b1640" stroke={palette.cyan} strokeWidth="2" />
              <path d="M -3 2 L 0 -3 L 3 2" fill="none" stroke={palette.cyan} strokeWidth="1.8" />
            </g>
          ))}

          {orbsLeft.map((p, i) => (
            <g
              key={i}
              data-pin
              transform={`translate(${p[0]} ${p[2]}) scale(${u})`}
              {...mark({
                title: "Base orb",
                kicker: "Collect",
                body: "A spark of plaza energy. Gather all six for Jesse.",
                color: palette.baseBright,
                x: p[0],
                z: p[2],
              })}
            >
              <circle r="12" fill="transparent" />
              <circle r="6" fill={palette.baseBright} stroke="#fff" strokeWidth="1.8" />
            </g>
          ))}

          {stations.map((st) => (
            <g
              key={st.id}
              data-pin
              transform={`translate(${st.position[0]} ${st.position[2]}) scale(${u})`}
              style={{ cursor: "pointer" }}
              {...mark({
                title: st.label,
                kicker: "Terminal",
                body: STATION_BLURB[st.id],
                meta: districtOf(st.position)?.name,
                color: st.color,
                photo: st.logo,
                x: st.position[0],
                z: st.position[2],
              })}
            >
              <circle r="16" fill="transparent" />
              <path d="M 0 8 L -7 -4 A 8 8 0 1 1 7 -4 Z" fill={st.color} stroke="#fff" strokeWidth="1.5" />
              <circle cy="-3" r="3.2" fill="#050b24" />
            </g>
          ))}

          {npcs.map((n) => {
            const offer = offerFor(n.id);
            const turnIn = turnInFor(n.id);
            const bang = turnIn ? "?" : offer ? "!" : null;
            return (
              <g
                key={n.id}
                data-pin
                transform={`translate(${n.position[0]} ${n.position[2]}) scale(${u})`}
                style={{ cursor: "pointer" }}
                {...mark({
                  title: n.name,
                  kicker: n.title,
                  body: turnIn ? `Quest complete: ${turnIn.title}` : offer ? `Has a quest: ${offer.title}` : n.greeting[0],
                  meta: n.twitter ? `@${n.twitter}` : n.kind === "agent" ? "AI agent" : undefined,
                  color: bang ? palette.gold : n.color,
                  photo: n.photo,
                  x: n.position[0],
                  z: n.position[2],
                })}
              >
                <circle r="16" fill="transparent" />
                {n.photo ? (
                  <image href={n.photo} x="-7" y="-7" width="14" height="14" clipPath="url(#map-face)" />
                ) : (
                  <circle r="6" fill={n.kind === "agent" ? palette.virtuals : "#dce8ff"} />
                )}
                <circle r="7.4" fill="none" stroke={bang ? palette.gold : "#fff"} strokeWidth={bang ? 2.2 : 1.6} />
                {bang && (
                  <g transform="translate(6 -8)">
                    <circle r="4.5" fill={palette.gold} stroke="#050b24" strokeWidth="0.8" />
                    <text y="2.8" className={styles.mapBang}>
                      {bang}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {targets.map((t) => {
            const tracked = s.tracked === t.id;
            const q = questById[t.id];
            return (
              <g
                key={t.id}
                data-pin
                transform={`translate(${t.pos[0]} ${t.pos[2]}) scale(${u})`}
                className={tracked ? styles.mapPulse : undefined}
                style={{ cursor: "pointer" }}
                onClick={() => s.track(t.id)}
                {...mark({
                  title: q.title,
                  kicker: "Quest",
                  body: t.label,
                  meta: rewardText(q.reward),
                  color: palette.gold,
                  x: t.pos[0],
                  z: t.pos[2],
                })}
              >
                <path d="M 0 10 L -7 -2 A 8 8 0 1 1 7 -2 Z" fill={tracked ? palette.gold : "#1a1408"} stroke="#fff" strokeWidth="1.6" />
                <text y="-1" className={styles.mapBang} fill={tracked ? "#050b24" : palette.gold}>
                  !
                </text>
              </g>
            );
          })}

          {next && (
            <g pointerEvents="none">
              <line
                x1={live.pos.x}
                y1={live.pos.z}
                x2={next.pos[0]}
                y2={next.pos[2]}
                stroke={palette.gold}
                strokeWidth={5.5 * u}
                strokeDasharray={`${16 * u} ${10 * u}`}
                strokeLinecap="round"
                opacity="0.75"
              />
              <g transform={`translate(${next.pos[0]} ${next.pos[2]}) scale(${u})`}>
                <circle r="16" fill="rgba(255,209,102,0.22)" className={styles.mapPulse} />
                <path d="M 0 -9 L 9 0 L 0 9 L -9 0 Z" fill={palette.gold} stroke="#050b24" strokeWidth="1.6" />
                <text y="20" className={styles.mapGoal}>
                  Next · {next.label}
                </text>
              </g>
            </g>
          )}

          <g
            ref={arrow}
            data-pin
            {...mark({
              title: "You",
              kicker: s.district ? districtName(s.district) : "Open city",
              body: next ? `Next: ${next.label} · ${nextDist} m` : "Explore. Press E to talk.",
              color: palette.cyan,
              x: live.pos.x,
              z: live.pos.z,
            })}
          >
            <circle r="14" fill="rgba(94,231,255,0.2)" className={styles.mapPulse} />
            <path d="M 0 -10 L 7 7 L 0 4 L -7 7 Z" fill={palette.cyan} stroke="#fff" strokeWidth="1.6" />
          </g>

          {captions.map((c) => (
            <text
              key={c.id}
              transform={`translate(${c.x} ${c.z}) scale(${u})`}
              x={c.ox}
              y={c.oy}
              className={c.kind === "district" ? styles.mapDistrict : styles.mapLabel}
              fill={c.fill}
              pointerEvents="none"
            >
              {c.text}
            </text>
          ))}
        </svg>

        {tip && (
          <aside className={styles.mapTip} style={tipStyle}>
            <div className={styles.mapTipHead}>
              {tip.photo && <img src={tip.photo} alt="" />}
              <div>
                {tip.kicker && <small style={{ color: tip.color }}>{tip.kicker}</small>}
                <b>{tip.title}</b>
              </div>
            </div>
            {tip.body && <p>{tip.body}</p>}
            {tip.meta && <em>{tip.meta}</em>}
          </aside>
        )}

        <div className={styles.mapTools}>
          <button onClick={() => zoom(1 / 1.4)} aria-label="Zoom in">
            +
          </button>
          <button onClick={() => zoom(1.4)} aria-label="Zoom out">
            −
          </button>
          <button onClick={() => flyTo(live.pos.x, live.pos.z, Math.min(view.span, 220))} title="Center on me">
            ◎
          </button>
          <button onClick={() => setView(HOME)} title="Whole world">
            ⤢
          </button>
        </div>
        <small className={styles.mapHint}>Hover a pin · scroll to zoom · drag to pan</small>
      </div>

      <aside className={styles.mapSide}>
        <header>
          <div>
            <h2>Atlas</h2>
            <small>
              {s.district ? districtName(s.district) : "Open city"} · {done}/{quests.length} quests · {s.xp} XP
            </small>
          </div>
          <button className={styles.close} onClick={s.close} aria-label="Close">
            ×
          </button>
        </header>

        {next && (
          <button className={styles.mapNext} onClick={() => flyTo(next.pos[0], next.pos[2], Math.max(MIN_SPAN * 1.8, 180))}>
            <small>Next</small>
            <b>{next.label}</b>
            <span>{nextDist} m</span>
          </button>
        )}

        {(active.length > 0 || available.length > 0) && (
          <section>
            <h4>Quests</h4>
            {active.map((q) => {
              const o = q.objectives.find((x) => (s.quests[q.id].progress[x.id]?.length ?? 0) < (x.count ?? 1));
              const target = targets.find((t) => t.id === q.id);
              return (
                <button
                  key={q.id}
                  className={styles.mapQuest}
                  data-tracked={s.tracked === q.id || undefined}
                  onClick={() => {
                    s.track(q.id);
                    if (target) flyTo(target.pos[0], target.pos[2]);
                  }}
                >
                  <b>{q.title}</b>
                  <small>
                    {o ? o.label : "Ready to hand in"} · {rewardText(q.reward)}
                  </small>
                </button>
              );
            })}
            {available.map((q) => {
              const giver = npcs.find((n) => n.id === q.giver);
              return (
                <button key={q.id} className={styles.mapQuest} data-offer onClick={() => giver && flyTo(giver.position[0], giver.position[2])}>
                  <b>{q.title}</b>
                  <small>Talk to {giver?.name}</small>
                </button>
              );
            })}
          </section>
        )}

        <section>
          <h4>Districts</h4>
          {districts.map((d) => {
            const { stations: st, people } = here(d);
            return (
              <div
                key={d.id}
                className={styles.mapRow}
                data-focus={focus === d.id || undefined}
                onMouseEnter={() => setFocus(d.id)}
                onMouseLeave={() => setFocus(null)}
                onClick={() => flyTo(d.center[0], d.center[1], Math.max(d.radius * 3, MIN_SPAN * 1.5))}
              >
                {d.logo ? <img src={d.logo} alt="" /> : <i style={{ background: d.color }} />}
                <div>
                  <b>{d.name}</b>
                  <small>{d.look?.tagline ?? DISTRICT_BLURB[d.id]}</small>
                  {(st.length > 0 || people.length > 0) && (
                    <p>
                      {[...st.map((x) => x.label), ...people.filter((n) => n.kind === "human").map((n) => n.name)].join(" · ")}
                      {people.some((n) => n.kind === "agent") && ` · ${people.filter((n) => n.kind === "agent").length} AI agents`}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        <section className={styles.mapLegend}>
          <span>
            <i style={{ background: palette.cyan }} data-shape="arrow" /> You
          </span>
          <span>
            <i style={{ background: palette.gold }} data-shape="diamond" /> Next goal
          </span>
          <span>
            <i style={{ background: palette.gold }} /> Quest
          </span>
          <span>
            <i style={{ background: "#dce8ff" }} /> Person
          </span>
          <span>
            <i data-shape="square" style={{ background: palette.aero }} /> Terminal
          </span>
          <span>
            <i data-shape="ring" style={{ borderColor: palette.cyan }} /> Jump pad
          </span>
          <span>
            <i style={{ background: palette.baseBright }} /> Orb
          </span>
        </section>
      </aside>
    </div>
  );
}
