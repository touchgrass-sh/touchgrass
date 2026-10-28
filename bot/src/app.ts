// The mini app, served at /app and opened from Telegram (menu button or "⚙️ open full settings").
// One self-contained page: Telegram's web-app script, no build step. Tabs: Today, Progress, Habits, Learn,
// Settings (+ Admin on our test bot). Data comes from /api/dash (src/dash-api.ts), settings from
// /api/settings (src/settings-api.ts), both signed with Telegram's initData so only the owner gets in.
// Paid parts the plan doesn't include show as an "unlock" card: it can be minimised to one line, never removed.
// The script below avoids backticks and ${} because this whole page is one TS template string.

export const APP_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>touchgrass</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
  :root {
    --bg: var(--tg-theme-secondary-bg-color, #0d1117);
    --card: var(--tg-theme-bg-color, #161b22);
    --text: var(--tg-theme-text-color, #e6edf3);
    --hint: var(--tg-theme-hint-color, #8b949e);
    --line: color-mix(in srgb, var(--hint) 25%, transparent);
    --grass: #3fb950;
    --amber: #d29922;
    --violet: #a371f7;
    --water: #58a6ff;
    --err: #f85149;
    --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.45 -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; padding: 12px 12px calc(100px + env(safe-area-inset-bottom, 0px)); }
  .mono { font-family: var(--mono); }
  header { display: flex; align-items: center; gap: 10px; padding: 4px 4px 12px; }
  header .face { color: var(--grass); font: 700 18px var(--mono); cursor: pointer; }
  header h1 { font-size: 17px; margin: 0; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip { font: 700 11px var(--mono); padding: 2px 8px; border-radius: 999px; border: 1px solid currentColor; white-space: nowrap; }
  .chip.user { color: var(--grass); } .chip.sudo { color: var(--amber); } .chip.root { color: var(--violet); }
  .panel { display: none; } .panel.on { display: block; }
  .card, section { background: var(--card); border-radius: 14px; padding: 12px 14px; margin-bottom: 12px; }
  .card h2, section > h2 { font-size: 12px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--hint); margin: 0 0 8px; display: flex; align-items: center; gap: 8px; }
  .card h2 .right { margin-left: auto; text-transform: none; letter-spacing: 0; font-weight: 400; }
  .big { font: 700 28px/1.1 var(--mono); }
  .sub { color: var(--hint); font-size: 13px; }
  .row2 { display: flex; align-items: center; gap: 14px; }
  .grow { flex: 1; min-width: 0; }
  .bar { height: 10px; border-radius: 999px; background: var(--line); overflow: hidden; margin: 8px 0 4px; }
  .bar > i { display: block; height: 100%; border-radius: 999px; background: var(--grass); transition: width .4s; }
  .btns { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  .btn { background: transparent; color: var(--text); border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px; font: inherit; font-size: 14px; cursor: pointer; }
  .btn:active { transform: scale(.97); }
  .btn.primary { background: var(--grass); border-color: var(--grass); color: #0d1117; font-weight: 700; }
  .btn.wide { width: 100%; }
  .scroll { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; margin-top: 10px; scrollbar-width: none; }
  .scroll .btn { flex: none; font-size: 13px; }
  .list { margin: 8px 0 0; padding: 0; list-style: none; }
  .list li { display: flex; justify-content: space-between; gap: 10px; padding: 7px 0; border-top: 1px solid var(--line); font-size: 14px; }
  .list li span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chart { display: flex; align-items: flex-end; gap: 6px; height: 90px; margin-top: 6px; }
  .chart div { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; justify-content: flex-end; }
  .chart b { width: 100%; border-radius: 6px 6px 2px 2px; background: var(--grass); min-height: 3px; }
  .chart small { font-size: 11px; color: var(--hint); }
  .badges { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 8px; }
  .badge { border: 1px solid var(--line); border-radius: 12px; padding: 10px 6px; text-align: center; font-size: 12px; }
  .badge .ic { font-size: 22px; display: block; }
  .badge.off { opacity: .35; filter: grayscale(1); }
  .badge.on { border-color: var(--grass); }
  /* unlock cards */
  .lock { border: 1px dashed var(--amber); }
  .lock.root { border-color: var(--violet); }
  .lock .head { display: flex; align-items: center; gap: 8px; }
  .lock .head b { flex: 1; font-size: 14px; }
  .lock .min { background: none; border: 0; color: var(--hint); font-size: 18px; padding: 0 4px; cursor: pointer; }
  .lock ul { margin: 8px 0 0; padding-left: 18px; color: var(--hint); font-size: 13.5px; }
  .lock .ghost { margin-top: 10px; filter: blur(3px); opacity: .5; pointer-events: none; user-select: none; }
  .lock .cta { margin-top: 10px; font-size: 13px; color: var(--amber); }
  .lock.root .cta { color: var(--violet); }
  .lock.mini ul, .lock.mini .ghost, .lock.mini .cta { display: none; }
  .soon { border: 1px dashed var(--line); color: var(--hint); }
  /* tab bar */
  /* floating glass pill: blurred card, hairline border, top highlight, two-layer shadow */
  nav { position: fixed; left: 12px; right: 12px; bottom: calc(10px + env(safe-area-inset-bottom, 0px)); display: flex; gap: 4px; padding: 6px; border-radius: 24px; background: color-mix(in srgb, var(--card) 80%, transparent); -webkit-backdrop-filter: blur(18px) saturate(1.5); backdrop-filter: blur(18px) saturate(1.5); border: 1px solid var(--line); box-shadow: inset 0 1px 0 rgba(255,255,255,.07), 0 12px 32px rgba(0,0,0,.42), 0 2px 6px rgba(0,0,0,.22); z-index: 5; }
  nav button { flex: 1; background: none; border: 0; color: var(--hint); font: inherit; font-size: 11px; padding: 7px 0 10px; border-radius: 18px; display: flex; flex-direction: column; align-items: center; gap: 3px; cursor: pointer; transition: background .2s, color .2s, box-shadow .2s, transform .12s; }
  nav button .i { height: 20px; display: flex; align-items: center; }
  nav button .i svg, .mossgo .btn .i svg { width: 20px; height: 20px; display: block; }
  #navmenu svg { width: 18px; height: 18px; display: block; }
  .mossicon { font-size: 12px; font-weight: 800; line-height: 20px; }
  /* active tab: green text + a short glowing bar under it; hairline dividers between buttons */
  nav button.on { color: var(--grass); font-weight: 600; }
  nav button.on::after { content: ""; position: absolute; bottom: 2px; left: 50%; width: 16px; height: 3px; margin-left: -8px; border-radius: 3px; background: var(--grass); box-shadow: 0 0 8px var(--grass); }
  nav button + button::before { content: ""; position: absolute; left: -2px; top: 28%; bottom: 28%; width: 1px; background: var(--line); }
  nav button:active { transform: scale(.94); }
  nav { user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
  nav button { position: relative; }
  nav button .more { position: absolute; top: 3px; left: calc(50% + 14px); font-size: 9px; opacity: .8; }
  /* sub menu: long-press (phone) or hover (desktop) on a grouped tab */
  #navmenu { position: fixed; bottom: calc(86px + env(safe-area-inset-bottom, 0px)); min-width: 160px; background: color-mix(in srgb, var(--card) 86%, transparent); -webkit-backdrop-filter: blur(18px) saturate(1.5); backdrop-filter: blur(18px) saturate(1.5); border: 1px solid var(--line); border-radius: 18px; padding: 6px; box-shadow: inset 0 1px 0 rgba(255,255,255,.07), 0 12px 32px rgba(0,0,0,.42), 0 2px 6px rgba(0,0,0,.22); z-index: 7; display: none; }
  #navmenu.on { display: block; animation: menu-up .15s ease-out; }
  #navmenu button { display: flex; align-items: center; gap: 10px; width: 100%; background: none; border: 0; border-radius: 10px; color: var(--text); font: inherit; font-size: 15px; padding: 10px 12px; text-align: left; cursor: pointer; }
  #navmenu button:hover { background: var(--line); }
  #navmenu button.on { color: var(--grass); font-weight: 600; }
  #navmenu button.on::after { content: ""; margin-left: auto; width: 6px; height: 6px; border-radius: 50%; background: var(--grass); box-shadow: 0 0 6px var(--grass); }
  @keyframes menu-up { from { opacity: 0; transform: translateY(6px); } }
  /* settings form (kept from the old settings page) */
  .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 0; border-top: 1px solid var(--line); }
  section > h2 + .row, section > h2 + .slider { border-top: 0; }
  .row label { flex: 1; }
  .row small, .slider small { display: block; color: var(--hint); font-size: 12.5px; }
  .slider { display: block; padding: 11px 0; border-top: 1px solid var(--line); }
  .slider .top { display: flex; justify-content: space-between; }
  .slider .top label { flex: 1; }
  .slider output { white-space: nowrap; margin-left: 12px; color: var(--grass); font-weight: 600; }
  input[type=text], input[type=time], input[type=number], select { background: transparent; color: var(--text); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; font: inherit; max-width: 52%; }
  input[type=number] { width: 6.5em; }
  /* Phones zoom into any field under 16px when it is tapped. 16px everywhere stops that. */
  input, select, textarea { font-size: 16px !important; }
  select option { color: #000; }
  input[type=range] { width: 100%; accent-color: var(--grass); margin-top: 8px; }
  .seg { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
  .seg button { background: transparent; color: var(--text); border: 1px solid var(--line); border-radius: 999px; padding: 5px 11px; font: inherit; font-size: 13.5px; }
  .seg button[aria-pressed=true] { background: var(--grass); border-color: var(--grass); color: #0d1117; font-weight: 600; }
  /* GIF style preview: a tiny window per style, the chosen one outlined */
  .gifprev { display: flex; gap: 10px; margin: 4px 0 2px; }
  .gifprev div { flex: 1; min-width: 0; border-radius: 8px; overflow: hidden; border: 2px solid transparent; font-family: var(--mono); text-align: center; cursor: pointer; }
  .gifprev div.on { border-color: var(--grass); }
  .gifprev i { display: block; height: 10px; }
  .gifprev b { display: block; padding: 8px 0 2px; font-size: 18px; }
  .gifprev span { display: block; padding-bottom: 8px; font-size: 11px; }
  .gp-light { background: #f5f0e6; } .gp-light i { background: #e8dfcc; } .gp-light b { color: #1a7f37; } .gp-light span { color: #5f5a50; }
  .gp-dark { background: #0d1117; } .gp-dark i { background: #161b22; } .gp-dark b { color: #3fb950; } .gp-dark span { color: #8b949e; }
  .switch, .row label.switch { position: relative; width: 46px; height: 28px; flex: none; }
  .switch input { opacity: 0; width: 0; height: 0; }
  .switch span { position: absolute; inset: 0; background: var(--line); border-radius: 999px; transition: .2s; }
  .switch span::after { content: ""; position: absolute; width: 22px; height: 22px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: .2s; }
  .switch input:checked + span { background: var(--grass); }
  .switch input:checked + span::after { transform: translateX(18px); }
  .times { display: flex; gap: 6px; align-items: center; }
  .times input { max-width: 7.5em; }
  #save { display: none; width: 100%; margin-top: 4px; padding: 13px; border: 0; border-radius: 12px; background: var(--grass); color: #0d1117; font: inherit; font-weight: 700; }
  #status { position: fixed; left: 12px; right: 12px; bottom: calc(92px + env(safe-area-inset-bottom, 0px)); text-align: center; padding: 10px; border-radius: 12px; background: var(--card); box-shadow: 0 4px 18px rgba(0,0,0,.35); display: none; z-index: 6; }
  #status.err { color: var(--err); }
  .hidden { display: none !important; }
  #gate { text-align: center; padding: 40px 16px; color: var(--hint); }
  svg.ring { flex: none; }
  .dots { display: grid; grid-template-columns: repeat(15, 1fr); gap: 4px; margin: 4px 0 6px; }
  .dots i { aspect-ratio: 1; border-radius: 4px; background: var(--line); } .dots i.on { background: var(--grass); }
  details.card summary { cursor: pointer; list-style: none; }
  .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
  .card.mini { margin: 0; padding: 10px; } .card.mini b { font: 700 18px var(--mono); }
  .chip.plain { color: var(--hint); }
  /* daily ticks editor: icon · name · reminder · ✕, always inside the card */
  /* swipe left to reveal Delete, like Telegram's chat list */
  .swipe { position: relative; overflow: hidden; border-top: 1px solid var(--line); }
  .swipe .del { position: absolute; top: 0; right: 0; bottom: 0; width: 84px; border: 0; background: var(--err); color: #fff; font: inherit; font-size: 13px; font-weight: 600; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; cursor: pointer; }
  .swipe .del b { font-size: 18px; }
  .swipe:not(.reveal) .del { visibility: hidden; }
  .row.habit { display: grid; grid-template-columns: 2.2em minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 10px 0; border-top: 0; background: var(--card); position: relative; transition: transform .2s ease; touch-action: pan-y; }
  .row.habit.dragging { transition: none; }
  .row.habit input { width: 100% !important; max-width: none !important; min-width: 0; border: 0; background: transparent; padding: 4px 0; font-size: 16px; }
  .row.habit input:focus { outline: none; box-shadow: inset 0 -1px 0 var(--grass); }
  .row.habit .h_icon { font-size: 22px; text-align: center; }
  .row.habit .h_remind { width: auto !important; font-size: 14px; color: var(--hint); border: 1px solid var(--line); border-radius: 999px; padding: 4px 10px; }
  .habits-hint { display: flex; align-items: center; gap: 6px; color: var(--hint); font-size: 12.5px; margin: 2px 0 6px; }
  /* sudo: camera, meal list, day picker, target lines */
  .camrow { display: flex; gap: 8px; margin-bottom: 12px; }
  .camrow > * { flex: 1; text-align: center; padding: 12px 8px; font-weight: 600; }
  .list li > span:last-child { flex: none; white-space: nowrap; }
  .list li .x { background: none; border: 0; color: var(--hint); font-size: 15px; padding: 0 0 0 10px; cursor: pointer; }
  .list li .t { color: var(--hint); font: 12px var(--mono); margin-right: 8px; }
  .daynav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .daynav b { font-size: 16px; }
  .chart { position: relative; }
  .chart .target { position: absolute; left: 0; right: 0; border-top: 1.5px dashed var(--hint); opacity: .8; pointer-events: none; }
  .chart.wide { gap: 3px; } .chart.wide small { font-size: 9px; }
  .scan { position: fixed; inset: 0; background: #000; z-index: 20; }
  .scan video { width: 100%; height: 100%; object-fit: cover; }
  .scan .guide { position: absolute; left: 5%; right: 5%; top: 27.5%; height: 45%; border: 2px solid var(--grass); border-radius: 14px; box-shadow: 0 0 0 999px rgba(0,0,0,.35); }
  .scan .scanbar { position: absolute; left: 12px; right: 12px; bottom: calc(24px + env(safe-area-inset-bottom, 0px)); display: flex; gap: 8px; align-items: center; background: var(--card); border-radius: 14px; padding: 10px; }
  .scan .msg { flex: 1; text-align: center; }
  /* Moss tab: the site's hero Moss (site-zolt moss.astro) to play with, plus buttons to every other tab.
     Brand: floating face only, #1f9d4a, pink cheeks, soft shadow, never over green. */
  .mossbox { position: relative; height: 330px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; }
  .say { position: relative; max-width: 86%; background: var(--card); border-radius: 14px; padding: 8px 14px; font: 600 14px var(--mono); color: var(--text); text-align: center; min-height: 1.45em; }
  .say::after { content: ""; position: absolute; left: 50%; bottom: -7px; width: 14px; height: 14px; margin-left: -7px; background: var(--card); transform: rotate(45deg); border-radius: 2px; }
  .mdrag { transition: transform .45s cubic-bezier(.2, 1.6, .4, 1); }
  .mdrag.held { transition: none; }
  .moss { font-size: min(88px, 22vw); position: relative; width: 3.6em; height: 1.2em; cursor: grab; animation: moss-float 4.5s ease-in-out infinite; transition: transform .25s cubic-bezier(.2, .8, .2, 1); }
  .moss-face { position: absolute; top: 0; left: 50%; transform: translateX(-50%); height: 1.1em; font-family: "JetBrains Mono", Consolas, monospace; font-weight: 800; line-height: 1.1; letter-spacing: -.02em; white-space: nowrap; color: #1f9d4a; filter: drop-shadow(0 8px 14px rgba(0, 0, 0, .45)); }
  .moss-core { position: relative; display: inline-block; }
  .moss-side { position: absolute; top: 0; font-family: Gadugi, "Euphemia UCAS", Euphemia, "Noto Sans Canadian Aboriginal", "JetBrains Mono", Consolas, monospace; }
  .moss-l { right: 100%; } .moss-r { left: 100%; }
  .moss-mouth { display: inline-block; width: .6em; text-align: center; position: relative; }
  .moss-mouth.frown, .moss-mouth.smile { color: transparent; }
  .moss-mouth.frown::after { content: ""; position: absolute; left: .1em; right: .1em; top: .66em; height: .18em; border: .085em solid #1f9d4a; border-bottom: none; border-radius: .25em .25em 0 0; }
  .moss-mouth.smile::after { content: ""; position: absolute; left: .1em; right: .1em; top: .58em; height: .2em; border: .085em solid #1f9d4a; border-top: none; border-radius: 0 0 .25em .25em; }
  .moss-mouth.wide { transform: scale(.62) translateY(.12em); }
  .moss-eye { display: inline-block; transition: transform .12s ease-out; }
  .moss-eye.solid { width: .6em; color: transparent; position: relative; }
  .moss-eye.solid::after { content: ""; position: absolute; left: .14em; right: .14em; top: .3em; bottom: .22em; border-radius: .04em; background: #1f9d4a; }
  .moss-core.brows .moss-eye.solid::before { content: ""; position: absolute; left: .04em; right: .04em; top: .16em; height: .1em; border-radius: .04em; background: #1f9d4a; }
  .moss-core.brows #mp_e1::before { transform: rotate(22deg); }
  .moss-core.brows #mp_e2::before { transform: rotate(-22deg); }
  .moss-cheek { position: absolute; top: .98em; width: .26em; height: .11em; border-radius: 50%; background: #ff8fa3; opacity: .8; }
  .moss-c1 { left: .62em; } .moss-c2 { right: .62em; }
  .moss.boop { animation: moss-boop .35s ease-out; }
  .mosshint { text-align: center; color: var(--hint); font: 12px var(--mono); margin: -6px 0 12px; }
  .mossgo { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .mossgo .btn { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 9px 2px; font-size: 12px; font-weight: 600; background: var(--card); border-color: transparent; white-space: nowrap; }
  .mossgo .btn .i { height: 22px; display: flex; align-items: center; color: var(--grass); }
  @keyframes moss-float { 0%, 100% { translate: 0 0; } 50% { translate: 0 -10px; } }
  @keyframes moss-boop { 0% { scale: 1; } 40% { scale: .92 1.06; } 100% { scale: 1; } }
  @media (prefers-reduced-motion: reduce) { .moss, .moss.boop { animation: none; } }
</style>
</head>
<body>
<header><span class="face" id="face">[▮_▮]</span><h1 id="title">touchgrass</h1><span class="chip" id="planchip"></span></header>

<div id="gate" class="hidden"></div>

<main id="app" class="hidden">
  <div class="panel" id="p-moss">
    <div class="mossbox" id="mossbox">
      <div class="say" id="moss_say">hi. poke me, drag me, or pick a spot</div>
      <div class="mdrag" id="mdrag"><div class="moss" id="moss" role="img" aria-label="Moss"><div class="moss-face" aria-hidden="true"><span class="moss-core" id="moss_core"><span class="moss-side moss-l" id="mp_l"></span>[<span class="moss-eye solid" id="mp_e1">▮</span><span class="moss-mouth" id="mp_m">_</span><span class="moss-eye solid" id="mp_e2">▮</span>]<span class="moss-side moss-r" id="mp_r"></span><span class="moss-cheek moss-c1"></span><span class="moss-cheek moss-c2"></span></span></div></div></div>
    </div>
    <div class="mosshint">tilt your phone, he follows</div>
    <div class="mossgo" id="mossgo"></div>
  </div>
  <div class="panel on" id="p-today"></div>
  <div class="panel" id="p-meals"></div>
  <div class="panel" id="p-progress"></div>
  <div class="panel" id="p-habits"></div>
  <div class="panel" id="p-learn"></div>
  <div class="panel" id="p-settings">
    <form id="form" autocomplete="off">
      <section>
        <h2>Your buddy</h2>
        <div class="row"><label for="name">Name<small>also renames the bot in Telegram</small></label><input id="name" type="text" maxlength="24"></div>
        <div class="row"><label>Personality</label><div class="seg" id="personality"></div></div>
      </section>
      <section>
        <h2>When I can nudge you</h2>
        <div class="row"><label for="tz">Timezone</label><select id="tz"></select></div>
        <div class="row"><label>Hours</label><div class="times"><input id="hours_start" type="time"> – <input id="hours_end" type="time"></div></div>
        <div class="row"><label for="weekdays_only">Weekdays only<small>off = every day</small></label><label class="switch"><input id="weekdays_only" type="checkbox"><span></span></label></div>
      </section>
      <section>
        <h2>Agent nudges</h2>
        <div class="row"><label>Level<small>how many reps</small></label><div class="seg" id="level"></div></div>
        <div class="slider"><div class="top"><label for="wait_sec">Wait before nudging<small>agent has to be busy this long</small></label><output id="wait_sec_out"></output></div><input id="wait_sec" type="range"></div>
        <div class="slider"><div class="top"><label for="cooldown_min">Gap between nudges</label><output id="cooldown_min_out"></output></div><input id="cooldown_min" type="range"></div>
        <div class="slider"><div class="top"><label for="daily_cap">Max nudges a day</label><output id="daily_cap_out"></output></div><input id="daily_cap" type="range"></div>
      </section>
      <section>
        <h2>Water & caffeine</h2>
        <div class="slider"><div class="top"><label for="water_ml">Water target</label><output id="water_ml_out"></output></div><input id="water_ml" type="range"></div>
        <div class="row"><label for="caffeine_cutoff">Caffeine cutoff<small>I'll flag caffeine after this time</small></label><input id="caffeine_cutoff" type="time"></div>
      </section>
      <section id="set_targets">
        <h2>Daily targets <span class="chip sudo">sudo</span></h2>
        <div class="row"><label for="kcal_target">Calories<small>empty = no target</small></label><input id="kcal_target" type="number" inputmode="numeric" min="800" max="6000" step="50" placeholder="—"></div>
        <div class="row"><label for="protein_target">Protein (g)<small>a target to reach</small></label><input id="protein_target" type="number" inputmode="numeric" min="20" max="400" step="5" placeholder="—"></div>
        <div class="row"><label for="carbs_target">Carbs (g)<small>flexible</small></label><input id="carbs_target" type="number" inputmode="numeric" min="0" max="1000" step="5" placeholder="—"></div>
        <div class="row"><label for="fat_target">Fat (g)<small>flexible</small></label><input id="fat_target" type="number" inputmode="numeric" min="0" max="400" step="5" placeholder="—"></div>
      </section>
      <section>
        <h2>Eating window & mornings</h2>
        <div class="row"><label for="fasting">Eating window<small>15 min warning, open, 30 min left, fast started</small></label><label class="switch"><input id="fasting" type="checkbox"><span></span></label></div>
        <div class="row" id="window_row"><label>Eat between</label><div class="times"><input id="window_start" type="time"> – <input id="window_end" type="time"></div></div>
        <div class="row"><label for="morning">Morning message<small>yesterday's recap, today, mini goal</small></label><input id="morning" type="time"></div>
        <div class="row"><label for="goal_burpees">Mini goal: burpees<small>0 = off</small></label><input id="goal_burpees" type="number" inputmode="numeric" min="0" max="200" step="1"></div>
        <div class="row"><label for="goal_skip_min">Mini goal: skipping (min)<small>0 = off</small></label><input id="goal_skip_min" type="number" inputmode="decimal" min="0" max="60" step="0.5"></div>
      </section>
      <section id="set_sources">
        <h2>Where calories come from</h2>
        <div class="sub" style="margin:-2px 0 6px">Checked in this order. When none has the food, the AI's own estimate is used (marked "est").</div>
        <div class="row"><label for="food_db">🇬🇧 UK food database<small id="src_cofid">CoFID, UK government data</small></label><label class="switch"><input id="food_db" type="checkbox"><span></span></label></div>
        <div class="row"><label for="food_saved">📦 Your saved products<small id="src_saved">barcodes and labels you scanned</small></label><label class="switch"><input id="food_saved" type="checkbox"><span></span></label></div>
        <div class="row"><label for="food_off">🌍 Open Food Facts<small>barcode lookups, online</small></label><label class="switch"><input id="food_off" type="checkbox"><span></span></label></div>
        <div class="row"><label for="shop">Where you shop<small>helps photo guesses and ideas</small></label><input id="shop" type="text" maxlength="40" placeholder="e.g. Aldi UK"></div>
      </section>
      <section>
        <h2>You & your goals</h2>
        <div class="row"><label for="start_weight">Starting weight (kg)</label><input id="start_weight" type="number" inputmode="decimal" min="30" max="300" step="0.1" placeholder="—"></div>
        <div class="row"><label for="height_cm">Height (cm)<small>for the deficit estimate</small></label><input id="height_cm" type="number" inputmode="numeric" min="100" max="250" step="1" placeholder="—"></div>
        <div class="row"><label for="age">Age</label><input id="age" type="number" inputmode="numeric" min="13" max="110" step="1" placeholder="—"></div>
        <div class="row"><label for="sex">Sex<small>for the deficit estimate</small></label><select id="sex"><option value="">—</option><option value="m">male</option><option value="f">female</option></select></div>
        <div class="row"><label for="weight_goals">Weight goals (kg)<small>steps, last one is the goal</small></label><input id="weight_goals" type="text" placeholder="99, 94, 90, 85"></div>
        <div class="row"><label for="waist_goals">Waist goals (cm)</label><input id="waist_goals" type="text" placeholder="102, 94, 91"></div>
      </section>
      <section>
        <h2>Daily ticks</h2>
        <div class="sub" style="margin:-2px 0 4px">Each gets a /command, a button on the morning message and a reminder at its time if it isn't ticked.</div>
        <div class="habits-hint">👈 tap to edit · swipe left to remove</div>
        <div id="habits_list"></div>
        <button class="btn" type="button" id="habit_add" style="margin-top:8px">+ add one</button>
      </section>
      <section>
        <h2>Reaction GIFs</h2>
        <div class="row"><label>GIF style<small>Paper white matches the avatar</small></label><div class="seg" id="gif_theme"></div></div>
        <div class="gifprev"><div class="gp-light" data-v="light"><i></i><b>[▮‿▮]</b><span>paper white</span></div><div class="gp-dark" data-v="dark"><i></i><b>[▮‿▮]</b><span>terminal dark</span></div></div>
      </section>
      <section id="set_screen">
        <h2>Screen weather</h2>
        <div class="row"><label for="weather_lat">Latitude<small>empty = no weather</small></label><input id="weather_lat" type="number" inputmode="decimal" step="0.01" placeholder="—"></div>
        <div class="row"><label for="weather_lon">Longitude</label><input id="weather_lon" type="number" inputmode="decimal" step="0.01" placeholder="—"></div>
      </section>
      <div id="food_lock"></div>
      <button id="save" type="submit">Save</button>
    </form>
  </div>
  <div class="panel" id="p-admin"></div>
</main>

<nav id="nav" class="hidden"></nav>
<div id="navmenu"></div>

<div id="status"></div>

<script>
const tg = window.Telegram && Telegram.WebApp;
const $ = (id) => document.getElementById(id);
const PLANS = ['user', 'sudo', 'root'];
const LEVELS = { easy: '🌱 Easy', normal: '🌿 Normal', spicy: '🌶️ Spicy' };
const ZONES = ['Europe/London', 'Europe/Dublin', 'Europe/Berlin', 'Europe/Paris', 'Europe/Madrid', 'Europe/Amsterdam', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'America/Sao_Paulo', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland'];
const fmt = {
  wait_sec: (v) => (v == 0 ? 'straight away' : v < 60 ? v + 's' : (v / 60).toFixed(v % 60 ? 1 : 0) + ' min'),
  cooldown_min: (v) => (v < 60 ? v + ' min' : (v / 60).toFixed(v % 60 ? 1 : 0) + ' h'),
  daily_cap: (v) => v + (v == 1 ? ' nudge' : ' nudges'),
  water_ml: (v) => litres(v),
};
let D = null;       // dashboard data
let saved = null;   // saved settings
let tab = 'today';
let mealView = null; // Meals tab: null = today, else YYYY-MM-DD

// ---------- helpers ----------
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const litres = (ml) => (ml / 1000).toFixed(2).replace(/0$/, '').replace(/[.]0$/, '') + 'L';
const pct = (a, b) => (b ? Math.max(0, Math.min(100, Math.round((a / b) * 100))) : 0);
const has = (need) => D && PLANS.indexOf(D.plan) >= PLANS.indexOf(need);
const hm = (sec) => Math.floor(sec / 3600) + 'h ' + String(Math.floor((sec % 3600) / 60)).padStart(2, '0') + 'm';
const day3 = (d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(d + 'T12:00:00Z').getUTCDay()];
function haptic(kind) { try { tg.HapticFeedback.notificationOccurred(kind); } catch (e) {} }

function status(text, err) {
  const s = $('status');
  s.textContent = text;
  s.className = err ? 'err' : '';
  s.style.display = 'block';
  clearTimeout(status.t);
  status.t = setTimeout(() => (s.style.display = 'none'), 2200);
}

async function call(path, method, body) {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-init-data': (tg && tg.initData) || '' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({ ok: false, error: 'bad reply' }));
  if (!res.ok || !data.ok) throw new Error(data.error || 'something went wrong');
  return data;
}

async function act(action, extra) {
  try {
    const data = await call('/api/dash', 'POST', Object.assign({ action: action, view: mealView }, extra || {}));
    D = data;
    render();
    if (data.toast) status(data.toast);
    haptic('success');
    if (action === 'plan') location.reload();
  } catch (e) {
    status('[x_x] ' + e.message, true);
    haptic('error');
  }
}

function ring(value, max, color, label, size) {
  size = size || 92;
  const r = size / 2 - 7, c = 2 * Math.PI * r, p = max ? Math.min(1, value / max) : 0;
  return '<svg class="ring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
    '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="var(--line)" stroke-width="8"/>' +
    '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + c * (1 - p) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/>' +
    '<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" fill="var(--text)" font-family="ui-monospace,Menlo,monospace" font-weight="700" font-size="' + Math.round(size / 5) + '">' + esc(label) + '</text></svg>';
}

function bar(p, color) {
  return '<div class="bar"><i style="width:' + p + '%;background:' + (color || 'var(--grass)') + '"></i></div>';
}

// Minimised unlock cards are remembered per phone. Never removable.
function isMin(id) { try { return localStorage.getItem('min:' + id) === '1'; } catch (e) { return false; } }
function toggleMin(id) {
  const el = document.querySelector('[data-lock="' + id + '"]');
  const now = !el.classList.contains('mini');
  el.classList.toggle('mini', now);
  el.querySelector('.min').textContent = now ? '▸' : '▾';
  try { localStorage.setItem('min:' + id, now ? '1' : '0'); } catch (e) {}
}

function lock(id, need, title, bullets, ghost) {
  const mini = isMin(id);
  return '<div class="card lock ' + need + (mini ? ' mini' : '') + '" data-lock="' + id + '">' +
    '<div class="head"><span>🔒</span><b>' + esc(title) + '</b><span class="chip ' + need + '">' + need + '</span>' +
    '<button class="min" type="button" aria-label="minimise" onclick="toggleMin(\\'' + id + '\\')">' + (mini ? '▸' : '▾') + '</button></div>' +
    '<ul>' + bullets.map((b) => '<li>' + esc(b) + '</li>').join('') + '</ul>' +
    (ghost ? '<div class="ghost">' + ghost + '</div>' : '') +
    '<div class="cta">⚡ unlock with ' + need + ' · touchgrass.sh</div></div>';
}

function soon(title, text) {
  return '<div class="card soon"><h2>' + esc(title) + ' <span class="right">coming soon</span></h2><div class="sub">' + esc(text) + '</div></div>';
}

// ---------- tabs ----------
function today() {
  const t = D.today;
  const left = Math.max(0, t.moves.sent - t.moves.done);
  let h = '';
  h += '<div class="card"><h2>Moves <span class="right">🔥 ' + t.streak + ' day' + (t.streak === 1 ? '' : 's') + '</span></h2>' +
    '<div class="row2">' + ring(t.moves.done, Math.max(t.moves.sent, 1), 'var(--grass)', t.moves.done + '/' + t.moves.sent) +
    '<div class="grow"><div class="big">' + t.moves.done + ' done</div><div class="sub">' + (t.moves.sent ? (left ? left + ' skipped or waiting' : 'every nudge done today') : 'no nudges yet today') + '</div>' +
    '<div class="btns"><button class="btn primary" onclick="act(\\'nudge\\')">💪 nudge me now</button></div></div></div></div>';

  h += '<div class="card"><h2>Water <span class="right">' + litres(t.water.ml) + ' / ' + litres(t.water.target) + '</span></h2>' +
    bar(pct(t.water.ml, t.water.target), 'var(--water)') +
    '<div class="sub">' + (t.water.ml >= t.water.target ? '[▮‿▮] target hit' : litres(Math.max(0, t.water.target - t.water.ml)) + ' to go') + '</div>' +
    '<div class="btns">' + [250, 500, 750, 1000].map((ml) => '<button class="btn" onclick="act(\\'water\\',{ml:' + ml + '})">💧 +' + (ml === 1000 ? '1L' : ml + 'ml') + '</button>').join('') + '</div></div>';

  const c = t.caffeine;
  h += '<div class="card"><h2>Caffeine <span class="right">' + c.count + ' drink' + (c.count === 1 ? '' : 's') + ' · ~' + c.caf + 'mg</span></h2>' +
    bar(pct(c.caf, c.max), c.caf > c.max ? 'var(--err)' : 'var(--amber)') +
    '<div class="sub">' + (c.caf > c.max ? 'over the ~' + c.max + 'mg most adults are advised to stay under' : 'cutoff ' + esc(c.cutoff) + ' · ~' + c.max + 'mg a day max') + '</div>' +
    '<div class="scroll">' + D.drinks.map((d) => '<button class="btn" onclick="act(\\'caffeine\\',{key:\\'' + d.key + '\\'})">' + esc(d.label) + '</button>').join('') + '</div></div>';

  if (D.food) h = dayCards() + h;
  if (!has('sudo')) {
    h += lock('food', 'sudo', 'Calories & macros', ['snap a photo of any meal, get calories + protein from the UK food database', 'barcodes, labels and receipts read for you', 'daily targets, deficit and meal ideas that fit'],
      '<div class="row2">' + ring(1240, 2000, 'var(--amber)', '1240') + '<div class="grow"><div class="big">1240 kcal</div><div class="sub">💪 82g protein · 🍞 140g · 🧈 38g</div></div></div>');
  }

  h += '<button class="btn wide" onclick="act(\\'undo\\')">↩️ undo the last thing I logged</button>';
  $('p-today').innerHTML = h;
}

const dur = (m) => { m = Math.max(0, Math.round(m)); return Math.floor(m / 60) ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : (m % 60) + 'm'; };
const r0 = (n) => Math.round(n).toLocaleString('en-GB');

function macroCard(name, v, t, color, reach) {
  const over = t && v > t;
  return '<div class="card mini"><div class="sub">' + name + '</div><b>' + r0(v) + 'g</b>' + (t ? '<span class="sub"> / ' + t + 'g</span>' : '') +
    (t ? bar(pct(v, t), over && !reach ? 'var(--err)' : color) + '<div class="sub">' + (reach ? (v >= t ? 'target hit ✅' : r0(t - v) + 'g to go') : over ? r0(v - t) + 'g over' : r0(t - v) + 'g left') + '</div>' : '') + '</div>';
}

// Jake's Today tab: camera, calories + weight, deficit, macros, window, exercise, ticks, streaks, meals.
// Today's day cards. Food parts (camera, calories, deficit, macros, AI, meals) need sudo; the rest is free.
function dayCards() {
  const f = D.food, fa = D.fast, st = D.streaks, food = has('sudo');
  const ws = D.weights || [], last = ws[ws.length - 1];
  const change = last && D.weight_start != null ? Math.round((last.kg - D.weight_start) * 10) / 10 : null;
  const weight = last ? '<span class="sub">Weight </span><b>' + last.kg + ' kg</b>' + (change != null ? '<span class="sub"> · ' + (change > 0 ? '+' : '') + change + ' since start</span>' : '') : '';
  let h = '';
  if (food) {
    h += '<div class="camrow"><button class="btn" data-scan>📷 Scan barcode</button><label class="btn">🏷️ Snap label<input id="snap" type="file" accept="image/*" capture="environment" hidden></label></div>';
    h += '<div class="card"><div class="row2">' + ring(f.kcal, f.kcal_target || Math.max(f.kcal, 1), f.kcal_target && f.kcal > f.kcal_target ? 'var(--err)' : 'var(--amber)', String(f.kcal)) +
      '<div class="grow"><div class="sub">Eaten</div><div class="big">' + r0(f.kcal) + '</div><div class="sub">' + (f.kcal_target ? 'of ' + r0(f.kcal_target) + ' kcal · ' + (f.kcal <= f.kcal_target ? r0(f.kcal_target - f.kcal) + ' left' : r0(f.kcal - f.kcal_target) + ' over, no stress') : 'kcal today') + '</div>' +
      (weight ? '<div style="margin-top:8px">' + weight + '</div>' : '') + '</div></div></div>';
  } else if (weight) {
    h += '<div class="card"><div class="row2"><div style="font-size:30px">⚖️</div><div class="grow">' + weight + '</div></div></div>';
  }
  const df = D.deficit;
  if (food && df && df.days) {
    h += '<div class="card"><h2>🔥 Deficit ' + esc(df.label) + '<span class="right">' + df.days + ' day' + (df.days === 1 ? '' : 's') + '</span></h2><div class="big">' + (df.total >= 0 ? '−' : '+') + r0(Math.abs(df.total)) + '<span class="sub"> kcal</span></div>' +
      (df.total > 0 ? '<div class="sub">≈ ' + df.fatKg.toFixed(2) + ' kg of fat · about ' + Math.floor(df.total / 550) + ' Big Macs 🍔</div>' : '') +
      chart(df.perDay.map((x) => Math.max(0, x.def)), Math.max(500, Math.max.apply(null, df.perDay.map((x) => x.def))), 'var(--grass)', df.perDay.map((x) => day3(x.day).slice(0, 2))) + '</div>';
  }
  if (food) h += '<div class="grid3">' + macroCard('Protein', f.p, f.protein_target, 'var(--grass)', true) + macroCard('Carbs', f.c, f.carbs_target, 'var(--amber)') + macroCard('Fat', f.f, f.fat_target, 'var(--violet)') + '</div>';
  if (fa && fa.window) {
    h += '<div class="card"><div class="row2"><div style="font-size:30px">' + (fa.eating ? '🍽️' : '🔒') + '</div><div class="grow"><b>' + (fa.eating ? 'Eating window open' : 'Fasting') + '</b><div class="sub">' +
      (fa.eating ? dur(fa.minsLeft) + ' left · closes ' + esc(fa.window_end) + (fa.late ? ' (late tonight 🍔)' : '') : dur(fa.minsLeft) + ' until ' + esc(fa.window_start) + (fa.fastedMins > 0 ? ' · ' + dur(fa.fastedMins) + ' done' : '')) +
      '</div></div></div></div>';
  }
  h += '<div class="card"><div class="row2"><div style="font-size:30px">🏃</div><div class="grow"><b>🪢 ' + dur(f.skip_mins) + ' · 💥 ' + f.burpees + ' burpees</b><div class="sub">~' + r0(f.burned) + ' kcal burned (bonus, not added to food)</div></div></div></div>';
  if (D.habits && D.habits.length) {
    h += '<div class="card"><h2>Daily ticks</h2><div class="btns">' + D.habits.map((x) => '<button class="btn' + (x.done ? ' primary' : '') + '" data-habit="' + esc(x.id) + '">' + esc(x.icon) + ' ' + esc(x.label) + (x.done ? ' ✓ ' + esc(x.at) : '') + '</button>').join('') + '</div></div>';
  }
  h += '<div class="scroll" style="margin:0 0 12px">' + (food && D.fast && D.fast.window_start ? '<span class="chip plain">⏱️ ' + st.fasting + 'd window</span>' : '') + (food ? '<span class="chip plain">📝 ' + st.logging + 'd logging</span>' : '') + '<span class="chip plain">🏃 ' + st.exercise + 'd exercise</span><span class="chip plain">💧 ' + st.water + 'd water</span><span class="chip plain">🗓️ day ' + D.journey.day + (food ? ' · ' + D.journey.committed + ' committed' : '') + '</span></div>';
  if (food && D.ai && D.ai.used >= D.ai.limit * 0.7) h += '<div class="card"><b>⚠️ AI allowance ' + Math.round((D.ai.used / D.ai.limit) * 100) + '% used</b><div class="sub">photo logging and ideas pause at 100% until 01:00 UK time</div></div>';
  if (food) h += '<div class="card"><h2>Meals today</h2>' + (f.meals.length ? mealList(f.meals) : '<div class="sub">nothing yet, send the bot a photo 📸</div>') + '</div>';
  return h;
}

function chart(values, max, color, labels, target, wide) {
  // Bars sit above the 18px label row, so the target line is placed in that same space.
  const line = target ? '<i class="target" style="bottom:calc(18px + (100% - 18px) * ' + Math.min(1, target / max) + ')"></i>' : '';
  return '<div class="chart' + (wide ? ' wide' : '') + '">' + line + values.map((v, i) => '<div><b style="height:' + (v ? Math.max(3, pct(v, max)) : 0) + '%;background:' + (typeof color === 'function' ? color(v) : color) + '"></b><small>' + labels[i] + '</small></div>').join('') + '</div>';
}

function mealList(meals, detail) {
  return '<ul class="list">' + meals.map((m) => '<li style="flex-wrap:wrap"><span><span class="t">' + esc(m.time) + '</span>' + (m.caffeine ? '☕ ' : m.photo ? '📷 ' : '') + esc(m.label) + (m.late ? ' 🔒' : '') + '</span>' +
    '<span class="mono">' + (m.kcal == null ? '–' : r0(m.kcal)) + '<button class="x" data-del="' + m.id + '" aria-label="remove">✕</button></span>' +
    (detail && m.items && m.items.length > 1 ? '<div class="sub" style="width:100%;padding-left:46px">' + m.items.map((i) => esc(i.name) + (i.grams ? ' ' + i.grams + 'g' : '') + ' ' + i.kcal + (i.est ? ' est' : '')).join(' · ') + '</div>' : '') +
    '</li>').join('') + '</ul>';
}

function dayLabel(d) {
  if (d === D.day) return 'Today';
  const dt = new Date(d + 'T12:00:00Z');
  return day3(d) + ' ' + dt.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][dt.getUTCMonth()];
}

function shiftDay(d, n) {
  const dt = new Date(d + 'T12:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

async function goDay(n) {
  const next = shiftDay(mealView || D.day, n);
  if (next > D.day) return;
  mealView = next === D.day ? null : next;
  try {
    D = await call('/api/dash' + (mealView ? '?day=' + mealView : ''), 'GET');
    render();
  } catch (e) { status('[x_x] ' + e.message, true); }
}

function mealsTab() {
  if (!D.food) {
    $('p-meals').innerHTML = lock('meals', 'sudo', 'Meal history', ['every meal and drink, day by day', 'remove anything logged by mistake', 'calories and protein per day']);
    return;
  }
  const v = (mealView && D.meals_day) || D.food;
  const cur = mealView || D.day;
  let h = '<div class="daynav"><button class="btn" onclick="goDay(-1)">‹</button><b>' + dayLabel(cur) + '</b><button class="btn" onclick="goDay(1)"' + (cur >= D.day ? ' disabled style="opacity:.3"' : '') + '>›</button></div>';
  h += '<div class="card"><div class="row2">' + ring(v.kcal, v.kcal_target || Math.max(v.kcal, 1), v.kcal_target && v.kcal > v.kcal_target ? 'var(--err)' : 'var(--amber)', String(v.kcal)) +
    '<div class="grow"><div class="big">' + r0(v.kcal) + '<span class="sub"> kcal' + (v.kcal_target ? ' / ' + v.kcal_target : '') + '</span></div>' +
    '<div class="sub">💪 ' + v.p + 'g protein · 🍞 ' + v.c + 'g · 🧈 ' + v.f + 'g</div></div></div>' +
    (v.meals.length ? mealList(v.meals, true) : '<div class="sub" style="margin-top:8px">nothing logged this day</div>') + '</div>';
  if (v.exercise.length) {
    h += '<div class="card"><h2>Exercise <span class="right">~' + v.burned + ' kcal</span></h2><ul class="list">' + v.exercise.map((x) => '<li><span><span class="t">' + esc(x.time) + '</span>' +
      (x.kind === 'skip' ? '🪢 Skipping ' + dur(x.minutes || 0) + (x.reps ? ' (' + x.reps + ' jumps)' : '') : '💥 ' + x.reps + ' burpees') + '</span><span class="mono">~' + x.kcal +
      '<button class="x" data-delx="exercise:' + x.id + '">✕</button></span></li>').join('') + '</ul></div>';
  }
  if (v.water_log.length) {
    h += '<div class="card"><h2>Water <span class="right">' + litres(v.water) + '</span></h2><ul class="list">' + v.water_log.map((x) => '<li><span><span class="t">' + esc(x.time) + '</span>💧 ' + x.ml + 'ml</span>' +
      '<span class="mono"><button class="x" data-delx="water:' + x.id + '">✕</button></span></li>').join('') + '</ul></div>';
  }
  if (!mealView && D.kitchen) {
    const k = D.kitchen;
    h += '<div class="card"><h2>🧺 Kitchen <span class="right">' + k.length + ' item' + (k.length === 1 ? '' : 's') + '</span></h2>' +
      (k.length ? '<ul class="list">' + k.map((x) => '<li><span>' + esc(x.name) + '</span><span class="mono sub">use by ~' + esc(dayLabel(x.expires)) + '<button class="x" data-delx="kitchen:' + x.id + '">✕</button></span></li>').join('') + '</ul>'
        : '<div class="sub">empty. photo a shop receipt, or <span class="mono">/kitchen add eggs, milk</span> in the chat. meal ideas use what is here.</div>') + '</div>';
  }
  $('p-meals').innerHTML = h;
}

function progress() {
  const w = D.week;
  const labels = w.days.map(day3);
  const mMax = Math.max(4, Math.max.apply(null, w.moves));
  let h = '';
  h += '<div class="card"><h2>Moves this week <span class="right">' + w.moves.reduce((a, b) => a + b, 0) + ' done</span></h2>' + chart(w.moves, mMax, 'var(--grass)', labels) + '</div>';
  h += '<div class="card"><h2>Water this week <span class="right">target ' + litres(w.water_target) + '</span></h2>' + chart(w.water, Math.max(w.water_target, Math.max.apply(null, w.water)), 'var(--water)', labels) + '</div>';

  if (D.trend) {
    const tr = D.trend, T = D.targets || {};
    const tl = tr.map((x, i) => (i % 5 ? '' : String(new Date(x.day + 'T12:00:00Z').getUTCDate())));
    const logged = tr.filter((x) => x.n > 0 && x.day !== D.day);
    const avg = (k) => (logged.length ? logged.reduce((a, x) => a + x[k], 0) / logged.length : 0);
    const ws = D.weights || [], last = ws[ws.length - 1];
    const lost = last && D.weight_start != null ? Math.round((D.weight_start - last.kg) * 10) / 10 : null;
    const lostCard = '<div class="card mini"><div class="sub">Weight</div><b>' + (lost == null ? '—' : (lost >= 0 ? '−' : '+') + Math.abs(lost) + 'kg') + '</b></div>';
    const mx = (k, t) => Math.max(t || 0, Math.max.apply(null, tr.map((x) => x[k]))) * 1.1 || 1;
    if (has('sudo')) {
      h += '<div class="grid3"><div class="card mini"><div class="sub">Avg kcal</div><b>' + r0(avg('kcal')) + '</b></div><div class="card mini"><div class="sub">Avg protein</div><b>' + r0(avg('p')) + 'g</b></div>' + lostCard + '</div>';
      h += '<div class="card"><h2>Calories vs target · 30 days</h2>' + chart(tr.map((x) => x.kcal), mx('kcal', T.kcal), (v) => (T.kcal && v > T.kcal * 1.05 ? 'var(--err)' : 'var(--amber)'), tl, T.kcal, true) + '</div>';
      h += '<div class="card"><h2>Protein vs target</h2>' + chart(tr.map((x) => x.p), mx('p', T.protein), 'var(--grass)', tl, T.protein, true) + '</div>';
    } else {
      h += lock('trends', 'sudo', 'Calorie & protein trends', ['30 days of calories and protein against your targets', 'filled in from your food photos']);
    }
    h += '<div class="card"><h2>Water per day · 30 days</h2>' + chart(tr.map((x) => x.water), mx('water', T.water), 'var(--water)', tl, T.water, true) + '</div>';
    h += '<div class="card"><h2>Caffeine drinks per day</h2>' + chart(tr.map((x) => x.coffee), Math.max(4, mx('coffee')), '#8d5a3b', tl, 0, true) + '</div>';
    h += '<div class="card"><h2>Exercise (kcal burned)</h2>' + chart(tr.map((x) => x.burned), Math.max(50, mx('burned')), 'var(--grass)', tl, 0, true) + '</div>';
  }

  const b = D.badges;
  const got = b.list.filter((x) => x.on).length;
  h += '<div class="card"><h2>Badges <span class="right">' + got + ' / ' + b.list.length + ' · ' + b.total + ' moves total</span></h2><div class="badges">' +
    b.list.map((x) => '<div class="badge ' + (x.on ? 'on' : 'off') + '"><span class="ic">' + x.icon + '</span>' + esc(x.label) + (x.on ? '<div class="sub">' + esc(x.on) + '</div>' : '') + '</div>').join('') + '</div></div>';

  if (D.weights) {
    const ws = D.weights;
    let spark = '<div class="sub">no weigh-ins yet</div>';
    if (ws.length) {
      const kg = ws.map((x) => x.kg), lo = Math.min.apply(null, kg) - 0.5, hi = Math.max.apply(null, kg) + 0.5;
      const avg7 = ws.map((x, i) => { const w = ws.slice(Math.max(0, i - 6), i + 1); return w.reduce((a, y) => a + y.kg, 0) / w.length; });
      const W = 300, H = 70;
      const pts = ws.map((x, i) => [ws.length === 1 ? W / 2 : (i / (ws.length - 1)) * (W - 10) + 5, H - 5 - ((x.kg - lo) / (hi - lo)) * (H - 10)]);
      spark = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" preserveAspectRatio="none"><polyline fill="none" stroke="var(--amber)" stroke-width="2.5" points="' + pts.map((p) => p.join(',')).join(' ') + '"/>' +
        '<polyline fill="none" stroke="var(--grass)" stroke-width="2" stroke-dasharray="4 3" points="' + avg7.map((v, i) => pts[i][0] + ',' + (H - 5 - ((v - lo) / (hi - lo)) * (H - 10))).join(' ') + '"/>' +
        '<circle cx="' + pts[pts.length - 1][0] + '" cy="' + pts[pts.length - 1][1] + '" r="4" fill="var(--amber)"/></svg><div class="sub">amber = weigh-ins · green dashed = 7-day average' + (D.weight_goals && D.weight_goals.length ? ' · goal ' + D.weight_goals[D.weight_goals.length - 1] + ' kg' : '') + '</div>';
    }
    const last = ws[ws.length - 1];
    h += '<div class="card"><h2>Weight <span class="right">' + (last ? last.kg + ' kg · ' + esc(last.day) : '') + '</span></h2>' + spark +
      '<div class="btns"><input id="kg" type="number" inputmode="decimal" step="0.1" placeholder="kg" style="max-width:7em"><button class="btn" onclick="logKg()">⚖️ log weight</button></div></div>';
  } else {
    h += lock('weight', 'sudo', 'Weight trend', ['log a number, see the line', 'never praised or scolded, just data']);
  }
  h += soon('Weekly report card', 'Sunday evening in your chat: moves, water, fasts' + (has('sudo') ? ', food' : '') + '. In the app next.');
  $('p-progress').innerHTML = h;
}

function logKg() {
  const v = Number($('kg').value);
  if (!v) return status('type your weight first', true);
  act('weight', { kg: v });
}

function habits() {
  let h = '';
  if (!D.habits.length) {
    h += '<div class="card"><h2>Daily ticks</h2><div class="sub">none yet. add one in Settings → Daily ticks (an inhaler, vitamins, a stretch). each gets a /command, a morning button and a reminder.</div></div>';
  } else {
    const days = D.trend.map((x) => x.day);
    h += '<div class="card"><h2>Today</h2><div class="btns">' + D.habits.map((x) => '<button class="btn' + (x.done ? ' primary' : '') + '" data-habit="' + esc(x.id) + '">' + esc(x.icon) + ' ' + esc(x.label) + (x.done ? ' ✓ ' + esc(x.at) : '') + '</button>').join('') + '</div></div>';
    for (const x of D.habits) {
      const got = (D.habit_days.find((y) => y.id === x.id) || { days: [] }).days;
      let streak = 0;
      for (let i = days.length - 1; i >= 0; i--) { if (got.includes(days[i])) streak++; else if (i < days.length - 1) break; }
      h += '<div class="card"><h2>' + esc(x.icon) + ' ' + esc(x.label) + '<span class="right">' + got.length + '/30 days · 🔥 ' + streak + '</span></h2><div class="dots">' +
        days.map((d) => '<i class="' + (got.includes(d) ? 'on' : '') + '" title="' + d + '"></i>').join('') + '</div>' + (x.remind ? '<div class="sub">reminder at ' + esc(x.remind) + ' if not ticked</div>' : '') + '</div>';
    }
  }
  $('p-habits').innerHTML = h;
}

function learn() {
  const sec = (icon, title, body, open) => '<details class="card"' + (open ? ' open' : '') + '><summary><b>' + icon + ' ' + title + '</b></summary><div class="sub" style="margin-top:8px;color:var(--text)">' + body + '</div></details>';
  let h = '';
  if (has('sudo')) {
    h += sec('📸', 'Logging food',
      'Send a <b>photo</b> of your meal (a caption like "200g rice" helps), or type it: <span class="mono">2 eggs, 2 toast with butter</span>. ' +
      'You get a card with <b>✅ Log it / ✏️ Fix / ❌</b>, nothing is saved until ✅. ✏️ Fix lets you change the grams, the calories, what it was, or remove an item. ' +
      'Typed calories always win: <span class="mono">skewers 340g, 172 kcal per 100g</span>. Photos of a <b>barcode</b> or <b>nutrition label</b> give exact numbers, and a <b>shop receipt</b> fills your kitchen.', true);
    h += sec('🇬🇧', 'Where the numbers come from',
      'The AI only works out <i>what</i> and <i>how much</i>. Calories come from the UK food database (CoFID), then products you scanned before, then Open Food Facts for barcodes. ' +
      'Only when none of those has it is the AI estimate used, marked <i>est</i>. Switch sources in Settings.');
    h += sec('🤔', 'Just asking', '"calories in a steak?" or "thinking of having mince and broccoli" shows the numbers without logging. General questions work too.');
    h += sec('💡', 'Meal ideas', '<span class="mono">/breakfast /lunch /dinner /snack</span>: three ideas (5, 15, 30 min) sized to what is left today, using your kitchen.');
  }
  {
    h += sec('⏱️', 'Eating window', 'Reminders 15 min before it opens, when it opens, 30 min before it closes and when the fast starts. <span class="mono">/late</span> extends tonight only. <span class="mono">/fast</span> shows where you are. Black coffee, plain tea and anything under ~25 kcal do not break the fast.');
    h += sec('⚖️', 'Weight, waist & goals', 'Just send a number: <span class="mono">106.8</span>, <span class="mono">16st 9</span>. <span class="mono">waist 113</span> for your waist. Goals and milestones are in Settings, <span class="mono">/goal</span> shows progress.');
    h += sec('🏃', 'Exercise', '<span class="mono">/skip 10m</span>, <span class="mono">/skip 1200</span> (jumps), <span class="mono">/burpees 50</span>, or "did 30 burpees". Burned calories are a bonus, never added to your food budget.');
    h += sec('📊', 'Summaries', '<span class="mono">/today</span>, <span class="mono">/week</span>, ' + (has('sudo') ? '<span class="mono">/deficit</span>, <span class="mono">/targets</span>, ' : '') + '<span class="mono">/window</span>, <span class="mono">/undo</span>. The morning message has yesterday, your streaks and today.');
  }
  h += sec('💧', 'Water & caffeine', 'Type "water", "500ml" or "2 glasses of water", or tap the buttons. Type a drink ("flat white", "2 coffees") for caffeine. Water checks only nudge when you are behind.', !has('sudo'));
  h += sec('💪', 'Agent-time moves', 'When your coding agent is busy, I nudge you to move. ✅ done / skip / snooze. /hook connects Claude Code or Codex.');
  $('p-learn').innerHTML = h;
}

function admin() {
  if (!D.dev) return;
  $('p-admin').innerHTML = '<div class="card"><h2>Plan <span class="right">test bot only</span></h2><div class="sub">switch to see exactly what each customer gets</div>' +
    '<div class="btns">' + PLANS.map((p) => '<button class="btn' + (p === D.plan ? ' primary' : '') + '" onclick="act(\\'plan\\',{plan:\\'' + p + '\\'})">' + (p === D.plan ? '✓ ' : '') + p + '</button>').join('') + '</div></div>' +
    '<div class="card"><h2>More test buttons</h2><div class="sub">/admin in the chat: fake agent run, window reminders, water nudge, recap, reset today</div></div>';
}

function render() {
  if (!D) return;
  $('title').textContent = D.name || 'touchgrass';
  const chip = $('planchip');
  chip.textContent = D.plan;
  chip.className = 'chip ' + D.plan;
  mossTab(); today(); mealsTab(); progress(); habits(); learn(); admin(); drawNav();
  bindCamera();
  const sudo = has('sudo');
  $('set_targets').classList.toggle('hidden', !sudo);
  $('set_sources').classList.toggle('hidden', !sudo);
  $('set_screen').classList.toggle('hidden', !has('root'));
  if (D.sources) {
    $('src_cofid').textContent = 'CoFID, UK government data · ' + D.sources.counts.cofid.toLocaleString('en-GB') + ' foods';
    $('src_saved').textContent = 'barcodes and labels you scanned · ' + D.sources.counts.saved;
  }
  $('food_lock').innerHTML = sudo ? '' : lock('foodset', 'sudo', 'Food targets & sources', ['daily calorie + protein targets', 'UK food database, saved products, Open Food Facts']);
}

function show(name) {
  tab = name;
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('on', p.id === 'p-' + name));
  NAV.forEach((g, i) => { if (g.includes(name)) navLast[i] = name; });
  closeMenu();
  drawNav();
  window.scrollTo(0, 0);
  dirty();
}
$('face').onclick = () => show('moss');

// ---------- bottom bar ----------
// Four buttons; the grouped ones (▴) open a sub menu on long-press (phone) or hover (desktop). A plain tap goes to
// the tab last used in that group, and the button shows that tab's icon + name.
// Menu buttons use line icons, not emoji (user, 2026-10-28; emoji are fine in content).
const svg = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
const ICONS = {
  moss: '<span class="mono mossicon">[▮_▮]</span>',
  today: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  meals: svg('<path d="M7 3v18M4 3v5a3 3 0 0 0 6 0V3M18 21V3c-2.5 1-4 4-4 8h4"/>'),
  progress: svg('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
  habits: svg('<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12.5l3 3 5-6"/>'),
  learn: svg('<path d="M2 5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2z"/><path d="M22 5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7z"/>'),
  settings: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  admin: svg('<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>'),
  nudge: svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
};
const TABS = {
  moss: [ICONS.moss, 'Moss'], today: [ICONS.today, 'Today'], meals: [ICONS.meals, 'Meals'], progress: [ICONS.progress, 'Progress'],
  habits: [ICONS.habits, 'Habits'], learn: [ICONS.learn, 'Guide'], settings: [ICONS.settings, 'Settings'], admin: [ICONS.admin, 'Admin'],
};
const NAV = [['moss'], ['today', 'meals'], ['progress', 'habits'], ['learn', 'settings', 'admin']];
const navLast = NAV.map((g) => g[0]);
let menuG = -1, navPress = null, navHoverT = 0;
const navTabs = (i) => NAV[i].filter((t) => t !== 'admin' || (D && D.dev));

function drawNav() {
  $('nav').innerHTML = NAV.map((g, i) => {
    const t = navLast[i];
    return '<button data-g="' + i + '"' + (t === tab ? ' class="on"' : '') + '><span class="i">' + TABS[t][0] + '</span>' + TABS[t][1] +
      (navTabs(i).length > 1 ? '<span class="more">▴</span>' : '') + '</button>';
  }).join('');
}
function openMenu(i) {
  const tabs = navTabs(i);
  if (tabs.length < 2) return closeMenu();
  const m = $('navmenu');
  m.innerHTML = tabs.map((t) => '<button data-tab="' + t + '"' + (t === tab ? ' class="on"' : '') + '><span>' + TABS[t][0] + '</span>' + TABS[t][1] + '</button>').join('');
  m.classList.add('on');
  menuG = i;
  const b = $('nav').children[i].getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, b.left + b.width / 2 - m.offsetWidth / 2)) + 'px';
}
function closeMenu() { $('navmenu').classList.remove('on'); menuG = -1; }

(function navEvents() {
  const nav = $('nav'), menu = $('navmenu');
  const g = (ev) => { const b = ev.target.closest('nav button'); return b ? +b.dataset.g : -1; };
  nav.addEventListener('contextmenu', (ev) => ev.preventDefault());
  nav.addEventListener('pointerdown', (ev) => {
    const i = g(ev);
    if (i < 0) return;
    navPress = { i, long: false };
    if (ev.pointerType !== 'mouse') navPress.t = setTimeout(() => {
      navPress.long = true;
      openMenu(i);
      try { tg.HapticFeedback.impactOccurred('medium'); } catch (e) {}
    }, 420);
  });
  nav.addEventListener('pointerup', (ev) => {
    if (!navPress) return;
    clearTimeout(navPress.t);
    const p = navPress;
    navPress = null;
    if (!p.long && g(ev) === p.i) show(navLast[p.i]);
  });
  nav.addEventListener('pointercancel', () => { if (navPress) clearTimeout(navPress.t); navPress = null; });
  // Desktop: hover opens the group's menu, leaving bar + menu closes it.
  nav.addEventListener('pointerover', (ev) => { if (ev.pointerType !== 'mouse') return; const i = g(ev); if (i < 0) return; clearTimeout(navHoverT); if (i !== menuG) openMenu(i); });
  menu.addEventListener('pointerover', () => clearTimeout(navHoverT));
  [nav, menu].forEach((el) => el.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') navHoverT = setTimeout(closeMenu, 300); }));
  menu.addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b) show(b.dataset.tab); });
  document.addEventListener('pointerdown', (ev) => { if (menuG >= 0 && !ev.target.closest('nav, #navmenu')) closeMenu(); });
})();
drawNav();

// ---------- Moss tab ----------
// Same Moss as the site hero (site-zolt/src/components/home/moss.astro): the core [▮_▮] never moves, arms and
// extras hang off its sides, curved mouths + eyes are drawn in CSS. Eyes follow the finger/pointer (phone tilt too),
// pokes step through POKES, he can be dragged and springs back, and each button below makes a face then opens its tab.
const FACES = {
  idle: { e: '▮', m: '_' },
  happy: { e: '▮', m: '‿' },
  blink: { e: '-', m: '_' },
  celebrate: { l: '\\\\', e: '▮', m: '▽', r: '/' },
  shocked: { e: '▮', m: 'o', r: '!' },
  flex: { l: 'ᕦ', e: '▮', m: '_', r: 'ᕤ' },
  judging: { e: '¬', m: '_' },
  angry: { e: '▮', m: '︵', brows: true },
  proud: { e: '▮', m: '‿', r: ' ✓' },
  done: { e: '▮', m: '◡', r: '♪' },
  off: { e: '▮', m: '_', r: '→' },
  dead: { e: 'x', m: '_' },
  sleepy: { e: '-', m: '_', r: 'zZ' },
};
const POKES = [['celebrate', 'again!'], ['shocked', 'oi.'], ['flex', 'feel that bicep'], ['judging', 'really?'], ['sleepy', 'zzz… poke harder'], ['dead', 'you killed me'], ['angry', 'ok, stop'], ['off', 'going outside. bye']];
// [tab or action (also its icon in ICONS), label, small line, face, what he says on the way]
const GO = [
  ['today', 'Today', 'moves, water, caffeine', 'celebrate', 'today, let\\'s go'],
  ['meals', 'Meals', 'what you ate', 'happy', 'snack report incoming'],
  ['progress', 'Progress', 'weight, streaks, badges', 'proud', 'look how far you\\'ve come'],
  ['habits', 'Habits', 'daily ticks', 'judging', 'did you, though?'],
  ['learn', 'Guide', 'everything I can do', 'shocked', 'I can do HOW much?'],
  ['settings', 'Settings', 'hours, goals, my name', 'flex', 'tune me up'],
  ['nudge', 'Nudge me', 'a move in the chat', 'flex', 'check the chat. move.'],
  ['admin', 'Admin', 'test bot only', 'off', 'backstage pass'],
];
const mossReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let mossHover = null, mossBusy = 0, mossTimer = 0, mossPoke = 0;

function mossFace(name) {
  const f = FACES[name] || FACES.idle;
  $('mp_l').textContent = f.l || '';
  $('mp_r').textContent = f.r || '';
  const m = $('mp_m');
  m.textContent = f.m;
  m.classList.toggle('smile', f.m === '‿' || f.m === '◡');
  m.classList.toggle('wide', f.m === '▽');
  m.classList.toggle('frown', f.m === '︵');
  $('moss_core').classList.toggle('brows', !!f.brows);
  ['mp_e1', 'mp_e2'].forEach((id) => { $(id).textContent = f.e; $(id).classList.toggle('solid', f.e === '▮'); });
}
const mossRest = () => mossFace(mossHover || 'idle');
// A reaction holds for a moment, then he settles back.
function mossReact(face, line, ms) {
  mossFace(face);
  if (line) $('moss_say').textContent = line;
  mossBusy = Date.now() + (ms || 1400);
  clearTimeout(mossTimer);
  mossTimer = setTimeout(mossRest, ms || 1400);
  const el = $('moss');
  el.classList.remove('boop');
  void el.offsetWidth;
  el.classList.add('boop');
}
// Eyes (and a little of the whole face) lean towards a point.
function mossLook(dx, dy) {
  if (mossReduced) return;
  const len = Math.hypot(dx, dy) || 1;
  const k = Math.min(1, len / 300);
  const ex = (dx / len) * 6 * k, ey = (dy / len) * 5 * k;
  ['mp_e1', 'mp_e2'].forEach((id) => ($(id).style.transform = 'translate(' + ex + 'px,' + ey + 'px)'));
  $('moss').style.transform = 'translate(' + ex * 1.6 + 'px,' + ey * 1.2 + 'px) rotate(' + (dx / len) * 3 * k + 'deg)';
}
function mossLookAt(x, y) {
  const r = $('moss').getBoundingClientRect();
  mossLook(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
}

function mossTab() {
  $('mossgo').innerHTML = GO.filter((g) => g[0] !== 'admin' || D.dev).map((g, i) =>
    '<button class="btn" data-go="' + i + '" title="' + esc(g[2]) + '"><span class="i">' + ICONS[g[0]] + '</span>' + esc(g[1]) + '</button>').join('');
  $('mossgo').querySelectorAll('button').forEach((b) => {
    const g = GO[+b.dataset.go];
    b.onpointerenter = (ev) => { if (ev.pointerType !== 'touch') { mossHover = g[3]; if (Date.now() > mossBusy) mossRest(); } };
    b.onpointerleave = () => { mossHover = null; if (Date.now() > mossBusy) mossRest(); };
    b.onclick = () => {
      mossReact(g[3], g[4], 900);
      haptic('success');
      setTimeout(() => (g[0] === 'nudge' ? act('nudge') : show(g[0])), g[0] === 'nudge' ? 0 : 550);
    };
  });
}

(function mossPlay() {
  const box = $('mossbox'), drag = $('mdrag'), el = $('moss');
  let down = null, dragging = false;
  box.addEventListener('pointermove', (ev) => {
    if (down) {
      const dx = ev.clientX - down.x, dy = ev.clientY - down.y;
      if (!dragging && Math.hypot(dx, dy) > 8) { dragging = true; drag.classList.add('held'); mossReact('shocked', 'wheee', 60000); }
      if (dragging) {
        const b = box.getBoundingClientRect();
        const cx = Math.max(-b.width / 2 + 40, Math.min(b.width / 2 - 40, dx));
        const cy = Math.max(-b.height / 2 + 10, Math.min(b.height / 2 - 30, dy));
        drag.style.transform = 'translate(' + cx + 'px,' + cy + 'px) rotate(' + cx / 20 + 'deg)';
        return;
      }
    }
    mossLookAt(ev.clientX, ev.clientY);
  }, { passive: true });
  el.addEventListener('pointerdown', (ev) => { down = { x: ev.clientX, y: ev.clientY }; dragging = false; el.setPointerCapture(ev.pointerId); });
  const up = () => {
    if (!down) return;
    down = null;
    if (dragging) {
      dragging = false;
      drag.classList.remove('held');
      drag.style.transform = '';
      mossReact('dead', 'put me down gently next time', 1600);
      haptic('warning');
      return;
    }
    const p = POKES[mossPoke++ % POKES.length];
    mossReact(p[0], p[1]);
    haptic('success');
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  // Desktop: follow the pointer anywhere on the page while the tab is open.
  addEventListener('pointermove', (ev) => { if (tab === 'moss' && !down && ev.pointerType !== 'touch') mossLookAt(ev.clientX, ev.clientY); }, { passive: true });
  // Phones: tilt to make him look around.
  addEventListener('deviceorientation', (ev) => { if (tab === 'moss' && !down && ev.gamma != null && ev.beta != null) mossLook(ev.gamma * 12, (ev.beta - 45) * 8); });
  // Blink now and then, unless he's mid-reaction.
  (function blink() {
    if (tab === 'moss' && Date.now() > mossBusy && !mossHover) { mossFace('blink'); setTimeout(() => Date.now() > mossBusy && mossRest(), 140); }
    setTimeout(blink, 2600 + Math.random() * 3200);
  })();
})();

// ---------- camera (sudo): 📷 live barcode scan / 🏷️ label photo ----------
// Runs in the web view, so nothing lands in the phone's camera roll. Results arrive in the chat as the usual
// ✅ Log it / ✏️ Fix card. The scanner library loads from jsdelivr only when the camera opens.
const ZX = 'https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.5/dist/';
let zxReady = null;
function loadZX() {
  if (zxReady) return zxReady;
  zxReady = new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = ZX + 'iife/reader/index.js';
    sc.onload = () => { ZXingWASM.prepareZXingModule({ overrides: { locateFile: (f) => ZX + 'reader/' + f } }); res(); };
    sc.onerror = () => { zxReady = null; rej(new Error('scanner failed to load')); };
    document.head.appendChild(sc);
  });
  return zxReady;
}

async function sendToChat(action, extra, msg) {
  const r = await call('/api/dash', 'POST', Object.assign({ action: action, view: mealView }, extra));
  D = r;
  render();
  haptic('success');
  msg.textContent = r.toast || '✅ sent to your chat';
  setTimeout(() => { try { tg.close(); } catch (e) {} }, 900);
}

async function openScanner() {
  const ov = document.createElement('div');
  ov.className = 'scan';
  ov.innerHTML = '<video playsinline muted></video><div class="guide"></div><div class="scanbar"><button class="btn" data-z hidden>2x</button><span class="msg">point at the barcode</span><button class="btn" data-x>✕</button></div>';
  document.body.appendChild(ov);
  const video = ov.querySelector('video'), msg = ov.querySelector('.msg'), zb = ov.querySelector('[data-z]');
  let stream = null, stop = false, zoom = 1;
  const close = () => { stop = true; if (stream) stream.getTracks().forEach((t) => t.stop()); ov.remove(); };
  ov.querySelector('[data-x]').onclick = close;
  try {
    const both = await Promise.all([navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } }, audio: false }), loadZX()]);
    stream = both[0];
  } catch (e) { msg.textContent = 'camera did not start: ' + e.message; return; }
  if (stop) return close();
  video.srcObject = stream;
  await video.play();
  const track = stream.getVideoTracks()[0];
  const caps = track.getCapabilities ? track.getCapabilities() : {};
  if (caps.zoom && caps.zoom.max >= 2) {
    zb.hidden = false;
    zb.onclick = async () => {
      const z = zoom === 1 ? 2 : 1;
      try { await track.applyConstraints({ advanced: [{ zoom: z }] }); zoom = z; zb.textContent = z === 1 ? '2x' : '1x'; } catch (e) { zb.hidden = true; }
    };
  }
  // Decode the band inside the guide box a few times a second.
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  while (!stop) {
    await new Promise((r) => setTimeout(r, 180));
    const w = video.videoWidth, hh = video.videoHeight;
    if (!w || stop) continue;
    const cw = Math.round(w * 0.9), ch = Math.round(hh * 0.45);
    canvas.width = cw; canvas.height = ch;
    ctx.drawImage(video, (w - cw) / 2, (hh - ch) / 2, cw, ch, 0, 0, cw, ch);
    let hit = null;
    try {
      hit = (await ZXingWASM.readBarcodes(ctx.getImageData(0, 0, cw, ch), { formats: ['EAN13', 'EAN8', 'UPCA', 'UPCE'], tryHarder: true, maxNumberOfSymbols: 1 })).find((r) => r.isValid);
    } catch (e) { continue; }
    if (!hit || stop) continue;
    stop = true;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    msg.textContent = 'got ' + hit.text + ', looking it up…';
    try { await sendToChat('scan', { code: hit.text }, msg); setTimeout(() => ov.remove(), 900); }
    catch (e) { msg.textContent = '[x_x] ' + e.message; haptic('error'); }
  }
}

/** Shrink to 1600px max as JPEG (plenty for a label, keeps the AI call cheap), base64. */
async function shrinkB64(file) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85).split(',')[1];
}

async function snapLabel(file) {
  const ov = document.createElement('div');
  ov.className = 'scan';
  ov.innerHTML = '<div class="scanbar" style="bottom:45%"><span class="msg">🏷️ reading the label… (~15s)</span></div>';
  document.body.appendChild(ov);
  const msg = ov.querySelector('.msg');
  try { await sendToChat('snap', { b64: await shrinkB64(file) }, msg); setTimeout(() => ov.remove(), 900); }
  catch (e) { haptic('error'); msg.textContent = '[x_x] ' + e.message; setTimeout(() => ov.remove(), 3000); }
}

function bindCamera() {
  const sc = document.querySelector('[data-scan]'), pick = $('snap');
  if (sc) sc.onclick = openScanner;
  if (pick) pick.onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) snapLabel(f); };
}

// ✕ on an exercise, water or kitchen row (Meals tab).
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-delx]');
  if (!b) return;
  const [what, id] = b.dataset.delx.split(':');
  act('del' + what, { id: Number(id) });
});

// Tap a daily tick on the Today or Habits tab.
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-habit]');
  if (b) act('habit', { id: b.dataset.habit });
});

// ✕ on a meal (Today card or Meals tab).
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-del]');
  if (!b) return;
  const go = () => act('delmeal', { id: Number(b.dataset.del) });
  if (tg && tg.showConfirm) tg.showConfirm('Remove this from your log?', (yes) => { if (yes) go(); });
  else if (confirm('Remove this from your log?')) go();
});

// ---------- settings ----------
function seg(el, options, value) {
  el.innerHTML = '';
  for (const [key, label] of Object.entries(options)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.dataset.value = key;
    b.setAttribute('aria-pressed', String(key === value));
    b.onclick = () => {
      el.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      dirty();
    };
    el.appendChild(b);
  }
}
const segValue = (el) => { const b = el.querySelector('[aria-pressed=true]'); return b && b.dataset.value; };

function fill(data) {
  const s = data.settings;
  saved = s;
  $('name').value = s.name || '';
  seg($('personality'), data.personalities, s.personality);
  seg($('level'), LEVELS, s.level);
  const zones = ZONES.includes(s.tz) ? ZONES : [s.tz].concat(ZONES);
  $('tz').innerHTML = zones.map((z) => '<option' + (z === s.tz ? ' selected' : '') + '>' + esc(z) + '</option>').join('');
  $('hours_start').value = s.hours_start;
  $('hours_end').value = s.hours_end;
  $('weekdays_only').checked = !!s.weekdays_only;
  for (const [k, lim] of Object.entries(data.limits)) {
    const r = $(k);
    Object.assign(r, { min: lim.min, max: lim.max, step: lim.step });
    r.value = s[k];
    $(k + '_out').textContent = fmt[k](Number(s[k]));
    r.oninput = () => { $(k + '_out').textContent = fmt[k](Number(r.value)); dirty(); };
  }
  $('caffeine_cutoff').value = s.caffeine_cutoff || '14:00';
  for (const k of NUMS) $(k).value = s[k] == null ? '' : s[k];
  for (const k of BOOLS) $(k).checked = !!s[k];
  $('sex').value = s.sex || '';
  $('shop').value = s.shop || '';
  $('morning').value = s.morning || s.hours_start;
  $('weight_goals').value = (s.weight_goals || []).join(', ');
  $('waist_goals').value = (s.waist_goals || []).join(', ');
  drawHabits(s.habits || []);
  seg($('gif_theme'), GIF_THEMES, s.gif_theme || 'light');
  gifPrev();
  const fasting = !!s.window_start;
  $('fasting').checked = fasting;
  $('window_start').value = s.window_start || '12:00';
  $('window_end').value = s.window_end || '20:00';
  $('window_row').classList.toggle('hidden', !fasting);
}

const num = (id) => ($(id).value === '' ? null : Number($(id).value));
// sudo settings fields, by type.
const NUMS = ['kcal_target', 'protein_target', 'carbs_target', 'fat_target', 'start_weight', 'height_cm', 'age', 'goal_burpees', 'goal_skip_min', 'weather_lat', 'weather_lon'];
const BOOLS = ['food_db', 'food_saved', 'food_off'];
const GIF_THEMES = { light: 'Paper white', dark: 'Terminal dark' };
function gifPrev() {
  const v = segValue($('gif_theme'));
  document.querySelectorAll('.gifprev div').forEach((d) => d.classList.toggle('on', d.dataset.v === v));
}
$('gif_theme').addEventListener('click', gifPrev);
document.querySelectorAll('.gifprev div').forEach((d) => (d.onclick = () => { const b = $('gif_theme').querySelector('[data-value=' + d.dataset.v + ']'); if (b) b.click(); }));
const list = (v) => v.split(/[\\s,]+/).filter(Boolean).map(Number).sort((a, b) => b - a);

// Daily ticks editor: icon, name, reminder time per row.
function drawHabits(hs) {
  $('habits_list').innerHTML = hs.map((h, i) => '<div class="swipe"><button class="del" type="button" data-hdel="' + i + '"><b>🗑</b>Delete</button>' +
    '<div class="row habit"><input class="h_icon" type="text" maxlength="4" value="' + esc(h.icon) + '">' +
    '<input class="h_label" type="text" maxlength="30" value="' + esc(h.label) + '" placeholder="e.g. Inhaler">' +
    '<input class="h_remind" type="time" value="' + esc(h.remind || '') + '"></div></div>').join('') +
    (hs.length ? '' : '<div class="sub" style="padding:10px 0">none yet</div>');
  document.querySelectorAll('[data-hdel]').forEach((b) => (b.onclick = () => { const cur = readHabits(); cur.splice(Number(b.dataset.hdel), 1); drawHabits(cur); dirty(); }));
  document.querySelectorAll('#habits_list input').forEach((x) => x.addEventListener('input', dirty));
  document.querySelectorAll('#habits_list .row.habit').forEach(swipeable);
}

// Drag a row left to show its Delete button; let go past halfway and it stays open. Opening one closes the others.
const SWIPE = 84;
function swipeable(row) {
  let x0 = null, y0 = 0, dx = 0, open = false, sideways = null;
  const set = (x) => { row.style.transform = 'translateX(' + x + 'px)'; };
  row.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; dx = 0; sideways = null; });
  row.addEventListener('pointermove', (e) => {
    if (x0 === null) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (sideways === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) sideways = Math.abs(mx) > Math.abs(my);
    if (!sideways) return;
    dx = mx;
    row.classList.add('dragging');
    row.parentNode.classList.add('reveal');
    set(Math.max(-SWIPE - 20, Math.min(0, (open ? -SWIPE : 0) + dx)));
  });
  const end = () => {
    if (x0 === null) return;
    row.classList.remove('dragging');
    if (sideways) {
      open = (open ? -SWIPE : 0) + dx < -SWIPE / 2;
      if (open) document.querySelectorAll('#habits_list .row.habit').forEach((r) => { if (r !== row) { r.style.transform = ''; r.parentNode.classList.remove('reveal'); } });
      set(open ? -SWIPE : 0);
      // Hide the red button again once the row has slid back.
      if (!open) setTimeout(() => { if (!row.style.transform || row.style.transform === 'translateX(0px)') row.parentNode.classList.remove('reveal'); }, 220);
    }
    x0 = null;
  };
  row.addEventListener('pointerup', end);
  row.addEventListener('pointercancel', end);
  row.addEventListener('pointerleave', end);
}
function readHabits() {
  return Array.from(document.querySelectorAll('#habits_list .habit')).map((r) => ({
    icon: r.querySelector('.h_icon').value || '✅', label: r.querySelector('.h_label').value.trim(), remind: r.querySelector('.h_remind').value || null,
  })).filter((h) => h.label);
}
$('habit_add').onclick = () => { const cur = readHabits(); cur.push({ icon: '✅', label: '', remind: null }); drawHabits(cur); };

function collect() {
  const out = {
    name: $('name').value.trim(),
    personality: segValue($('personality')),
    tz: $('tz').value,
    hours_start: $('hours_start').value,
    hours_end: $('hours_end').value,
    weekdays_only: $('weekdays_only').checked,
    level: segValue($('level')),
    wait_sec: Number($('wait_sec').value),
    cooldown_min: Number($('cooldown_min').value),
    daily_cap: Number($('daily_cap').value),
    water_ml: Number($('water_ml').value),
    caffeine_cutoff: $('caffeine_cutoff').value,
  };
  {
    const fasting = $('fasting').checked;
    for (const k of NUMS) out[k] = num(k);
    for (const k of BOOLS) out[k] = $(k).checked;
    out.sex = $('sex').value || null;
    out.shop = $('shop').value.trim();
    out.morning = $('morning').value || null;
    out.weight_goals = list($('weight_goals').value);
    out.waist_goals = list($('waist_goals').value);
    out.habits = readHabits();
    out.gif_theme = segValue($('gif_theme'));
    out.window_start = fasting ? $('window_start').value : null;
    out.window_end = fasting ? $('window_end').value : null;
  }
  return out;
}
// Shape the saved settings like collect() so "changed?" compares like with like.
function shape(s) {
  const out = {
    name: s.name || '', personality: s.personality, tz: s.tz, hours_start: s.hours_start, hours_end: s.hours_end,
    weekdays_only: !!s.weekdays_only, level: s.level, wait_sec: s.wait_sec, cooldown_min: s.cooldown_min,
    daily_cap: s.daily_cap, water_ml: s.water_ml, caffeine_cutoff: s.caffeine_cutoff,
  };
  {
    for (const k of NUMS) out[k] = s[k] == null ? null : s[k];
    for (const k of BOOLS) out[k] = !!s[k];
    Object.assign(out, {
      sex: s.sex || null, shop: s.shop || '', morning: s.morning || s.hours_start, weight_goals: s.weight_goals || [], waist_goals: s.waist_goals || [],
      habits: (s.habits || []).map((h) => ({ icon: h.icon, label: h.label, remind: h.remind || null })), gif_theme: s.gif_theme || 'light', window_start: s.window_start, window_end: s.window_end,
    });
  }
  return out;
}

function dirty() {
  const changed = tab === 'settings' && saved && JSON.stringify(collect()) !== JSON.stringify(shape(saved));
  if (tg && tg.MainButton && tg.initData) {
    tg.MainButton.setParams({ text: 'Save', color: '#3fb950', text_color: '#0d1117' });
    changed ? tg.MainButton.show() : tg.MainButton.hide();
  } else {
    $('save').style.display = changed ? 'block' : 'none';
  }
}

async function save() {
  const body = collect();
  if (!body.name) delete body.name;
  try {
    if (tg && tg.MainButton) tg.MainButton.showProgress();
    const data = await call('/api/settings', 'PUT', body);
    saved = data.settings;
    $('face').textContent = '[▮‿▮] ✓';
    setTimeout(() => ($('face').textContent = '[▮_▮]'), 1500);
    status('saved ✓');
    haptic('success');
    D = await call('/api/dash', 'GET');
    render();
  } catch (e) {
    status('[x_x] ' + e.message, true);
    haptic('error');
  } finally {
    if (tg && tg.MainButton) tg.MainButton.hideProgress();
    dirty();
  }
}

$('fasting').onchange = () => { $('window_row').classList.toggle('hidden', !$('fasting').checked); dirty(); };
for (const id of ['name', 'tz', 'hours_start', 'hours_end', 'weekdays_only', 'window_start', 'window_end', 'caffeine_cutoff', 'sex', 'shop', 'morning', 'weight_goals', 'waist_goals'].concat(NUMS, BOOLS)) {
  $(id).addEventListener('input', dirty);
  $(id).addEventListener('change', dirty);
}
$('form').onsubmit = (e) => { e.preventDefault(); save(); };
if (tg) { tg.ready(); tg.expand(); if (tg.MainButton) tg.MainButton.onClick(save); }

// Refresh when the app comes back into view (e.g. after logging in the chat).
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && D) call('/api/dash', 'GET').then((d) => { D = d; render(); }).catch(() => {});
});

Promise.all([call('/api/dash', 'GET'), call('/api/settings', 'GET')]).then(([dash, set]) => {
  D = dash;
  fill(set);
  render();
  $('app').classList.remove('hidden');
  $('nav').classList.remove('hidden');
  const start = location.hash.slice(1);
  if (['moss', 'today', 'meals', 'progress', 'habits', 'learn', 'settings', 'admin'].includes(start)) show(start);
  if (new URLSearchParams(location.search).get('go') === 'scan') openScanner();
}).catch((e) => {
  const g = $('gate');
  g.innerHTML = '<div class="mono" style="color:var(--grass);font-size:22px">[x_x]</div><p>' + esc(e.message) + '</p>';
  g.classList.remove('hidden');
});
</script>
</body>
</html>`;
