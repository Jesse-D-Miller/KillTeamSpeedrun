import { createLogEntry } from "./actionCreator";
import { ACTION_CONFIG } from "../engine/rules/actionsCore";
import { isInCounteractWindow } from "./gameLoopSelectors";

const getUnit = (state, unitId) =>
  state?.game?.find((unit) => unit.id === unitId) || null;

const getUnitName = (state, unitId, fallback = "Operative") =>
  getUnit(state, unitId)?.name || fallback;

const buildEntry = (stateBefore, stateAfter, event, data) =>
  createLogEntry({
    ...data,
    meta: {
      phase: stateAfter.phase ?? stateBefore.phase ?? null,
      turningPoint: stateAfter.turningPoint ?? stateBefore.turningPoint ?? null,
      ...(data.meta || {}),
    },
    eventId: event?.meta?.eventId ?? null,
    ts: event?.meta?.ts ?? null,
    undo: null,
    redo: null,
  });

export const buildLogEntriesForEvent = (stateBefore, stateAfter, event) => {
  if (!event || !stateBefore || !stateAfter) return [];
  const entries = [];
  const { type, payload } = event;

  const add = (data) => entries.push(buildEntry(stateBefore, stateAfter, event, data));

  switch (type) {
    case "LOCK_TEAMS":
      if (!stateBefore.setup?.teamsLocked && stateAfter.setup?.teamsLocked) {
        add({ type: "LOCK_TEAMS", summary: "Rosters locked" });
      }
      break;
    case "DEPLOY_OPERATIVES":
      if (!stateBefore.setup?.deploymentComplete && stateAfter.setup?.deploymentComplete) {
        add({ type: "DEPLOY_OPERATIVES", summary: "Operatives deployed" });
      }
      break;
    case "BEGIN_BATTLE":
      add({ type: "BEGIN_BATTLE", summary: "Battle begins" });
      break;
    case "TURNING_POINT_START":
      add({
        type: "TURNING_POINT_START",
        summary: `Turning Point ${stateAfter.turningPoint ?? stateBefore.turningPoint ?? "?"} begins`,
        meta: { turningPoint: stateAfter.turningPoint ?? stateBefore.turningPoint ?? null },
      });
      break;
    case "SET_INITIATIVE": {
      const winner = payload?.winnerPlayerId || payload?.playerId;
      if (winner) {
        add({
          type: "SET_INITIATIVE",
          summary: `Initiative: Player ${winner}`,
          meta: { playerId: winner },
        });
      }
      break;
    }
    case "GAIN_CP": {
      const beforeA = stateBefore.cp?.A ?? 0;
      const beforeB = stateBefore.cp?.B ?? 0;
      const afterA = stateAfter.cp?.A ?? 0;
      const afterB = stateAfter.cp?.B ?? 0;
      const deltaA = afterA - beforeA;
      const deltaB = afterB - beforeB;
      if (deltaA > 0) {
        add({
          type: "GAIN_CP",
          summary: `Player A gains ${deltaA} CP`,
          meta: { playerId: "A", amount: deltaA },
        });
      }
      if (deltaB > 0) {
        add({
          type: "GAIN_CP",
          summary: `Player B gains ${deltaB} CP`,
          meta: { playerId: "B", amount: deltaB },
        });
      }
      break;
    }
    case "AWARD_COMMAND_POINTS": {
      const beforeA = stateBefore.cp?.A ?? 0;
      const beforeB = stateBefore.cp?.B ?? 0;
      const afterA = stateAfter.cp?.A ?? 0;
      const afterB = stateAfter.cp?.B ?? 0;
      const deltaA = afterA - beforeA;
      const deltaB = afterB - beforeB;
      if (deltaA > 0) {
        add({
          type: "GAIN_CP",
          summary: `Player A gains ${deltaA} CP`,
          meta: { playerId: "A", amount: deltaA },
        });
      }
      if (deltaB > 0) {
        add({
          type: "GAIN_CP",
          summary: `Player B gains ${deltaB} CP`,
          meta: { playerId: "B", amount: deltaB },
        });
      }
      break;
    }
    case "READY_ALL_OPERATIVES":
      if (!stateBefore.strategy?.operativesReadiedThisTP && stateAfter.strategy?.operativesReadiedThisTP) {
        add({
          type: "READY_ALL_OPERATIVES",
          summary: "All operatives readied",
          meta: { turningPoint: stateAfter.turningPoint ?? null },
        });
      }
      break;
    case "USE_STRATEGIC_PLOY": {
      const playerId = payload?.playerId;
      const ployId = payload?.ployId;
      if (playerId && ployId) {
        add({
          type: "USE_STRATEGIC_PLOY",
          summary: `Player ${playerId} used: ${ployId}`,
          meta: { playerId, ployId },
        });
      }
      break;
    }
    case "PASS_STRATEGIC_PLOY": {
      const playerId = payload?.playerId;
      if (playerId) {
        add({
          type: "PASS_STRATEGIC_PLOY",
          summary: `Player ${playerId} passed`,
          meta: { playerId, phase: "STRATEGY" },
        });
      }
      break;
    }
    case "END_STRATEGY_PHASE": {
      add({
        type: "END_STRATEGY_PHASE",
        summary: "Firefight begins",
        meta: { phase: "FIREFIGHT" },
      });
      break;
    }
    case "SET_ACTIVE_OPERATIVE": {
      const operativeId = payload?.operativeId;
      const playerId = payload?.playerId;
      const order = payload?.order;
      if (operativeId && playerId) {
        const name = getUnitName(stateAfter, operativeId);
        add({
          type: "SET_ACTIVE_OPERATIVE",
          summary: `Player ${playerId} activates ${name}${order ? ` (${order})` : ""}`,
          meta: { playerId, operativeId, order },
        });
      }
      break;
    }
    case "SET_ORDER": {
      const operativeId = payload?.operativeId;
      const order = payload?.order;
      if (operativeId && order) {
        const prevOrder = getUnit(stateBefore, operativeId)?.state?.order;
        const nextOrder = getUnit(stateAfter, operativeId)?.state?.order;
        if (prevOrder !== nextOrder) {
          add({
            type: "SET_ORDER",
            summary: `${getUnitName(stateAfter, operativeId)} set to ${order}`,
            meta: { operativeId, order },
          });
        }
      }
      break;
    }
    case "ACTION_USE": {
      const operativeId = payload?.operativeId;
      const actionKey = payload?.actionKey;
      const actionConfig = actionKey ? ACTION_CONFIG[actionKey] : null;
      if (operativeId && actionConfig) {
        const isCounteract = Boolean(stateBefore.firefight?.activation?.isCounteract);
        const beforeMarks = getUnit(stateBefore, operativeId)?.state?.actionMarks || {};
        const afterMarks = getUnit(stateAfter, operativeId)?.state?.actionMarks || {};
        const beforeAp = getUnit(stateBefore, operativeId)?.state?.apCurrent;
        const afterAp = getUnit(stateAfter, operativeId)?.state?.apCurrent;
        const markChanged = beforeMarks[actionKey] !== afterMarks[actionKey];
        const apChanged = beforeAp !== afterAp;
        if (markChanged || apChanged || isCounteract) {
          const label = actionConfig.logLabel || actionKey;
          add({
            type: isCounteract ? "COUNTERACT_ACTION_USE" : "ACTION_USE",
            summary: `${getUnitName(stateAfter, operativeId)}${isCounteract ? " counteract" : ""}: ${label} (cost ${actionConfig.cost ?? 0})`,
            meta: { operativeId, actionKey, apCost: actionConfig.cost ?? 0, isCounteract },
          });
        }
      }
      break;
    }
    case "END_ACTIVATION": {
      const operativeId = stateBefore.firefight?.activeOperativeId;
      if (operativeId) {
        add({
          type: "END_ACTIVATION",
          summary: `${getUnitName(stateBefore, operativeId)} activation ended`,
          meta: { operativeId },
        });
      }
      if (stateBefore.firefight?.activation?.isCounteract && !stateAfter.firefight?.activation) {
        const counterId = stateBefore.firefight?.activeOperativeId;
        if (counterId) {
          add({
            type: "COUNTERACT_COMPLETE",
            summary: `${getUnitName(stateBefore, counterId)} counteract complete`,
            meta: { operativeId: counterId },
          });
        }
      }
      break;
    }
    case "SKIP_ACTIVATION": {
      const playerId = payload?.playerId;
      if (playerId) {
        add({
          type: "SKIP_ACTIVATION",
          summary: `Player ${playerId} has no ready operatives (skipped)`,
          meta: { playerId },
        });
      }
      break;
    }
    case "COUNTERACT": {
      const operativeId = payload?.operativeId;
      if (operativeId && stateAfter.firefight?.activation?.isCounteract) {
        add({
          type: "COUNTERACT",
          summary: `${getUnitName(stateAfter, operativeId)} counteracts (1 free action)`,
          meta: { operativeId, playerId: payload?.playerId },
        });
      }
      break;
    }
    case "PASS_COUNTERACT_WINDOW": {
      const playerId = payload?.playerId;
      if (playerId) {
        add({
          type: "PASS_COUNTERACT_WINDOW",
          summary: `Player ${playerId} passed counteract`,
          meta: { playerId },
        });
      }
      break;
    }
    case "START_RANGED_ATTACK": {
      const attackerId = payload?.attackingOperativeId || payload?.attackerId;
      const defenderId = payload?.defendingOperativeId || payload?.defenderId;
      if (attackerId && defenderId) {
        add({
          type: "SHOOT_DECLARED",
          summary: `${getUnitName(stateAfter, attackerId, "Attacker")} declared Shoot vs ${getUnitName(stateAfter, defenderId, "defender")}`,
          meta: { attackerId, defenderId },
        });
      }
      break;
    }
    case "COMBAT_SET_ROLL_READY": {
      const playerId = payload?.playerId;
      if (playerId) {
        add({
          type: "COMBAT_READY",
          summary: `Player ${playerId} ready to resolve rolls`,
          meta: { playerId },
        });
      }
      break;
    }
    case "SET_ATTACK_ROLL": {
      const roll = payload?.roll || [];
      const attackerId = stateAfter.combatState?.attackingOperativeId || payload?.attackingOperativeId;
      if (Array.isArray(roll)) {
        add({
          type: "ATTACK_ROLL_SET",
          summary: `${getUnitName(stateAfter, attackerId, "Attacker")} attack dice: ${roll.join(", ")}`,
          meta: { attackerId, roll },
        });
      }
      break;
    }
    case "LOCK_ATTACK_ROLL": {
      const attackerId = stateAfter.combatState?.attackingOperativeId || payload?.attackingOperativeId;
      add({
        type: "ATTACK_LOCKED",
        summary: `${getUnitName(stateAfter, attackerId, "Attacker")} locked attack roll`,
        meta: { attackerId },
      });
      break;
    }
    case "SET_DEFENSE_ROLL": {
      const roll = payload?.roll || [];
      const defenderId = stateAfter.combatState?.defendingOperativeId || payload?.defendingOperativeId;
      if (Array.isArray(roll)) {
        add({
          type: "DEFENSE_ROLL_SET",
          summary: `${getUnitName(stateAfter, defenderId, "Defender")} defense dice: ${roll.join(", ")}`,
          meta: { defenderId, roll },
        });
      }
      break;
    }
    case "LOCK_DEFENSE_ROLL": {
      const defenderId = stateAfter.combatState?.defendingOperativeId || payload?.defendingOperativeId;
      add({
        type: "DEFENSE_LOCKED",
        summary: `${getUnitName(stateAfter, defenderId, "Defender")} locked defense roll`,
        meta: { defenderId },
      });
      break;
    }
    case "LOCK_ROLLS": {
      add({ type: "ROLLS_LOCKED", summary: "Rolls locked" });
      break;
    }
    case "SET_BLOCKS_RESULT": {
      const remainingHits = payload?.remainingHits ?? null;
      const remainingCrits = payload?.remainingCrits ?? null;
      add({
        type: "BLOCKS_SET",
        summary: `Blocks assigned: hits left ${remainingHits ?? 0}, crits left ${remainingCrits ?? 0}`,
        meta: { remainingHits, remainingCrits },
      });
      break;
    }
    case "APPLY_DAMAGE": {
      const targetUnitId = payload?.targetUnitId;
      const damage = payload?.damage ?? null;
      if (targetUnitId && typeof damage === "number") {
        const before = getUnit(stateBefore, targetUnitId)?.state?.woundsCurrent;
        const after = getUnit(stateAfter, targetUnitId)?.state?.woundsCurrent;
        if (before !== after) {
          add({
            type: "DAMAGE_APPLIED",
            summary: `Damage: ${getUnitName(stateAfter, targetUnitId, "Defender")} took ${damage} (${before ?? "?"}→${after ?? "?"})`,
            meta: { targetUnitId, damage, before, after },
          });
        }
      }
      break;
    }
    case "RESOLVE_COMBAT":
    case "RESOLVE_COMBAT_DONE":
      add({ type: "COMBAT_RESOLVED", summary: "Attack resolved" });
      break;
    case "CANCEL_COMBAT":
      add({ type: "COMBAT_CANCELLED", summary: "Combat cancelled" });
      break;
    case "FLOW_START_FIGHT": {
      const attackerId = payload?.attackerId;
      if (attackerId) {
        add({
          type: "FIGHT_DECLARED",
          summary: `${getUnitName(stateAfter, attackerId)} declared Fight`,
          meta: { attackerId },
        });
      }
      break;
    }
    case "FLOW_SET_TARGET": {
      const defenderId = payload?.defenderId;
      const attackerId = stateAfter.ui?.actionFlow?.attackerId || stateBefore.ui?.actionFlow?.attackerId;
      if (attackerId && defenderId) {
        add({
          type: "FIGHT_TARGET",
          summary: `Target: ${getUnitName(stateAfter, attackerId)} -> ${getUnitName(stateAfter, defenderId, "defender")}`,
          meta: { attackerId, defenderId },
        });
      }
      break;
    }
    case "FLOW_SET_WEAPON": {
      const role = payload?.role;
      const weaponName = payload?.weaponName;
      if (role && weaponName) {
        add({
          type: "FIGHT_WEAPONS_SELECTED",
          summary: `${role} selected ${weaponName}`,
          meta: { role, weaponName },
        });
      }
      break;
    }
    case "FLOW_ROLL_DICE": {
      const attacker = payload?.attacker;
      const defender = payload?.defender;
      if (attacker || defender) {
        add({
          type: "FIGHT_ROLLS",
          summary: `Fight rolls: attacker ${attacker?.raw?.join(", ") || ""} defender ${defender?.raw?.join(", ") || ""}`.trim(),
          meta: { attacker, defender },
        });
      }
      break;
    }
    case "FLOW_RESOLVE_ACTION": {
      const { actorRole, actionType, dieType, blockedType } = payload || {};
      if (actorRole && actionType) {
        add({
          type: "FIGHT_RESOLVE_STEP",
          summary: `${actorRole} ${actionType} (${dieType}${blockedType ? ` vs ${blockedType}` : ""})`,
          meta: { actorRole, actionType, dieType, blockedType },
        });
      }
      break;
    }
    default:
      break;
  }

  const wasCounteractWindow = isInCounteractWindow(stateBefore, stateBefore.firefight?.activePlayerId);
  const isCounteractWindowNow = isInCounteractWindow(stateAfter, stateAfter.firefight?.activePlayerId);
  if (!wasCounteractWindow && isCounteractWindowNow) {
    const playerId = stateAfter.firefight?.activePlayerId;
    if (playerId) {
      add({
        type: "COUNTERACT_WINDOW_OPEN",
        summary: `Counteract available for Player ${playerId}`,
        meta: { playerId },
      });
    }
  }

  if (stateBefore.turningPoint !== stateAfter.turningPoint) {
    const endedTp = stateBefore.turningPoint ?? null;
    if (endedTp) {
      add({
        type: "TURNING_POINT_END",
        summary: `Turning Point ${endedTp} ended`,
        meta: { turningPoint: endedTp },
      });
    }
  }

  return entries;
};
