/**
 * The duel rules. Pure and deterministic: the same cast log always produces the same fight,
 * so the server can replay a PvP log to decide the winner while clients replay it to draw it.
 * No randomness — outcomes come from choices and timing only.
 */

export type ClassId = "knight" | "mage" | "rogue";
export type SideId = 0 | 1;

export type Effect =
  | { kind: "hit"; dmg: number }
  | { kind: "interrupt"; dmg: number; lock: number }
  | { kind: "absorb"; amount: number; ms: number }
  | { kind: "reduce"; pct: number; ms: number }
  | { kind: "dodge"; ms: number };

export interface Skill {
  id: string;
  name: string;
  /** Cast time in ms; 0 is instant. Casts can be interrupted. */
  cast: number;
  cd: number;
  mana: number;
  /** Triggers (and waits for) the shared global cooldown. Reactions skip it. */
  gcd: boolean;
  effect: Effect;
  blurb: string;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  blurb: string;
  color: string;
  hp: number;
  mana: number;
  /** Mana per second. */
  regen: number;
  /** Basic, heavy, defense, interrupt — bound to keys 1–4. */
  skills: [Skill, Skill, Skill, Skill];
}

export const GCD = 900;
export const LIMIT = 90_000;
/** PvP fights start this long after both stakes land, so both clients see the countdown. */
export const COUNTDOWN = 4_000;

export const classes: Record<ClassId, ClassDef> = {
  knight: {
    id: "knight",
    name: "Knight",
    blurb: "Sword and shield. Most health, steady damage, punishes long casts.",
    color: "#ffb547",
    hp: 450,
    mana: 100,
    regen: 4,
    skills: [
      { id: "slash", name: "Slash", cast: 0, cd: 0, mana: 0, gcd: true, effect: { kind: "hit", dmg: 9 }, blurb: "Instant sword strike." },
      { id: "crush", name: "Crushing Blow", cast: 1200, cd: 6000, mana: 30, gcd: true, effect: { kind: "hit", dmg: 28 }, blurb: "Wind up, then hit hard." },
      { id: "wall", name: "Shield Wall", cast: 0, cd: 12000, mana: 25, gcd: false, effect: { kind: "reduce", pct: 0.6, ms: 2750 }, blurb: "Take 60% less damage for 2.75s." },
      { id: "bash", name: "Shield Bash", cast: 0, cd: 9500, mana: 20, gcd: false, effect: { kind: "interrupt", dmg: 6, lock: 3000 }, blurb: "Interrupt a cast and lock it for 3s." },
    ],
  },
  mage: {
    id: "mage",
    name: "Mage",
    blurb: "Fragile, but the biggest spells. Win the casting game.",
    color: "#5ee7ff",
    hp: 350,
    mana: 130,
    regen: 7,
    skills: [
      { id: "frost", name: "Frostbolt", cast: 900, cd: 0, mana: 8, gcd: true, effect: { kind: "hit", dmg: 14 }, blurb: "Quick bolt of ice." },
      { id: "fireball", name: "Fireball", cast: 2000, cd: 8000, mana: 35, gcd: true, effect: { kind: "hit", dmg: 42 }, blurb: "Long cast, huge hit." },
      { id: "barrier", name: "Ice Barrier", cast: 0, cd: 15000, mana: 30, gcd: false, effect: { kind: "absorb", amount: 30, ms: 6000 }, blurb: "Absorb the next 30 damage." },
      { id: "counter", name: "Counterspell", cast: 0, cd: 9500, mana: 20, gcd: false, effect: { kind: "interrupt", dmg: 0, lock: 4000 }, blurb: "Interrupt a cast and lock it for 4s." },
    ],
  },
  rogue: {
    id: "rogue",
    name: "Rogue",
    blurb: "Fast blades and a perfect dodge. Read the cast, vanish from it.",
    color: "#b07cff",
    hp: 380,
    mana: 100,
    regen: 9,
    skills: [
      { id: "stab", name: "Stab", cast: 0, cd: 0, mana: 0, gcd: true, effect: { kind: "hit", dmg: 9 }, blurb: "Instant dagger strike." },
      { id: "evis", name: "Eviscerate", cast: 1000, cd: 5500, mana: 30, gcd: true, effect: { kind: "hit", dmg: 32 }, blurb: "A short, brutal combo." },
      { id: "evade", name: "Evade", cast: 0, cd: 10500, mana: 25, gcd: false, effect: { kind: "dodge", ms: 1500 }, blurb: "Dodge everything for 1.5s." },
      { id: "kick", name: "Kick", cast: 0, cd: 9000, mana: 20, gcd: false, effect: { kind: "interrupt", dmg: 5, lock: 3000 }, blurb: "Interrupt a cast and lock it for 3s." },
    ],
  },
};

export const CLASS_IDS = Object.keys(classes) as ClassId[];
export const isClass = (v: unknown): v is ClassId => typeof v === "string" && v in classes;
export const skillOf = (cls: ClassId, id: string) => classes[cls].skills.find((s) => s.id === id);

/** One entry of the authoritative log: who pressed what, stamped with ms since the fight began. */
export interface Cast {
  t: number;
  by: SideId;
  skill: string;
}

/** What happened, for drawing: casts starting, landing, missing and being cut. */
export interface Beat {
  t: number;
  by: SideId;
  skill: string;
  kind: "start" | "land" | "miss" | "cut";
  dmg?: number;
  absorbed?: number;
}

export interface Fighter {
  cls: ClassId;
  hp: number;
  mana: number;
  casting: { skill: string; start: number; end: number } | null;
  ready: Record<string, number>;
  gcd: number;
  absorb: { amount: number; until: number };
  reduce: { pct: number; until: number };
  dodge: number;
}

