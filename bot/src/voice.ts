import type { Personality } from './env';
import { custom } from './custom';

// Canned lines per personality. Nudges and confirmations never call the AI, so they cost nothing
// against the Workers AI free allowance. {n} = reps/seconds, {move} = the move name.
// Savage never jokes about bodies or weight, only about sitting and skipped moves (BOT_SPEC §7).

export const PERSONALITIES: Record<Personality, { label: string; blurb: string }> = {
  buddy: { label: '🤝 Buddy', blurb: 'friendly nudges, a bit of banter' },
  hype: { label: '📣 Hype coach', blurb: 'big energy, lots of caps' },
  zen: { label: '🧘 Zen', blurb: 'calm, gentle, breathe' },
  savage: { label: '🔥 Savage', blurb: 'roasts you (only about sitting)' },
};

export const FACE = {
  idle: '[▮_▮]',
  flex: 'ᕦ[▮_▮]ᕤ',
  proud: '[▮‿▮] ✓',
  celebrate: '\\[▮▽▮]/',
  judging: '[¬_¬]',
  zz: '[-_-]zZ',
  grass: '[▮_▮]→',
  done: '[▮◡▮]♪',
};

type Kind = 'nudge' | 'done' | 'skip' | 'snooze' | 'agent_done';

const LINES: Record<Personality, Record<Kind, string[]>> = {
  buddy: {
    nudge: ["agent's thinking. {n} {move}?", 'quick one while it works: {n} {move}', "it's busy, you're not. {n} {move}"],
    done: ['nice one 👊', "that's the stuff", 'legend. back to it'],
    skip: ['fair enough, next time', 'no stress', "all good, I'll catch you later"],
    snooze: ["cool, I'll leave you be for an hour", 'quiet mode for an hour'],
    agent_done: ['agent done. stretch before you read it?', "it's finished. stand up for a sec?"],
  },
  hype: {
    nudge: ['AGENT IS COOKING. {n} {move}. GO GO GO', "LET'S GOOO: {n} {move} RIGHT NOW", 'WHILE IT THINKS, YOU MOVE. {n} {move}'],
    done: ['YESSSS 🔥', 'ABSOLUTE UNIT', "THAT'S WHAT I'M TALKING ABOUT"],
    skip: ["OK OK, NEXT ONE'S YOURS", 'SAVING ENERGY, I RESPECT IT'],
    snooze: ['RECHARGING. BACK IN AN HOUR'],
    agent_done: ['AGENT DONE. VICTORY LAP? 🏃'],
  },
  zen: {
    nudge: ['while it thinks, so can your body. {n} {move}', 'a small moment for you: {n} {move}', 'breathe in, stand up. {n} {move}'],
    done: ['well done. notice how you feel', 'lovely', 'that was enough. good'],
    skip: ['that is okay', 'rest is fine too'],
    snooze: ['an hour of stillness. see you soon'],
    agent_done: ['the work is done. a slow stretch?'],
  },
  savage: {
    nudge: ['agent is working harder than you. {n} {move}', 'your chair has filed a complaint. {n} {move}', 'ERROR: movement not found. {n} {move}'],
    done: ['look at you, a functioning human', 'fine. that counts', 'acceptable'],
    skip: ['the chair wins again', 'noted. disappointed, but noted'],
    snooze: ['an hour off. the chair thanks you'],
    agent_done: ['agent finished. did you? no. stand up'],
  },
};

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export function line(p: Personality, kind: Kind, vars: { n?: number; move?: string } = {}) {
  // Owner's own lines from src/custom/ join the built-in ones.
  return pick([...LINES[p][kind], ...(custom.lines?.[p]?.[kind] ?? [])]).replace('{n}', String(vars.n ?? '')).replace('{move}', vars.move ?? '');
}
