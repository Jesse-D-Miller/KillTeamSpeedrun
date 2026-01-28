// src/engine/rules/weaponRuleUi.js
// Purpose:
// - Take a weapon's WR list (already normalized to {id, value, ...})
// - Render them as clickable UI items with REAL numbers (e.g. "Lethal 5+")
// - When clicked, push a boiled-down "do this now" prompt into ctx.ui.prompts
//
// Assumptions / contract:
// ctx.phase is one of: "PRE_ROLL" | "ROLL" | "POST_ROLL"
// ctx.ui = { prompts: [], notes: [] } (created if missing)
// ctx.log = [] (created if missing)
// ctx.weaponRules = normalized rules array
// ctx.modifiers used for "used once" gating (balancedUsed etc.)

const PHASES = ["PRE_ROLL", "ROLL", "POST_ROLL"];

const ensureUi = (ctx) => {
  ctx.ui = ctx.ui || {};
  ctx.ui.prompts = Array.isArray(ctx.ui.prompts) ? ctx.ui.prompts : [];
  ctx.ui.notes = Array.isArray(ctx.ui.notes) ? ctx.ui.notes : [];
  ctx.log = Array.isArray(ctx.log) ? ctx.log : [];
  ctx.modifiers = ctx.modifiers || {};
  return ctx;
};

const hasRetainedCrit = (ctx) =>
  Array.isArray(ctx.attackDice) &&
  ctx.attackDice.some(
    (d) =>
      Array.isArray(d.tags) && d.tags.includes("retained") && d.tags.includes("crit"),
  );

const hasRetainedHit = (ctx) =>
  Array.isArray(ctx.attackDice) &&
  ctx.attackDice.some(
    (d) =>
      Array.isArray(d.tags) &&
      d.tags.includes("retained") &&
      d.tags.includes("success") &&
      !d.tags.includes("crit"),
  );

const hasMiss = (ctx) =>
  Array.isArray(ctx.attackDice) &&
  ctx.attackDice.some((d) => {
    const tags = Array.isArray(d.tags) ? d.tags : [];
    return tags.includes("miss") || tags.includes("fail");
  });

/**
 * Human-facing display label with real numbers.
 */
export function formatWeaponRuleLabel(rule) {
  if (!rule || !rule.id) return "";
  const id = String(rule.id);

  switch (id) {
    case "lethal":
      return `Lethal ${Number(rule.value)}+`;
    case "accurate":
      return `Accurate ${Number(rule.value)}`;
    case "piercing":
      return `Piercing ${Number(rule.value)}`;
    case "piercing-crits":
      return `Piercing Crits ${Number(rule.value)}`;
    case "devastating": {
      const x = Number(rule.value);
      const dist = Number(rule.distance);
      if (Number.isFinite(dist)) return `${dist}" Devastating ${x}`;
      return `Devastating ${x}`;
    }
    case "blast":
      return `Blast ${Number(rule.value)}"`;
    case "torrent":
      return `Torrent ${Number(rule.value)}"`;
    case "range":
      return `Range ${Number(rule.value)}"`;
    case "limited":
      return `Limited ${Number(rule.value)}`;
    case "seek":
      return rule.scope ? `Seek ${String(rule.scope).replace(/^\w/, (c) => c.toUpperCase())}` : "Seek";
    case "heavy":
      return rule.only ? `Heavy (${String(rule.only)})` : "Heavy";
    default:
      // single-word rules like Brutal, Ceaseless, Balanced, Silent...
      return id.replace(/(^|-)\w/g, (m) => m.toUpperCase().replace("-", " "));
  }
}

/**
 * Boiled-down instruction text: exactly what player should/could do *right now*.
 * Keep it short. No essays. No dice manipulation in-app — this is IRL prompting.
 */
