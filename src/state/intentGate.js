const isFiniteNumber = (value) => Number.isFinite(Number(value));

const pushIssue = (issues, message, detail = {}) => {
  issues.push({ message, ...detail });
};

const hasUnit = (state, id) =>
  Boolean(state?.game?.some((unit) => unit.id === id));

export const validateGameIntent = (state, event) => {
  const issues = [];

  if (!event || typeof event.type !== "string") {
    pushIssue(issues, "Missing or invalid event type.");
    return { ok: false, issues };
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

    case "ACTION_USE": {
      const { operativeId, actionKey } = event.payload || {};
      if (!operativeId) pushIssue(issues, "Missing operativeId.");
      if (!actionKey) pushIssue(issues, "Missing actionKey.");
      if (operativeId && !hasUnit(state, operativeId)) {
        pushIssue(issues, "Unit not found.", { unitId: operativeId });
      }
      break;
    }

    case "ACTIVATION_START": {
      const { operativeId } = event.payload || {};
      if (!operativeId) pushIssue(issues, "Missing operativeId.");
      if (operativeId && !hasUnit(state, operativeId)) {
        pushIssue(issues, "Unit not found.", { unitId: operativeId });
      }
      break;
    }

    case "ACTIVATION_END":
    case "FLOW_CANCEL":
      break;

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
