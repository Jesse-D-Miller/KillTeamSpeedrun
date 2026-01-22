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

    default:
      pushIssue(issues, `Unknown event type: ${event.type}`);
      break;
  }

  return { ok: issues.length === 0, issues };
};
