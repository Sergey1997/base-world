// Bot-vs-bot round robin for tuning class numbers: `node scripts/balance.mjs [fights]`.
import { register } from "node:module";

// The game imports modules without extensions; let Node find the .ts files.
register("data:text/javascript,export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if(s.startsWith('.'))return n(s+'.ts',c);throw e}}");
const { decide } = await import("../components/battle/bot.ts");
const { CLASS_IDS, Duel, LIMIT } = await import("../components/battle/engine.ts");

const N = +(process.argv[2] ?? 400);
let seed = 7;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const style = () => ({ react: 200 + rand() * 800, defend: 250 + rand() * 700 });

function fight(a, b) {
  const duel = new Duel([a, b]);
  const styles = [style(), style()];
  const think = [rand() * 200, rand() * 200];
  for (let t = 0; t <= LIMIT && duel.winner === null; t += 20) {
    duel.advance(t);
    for (const me of [0, 1]) {
      if (t < think[me]) continue;
      const skill = decide(duel, me, t, styles[me]);
      if (skill) duel.cast(me, skill, t);
      think[me] = t + 60 + rand() * 140;
    }
  }
  duel.advance(LIMIT);
  return duel;
}

const rows = [];
for (const a of CLASS_IDS)
  for (const b of CLASS_IDS) {
    if (a === b) continue;
    let wins = 0, draws = 0, time = 0;
    for (let i = 0; i < N; i++) {
      const side = i % 2;
      const d = side ? fight(b, a) : fight(a, b);
      const aSide = side ? 1 : 0;
      if (d.winner === "draw") draws++;
      else if (d.winner === aSide) wins++;
      time += d.end;
    }
    rows.push({ matchup: `${a} vs ${b}`, win: `${((wins / N) * 100).toFixed(1)}%`, draw: `${((draws / N) * 100).toFixed(1)}%`, avgSec: (time / N / 1000).toFixed(1) });
  }
console.table(rows);

const mirror = {};
for (const c of CLASS_IDS) {
  let s0 = 0;
  for (let i = 0; i < N; i++) if (fight(c, c).winner === 0) s0++;
  mirror[c] = `${((s0 / N) * 100).toFixed(1)}% side 0`;
}
console.log("mirror", mirror);
