import type { E } from './env';
import { INSTALLED } from './addons';
import { delState, getState, setState } from './store';

// Which plan this bot runs. Normally that's whatever add-on pack is installed (src/addons/). On our own
// test deployment (DEV=1) the owner can override it from /admin to see every tier.

export const PLANS = ['user', 'sudo', 'root'] as const;
export type Plan = (typeof PLANS)[number];

export const isDev = (env: E) => env.DEV === '1';

export async function getPlan(env: E): Promise<Plan> {
  if (isDev(env)) {
    const o = await getState(env, 'plan_override');
    if (o && (PLANS as readonly string[]).includes(o)) return o as Plan;
  }
  return INSTALLED;
}

/** True if the bot's plan is `need` or higher. */
export async function has(env: E, need: Plan) {
  return PLANS.indexOf(await getPlan(env)) >= PLANS.indexOf(need);
}

export async function setPlanOverride(env: E, plan: Plan | null) {
  if (!isDev(env)) return;
  if (plan) await setState(env, 'plan_override', plan);
  else await delState(env, 'plan_override');
}
