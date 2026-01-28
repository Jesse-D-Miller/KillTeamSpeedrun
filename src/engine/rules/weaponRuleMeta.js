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
    case "lethal":
    case "range":
    case "seek":
    case "silent":
    case "heavy":
    case "piercing":
    case "saturate":
    case "blast":
    case "torrent":
    case "devastating":
      return RESPONSIBILITY.AUTO;

    case "balanced":
    case "ceaseless":
    case "relentless":
    case "accurate":
    case "punishing":
    case "rending":
    case "severe":
      return RESPONSIBILITY.PLAYER;

    default:
      return RESPONSIBILITY.PLAYER;
  }
}

export function getRulePhase(ruleId) {
  const id = String(ruleId || "").toLowerCase();

  switch (id) {
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
      return PHASES.PRE_ROLL;

    case "balanced":
    case "ceaseless":
    case "relentless":
    case "lethal":
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