export type Winner = SideId | "draw";

const fighter = (cls: ClassId): Fighter => ({
  cls,
  hp: classes[cls].hp,
  mana: classes[cls].mana,
  casting: null,
  ready: {},
  gcd: 0,
  absorb: { amount: 0, until: -1 },
  reduce: { pct: 0, until: -1 },
  dodge: -1,
});

export class Duel {
  t = 0;
  readonly sides: [ClassId, ClassId];
  readonly f: [Fighter, Fighter];
  readonly beats: Beat[] = [];
  winner: Winner | null = null;
  end: number | null = null;
  private landings: { t: number; by: SideId; skill: string }[] = [];

  constructor(sides: [ClassId, ClassId]) {
    this.sides = sides;
    this.f = [fighter(sides[0]), fighter(sides[1])];
  }

  /** Why `by` can't use `skill` at `t` (default: now), or null if it can. */
  check(by: SideId, skill: string, t = this.t) {
    const me = this.f[by];
    const s = skillOf(me.cls, skill);
    if (!s) return "unknown skill";
    if (this.winner !== null) return "fight over";
    if (me.casting) return "casting";
    if (s.gcd && t < me.gcd) return "global cooldown";
    if (t < (me.ready[s.id] ?? 0)) return "cooldown";
    if (me.mana < s.mana) return "not enough mana";
    return null;
  }

  /** Applies a cast at `t` (never earlier than the clock). Returns the reason it was rejected, if it was. */
  cast(by: SideId, skill: string, t: number) {
    if (t < 0) return "not started";
    if (t < this.t) return "out of order";
    this.advance(t);
    const why = this.check(by, skill, t);
    if (why) return why;
    const me = this.f[by];
    const s = skillOf(me.cls, skill)!;
    me.mana -= s.mana;
    me.ready[s.id] = t + s.cd;
    if (s.gcd) me.gcd = t + GCD;
    this.beats.push({ t, by, skill, kind: "start" });
    if (s.cast > 0) {
      me.casting = { skill, start: t, end: t + s.cast };
      this.landings.push({ t: t + s.cast, by, skill });
      this.landings.sort((a, b) => a.t - b.t);
    } else this.resolve(by, s, t);
    return null;
  }

  /** Moves the clock to `to`, landing finished casts and regenerating mana on the way. */
  advance(to: number) {
    const stop = Math.min(to, LIMIT);
    while (this.winner === null && this.landings.length && this.landings[0].t <= stop) {
      const l = this.landings.shift()!;
      this.regen(l.t);
      const me = this.f[l.by];
      if (me.casting?.skill !== l.skill || me.casting.end !== l.t) continue;
      me.casting = null;
      this.resolve(l.by, skillOf(me.cls, l.skill)!, l.t);
    }
    if (this.winner !== null) return;
    this.regen(stop);
    if (to >= LIMIT) this.timeout();
  }

  private regen(to: number) {
    const dt = (to - this.t) / 1000;
    if (dt <= 0) return;
    for (const me of this.f) me.mana = Math.min(classes[me.cls].mana, me.mana + classes[me.cls].regen * dt);
    this.t = to;
  }

  private resolve(by: SideId, s: Skill, t: number) {
    const me = this.f[by];
    const foe = this.f[(1 - by) as SideId];
    const e = s.effect;
    if (e.kind === "absorb") me.absorb = { amount: e.amount, until: t + e.ms };
    else if (e.kind === "reduce") me.reduce = { pct: e.pct, until: t + e.ms };
    else if (e.kind === "dodge") me.dodge = t + e.ms;
    else if (t <= foe.dodge) this.beats.push({ t, by, skill: s.id, kind: "miss" });
    else {
      if (e.kind === "interrupt" && foe.casting) {
        const cut = foe.casting.skill;
        foe.ready[cut] = Math.max(foe.ready[cut] ?? 0, t + e.lock);
        foe.casting = null;
        this.beats.push({ t, by: (1 - by) as SideId, skill: cut, kind: "cut" });
      }
      this.hurt(by, s.id, e.dmg, t);
    }
  }

  private hurt(by: SideId, skill: string, raw: number, t: number) {
    const foe = this.f[(1 - by) as SideId];
    let dmg = t <= foe.reduce.until ? raw * (1 - foe.reduce.pct) : raw;
    const absorbed = t <= foe.absorb.until ? Math.min(foe.absorb.amount, dmg) : 0;
    foe.absorb.amount -= absorbed;
    dmg -= absorbed;
    foe.hp = Math.max(0, foe.hp - dmg);
    this.beats.push({ t, by, skill, kind: "land", dmg, absorbed });
    if (foe.hp === 0) this.finish(by, t);
  }

  private timeout() {
    const [a, b] = this.f.map((me) => me.hp / classes[me.cls].hp);
    this.finish(a === b ? "draw" : a > b ? 0 : 1, LIMIT);
  }

  private finish(winner: Winner, t: number) {
    this.winner = winner;
    this.end = t;
    for (const me of this.f) me.casting = null;
  }
}

/** Replays a log up to `until`. Casts are ordered by time, ties by log order; rejected casts simply don't happen. */
export function replay(sides: [ClassId, ClassId], log: Cast[], until: number) {
  const duel = new Duel(sides);
  const ordered = log.map((c, i) => ({ c, i })).sort((x, y) => x.c.t - y.c.t || x.i - y.i);
  for (const { c } of ordered) {
    if (c.t > until || duel.winner !== null) break;
    duel.cast(c.by, c.skill, c.t);
  }
  duel.advance(until);
  return duel;
}
