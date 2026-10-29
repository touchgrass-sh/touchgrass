import type { Addon } from '../hooks';
import type { E } from '../env';
import { burpeesCmd, exerciseText, goalDone, skipCmd } from './exercise';
import { parseWeight, weigh, weightCmd } from './body';
import { goalCmd, parseWaist, waist, waistCmd } from './goals';
import { looksLikeTick, tickCommand, tickTap, untickTap } from './habits';
import { lateButtons, lateCmd } from './late';
import { weekCmd } from './report';
import { fastText, tick, todayText, weekText, windowCmd, windowReminders } from './summary';
import { dash, dashActions } from './dash';
import { send } from '../tg';
import { getSettings, getState } from '../store';

// The free pack: everything from Jake that needs no AI. Weight, waist, goals and milestones, eating window + /late,
// skipping and burpees, daily ticks, the morning message, /today /week /report. Open source and
// always on (src/hooks.ts runs it after any paid pack). The paid packs in src/addons/ add the AI food features
// and reaction GIFs (moved to sudo, user 2026-10-29).

export const free: Addon = {
  plan: 'user',
  fasting: true,
  ownsMorning: true,
  helpLines: [
    '⚖️ send a number like <code>106.8</code> to log your weight · <code>waist 113</code>',
    '🏃 <code>/skip 10m</code>, <code>/burpees 50</code>, or "did 30 burpees"',
  ],
  commands: [
    { command: 'today', description: "today's numbers", help: '', run: async (env, chat) => send(env, chat, await todayText(env)) },
    { command: 'week', description: 'the last 7 days', help: '/week — the last 7 days', run: async (env, chat) => send(env, chat, await weekText(env)) },
    { command: 'report', description: 'your weekly report card', help: '', run: (env, chat) => weekCmd(env, chat) },
    { command: 'fast', description: 'fasting status', help: '/fast — fasting status · /late — eat late tonight', run: async (env, chat) => send(env, chat, await fastText(env)) },
    { command: 'late', description: "extend tonight's eating window", help: '', run: lateCmd },
    { command: 'weight', description: 'log your weight', help: '', run: weightCmd },
    { command: 'weigh', description: 'log your weight', help: '', run: weightCmd },
    { command: 'waist', description: 'log your waist', help: '', run: waistCmd },
    { command: 'goal', description: 'goal progress', help: '/goal · /window', run: goalCmd },
    { command: 'window', description: 'eating window', help: '', run: windowCmd },
    { command: 'skip', description: 'log skipping', help: '', run: skipCmd },
    { command: 'burpees', description: 'log burpees', help: '', run: burpeesCmd },
    { command: 'burpee', description: 'log burpees', help: '', run: burpeesCmd },
    { command: 'app', description: 'open the dashboard', help: '', run: async (env, chat) => send(env, chat, 'Your dashboard 👇', [[{ text: '📊 Open dashboard', app: `${await appOrigin(env)}/app` }]]) },
  ],
  buttons: {
    xg: goalDone,
    ck: tickTap,
    cx: untickTap,
    ...lateButtons,
  },
  async onCommand(env, chat, name) {
    // One command per habit, e.g. /inhaler.
    if ((await getSettings(env)).habits.some((h) => h.id === name)) {
      await tickCommand(env, chat, name);
      return true;
    }
    return false;
  },
  async onText(env, chat, text) {
    const cm = parseWaist(text);
    if (cm != null) return waist(env, chat, cm).then(() => true);
    const kg = parseWeight(text);
    if (kg != null) return weigh(env, chat, kg).then(() => true);
    if (await exerciseText(env, chat, text)) return true;
    const habit = await looksLikeTick(env, text);
    if (habit) return tickCommand(env, chat, habit).then(() => true);
    return false;
  },
  reminders: windowReminders,
  dash,
  dashActions,
  tick,
};

/** The Worker's public origin (saved by /setup), for mini app links. */
export async function appOrigin(env: E) {
  return (await getState(env, 'origin')) ?? 'https://bot.touchgrass.sh';
}
