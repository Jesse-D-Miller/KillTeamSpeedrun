// src/engine/rules/weaponRuleMeta.js

export const RESPONSIBILITY = Object.freeze({
  PLAYER: "PLAYER",
  AUTO: "AUTO",
  SEMI: "SEMI",
});

export const PHASES = Object.freeze({
  PRE_ROLL: "PRE_ROLL",
  ROLL: "ROLL",
  POST_ROLL: "POST_ROLL",
});

export function getRuleResponsibility(ruleOrId) {
  const id = String(ruleOrId?.id ?? ruleOrId ?? "").toLowerCase();

  switch (id) {
    case "stun":
    case "hot":
    case "shock":
    case "piercing-crits":
      return RESPONSIBILITY.SEMI;

    case "brutal":
    case "range":
    case "seek":
    case "silent":
    case "heavy":
    case "piercing":
    case "saturate":
    case "blast":
    case "torrent":
    case "devastating":
    case "limited":
      return RESPONSIBILITY.AUTO;

    case "balanced":
    case "ceaseless":
    case "relentless":
    case "accurate":
    case "lethal":
    case "punishing":
    case "rending":
    case "severe":
    case "bipod":
      return RESPONSIBILITY.PLAYER;

    default:
      return RESPONSIBILITY.PLAYER;
  }
}

export function getRulePhase(ruleId) {
  const id = String(ruleId || "").toLowerCase();
  if (id.startsWith("seek")) return PHASES.PRE_ROLL;

  switch (id) {
    case "accurate":
    case "blast":
    case "torrent":
    case "range":
    case "heavy":
    case "limited":
    case "piercing":
    case "saturate":
    case "silent":
      return PHASES.PRE_ROLL;

    case "balanced":
    case "ceaseless":
    case "relentless":
    case "lethal":
    case "bipod":
      return PHASES.ROLL;

    case "devastating":
    case "brutal":
    case "piercing-crits":
    case "punishing":
    case "rending":
    case "severe":
    case "stun":
    case "hot":
    case "shock":
      return PHASES.POST_ROLL;

    default:
      return PHASES.ROLL;
  }
}
