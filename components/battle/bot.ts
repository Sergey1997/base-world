import { classes, type Duel, type SideId, skillOf } from "./engine";

/** How a bot plays: `react` is how long it takes to notice a cast, `defend` how late it waits before a defensive. */
export interface Style {
  react: number;
  defend: number;
}

export const HUMAN: Style = { react: 380, defend: 650 };

/** What the bot presses at `t`, if anything. It only sees an enemy cast once `react` ms have passed. */
export function decide(duel: Duel, me: SideId, t: number, style: Style = HUMAN) {
  const self = duel.f[me];
  const foe = duel.f[(1 - me) as SideId];
  const [basic, heavy, defense, interrupt] = classes[self.cls].skills;
  const can = (id: string) => !duel.check(me, id, t);
  const seen = foe.casting && t - foe.casting.start >= style.react ? foe.casting : null;

  if (seen) {
    const threat = skillOf(foe.cls, seen.skill)!;
    const dmg = threat.effect.kind === "hit" ? threat.effect.dmg : 0;
    if (dmg >= 20 && can(interrupt.id)) return interrupt.id;
    if (dmg >= 20 && seen.end - t <= style.defend && can(defense.id)) return defense.id;
  }
  if (defense.effect.kind === "absorb" && !seen && self.hp < classes[self.cls].hp * 0.75 && self.absorb.until < t && can(defense.id)) return defense.id;
  if (self.casting) return null;
  if (can(heavy.id) && self.mana - heavy.mana >= interrupt.mana) return heavy.id;
  if (can(basic.id)) return basic.id;
  return null;
}
