// Paid add-ons drop into this folder (BOT_SPEC §5). The sudo/root packs from the private repos replace
// this file: INSTALLED says which plan they unlock, ADDONS lists their hook objects (see src/hooks.ts).
// Open source installs stay on 'user' with no addons; the free pack (src/free/) is always on.

import type { Plan } from '../plan';
import type { Addon } from '../hooks';

export const INSTALLED: Plan = 'user';
export const ADDONS: Addon[] = [];