export function getWeaponRuleBoiledDown(ctx, rule, phase = ctx?.phase) {
  const id = rule?.id;
  const x = Number(rule?.value);

  switch (id) {
    case "accurate":
      return `Before rolling, you may convert up to ${x} attack dice into auto-retained hits (roll fewer dice).`;
    case "balanced":
      return `Once, you may reroll 1 attack die (recommend: lowest miss; otherwise lowest hit; otherwise lowest crit).`;
    case "ceaseless":
      return `After rolling, reroll all dice showing the most common missed value (ties: reroll the lower value).`;
    case "lethal":
      return `Critical successes are ${x}+ for this attack.`;
    case "devastating":
      return `When you lock in: for each retained crit, immediately apply ${x} extra damage.`;
    case "brutal":
      return `Defender can only block with crits (cover retains still apply if in cover).`;
    case "piercing":
      return `Defender rolls ${x} fewer defence dice (or has ${x} fewer dice available).`;
    case "piercing-crits":
      return `If you retained a crit, defender rolls ${x} fewer defence dice.`;
    case "saturate":
      return `Defender cannot retain cover saves (cover doesn’t help).`;
    case "relentless":
      return `You may reroll any/all of your attack dice (choose which).`;
    case "rending":
      return `If you retained a crit, you may upgrade 1 retained normal success into a retained crit.`;
    case "punishing":
      return `If you retained a crit, you may retain 1 failed die as a normal success.`;
    case "severe":
      return `If you retained no crits, you may upgrade 1 retained normal success into a retained crit (blocks Punishing/Rending).`;
    case "stun":
      return `If you retained a crit, apply Stun to the target (-1 APL until end of its next activation).`;
    case "silent":
      return `You can Shoot while on Conceal.`;
    case "hot":
      return `After resolving: roll for Hot and apply the self-damage effect if it triggers.`;
    case "heavy":
      return `Heavy restricts movement/shooting this activation (follow the Heavy restriction shown).`;
    case "range":
      return `This weapon can only target within ${x}".`;
    case "seek":
      return `Seek ignores cover/obscuring for targeting (as specified: ${rule.scope || "type"}).`;
    case "blast":
      return `Blast hits nearby secondary targets: resolve attacks against primary then listed secondaries.`;
    case "torrent":
      return `Torrent hits multiple targets in a line/area: select eligible targets then resolve in sequence.`;
    case "limited":
      return `You can use this weapon/rule only ${x} times (track remaining uses).`;
    case "shock":
      return `Fight only: on first crit strike each sequence, discard 1 unresolved normal success (or crit if none).`;
    default:
      return `Apply ${formatWeaponRuleLabel(rule)} as written.`;
  }
}

/**
 * Gating: should it be shown in this phase, and is it clickable right now?
 * You can tighten/adjust this to match your exact flow.
 */
function getRulePhase(rule) {
  // Default phase assignments (you can tune these later)
  switch (rule.id) {
    case "accurate":
    case "blast":
    case "torrent":
    case "range":
    case "seek":
    case "heavy":
    case "limited":
    case "piercing":
    case "saturate":
    case "silent":
      return "PRE_ROLL";

    case "balanced":
    case "ceaseless":
    case "relentless":
    case "lethal":
      return "ROLL";

    case "devastating":
    case "brutal":
    case "piercing-crits":
    case "punishing":
    case "rending":
    case "severe":
    case "stun":
    case "hot":
    case "shock":
      return "POST_ROLL";

    default:
      return "ROLL";
  }
}

