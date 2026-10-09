# Base World — handoff

The game is playable end to end at `/`. All 11 quests were played through in the browser, from the plaza orbs to the "Stay Based" finale. `pnpm typecheck` and `pnpm build` pass.

## Get it locally

```bash
git clone https://github.com/Sergey1997/base-world.git && cd base-world
corepack enable && pnpm install
pnpm dev        # http://localhost:3000
pnpm typecheck
pnpm build
```

- This repo is standalone and contains only the game. It was first started in `Sergey1997/byka` on branch `cursor/base-world-3d-2256`; that copy is superseded by this one.
- `app/page.tsx` renders `components/world/client.tsx`, which loads `game.tsx` with `dynamic(..., { ssr: false })`.
- Deps: `three@0.186`, `@react-three/fiber@9`, `drei@10`, `@react-three/rapier@2.2` (uses rapier 0.19, so ray hits have `timeOfImpact`, not `toi`), `@react-three/postprocessing@3`, `postprocessing`, `zustand@5`, `@types/three`.
- The project uses Next 16. Per `AGENTS.md`, read `node_modules/next/dist/docs/` before writing route code. `ssr: false` dynamic imports only work inside a Client Component.

## What exists (`components/world/`)

| File | Contents |
|---|---|
| `config.ts` | Everything is data: `palette`, `SPAWN`, the `districts[]` list (with an optional `look` so a district renders through the generic component), roads derived from the districts, `npcs[]`, `stations[]` (with `PanelId`), `orbs`, `RACE` rings and time limit, `jumpPads`. |
| `chain.ts` | The `ChainAdapter` interface plus `mockChain` (quote, swap, addLiquidity, vote, launchAgent, launchToken, swapWithHook, supply, borrow, repay, flashLoan). Tokens: ETH, SKY, VIRT, CASH. Also `hooks` and `fmt`. Swap this out for a wagmi/viem adapter later. |
| `quests.ts` | 10 quests: gm (orbs), speed (150 km/h), summit, race, aero, agents, bank (BANKO), lend (Morpho-like), hooks (Uniswap-like), flash (Aave-like), and the auto finale `based`. Also `matches()` (action prefix `x:`), and `levelFor` and `xpForLevel`. |
| `agents.ts` | Canned persona replies for the Virtua agents, `parseBankerIntent` (buy/swap/launch/portfolio), and `personas`. |
| `store.ts` | The zustand + persist store (`base-world-save`): quest engine (`emit`, `accept`, unlock, complete, rewards, level-up toasts), wallet, LP, veSKY, the vault and `healthFactor`, race (`passRing`, `failRace`), the protocol actions, BANKO chat (`bankerTurn`), and `waypoint()`. `live` is a mutable per-frame object (pos, speed, heading, camYaw, boosting, dashCharge) for the HUD. Also `uiLocked`. |
| `input.ts` | Keyboard sets (`keys`, `pressed`, `consume`). E interacts or closes, J/Tab opens the quest log, Esc closes. Keys are ignored while typing in an input. |
| `player.tsx` | Dynamic rapier capsule. Walk 13 m/s, Shift boost 36, Q dash 88 (1.1 s cooldown), double jump, jump pads, momentum in the air, respawn on falling. Camera control, drag/wheel orbit, arrow keys, auto-follow, and FOV/distance that stretch with speed run in `useFrame` at priority 0.5 (physics is at 0, the composer at 1). Also the stylized avatar, the hoverboard and the additive speed trail. |
| `environment.tsx` | Gradient sky shader with sun glow and stars, a sun that follows the player and casts shadows, fog, the ground with colliders and walls, the drei `Grid`, glowing roads, an instanced city with a world-space lit-window shader (`windowMaterial`) plus colliders, trees, mountains, clouds, and sparkles. `isFree()` keeps scenery out of districts and off roads. |
| `districts.tsx` | Hand-built Plaza (beacon ring), Summit plateau and beam, Aeroport as the flagship hub (runway lights, terminal, epoch board, tower, hangars, parked and flying planes, pool and vote props, race signage), and Virtua (neon towers, torus knot, launchpad beam). Generic `ProtocolDistrict` with vault, pylon and dome motifs for Vault Quarter (Morpho-like), Banker's Terminal (Bankr-like), Hook Bazaar (Uniswap-like) and Ghost Bank (Aave-like). Also `Sign` (Billboard text using `/world/Unbounded.ttf`) and `FONT`. |
| `public/world/Unbounded.ttf` | A copy of the repo's OFL font, so troika text doesn't fetch from a CDN. |
| `actors.tsx` | NPCs (capsule humans, floating icosahedron robots) with `Html` nameplates, a "!" when they offer a quest and a diamond when they're the tracked objective; station kiosks; orbs (only while `gm` is active); race rings (`passRing`, `failRace` after `RACE.limit`); jump pad visuals; launched agents orbiting the launchpad; the waypoint beam and distance label; and `Interactions`, which sets `nearby` (5 m) and `district` (respecting `minY`). |
| `game.tsx` | `Canvas` → `Suspense` → `Physics` with the scene, then an always-mounted `EffectComposer` (Bloom, Vignette, ACES ToneMapping last), plus `useKeyboard()` and the HUD. |
| `hud.tsx` | Intro, level/XP, wallet, district chip, north-up canvas minimap (220 m), quest tracker, race timer, speedometer with dash charge, "[E]" prompt, toasts, NPC dialog (offer / accept / hint / completion line), agent chat with suggested prompts, and the quest log with track and reset. Per-frame readouts write to the DOM from `requestAnimationFrame` instead of re-rendering. |
| `panels.tsx` | Swap / pool / vote (tabs at the Aeroport), launch, lend with a health-factor bar, hooks, and the flash loan: the 3-step route in shuffled order inside an 8 s block. |
| `world.module.css` | All HUD styles. The root is `position: fixed; inset: 0`. |
| `client.tsx` | Client wrapper that loads `game.tsx` with `ssr: false`. |

## Play-test results

- Jump pad to the summit: the player peaks at about 18 m and lands on the plateau (y 15).
- Runway Rush: cleared in 12.8 s by a straight-line bot that jumps for the two high rings, so the 26 s limit leaves a human player plenty of slack.
- BANKO: "buy 0.05 ETH of SKY", "portfolio" and "launch a token called BASED" all work and complete the quest.

## Next

- Record a short demo video (screenshots are in `docs/media/`).
- Replace `mockChain` with a wagmi/viem adapter.
- New districts, see below.

## Design notes

- Characters and names are fictional and don't resemble real people: Jess (Builder-in-Chief), Captain Bryan, Aero Al, Vee, BANKO, Curator Mira, Hana Hooks, Gus the Ghost.
- Districts are inspired by real protocols but use no real logos or tokens (SKY, VIRT and CASH are mock tokens). Ranking source: a research note, "Top Base Projects" (Oct 9, 2026, DefiLlama/CoinGecko). Aerodrome is #1 and the flagship hub; Morpho is #2 and becomes Vault Quarter.
- To add a protocol district: add one `districts` entry with a `look`, plus its NPC and station in `config.ts`, a quest in `quests.ts`, and, if it needs one, a panel and store action routed through `ChainAdapter`.
- Possible next districts from the ranking: Veranta (perps arena), Clanker (mint workshop), Zora (gallery), and Robinhood chain as a later theme.
