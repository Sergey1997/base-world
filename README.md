# base-world

A stylized 3D open world for the Base ecosystem, built with Next.js, React Three Fiber, Rapier and zustand. It has fast movement (boost, dash, hoverboard), quest givers and protocol districts. All onchain actions are simulated against mock state behind a swappable `ChainAdapter`.

```bash
corepack enable
pnpm install
pnpm dev        # http://localhost:3000
```

![Base Plaza](docs/media/base-world-plaza.jpg)

## Controls

| Key | Action |
|---|---|
| WASD | Move |
| Shift | Boost on the hoverboard |
| Q | Dash |
| Space | Jump, press again in the air to double jump |
| E | Talk to NPCs, use terminals |
| J / Tab | Quest log |
| Mouse drag, wheel, arrow keys | Orbit and zoom the camera |
| Esc | Close any window |

## Features

- 11 quests, from collecting orbs on Base Plaza to the "Stay Based" finale, with XP, levels, rewards and a waypoint to the next objective.
- Districts: the Summit (reached by jump pad), the Aeroport hub (swap, pool, gauge voting and the 26-second Runway Rush ring course), Virtua (chat with AI agents and launch your own), Vault Quarter (supply, borrow, repay with a health factor), Banker's Terminal (trade by chatting with BANKO), Hook Bazaar (swaps through hooks) and Ghost Bank (a one-block flash loan).
- HUD with a minimap, quest tracker, speedometer and dash charge, race timer, toasts and a quest log. Progress is saved in `localStorage`.

![Aeroport liquidity pool](docs/media/base-world-aeroport.jpg)
![Virtua](docs/media/base-world-virtua.jpg)

See [docs/HANDOFF.md](docs/HANDOFF.md) for how the code is organized and what could come next.

The font is Unbounded (SIL Open Font License, see `public/world/OFL.txt`).
