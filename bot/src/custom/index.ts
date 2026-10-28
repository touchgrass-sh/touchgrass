// YOUR CHANGES GO HERE. touchgrass is the body, your coding agent is the brain: ask Claude Code or Codex
// to edit this file (and only this folder), then `npx wrangler deploy`. Upstream updates never touch
// src/custom/, so your tweaks survive `git pull`.
//
// Everything is optional. Leave a field out to keep the built-in behaviour.

import type { Level, Personality, Settings } from '../env';

export type CustomMove = { name: string; n: Record<Level, number>; unit: 'reps' | 'sec' };
export type LineKind = 'nudge' | 'done' | 'skip' | 'snooze' | 'agent_done';

export interface Custom {
  /** Extra moves added to the rotation, e.g. { name: 'kettlebell swings', n: { easy: 5, normal: 10, spicy: 20 }, unit: 'reps' }. */
  moves?: CustomMove[];
  /** Set to true to use ONLY your moves instead of adding them to the built-in list. */
  replaceMoves?: boolean;
  /** Extra lines per personality. {n} = reps/seconds, {move} = move name. */
  lines?: Partial<Record<Personality, Partial<Record<LineKind, string[]>>>>;
  /** Defaults for new installs (cooldown, daily cap, wait before a nudge…). The owner's /settings still win. */
  defaults?: Partial<Settings>;
}

export const custom: Custom = {};
