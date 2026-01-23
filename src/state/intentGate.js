import { ACTION_CONFIG } from "../engine/rules/actionsCore";
import { canCounteract, getReadyOperatives } from "./gameLoopSelectors";

const isFiniteNumber = (value) => Number.isFinite(Number(value));

const pushIssue = (issues, message, detail = {}) => {
  issues.push({ message, ...detail });
};

const hasUnit = (state, id) =>
  Boolean(state?.game?.some((unit) => unit.id === id));

const ALWAYS_ALLOWED = new Set(["UNDO", "REDO", "LOG_PUSH"]);

const PHASE_ALLOWED_EVENTS = {
  SETUP: new Set([
    "GAME_CREATE",
    "LOCK_TEAMS",
    "SETUP_KILLZONE",
    "DEPLOY_OPERATIVES",
    "BEGIN_BATTLE",
    "TOGGLE_ORDER",
    "SET_ORDER_OVERRIDE",
    "SET_SELECTED_WEAPON",
  ]),
  STRATEGY: new Set([
    "ROLL_INITIATIVE",
    "SET_INITIATIVE",
    "GAIN_CP",
    "READY_ALL_OPERATIVES",
    "USE_STRATEGIC_GAMBIT",
    "PASS_STRATEGY",
    "END_STRATEGY_PHASE",
    "TURNING_POINT_START",
    "TOGGLE_ORDER",
    "SET_ORDER_OVERRIDE",
    "SET_SELECTED_WEAPON",
  ]),
  FIREFIGHT: new Set([
    "SET_ACTIVE_OPERATIVE",
    "SET_ORDER",
    "PERFORM_ACTION",
    "END_ACTIVATION",
    "COUNTERACT",
    "PASS_COUNTERACT_WINDOW",
    "SKIP_ACTIVATION",
    "END_FIREFIGHT_PHASE",
    "ACTION_USE",
    "ACTIVATION_END",
    "FLOW_START_SHOOT",
    "FLOW_START_FIGHT",
    "FLOW_CANCEL",
    "FLOW_SET_TARGET",
    "FLOW_SET_WEAPON",
    "FLOW_LOCK_WEAPON",
    "FLOW_ROLL_DICE",
    "FLOW_RESOLVE_ACTION",
    "START_RANGED_ATTACK",
    "SET_ATTACK_ROLL",
    "SET_COMBAT_INPUTS",
    "SET_COMBAT_MODIFIERS",
    "LOCK_ATTACK_ROLL",
    "SET_DEFENSE_ROLL",
    "LOCK_DEFENSE_ROLL",
    "SET_BLOCKS_RESULT",
    "RESOLVE_COMBAT",
    "CLEAR_COMBAT_STATE",
    "SET_COMBAT_STAGE",
    "ADVANCE_ATTACK_QUEUE",
    "APPLY_DAMAGE",
    "DAMAGE_UNIT",
    "HEAL_UNIT",
    "TOGGLE_ORDER",
    "SET_ORDER_OVERRIDE",
    "SET_SELECTED_WEAPON",
    "TURNING_POINT_END",
  ]),
  GAME_OVER: new Set(["RESET_GAME"]),
};