function isRuleClickable(ctx, rule) {
  const id = rule.id;

  // Example gating rules that match “speed up combat” expectations:
  if (id === "balanced" && ctx?.modifiers?.balancedUsed) return { ok: false, reason: "Already used." };
  if (id === "devastating" && !ctx?.inputs?.attackLockedIn) return { ok: false, reason: "Lock in attack first." };

  if (id === "piercing-crits" && !hasRetainedCrit(ctx)) return { ok: false, reason: "No retained crits." };
  if (id === "rending" && !(hasRetainedCrit(ctx) && hasRetainedHit(ctx)))
    return { ok: false, reason: "Need a retained crit + retained hit." };
  if (id === "punishing" && !(hasRetainedCrit(ctx) && hasMiss(ctx)))
    return { ok: false, reason: "Need a retained crit + a fail." };
  if (id === "severe" && (hasRetainedCrit(ctx) || !hasRetainedHit(ctx)))
    return { ok: false, reason: "Only if no retained crits and you have a retained hit." };
  if (id === "stun" && !hasRetainedCrit(ctx)) return { ok: false, reason: "No retained crits." };

  // Limited tracking (if you track remaining in modifiers)
  if (id === "limited") {
    const max = Number(rule.value);
    const used = Number(ctx?.modifiers?.limitedUsedCount ?? 0);
    if (Number.isFinite(max) && used >= max) return { ok: false, reason: "No uses left." };
  }

  return { ok: true, reason: null };
}

/**
 * Called by UI click.
 * Adds a short prompt and logs the click; sets minimal flags for “once” rules.
 */
export function clickWeaponRule(ctx, rule, payload = {}) {
  ensureUi(ctx);

  const phase = ctx.phase || getRulePhase(rule);
  const gate = isRuleClickable(ctx, rule);
  if (!gate.ok) {
    ctx.ui.prompts.push({
      type: "RULE_BLOCKED",
      ruleId: rule.id,
      phase,
      title: formatWeaponRuleLabel(rule),
      text: gate.reason || "Not available right now.",
    });
    ctx.log.push({
      type: "RULE_CLICK_BLOCKED",
      detail: { ruleId: rule.id, phase, reason: gate.reason, payload },
    });
    return ctx;
  }

  // “Boiled down” steps: short and actionable
  const text = getWeaponRuleBoiledDown(ctx, rule, phase);

  ctx.ui.prompts.push({
    type: "RULE_PROMPT",
    ruleId: rule.id,
    phase,
    title: formatWeaponRuleLabel(rule),
    text,
    payload,
  });

  // Minimal state changes for “once per attack” helpers
  if (!payload?.preview) {
    if (rule.id === "balanced") ctx.modifiers.balancedUsed = true;
    if (rule.id === "devastating") ctx.modifiers.devastatingShown = true;
    if (rule.id === "severe") ctx.modifiers.severeActive = true;
    if (rule.id === "limited") {
      ctx.modifiers.limitedUsedCount = Number(ctx.modifiers.limitedUsedCount ?? 0) + 1;
    }
  }

  ctx.log.push({
    type: "RULE_CLICKED",
    detail: {
      ruleId: rule.id,
      label: formatWeaponRuleLabel(rule),
      phase,
      payload,
    },
  });

  return ctx;
}

/**
 * Build the list your React UI can render: shows real labels and boiled-down preview.
 * Each item includes enabled/disabled + reason + onClick callback.
 */
export function getClickableWeaponRulesForPhase(ctx, phase) {
  ensureUi(ctx);

  const rules = Array.isArray(ctx.weaponRules) ? ctx.weaponRules : [];
  const items = rules
    .map((rule) => {
      const rulePhase = getRulePhase(rule);
      if (rulePhase !== phase) return null;

      const gate = isRuleClickable(ctx, rule);
      const label = formatWeaponRuleLabel(rule);
      const preview = getWeaponRuleBoiledDown(ctx, rule, phase);

      return {
        id: rule.id,
        label,
        phase,
        enabled: gate.ok,
        disabledReason: gate.ok ? null : gate.reason,
        preview,
        // UI calls this
        onClick: (payload = {}) => clickWeaponRule(ctx, rule, payload),
      };
    })
    .filter(Boolean);

  return items;
}

export function getAllClickableWeaponRules(ctx) {
  return PHASES.reduce((acc, phase) => {
    acc[phase] = getClickableWeaponRulesForPhase(ctx, phase);
    return acc;
  }, {});
}