export const validateGameIntent = (state, event) => {
  const issues = [];

  if (!event || typeof event.type !== "string") {
    pushIssue(issues, "Missing or invalid event type.");
    return { ok: false, issues };
  }

  const phase = state?.phase ?? "SETUP";
  const allowed = PHASE_ALLOWED_EVENTS[phase];
  if (allowed && !ALWAYS_ALLOWED.has(event.type) && !allowed.has(event.type)) {
    pushIssue(issues, `Event not allowed during ${phase} phase.`);
  }

  switch (event.type) {
    case "UNDO":
    case "REDO":
    case "LOG_PUSH":
      break;

    case "APPLY_DAMAGE": {
      const { targetUnitId, damage } = event.payload || {};
      if (!targetUnitId) pushIssue(issues, "Missing targetUnitId.");
      if (!isFiniteNumber(damage) || Number(damage) < 0) {
        pushIssue(issues, "Damage must be a non-negative number.");
      }
      if (targetUnitId && !hasUnit(state, targetUnitId)) {
        pushIssue(issues, "Target unit not found.", { targetUnitId });
      }
      break;
    }

    case "DAMAGE_UNIT":
    case "HEAL_UNIT": {
      const { id, amount } = event.payload || {};
      if (!id) pushIssue(issues, "Missing unit id.");
      if (!isFiniteNumber(amount) || Number(amount) <= 0) {
        pushIssue(issues, "Amount must be a positive number.");
      }
      if (id && !hasUnit(state, id)) {
        pushIssue(issues, "Unit not found.", { unitId: id });
      }
      break;
    }

    case "TOGGLE_ORDER": {
      const { id } = event.payload || {};
      if (!id) pushIssue(issues, "Missing unit id.");
      if (id && !hasUnit(state, id)) {
        pushIssue(issues, "Unit not found.", { unitId: id });
      }
      break;
    }

    case "SET_ORDER_OVERRIDE": {
      const { id, order } = event.payload || {};
      if (!id) pushIssue(issues, "Missing unit id.");
      if (order !== "conceal" && order !== "engage") {
        pushIssue(issues, "Order must be conceal or engage.");
      }
      if (id && !hasUnit(state, id)) {
        pushIssue(issues, "Unit not found.", { unitId: id });
      }
      break;
    }

    case "SET_SELECTED_WEAPON": {
      const { id, weaponName } = event.payload || {};
      if (!id) pushIssue(issues, "Missing unit id.");
      if (!weaponName) pushIssue(issues, "Missing weapon name.");
      if (id && !hasUnit(state, id)) {
        pushIssue(issues, "Unit not found.", { unitId: id });
      }
      break;
    }

    case "START_RANGED_ATTACK": {
      const { attackingOperativeId, defendingOperativeId } = event.payload || {};
      if (attackingOperativeId && !hasUnit(state, attackingOperativeId)) {
        pushIssue(issues, "Attacking unit not found.", {
          unitId: attackingOperativeId,
        });
      }
      if (defendingOperativeId && !hasUnit(state, defendingOperativeId)) {
        pushIssue(issues, "Defending unit not found.", {
          unitId: defendingOperativeId,
        });
      }
      break;
    }

    case "SET_ATTACK_ROLL": {
      const { roll, inputs } = event.payload || {};
      if (!Array.isArray(roll)) pushIssue(issues, "Attack roll must be an array.");
      if (inputs && typeof inputs === "object") {
        const spent = inputs.accurateSpent;
        if (spent != null && (!Number.isFinite(spent) || spent < 0)) {
          pushIssue(issues, "Accurate spent must be a non-negative number.");
        }
        if (inputs.balancedClick != null && typeof inputs.balancedClick !== "boolean") {
          pushIssue(issues, "Balanced click must be a boolean.");
        }
        if (inputs.balancedUsed != null && typeof inputs.balancedUsed !== "boolean") {
          pushIssue(issues, "Balanced used must be a boolean.");
        }
      }
      break;
    }

    case "SET_COMBAT_INPUTS": {
      const { inputs } = event.payload || {};
      if (!inputs || typeof inputs !== "object") {
        pushIssue(issues, "Inputs must be an object.");
        break;
      }
      const spent = inputs.accurateSpent;
      if (spent != null && (!Number.isFinite(spent) || spent < 0)) {
        pushIssue(issues, "Accurate spent must be a non-negative number.");
      }
      if (inputs.balancedClick != null && typeof inputs.balancedClick !== "boolean") {
        pushIssue(issues, "Balanced click must be a boolean.");
      }
      if (inputs.balancedUsed != null && typeof inputs.balancedUsed !== "boolean") {
        pushIssue(issues, "Balanced used must be a boolean.");
      }
      break;
    }

    case "SET_DEFENSE_ROLL": {
      const { roll } = event.payload || {};
      if (!Array.isArray(roll)) pushIssue(issues, "Defense roll must be an array.");
      break;
    }

    case "LOCK_ATTACK_ROLL":
    case "LOCK_DEFENSE_ROLL":
    case "SET_COMBAT_STAGE":
    case "SET_COMBAT_MODIFIERS":
    case "ADVANCE_ATTACK_QUEUE":
      break;

    case "SET_BLOCKS_RESULT":
      break;

    case "RESOLVE_COMBAT":
    case "CLEAR_COMBAT_STATE":
      break;

    case "LOCK_TEAMS":
    case "DEPLOY_OPERATIVES":
    case "SETUP_KILLZONE":
      break;

    case "BEGIN_BATTLE": {
      if (state?.phase !== "SETUP") {
        pushIssue(issues, "BEGIN_BATTLE only allowed in SETUP.");
      }
      if (!state?.setup?.teamsLocked) {
        pushIssue(issues, "Teams must be locked before battle begins.");
      }
      if (!state?.setup?.deploymentComplete) {
        pushIssue(issues, "Deployment must be complete before battle begins.");
      }
      break;
    }

    case "ROLL_INITIATIVE":
    case "SET_INITIATIVE": {
      if (state?.phase !== "STRATEGY") {
        pushIssue(issues, "Initiative only allowed in STRATEGY.");
      }
      if (state?.initiativePlayerId != null) {
        pushIssue(issues, "Initiative already set.");
      }
      const winnerPlayerId = event.payload?.winnerPlayerId || event.payload?.playerId;
      if (!winnerPlayerId) pushIssue(issues, "Missing winnerPlayerId.");
      break;
    }

    case "GAIN_CP": {
      if (state?.phase !== "STRATEGY") {
        pushIssue(issues, "GAIN_CP only allowed in STRATEGY.");
      }
      if (state?.initiativePlayerId == null) {
        pushIssue(issues, "Initiative must be set before GAIN_CP.");
      }
      if (state?.strategy?.cpGrantedThisTP) {
        pushIssue(issues, "CP already granted this turning point.");
      }
      break;
    }

    case "READY_ALL_OPERATIVES": {
      if (state?.phase !== "STRATEGY") {
        pushIssue(issues, "READY_ALL_OPERATIVES only allowed in STRATEGY.");
      }
      if (!state?.strategy?.cpGrantedThisTP) {
        pushIssue(issues, "CP must be granted before readying operatives.");
      }
      if (state?.strategy?.operativesReadiedThisTP) {
        pushIssue(issues, "Operatives already readied this turning point.");
      }
      break;
    }

    case "USE_STRATEGIC_GAMBIT": {
      const { playerId, gambitId } = event.payload || {};
      if (state?.phase !== "STRATEGY") {
        pushIssue(issues, "Strategic gambits only allowed in STRATEGY.");
      }
      if (!state?.strategy?.operativesReadiedThisTP) {
        pushIssue(issues, "Operatives must be readied before using strategic gambits.");
      }
      if (!playerId) pushIssue(issues, "Missing playerId.");
      if (!gambitId) pushIssue(issues, "Missing gambitId.");
      if (playerId && state?.strategy?.turn !== playerId) {
        pushIssue(issues, "Not this player's strategy turn.");
      }
      if (
        playerId &&
        state?.strategy?.usedStrategicGambits?.[playerId]?.includes(gambitId)
      ) {
        pushIssue(issues, "Strategic gambit already used.");
      }
      break;
    }

    case "PASS_STRATEGY": {
      const { playerId } = event.payload || {};
      if (state?.phase !== "STRATEGY") {
        pushIssue(issues, "PASS_STRATEGY only allowed in STRATEGY.");
      }
      if (!playerId) pushIssue(issues, "Missing playerId.");
      if (playerId && state?.strategy?.turn !== playerId) {
        pushIssue(issues, "Not this player's strategy turn.");
      }
      break;
    }

    case "END_STRATEGY_PHASE": {
      if (state?.phase !== "STRATEGY") {
        pushIssue(issues, "END_STRATEGY_PHASE only allowed in STRATEGY.");
      }
      if (!state?.strategy?.passed?.A || !state?.strategy?.passed?.B) {
        pushIssue(issues, "Both players must pass to end strategy phase.");
      }
      break;
    }

    case "SET_ACTIVE_OPERATIVE": {
      const { playerId, operativeId } = event.payload || {};
      if (state?.phase !== "FIREFIGHT") {
        pushIssue(issues, "SET_ACTIVE_OPERATIVE only allowed in FIREFIGHT.");
      }
      if (!playerId) pushIssue(issues, "Missing playerId.");
      if (!operativeId) pushIssue(issues, "Missing operativeId.");
      if (state?.firefight?.activeOperativeId) {
        pushIssue(issues, "Active operative already set.");
      }
      if (playerId && state?.firefight?.activePlayerId !== playerId) {
        pushIssue(issues, "Not this player's turn.");
      }
      break;
    }

    case "SET_ORDER": {
      const { operativeId, order } = event.payload || {};
      if (state?.phase !== "FIREFIGHT") {
        pushIssue(issues, "SET_ORDER only allowed in FIREFIGHT.");
      }
      if (!state?.firefight?.activeOperativeId) {
        pushIssue(issues, "No active operative set.");
      }
      if (!operativeId) pushIssue(issues, "Missing operativeId.");
      if (order !== "conceal" && order !== "engage") {
        pushIssue(issues, "Order must be conceal or engage.");
      }
      if (operativeId && state?.firefight?.activeOperativeId !== operativeId) {
        pushIssue(issues, "Order can only be set for active operative.");
      }
      if (operativeId && !hasUnit(state, operativeId)) {
        pushIssue(issues, "Operative not found.", { unitId: operativeId });
      }
      const operative = state?.game?.find((unit) => unit.id === operativeId);
      if (operative && operative.owner !== state?.firefight?.activePlayerId) {
        pushIssue(issues, "Operative does not belong to active player.");
      }
      if (state?.firefight?.orderChosenThisActivation) {
        pushIssue(issues, "Order already chosen this activation.");
      }
      break;
    }

    case "END_ACTIVATION": {
      if (state?.phase !== "FIREFIGHT") {
        pushIssue(issues, "END_ACTIVATION only allowed in FIREFIGHT.");
      }
      if (!state?.firefight?.activeOperativeId) {
        pushIssue(issues, "No active operative to end.");
      }
      const operative = state?.game?.find(
        (unit) => unit.id === state?.firefight?.activeOperativeId,
      );
      if (operative && operative.owner !== state?.firefight?.activePlayerId) {
        pushIssue(issues, "Active operative does not belong to active player.");
      }
      if (!state?.firefight?.orderChosenThisActivation) {
        pushIssue(issues, "Order must be chosen before ending activation.");
      }
      break;
    }

    case "COUNTERACT": {
      const { playerId, operativeId } = event.payload || {};
      if (state?.phase !== "FIREFIGHT") {
        pushIssue(issues, "COUNTERACT only allowed in FIREFIGHT.");
      }
      if (!playerId) pushIssue(issues, "Missing playerId.");
      if (!operativeId) pushIssue(issues, "Missing operativeId.");
      if (playerId && state?.firefight?.activePlayerId !== playerId) {
        pushIssue(issues, "Not this player's turn.");
      }
      if (state?.firefight?.activeOperativeId) {
        pushIssue(issues, "Cannot counteract during an activation.");
      }
      if (playerId && getReadyOperatives(state, playerId).length > 0) {
        pushIssue(issues, "Ready operatives remain; counteract not allowed.");
      }
      if (operativeId && !hasUnit(state, operativeId)) {
        pushIssue(issues, "Operative not found.", { unitId: operativeId });
      }
      const operative = state?.game?.find((unit) => unit.id === operativeId);
      if (operative) {
        if (operative.owner !== playerId) {
          pushIssue(issues, "Operative does not belong to active player.");
        }
        if (operative.state?.readyState !== "EXPENDED") {
          pushIssue(issues, "Operative must be expended to counteract.");
        }
        if (operative.state?.order !== "engage") {
          pushIssue(issues, "Operative must be Engage to counteract.");
        }
        if (operative.state?.hasCounteractedThisTP) {
          pushIssue(issues, "Operative already counteracted this turning point.");
        }
      }
      break;
    }

    case "PASS_COUNTERACT_WINDOW": {
      const { playerId } = event.payload || {};
      if (state?.phase !== "FIREFIGHT") {
        pushIssue(issues, "PASS_COUNTERACT_WINDOW only allowed in FIREFIGHT.");
      }
      if (!playerId) pushIssue(issues, "Missing playerId.");
      if (playerId && state?.firefight?.activePlayerId !== playerId) {
        pushIssue(issues, "Not this player's turn.");
      }
      if (state?.firefight?.activeOperativeId) {
        pushIssue(issues, "Cannot pass during an activation.");
      }
      if (playerId && getReadyOperatives(state, playerId).length > 0) {
        pushIssue(issues, "Ready operatives remain; cannot pass.");
      }
      if (playerId && !canCounteract(state, playerId)) {
        pushIssue(issues, "No counteract available to pass.");
      }
      break;
    }

    case "SKIP_ACTIVATION": {
      const { playerId } = event.payload || {};
      if (state?.phase !== "FIREFIGHT") {
        pushIssue(issues, "SKIP_ACTIVATION only allowed in FIREFIGHT.");
      }
      if (!playerId) pushIssue(issues, "Missing playerId.");
      if (playerId && state?.firefight?.activePlayerId !== playerId) {
        pushIssue(issues, "Not this player's turn.");
      }
      if (state?.firefight?.activeOperativeId) {
        pushIssue(issues, "Cannot skip while an operative is active.");
      }
      if (playerId && getReadyOperatives(state, playerId).length > 0) {
        pushIssue(issues, "Ready operatives remain; cannot skip.");
      }
      break;
    }

    case "END_FIREFIGHT_PHASE": {
      if (state?.phase !== "FIREFIGHT") {
        pushIssue(issues, "END_FIREFIGHT_PHASE only allowed in FIREFIGHT.");
      }
      break;
    }

    case "TURNING_POINT_END": {
      const { turningPoint: tp } = event.payload || {};
      if (state?.phase !== "FIREFIGHT") {
        pushIssue(issues, "TURNING_POINT_END only allowed after FIREFIGHT.");
      }
      if (!Number.isFinite(tp)) {
        pushIssue(issues, "Missing turningPoint.");
      }
      if (Number.isFinite(tp) && Number(state?.turningPoint ?? 0) !== Number(tp)) {
        pushIssue(issues, "turningPoint does not match current state.");
      }
      break;
    }

    case "GAME_END": {
      if (Number(state?.turningPoint ?? 0) !== 4) {
        pushIssue(issues, "GAME_END only allowed at turning point 4.");
      }
      break;
    }

    case "ACTION_USE": {
      const { operativeId, actionKey } = event.payload || {};
      if (!operativeId) pushIssue(issues, "Missing operativeId.");
      if (!actionKey) pushIssue(issues, "Missing actionKey.");
      if (operativeId && !hasUnit(state, operativeId)) {
        pushIssue(issues, "Unit not found.", { unitId: operativeId });
      }
      if (state?.phase !== "FIREFIGHT") {
        pushIssue(issues, "ACTION_USE only allowed in FIREFIGHT.");
      }
      if (operativeId && state?.firefight?.activeOperativeId !== operativeId) {
        pushIssue(issues, "Only the active operative can act.");
      }
      const operative = state?.game?.find((unit) => unit.id === operativeId);
      if (operative && operative.owner !== state?.firefight?.activePlayerId) {
        pushIssue(issues, "Only the active player can act.");
      }
      if (!state?.firefight?.orderChosenThisActivation) {
        pushIssue(issues, "Order must be chosen before acting.");
      }
      if (state?.firefight?.awaitingActions !== true) {
        pushIssue(issues, "Activation is not ready for actions.");
      }
      const actionConfig = actionKey ? ACTION_CONFIG[actionKey] : null;
      if (actionKey && !actionConfig) {
        pushIssue(issues, "Unknown action.");
      }
      const isCounteract = Boolean(state?.firefight?.activation?.isCounteract);
      const actionsAllowed = Number(state?.firefight?.activation?.actionsAllowed ?? 0);
      const actionsTaken = state?.firefight?.activation?.actionsTaken || [];
      if (isCounteract && actionConfig) {
        const cost = Number(actionConfig?.cost ?? 0);
        if (cost !== 1) {
          pushIssue(issues, "Counteract allows only 1AP actions.");
        }
      }
      if (isCounteract && actionsAllowed > 0 && actionsTaken.length >= actionsAllowed) {
        pushIssue(issues, "Counteract action already used.");
      }
      if (operative && actionConfig && !isCounteract) {
        const ap = Number(operative?.state?.apCurrent ?? 0);
        const cost = Number(actionConfig?.cost ?? 0);
        if (!Number.isFinite(ap) || ap < cost) {
          pushIssue(issues, "Not enough APL for this action.");
        }
      }
      break;
    }

    case "ACTIVATION_END":
    case "FLOW_CANCEL":
      break;

    case "TURNING_POINT_START": {
      const { turningPoint: tp } = event.payload || {};
      if (state?.phase !== "STRATEGY") {
        pushIssue(issues, "TURNING_POINT_START only allowed in STRATEGY.");
      }
      if (!Number.isFinite(tp)) {
        pushIssue(issues, "Missing turningPoint.");
      }
      if (Number.isFinite(tp) && Number(state?.turningPoint ?? 0) !== Number(tp)) {
        pushIssue(issues, "turningPoint does not match current state.");
      }
      break;
    }

    case "FLOW_START_SHOOT":
    case "FLOW_START_FIGHT": {
      const { attackerId } = event.payload || {};
      if (!attackerId) pushIssue(issues, "Missing attackerId.");
      if (attackerId && !hasUnit(state, attackerId)) {
        pushIssue(issues, "Unit not found.", { unitId: attackerId });
      }
      break;
    }

    case "FLOW_SET_TARGET": {
      const { defenderId } = event.payload || {};
      if (!defenderId) pushIssue(issues, "Missing defenderId.");
      if (defenderId && !hasUnit(state, defenderId)) {
        pushIssue(issues, "Unit not found.", { unitId: defenderId });
      }
      break;
    }

    case "FLOW_SET_WEAPON": {
      const { role, weaponName } = event.payload || {};
      if (role !== "attacker" && role !== "defender") {
        pushIssue(issues, "Role must be attacker or defender.");
      }
      if (!weaponName) pushIssue(issues, "Missing weaponName.");
      break;
    }

    case "FLOW_LOCK_WEAPON": {
      const { role } = event.payload || {};
      if (role !== "attacker" && role !== "defender") {
        pushIssue(issues, "Role must be attacker or defender.");
      }
      break;
    }

    case "FLOW_ROLL_DICE": {
      const { attacker, defender } = event.payload || {};
      if (!attacker || !defender) pushIssue(issues, "Missing dice payload.");
      break;
    }

    case "FLOW_RESOLVE_ACTION": {
      const { actorRole, actionType, dieType } = event.payload || {};
      if (actorRole !== "attacker" && actorRole !== "defender") {
        pushIssue(issues, "Role must be attacker or defender.");
      }
      if (actionType !== "strike" && actionType !== "block") {
        pushIssue(issues, "ActionType must be strike or block.");
      }
      if (dieType !== "crit" && dieType !== "norm") {
        pushIssue(issues, "DieType must be crit or norm.");
      }
      break;
    }

    default:
      pushIssue(issues, `Unknown event type: ${event.type}`);
      break;
  }

  return { ok: issues.length === 0, issues };
};
