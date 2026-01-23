import { createLogEntry } from "./actionCreator";
import { ACTION_CONFIG } from "../engine/rules/actionsCore";
import {
	allOperativesExpended,
	canCounteract,
	getReadyOperatives,
} from "./gameLoopSelectors";

export const COMBAT_STAGES = {
	ATTACK_ROLLING: "ATTACK_ROLLING",
	ATTACK_LOCKED: "ATTACK_LOCKED",
	DEFENSE_ROLLING: "DEFENSE_ROLLING",
	DEFENSE_LOCKED: "DEFENSE_LOCKED",
	BLOCKS_RESOLVING: "BLOCKS_RESOLVING",
	READY_TO_RESOLVE_DAMAGE: "READY_TO_RESOLVE_DAMAGE",
	DONE: "DONE",
};

export const initialCombatState = {
	attackerId: null,
	defenderId: null,
	attackingOperativeId: null,
	defendingOperativeId: null,
	weaponId: null,
	weaponProfile: null,
	stage: COMBAT_STAGES.ATTACK_ROLLING,
	attackRoll: [],
	attackLocked: false,
	defenseRoll: [],
	defenseLocked: false,
	blocksResolved: false,
	blocks: null,
	attackQueue: [],
	currentAttackIndex: 0,
	currentAttackItem: null,
	modifiers: {},
	inputs: {
		accurateSpent: 0,
		primaryTargetId: null,
		secondaryTargetIds: [],
		balancedClick: false,
		balancedUsed: false,
	},
};

const createActionFlow = ({ mode, attackerId }) => ({
	mode,
	attackerId,
	defenderId: null,
	step: "pickTarget",
	attackerWeapon: null,
	defenderWeapon: null,
	dice: {
		attacker: { raw: [], crit: 0, norm: 0 },
		defender: { raw: [], crit: 0, norm: 0 },
	},
	remaining: {
		attacker: { crit: 0, norm: 0 },
		defender: { crit: 0, norm: 0 },
	},
	resolve: {
		turn: "attacker",
	},
	locked: {
		attackerWeapon: false,
		defenderWeapon: false,
		diceRolled: false,
	},
});

function getRemainingCount(remaining = {}) {
	return (remaining.crit || 0) + (remaining.norm || 0);
}

function clampNonNegative(value) {
	return Math.max(0, Number(value) || 0);
}

function applyDamageNoLog(state, targetId, amount) {
	const targetUnit = state.game.find((unit) => unit.id === targetId);
	if (!targetUnit) return { nextGame: state.game, prevWounds: null, nextWounds: null, actualDamage: 0 };
	const prevWounds = targetUnit.state.woundsCurrent;
	const nextWounds = clamp(prevWounds - amount, 0, targetUnit.stats.woundsMax);
	const actualDamage = prevWounds - nextWounds;
	if (actualDamage <= 0) {
		return { nextGame: state.game, prevWounds, nextWounds: prevWounds, actualDamage: 0 };
	}
	const nextGame = state.game.map((unit) =>
		unit.id === targetId
			? {
					...unit,
					state: {
						...unit.state,
						woundsCurrent: nextWounds,
						},
				awaitingOrder: false,
				awaitingActions: false,
					}
			: unit,
	);
	return { nextGame, prevWounds, nextWounds, actualDamage };
}

function clamp(n, min, max) {
	return Math.max(min, Math.min(max, n));
}

function pushLog(log, entry) {
	const truncatedEntries = log.entries.slice(0, log.cursor);
	return {
		entries: [...truncatedEntries, entry],
		cursor: log.cursor + 1,
	};
}

function applyDamageToState(state, id, amount) {
	const targetUnit = state.game.find((unit) => unit.id === id);
	if (!targetUnit) return state;

	const prevWounds = targetUnit.state.woundsCurrent;
	const nextWounds = clamp(
		prevWounds - amount,
		0,
		targetUnit.stats.woundsMax,
	);

	const actualDamage = prevWounds - nextWounds;
	if (actualDamage <= 0) return state;

	const nextGame = state.game.map((unit) =>
		unit.id === id
			? {
					...unit,
					state: {
						...unit.state,
						woundsCurrent: nextWounds,
					},
				}
			: unit,
	);

	const entry = createLogEntry({
		type: "DAMAGE_APPLIED",
		summary: `${targetUnit.name} took ${actualDamage} dmg (${prevWounds}→${nextWounds})`,
		meta: {
			unitId: id,
			amount: actualDamage,
		},
		undo: state.game,
		redo: nextGame,
	});

	return {
		...state,
		game: nextGame,
		log: pushLog(state.log, entry),
	};
}

function getOtherPlayerId(playerId) {
	return playerId === "A" ? "B" : playerId === "B" ? "A" : null;
}

function resetApForAllUnits(game) {
	return game.map((unit) => ({
		...unit,
		state: {
			...unit.state,
			apCurrent: Number(unit.stats?.apl ?? 0),
			actionMarks: {},
		},
	}));
}

function resetTpFlags(state) {
	return {
		strategy: {
			...(state.strategy || {}),
			passed: { A: false, B: false },
			usedStrategicGambits: { A: [], B: [] },
			turn: null,
			cpGrantedThisTP: false,
			operativesReadiedThisTP: false,
		},
		firefight: {
			...(state.firefight || {}),
			activeOperativeId: null,
			activePlayerId: null,
			awaitingOrder: false,
			awaitingActions: false,
		},
		game: state.game.map((unit) => ({
			...unit,
			state: {
				...unit.state,
				hasCounteractedThisTP: false,
				apCurrent: Number(unit.stats?.apl ?? 0),
				actionMarks: {},
			},
		})),
	};
}

export function gameReducer(state, action) {
	switch (action.type) {
		case "START_RANGED_ATTACK": {
			const {
				attackerId,
				defenderId,
				attackingOperativeId,
				defendingOperativeId,
				weaponId,
				weaponProfile,
			} = action.payload || {};

			return {
				...state,
				combatState: {
					...initialCombatState,
					attackerId: attackerId ?? null,
					defenderId: defenderId ?? null,
					attackingOperativeId: attackingOperativeId ?? null,
					defendingOperativeId: defendingOperativeId ?? null,
					weaponId: weaponId ?? null,
					weaponProfile: weaponProfile ?? null,
					stage: COMBAT_STAGES.ATTACK_ROLLING,
					attackRoll: [],
					attackLocked: false,
					defenseRoll: [],
					defenseLocked: false,
					blocksResolved: false,
					blocks: null,
					attackQueue: Array.isArray(action.payload?.attackQueue)
						? action.payload.attackQueue
						: [],
					currentAttackIndex: 0,
					currentAttackItem: Array.isArray(action.payload?.attackQueue)
						? action.payload.attackQueue[0] ?? null
						: null,
					modifiers: {},
					inputs: {
						accurateSpent: 0,
						primaryTargetId: action.payload?.inputs?.primaryTargetId ?? null,
						secondaryTargetIds: action.payload?.inputs?.secondaryTargetIds ?? [],
						balancedClick: false,
						balancedUsed: false,
					},
				},
			};
		}

			case "SET_ATTACK_ROLL": {
				const { roll, inputs } = action.payload || {};
				if (!Array.isArray(roll)) return state;
				if (state.combatState?.stage !== COMBAT_STAGES.ATTACK_ROLLING) return state;
				if (state.combatState?.attackLocked) return state;
				return {
					...state,
					combatState: {
						...state.combatState,
						attackRoll: roll,
						attackLocked: false,
						inputs: {
							...(state.combatState?.inputs || {}),
							...(inputs || {}),
						},
					},
				};
			}

			case "SET_COMBAT_INPUTS": {
				const { inputs } = action.payload || {};
				if (!inputs || typeof inputs !== "object") return state;
				return {
					...state,
					combatState: {
						...state.combatState,
						inputs: {
							...(state.combatState?.inputs || {}),
							...inputs,
						},
					},
				};
			}

			case "SET_COMBAT_MODIFIERS": {
				const { modifiers } = action.payload || {};
				if (!modifiers || typeof modifiers !== "object") return state;
				return {
					...state,
					combatState: {
						...state.combatState,
						modifiers: {
							...(state.combatState?.modifiers || {}),
							...modifiers,
						},
					},
				};
			}

			case "ADVANCE_ATTACK_QUEUE": {
				const queue = state.combatState?.attackQueue || [];
				const nextIndex = Number(state.combatState?.currentAttackIndex ?? 0) + 1;
				if (!queue[nextIndex]) return state;
				return {
					...state,
					combatState: {
						...state.combatState,
						stage: COMBAT_STAGES.ATTACK_ROLLING,
						attackRoll: [],
						attackLocked: false,
						defenseRoll: [],
						defenseLocked: false,
						blocksResolved: false,
						blocks: null,
						currentAttackIndex: nextIndex,
						currentAttackItem: queue[nextIndex] ?? null,
						defendingOperativeId: queue[nextIndex]?.targetId ?? state.combatState?.defendingOperativeId,
						inputs: {
							...(state.combatState?.inputs || {}),
							accurateSpent: 0,
							balancedClick: false,
							balancedUsed: false,
						},
						modifiers: {
							...(state.combatState?.modifiers || {}),
							ignoreConcealForTargeting: false,
						},
					},
				};
			}

			case "LOCK_ATTACK_ROLL": {
				if (state.combatState?.stage !== COMBAT_STAGES.ATTACK_ROLLING) return state;
				if (state.combatState?.attackLocked) return state;
				return {
					...state,
					combatState: {
						...state.combatState,
						attackLocked: true,
						stage: COMBAT_STAGES.ATTACK_LOCKED,
					},
				};
			}

			case "SET_DEFENSE_ROLL": {
				const { roll } = action.payload || {};
				if (!Array.isArray(roll)) return state;
				if (state.combatState?.stage !== COMBAT_STAGES.DEFENSE_ROLLING) return state;
				if (state.combatState?.defenseLocked) return state;
				return {
					...state,
					combatState: {
						...state.combatState,
						defenseRoll: roll,
						defenseLocked: false,
					},
				};
			}

			case "LOCK_DEFENSE_ROLL": {
				if (state.combatState?.stage !== COMBAT_STAGES.DEFENSE_ROLLING) return state;
				if (state.combatState?.defenseLocked) return state;
				return {
					...state,
					combatState: {
						...state.combatState,
						defenseLocked: true,
						stage: COMBAT_STAGES.DEFENSE_LOCKED,
					},
				};
			}

			case "SET_BLOCKS_RESULT": {
				const { blocks } = action.payload || {};
				if (state.combatState?.stage !== COMBAT_STAGES.BLOCKS_RESOLVING) return state;
				return {
					...state,
					combatState: {
						...state.combatState,
						blocks: blocks ?? null,
						blocksResolved: true,
						attackRoll: [],
						defenseRoll: [],
						stage: COMBAT_STAGES.READY_TO_RESOLVE_DAMAGE,
					},
				};
			}

			case "RESOLVE_COMBAT": {
				if (state.combatState?.stage !== COMBAT_STAGES.READY_TO_RESOLVE_DAMAGE) {
					return state;
				}
				return {
					...state,
					combatState: {
						...state.combatState,
						stage: COMBAT_STAGES.DONE,
					},
				};
			}

			case "CLEAR_COMBAT_STATE": {
				return {
					...state,
					combatState: initialCombatState,
				};
			}

			case "SET_COMBAT_STAGE": {
				const { stage } = action.payload || {};
				if (!Object.values(COMBAT_STAGES).includes(stage)) return state;
				return {
					...state,
					combatState: {
						...state.combatState,
						stage,
					},
				};
			}
		case "UNDO": {
			if (state.log.cursor <= 0) return state;
			const nextCursor = state.log.cursor - 1;
			const entry = state.log.entries[nextCursor];
			if (!entry?.undo) return state;

			return {
				...state,
				game: entry.undo,
				log: {
					...state.log,
					cursor: nextCursor,
				},
			};
		}

		case "REDO": {
			if (state.log.cursor >= state.log.entries.length) return state;
			const entry = state.log.entries[state.log.cursor];
			if (!entry?.redo) return state;

			return {
				...state,
				game: entry.redo,
				log: {
					...state.log,
					cursor: state.log.cursor + 1,
				},
			};
		}

		case "LOG_PUSH": {
			const entry = action.payload;
			const cursor = state.log.cursor;
			const truncatedEntries = state.log.entries.slice(0, cursor);

			return {
				...state,
				log: {
					entries: [...truncatedEntries, entry],
					cursor: cursor + 1,
				},
			};
		}

		case "APPLY_DAMAGE": {
			const { targetUnitId, damage } = action.payload;
			return applyDamageToState(state, targetUnitId, damage);
		}

		case "ACTION_USE": {
			const { operativeId, actionKey } = action.payload || {};
			if (!operativeId || !actionKey) return state;
			if (state.phase !== "FIREFIGHT") return state;
			if (operativeId !== state.firefight?.activeOperativeId) return state;
			if (!state.firefight?.orderChosenThisActivation) return state;
			if (state.firefight?.awaitingActions !== true) return state;
			const actionConfig = ACTION_CONFIG[actionKey];
			if (!actionConfig) return state;

			const operative = state.game.find((unit) => unit.id === operativeId);
			if (!operative) return state;
			if (operative.owner !== state.firefight?.activePlayerId) return state;

			const cost = Number(actionConfig.cost) || 0;
			const prevAp = Number(operative.state?.apCurrent ?? 0);
			const isCounteract = Boolean(state.firefight?.activation?.isCounteract);
			const actionsAllowed = Number(state.firefight?.activation?.actionsAllowed ?? 0);
			const actionsTaken = state.firefight?.activation?.actionsTaken || [];
			if (isCounteract && cost > 1) return state;
			if (isCounteract && actionsAllowed > 0 && actionsTaken.length >= actionsAllowed) {
				return state;
			}
			if (!isCounteract && (!Number.isFinite(prevAp) || prevAp < cost)) return state;
			const nextAp = isCounteract ? prevAp : prevAp - cost;
			const nextMarks = {
				...(operative.state?.actionMarks ?? {}),
				[actionKey]: true,
			};
			for (const key of actionConfig.darkenAlso || []) {
				nextMarks[key] = true;
			}

			const nextGame = state.game.map((unit) =>
				unit.id === operativeId
					? {
							...unit,
							state: {
								...unit.state,
								apCurrent: nextAp,
								actionMarks: nextMarks,
							},
						}
					: unit,
			);

			const entry = createLogEntry({
				type: "ACTION_USE",
				summary: `ACTION:${operative.name} - ${actionConfig.logLabel}`,
				meta: {
					operativeId,
					actionKey,
					apCost: cost,
				},
				undo: state.game,
				redo: nextGame,
			});

			const nextActionFlow =
				actionKey === "shoot"
					? createActionFlow({ mode: "shoot", attackerId: operativeId })
					: actionKey === "fight"
						? createActionFlow({ mode: "fight", attackerId: operativeId })
						: state.ui?.actionFlow ?? null;

			const nextActivation = {
				...(state.firefight?.activation || {}),
				aplSpent: (state.firefight?.activation?.aplSpent || 0) + (isCounteract ? 0 : cost),
				actionsTaken: [
					...(state.firefight?.activation?.actionsTaken || []),
					actionKey,
				],
			};

			const nextState = {
				...state,
				game: nextGame,
				log: pushLog(state.log, entry),
				firefight: {
					...(state.firefight || {}),
					activation: nextActivation,
				},
				ui: {
					...(state.ui || {}),
					actionFlow: nextActionFlow,
				},
			};

			if (!isCounteract) return nextState;

			const remainingAllowed =
				Number(state.firefight?.activation?.actionsAllowed ?? 0) -
				nextActivation.actionsTaken.length;
			if (remainingAllowed > 0) return nextState;

			const currentPlayer = state.firefight?.activePlayerId;
			const otherPlayer = getOtherPlayerId(currentPlayer);
			const nextPlayer = otherPlayer ?? currentPlayer;

			const endState = {
				...nextState,
				firefight: {
					...(nextState.firefight || {}),
					activeOperativeId: null,
					activePlayerId: nextPlayer,
					orderChosenThisActivation: false,
					awaitingOrder: false,
					awaitingActions: false,
					activation: null,
					roundIndex: (state.firefight?.roundIndex ?? 0) + 1,
				},
			};

			if (allOperativesExpended({ ...state, game: nextGame })) {
				const nextTp = Number(state.turningPoint ?? 0) + 1;
				const entry = createLogEntry({
					type: "TURNING_POINT_END",
					summary: `Turning Point ${state.turningPoint ?? 0} ended`,
					meta: { turningPoint: state.turningPoint ?? 0 },
					undo: state.game,
					redo: nextGame,
				});
				return {
					...endState,
					log: pushLog(endState.log, entry),
					phase: nextTp > 4 ? "GAME_OVER" : "STRATEGY",
					turningPoint: nextTp > 4 ? 4 : nextTp,
					initiativePlayerId: null,
					firefight: {
						...(endState.firefight || {}),
						activeOperativeId: null,
						activePlayerId: null,
						orderChosenThisActivation: false,
						awaitingOrder: false,
						awaitingActions: false,
						activation: null,
					},
				};
			}

			return endState;
		}

		case "FLOW_START_SHOOT": {
			const { attackerId } = action.payload || {};
			if (!attackerId) return state;
			return {
				...state,
				ui: {
					...(state.ui || {}),
					actionFlow: createActionFlow({ mode: "shoot", attackerId }),
				},
			};
		}

		case "FLOW_START_FIGHT": {
			const { attackerId } = action.payload || {};
			if (!attackerId) return state;
			return {
				...state,
				ui: {
					...(state.ui || {}),
					actionFlow: createActionFlow({ mode: "fight", attackerId }),
				},
			};
		}

		case "FLOW_CANCEL": {
			const flow = state.ui?.actionFlow;
			if (!flow) return state;
			const locked = flow.locked || {};
			if (locked.attackerWeapon || locked.defenderWeapon || locked.diceRolled) {
				return state;
			}
			return {
				...state,
				ui: {
					...(state.ui || {}),
					actionFlow: null,
				},
			};
		}

		case "FLOW_SET_TARGET": {
			const { defenderId } = action.payload || {};
			const flow = state.ui?.actionFlow;
			if (!flow || !defenderId) return state;
			return {
				...state,
				ui: {
					...(state.ui || {}),
					actionFlow: {
						...flow,
						defenderId,
						step: "pickWeapons",
					},
				},
			};
		}

		case "FLOW_SET_WEAPON": {
			const { role, weaponName } = action.payload || {};
			const flow = state.ui?.actionFlow;
			if (!flow || (role !== "attacker" && role !== "defender")) return state;
			return {
				...state,
				ui: {
					...(state.ui || {}),
					actionFlow: {
						...flow,
						attackerWeapon:
							role === "attacker" ? weaponName ?? null : flow.attackerWeapon,
						defenderWeapon:
							role === "defender" ? weaponName ?? null : flow.defenderWeapon,
					},
				},
			};
		}

		case "FLOW_LOCK_WEAPON": {
			const { role } = action.payload || {};
			const flow = state.ui?.actionFlow;
			if (!flow || (role !== "attacker" && role !== "defender")) return state;
			const nextLocked = {
				...(flow.locked || {}),
				attackerWeapon:
					role === "attacker"
						? true
						: Boolean(flow.locked?.attackerWeapon),
				defenderWeapon:
					role === "defender"
						? true
						: Boolean(flow.locked?.defenderWeapon),
			};
			const nextStep =
				nextLocked.attackerWeapon && nextLocked.defenderWeapon
					? "rollDice"
					: flow.step;
			return {
				...state,
				ui: {
					...(state.ui || {}),
					actionFlow: {
						...flow,
						locked: nextLocked,
						step: nextStep,
					},
				},
			};
		}

		case "FLOW_ROLL_DICE": {
			const { attacker, defender } = action.payload || {};
			const flow = state.ui?.actionFlow;
			if (!flow || flow.step !== "rollDice") return state;
			if (flow.locked?.diceRolled) return state;
			if (!attacker || !defender) return state;
			return {
				...state,
				ui: {
					...(state.ui || {}),
					actionFlow: {
						...flow,
						dice: {
							attacker: {
								raw: attacker.raw || [],
								crit: Number(attacker.crit || 0),
								norm: Number(attacker.norm || 0),
							},
							defender: {
								raw: defender.raw || [],
								crit: Number(defender.crit || 0),
								norm: Number(defender.norm || 0),
							},
						},
						remaining: {
							attacker: {
								crit: Number(attacker.crit || 0),
								norm: Number(attacker.norm || 0),
							},
							defender: {
								crit: Number(defender.crit || 0),
								norm: Number(defender.norm || 0),
							},
						},
						resolve: {
							turn: "attacker",
						},
						locked: {
							...(flow.locked || {}),
							diceRolled: true,
						},
						step: "resolve",
					},
				},
			};
		}

		case "FLOW_RESOLVE_ACTION": {
			const { actorRole, actionType, dieType, blockedType } = action.payload || {};
			const flow = state.ui?.actionFlow;
			if (!flow || flow.step !== "resolve") return state;
			if (actorRole !== "attacker" && actorRole !== "defender") return state;
			if (actorRole !== flow.resolve?.turn) return state;
			if (actionType !== "strike" && actionType !== "block") return state;
			if (dieType !== "crit" && dieType !== "norm") return state;

			const attackerUnit = state.game.find((unit) => unit.id === flow.attackerId);
			const defenderUnit = state.game.find((unit) => unit.id === flow.defenderId);
			if (!attackerUnit || !defenderUnit) return state;

			const actorRemaining =
				actorRole === "attacker" ? flow.remaining.attacker : flow.remaining.defender;
			const opponentRemaining =
				actorRole === "attacker" ? flow.remaining.defender : flow.remaining.attacker;
			if ((actorRemaining[dieType] || 0) <= 0) return state;

			const actorUnit = actorRole === "attacker" ? attackerUnit : defenderUnit;
			const opponentUnit = actorRole === "attacker" ? defenderUnit : attackerUnit;
			const actorWeaponName =
				actorRole === "attacker" ? flow.attackerWeapon : flow.defenderWeapon;
			const actorWeapon = (actorUnit.weapons || []).find(
				(weapon) => weapon.name === actorWeaponName,
			);
			if (!actorWeapon) return state;
			const [dmgNormal, dmgCrit] = String(actorWeapon.dmg || "0/0")
				.split("/")
				.map(Number);
			const safeNormal = Number.isFinite(dmgNormal) ? dmgNormal : 0;
			const safeCrit = Number.isFinite(dmgCrit) ? dmgCrit : 0;
			const damage = dieType === "crit" ? safeCrit : safeNormal;

			let nextGame = state.game;
			let nextLog = state.log;

			const nextActorRemaining = {
				...actorRemaining,
				[dieType]: clampNonNegative((actorRemaining[dieType] || 0) - 1),
			};
			let nextOpponentRemaining = { ...opponentRemaining };

			if (actionType === "strike") {
				const { nextGame: updatedGame, actualDamage } = applyDamageNoLog(
					{ ...state, game: nextGame },
					opponentUnit.id,
					damage,
				);
				nextGame = updatedGame;
				const entry = createLogEntry({
					type: "FIGHT_STRIKE",
					summary: `STRIKE:${actorUnit.name} -> ${opponentUnit.name} (${dieType}) dmg=${damage}`,
					meta: {
						actorId: actorUnit.id,
						opponentId: opponentUnit.id,
						dieType,
						damage,
						appliedDamage: actualDamage,
					},
					undo: state.game,
					redo: nextGame,
				});
				nextLog = pushLog(nextLog, entry);
			} else {
				if (dieType === "norm") {
					if ((nextOpponentRemaining.norm || 0) > 0) {
						nextOpponentRemaining.norm = clampNonNegative(
							nextOpponentRemaining.norm - 1,
						);
					}
				} else {
					if (blockedType === "crit" && (nextOpponentRemaining.crit || 0) > 0) {
						nextOpponentRemaining.crit = clampNonNegative(
							nextOpponentRemaining.crit - 1,
						);
					} else if ((nextOpponentRemaining.norm || 0) > 0) {
						nextOpponentRemaining.norm = clampNonNegative(
							nextOpponentRemaining.norm - 1,
						);
					} else if ((nextOpponentRemaining.crit || 0) > 0) {
						nextOpponentRemaining.crit = clampNonNegative(
							nextOpponentRemaining.crit - 1,
						);
					}
				}

				const blockedResolvedType =
					dieType === "norm"
						? "norm"
						: blockedType === "crit" && (opponentRemaining.crit || 0) > 0
							? "crit"
							: "norm";

				const entry = createLogEntry({
					type: "FIGHT_BLOCK",
					summary: `BLOCK:${actorUnit.name} blocked ${opponentUnit.name} (${blockedResolvedType}) with (${dieType})`,
					meta: {
						actorId: actorUnit.id,
						opponentId: opponentUnit.id,
						dieType,
						blockedType: blockedResolvedType,
					},
					undo: state.game,
					redo: nextGame,
				});
				nextLog = pushLog(nextLog, entry);
			}

			const attackerRemaining =
				actorRole === "attacker" ? nextActorRemaining : nextOpponentRemaining;
			const defenderRemaining =
				actorRole === "attacker" ? nextOpponentRemaining : nextActorRemaining;

			const attackerCount = getRemainingCount(attackerRemaining);
			const defenderCount = getRemainingCount(defenderRemaining);

			const nextFlowBase = {
				...flow,
				remaining: {
					attacker: attackerRemaining,
					defender: defenderRemaining,
				},
				resolve: {
					turn: flow.resolve?.turn,
				},
			};

			if (attackerCount === 0 && defenderCount === 0) {
				return {
					...state,
					game: nextGame,
					log: nextLog,
					ui: {
						...(state.ui || {}),
						actionFlow: null,
					},
				};
			}

			const opponentHasNone =
				(actorRole === "attacker" ? defenderCount : attackerCount) === 0;
			const actorHasDice =
				(actorRole === "attacker" ? attackerCount : defenderCount) > 0;

			if (opponentHasNone && actorHasDice) {
				let autoGame = nextGame;
				let autoLog = nextLog;
				let autoRemaining =
					actorRole === "attacker" ? attackerRemaining : defenderRemaining;
				while (getRemainingCount(autoRemaining) > 0) {
					const autoDieType = autoRemaining.crit > 0 ? "crit" : "norm";
					autoRemaining = {
						...autoRemaining,
						[autoDieType]: clampNonNegative(autoRemaining[autoDieType] - 1),
					};
					const autoDamage = autoDieType === "crit" ? safeCrit : safeNormal;
					const { nextGame: updatedGame, actualDamage } = applyDamageNoLog(
						{ ...state, game: autoGame },
						opponentUnit.id,
						autoDamage,
					);
					autoGame = updatedGame;
					const entry = createLogEntry({
						type: "FIGHT_STRIKE",
						summary: `STRIKE:${actorUnit.name} -> ${opponentUnit.name} (${autoDieType}) dmg=${autoDamage}`,
						meta: {
							actorId: actorUnit.id,
							opponentId: opponentUnit.id,
							dieType: autoDieType,
							damage: autoDamage,
							appliedDamage: actualDamage,
						},
						undo: state.game,
						redo: autoGame,
					});
					autoLog = pushLog(autoLog, entry);
				}

				return {
					...state,
					game: autoGame,
					log: autoLog,
					ui: {
						...(state.ui || {}),
						actionFlow: null,
					},
				};
			}

			const nextTurn = actorRole === "attacker" ? "defender" : "attacker";
			return {
				...state,
				game: nextGame,
				log: nextLog,
				ui: {
					...(state.ui || {}),
					actionFlow: {
						...nextFlowBase,
						resolve: {
							turn: nextTurn,
						},
					},
				},
			};
		}

		case "ACTIVATION_START": {
			const { operativeId } = action.payload || {};
			if (!operativeId) return state;
			const target = state.game.find((unit) => unit.id === operativeId);
			if (!target) return state;
			const nextGame = state.game.map((unit) =>
				unit.id === operativeId
					? {
							...unit,
							state: {
								...unit.state,
								apCurrent: Number(unit.stats?.apl ?? 0),
								actionMarks: {},
							},
						}
					: unit,
			);
			return {
				...state,
				game: nextGame,
			};
		}

		case "ACTIVATION_END": {
			return {
				...state,
				ui: {
					...(state.ui || {}),
					actionFlow: null,
				},
			};
		}

		case "TURNING_POINT_START": {
			return {
				...state,
				...resetTpFlags(state),
			};
		}

		case "LOCK_TEAMS": {
			return {
				...state,
				setup: {
					...(state.setup || {}),
					teamsLocked: true,
				},
			};
		}

		case "DEPLOY_OPERATIVES": {
			return {
				...state,
				setup: {
					...(state.setup || {}),
					deploymentComplete: true,
				},
			};
		}

		case "BEGIN_BATTLE": {
			return {
				...state,
				phase: "STRATEGY",
				turningPoint: 1,
				initiativePlayerId: null,
				cp: { A: 2, B: 2 },
				...resetTpFlags(state),
			};
		}

		case "ROLL_INITIATIVE":
		case "SET_INITIATIVE": {
			const winnerPlayerId = action.payload?.winnerPlayerId || action.payload?.playerId;
			if (!winnerPlayerId) return state;
			return {
				...state,
				initiativePlayerId: winnerPlayerId,
				strategy: {
					...(state.strategy || {}),
					passed: { A: false, B: false },
					turn: winnerPlayerId,
				},
			};
		}

		case "GAIN_CP": {
			const initiative = state.initiativePlayerId;
			if (!initiative) return state;
			if (state.strategy?.cpGrantedThisTP) return state;
			const other = getOtherPlayerId(initiative);
			const addA = state.turningPoint === 1
				? 1
				: initiative === "A"
					? 1
					: 2;
			const addB = state.turningPoint === 1
				? 1
				: initiative === "B"
					? 1
					: 2;
			return {
				...state,
				cp: {
					A: (state.cp?.A ?? 0) + addA,
					B: (state.cp?.B ?? 0) + addB,
				},
				strategy: {
					...(state.strategy || {}),
					cpGrantedThisTP: true,
				},
			};
		}

		case "READY_ALL_OPERATIVES": {
			if (!state.strategy?.cpGrantedThisTP) return state;
			if (state.strategy?.operativesReadiedThisTP) return state;
			return {
				...state,
				game: state.game.map((unit) => ({
					...unit,
					state: {
						...unit.state,
						readyState:
							Number(unit.state?.woundsCurrent ?? 0) > 0 ? "READY" : unit.state?.readyState,
						},
				})),
				firefight: {
					...(state.firefight || {}),
					activeOperativeId: null,
					activePlayerId: null,
				},
				strategy: {
					...(state.strategy || {}),
					operativesReadiedThisTP: true,
				},
			};
		}

		case "USE_STRATEGIC_GAMBIT": {
			const { playerId, gambitId } = action.payload || {};
			if (!playerId || !gambitId) return state;
			if (state.strategy?.turn !== playerId) return state;
			const used = state.strategy?.usedStrategicGambits?.[playerId] || [];
			if (used.includes(gambitId)) return state;
			const other = getOtherPlayerId(playerId);
			return {
				...state,
				strategy: {
					...(state.strategy || {}),
					usedStrategicGambits: {
						...(state.strategy?.usedStrategicGambits || {}),
						[playerId]: [...used, gambitId],
					},
					passed: {
						...(state.strategy?.passed || {}),
						[playerId]: false,
					},
					turn: other ?? state.strategy?.turn ?? null,
				},
			};
		}

		case "PASS_STRATEGY": {
			const { playerId } = action.payload || {};
			if (!playerId) return state;
			if (state.strategy?.turn !== playerId) return state;
			const nextPassed = {
				...(state.strategy?.passed || {}),
				[playerId]: true,
			};
			const bothPassed = Boolean(nextPassed.A) && Boolean(nextPassed.B);
			if (bothPassed) {
				return {
					...state,
					phase: "FIREFIGHT",
					firefight: {
						...(state.firefight || {}),
						activePlayerId: state.initiativePlayerId,
						activeOperativeId: null,
						orderChosenThisActivation: false,
						awaitingOrder: false,
						awaitingActions: false,
						awaitingChoice: true,
						roundIndex: 0,
					},
					strategy: {
						...(state.strategy || {}),
						passed: nextPassed,
						turn: null,
					},
				};
			}
			return {
				...state,
				strategy: {
					...(state.strategy || {}),
					passed: nextPassed,
					turn: getOtherPlayerId(playerId),
				},
			};
		}

		case "END_STRATEGY_PHASE": {
			if (!state.strategy?.passed?.A || !state.strategy?.passed?.B) return state;
			return {
				...state,
				phase: "FIREFIGHT",
				firefight: {
					...(state.firefight || {}),
					activePlayerId: state.initiativePlayerId,
					activeOperativeId: null,
					orderChosenThisActivation: false,
					awaitingChoice: true,
					roundIndex: 0,
				},
				strategy: {
					...(state.strategy || {}),
					turn: null,
				},
			};
		}

		case "SET_ACTIVE_OPERATIVE": {
			const { playerId, operativeId } = action.payload || {};
			if (state.phase !== "FIREFIGHT") return state;
			if (state.firefight?.activeOperativeId) return state;
			if (playerId !== state.firefight?.activePlayerId) return state;
			const operative = state.game.find((unit) => unit.id === operativeId);
			if (!operative || operative.owner !== playerId) return state;
			if (operative.state?.readyState !== "READY") return state;
			const desiredOrder = action.payload?.order;
			const hasOrder = desiredOrder === "conceal" || desiredOrder === "engage";
			return {
				...state,
				game: hasOrder
					? state.game.map((unit) =>
							unit.id === operativeId
								? {
										...unit,
										state: {
											...unit.state,
											order: desiredOrder,
										},
									}
								: unit,
							)
					: state.game,
				firefight: {
					...(state.firefight || {}),
					activeOperativeId: operativeId,
					orderChosenThisActivation: hasOrder,
					awaitingOrder: !hasOrder,
					awaitingActions: hasOrder,
					activation: {
						ownerPlayerId: playerId,
						aplSpent: 0,
						orderChosen: hasOrder,
						actionsTaken: [],
					},
				},
			};
		}

		case "SET_ORDER": {
			const { operativeId, order } = action.payload || {};
			if (state.phase !== "FIREFIGHT") return state;
			if (operativeId !== state.firefight?.activeOperativeId) return state;
			if (order !== "conceal" && order !== "engage") return state;
			if (state.firefight?.orderChosenThisActivation) return state;
			const operative = state.game.find((unit) => unit.id === operativeId);
			if (!operative || operative.owner !== state.firefight?.activePlayerId) return state;
			return {
				...state,
				game: state.game.map((unit) =>
					unit.id === operativeId
						? {
								...unit,
								state: {
									...unit.state,
									order,
								},
							}
						: unit,
					),
				firefight: {
					...(state.firefight || {}),
					orderChosenThisActivation: true,
					awaitingOrder: false,
					awaitingActions: true,
					activation: {
						...(state.firefight?.activation || {}),
						orderChosen: true,
					},
				},
			};
		}

		case "END_ACTIVATION": {
			if (state.phase !== "FIREFIGHT") return state;
			const operativeId = state.firefight?.activeOperativeId;
			if (!operativeId) return state;
			if (!state.firefight?.orderChosenThisActivation) return state;
			const operative = state.game.find((unit) => unit.id === operativeId);
			if (!operative) return state;
			if (operative.owner !== state.firefight?.activePlayerId) return state;
			const updatedGame = state.game.map((unit) =>
				unit.id === operativeId
					? {
							...unit,
							state: {
								...unit.state,
								readyState: "EXPENDED",
							},
						}
					: unit,
			);
			const currentPlayer = state.firefight?.activePlayerId;
			const otherPlayer = getOtherPlayerId(currentPlayer);
			const nextPlayer = otherPlayer ?? currentPlayer;

			const nextState = {
				...state,
				game: updatedGame,
				firefight: {
					...(state.firefight || {}),
					activeOperativeId: null,
					activePlayerId: nextPlayer,
					orderChosenThisActivation: false,
					awaitingOrder: false,
					awaitingActions: false,
					activation: null,
					roundIndex: (state.firefight?.roundIndex ?? 0) + 1,
				},
			};

			if (allOperativesExpended({ ...state, game: updatedGame })) {
				const nextTp = Number(state.turningPoint ?? 0) + 1;
				const entry = createLogEntry({
					type: "TURNING_POINT_END",
					summary: `Turning Point ${state.turningPoint ?? 0} ended`,
					meta: { turningPoint: state.turningPoint ?? 0 },
					undo: state.game,
					redo: updatedGame,
				});
				return {
					...nextState,
					log: pushLog(nextState.log, entry),
					phase: nextTp > 4 ? "GAME_OVER" : "STRATEGY",
					turningPoint: nextTp > 4 ? 4 : nextTp,
					initiativePlayerId: null,
					firefight: {
						...(nextState.firefight || {}),
						activeOperativeId: null,
						activePlayerId: null,
						orderChosenThisActivation: false,
						awaitingOrder: false,
						awaitingActions: false,
						activation: null,
					},
				};
			}

			return nextState;
		}

		case "COUNTERACT": {
			const { playerId, operativeId } = action.payload || {};
			if (state.phase !== "FIREFIGHT") return state;
			if (playerId !== state.firefight?.activePlayerId) return state;
			if (getReadyOperatives(state, playerId).length > 0) return state;
			const operative = state.game.find((unit) => unit.id === operativeId);
			if (!operative || operative.owner !== playerId) return state;
			if (operative.state?.readyState !== "EXPENDED") return state;
			if (operative.state?.order !== "engage") return state;
			if (operative.state?.hasCounteractedThisTP) return state;

			const updatedGame = state.game.map((unit) =>
				unit.id === operativeId
					? {
							...unit,
							state: {
								...unit.state,
								hasCounteractedThisTP: true,
							},
						}
					: unit,
			);
			return {
				...state,
				game: updatedGame,
				firefight: {
					...(state.firefight || {}),
					activeOperativeId: operativeId,
					orderChosenThisActivation: true,
					awaitingOrder: false,
					awaitingActions: true,
					activation: {
						ownerPlayerId: playerId,
						aplSpent: 0,
						actionsTaken: [],
						orderChosen: true,
						isCounteract: true,
						actionsAllowed: 1,
						orderLocked: true,
					},
				},
			};
		}

		case "SKIP_ACTIVATION": {
			const { playerId } = action.payload || {};
			if (state.phase !== "FIREFIGHT") return state;
			if (!playerId || playerId !== state.firefight?.activePlayerId) return state;
			if (state.firefight?.activeOperativeId) return state;
			if (getReadyOperatives(state, playerId).length > 0) return state;
			if (canCounteract(state, playerId)) return state;

			const otherPlayer = getOtherPlayerId(playerId);
			const nextPlayer = otherPlayer ?? playerId;

			const entry = createLogEntry({
				type: "ACTIVATION_SKIPPED",
				summary: `Player ${playerId} has no activations`,
				meta: { playerId },
				undo: state.game,
				redo: state.game,
			});

			const nextState = {
				...state,
				log: pushLog(state.log, entry),
				firefight: {
					...(state.firefight || {}),
					activeOperativeId: null,
					activePlayerId: nextPlayer,
					orderChosenThisActivation: false,
					awaitingOrder: false,
					awaitingActions: false,
					activation: null,
				},
			};

			if (allOperativesExpended(state)) {
				const nextTp = Number(state.turningPoint ?? 0) + 1;
				const entry = createLogEntry({
					type: "TURNING_POINT_END",
					summary: `Turning Point ${state.turningPoint ?? 0} ended`,
					meta: { turningPoint: state.turningPoint ?? 0 },
					undo: state.game,
					redo: state.game,
				});
				return {
					...nextState,
					log: pushLog(nextState.log, entry),
					phase: nextTp > 4 ? "GAME_OVER" : "STRATEGY",
					turningPoint: nextTp > 4 ? 4 : nextTp,
					initiativePlayerId: null,
					firefight: {
						...(nextState.firefight || {}),
						activeOperativeId: null,
						activePlayerId: null,
						orderChosenThisActivation: false,
						awaitingOrder: false,
						awaitingActions: false,
						activation: null,
					},
				};
			}

			return nextState;
		}

		case "END_FIREFIGHT_PHASE": {
			if (!allOperativesExpended(state)) return state;
			const nextTp = Number(state.turningPoint ?? 0) + 1;
			const entry = createLogEntry({
				type: "TURNING_POINT_END",
				summary: `Turning Point ${state.turningPoint ?? 0} ended`,
				meta: { turningPoint: state.turningPoint ?? 0 },
				undo: state.game,
				redo: state.game,
			});
			return {
				...state,
				log: pushLog(state.log, entry),
				phase: nextTp > 4 ? "GAME_OVER" : "STRATEGY",
				turningPoint: nextTp > 4 ? 4 : nextTp,
				initiativePlayerId: null,
				firefight: {
					...(state.firefight || {}),
					activeOperativeId: null,
					activePlayerId: null,
					orderChosenThisActivation: false,
					awaitingOrder: false,
					awaitingActions: false,
					activation: null,
				},
			};
		}

		case "TURNING_POINT_END": {
			const { turningPoint: tp } = action.payload || {};
			if (!Number.isFinite(Number(tp))) return state;
			if (Number(state.turningPoint ?? 0) !== Number(tp)) return state;
			if (tp === 4) {
				return {
					...state,
					phase: "GAME_OVER",
					endedAt: state.endedAt ?? new Date().toISOString(),
					winner: state.winner ?? null,
				};
			}
			return {
				...state,
				turningPoint: tp + 1,
				initiativePlayerId: null,
				phase: "STRATEGY",
				...resetTpFlags(state),
			};
		}

		case "GAME_END": {
			if (Number(state.turningPoint ?? 0) !== 4) return state;
			return {
				...state,
				phase: "GAME_OVER",
				endedAt: state.endedAt ?? new Date().toISOString(),
				winner: state.winner ?? null,
				log: pushLog(
					state.log,
					createLogEntry({
						type: "GAME_END",
						summary: "Game over",
						meta: { winner: state.winner ?? null },
						undo: state.game,
						redo: state.game,
					}),
				),
			};
		}

		case "DAMAGE_UNIT": {
			const { id, amount = 1 } = action.payload;
			return applyDamageToState(state, id, amount);
		}

		case "HEAL_UNIT": {
			const { id, amount = 1 } = action.payload;
			return {
				...state,
				game: state.game.map((unit) => {
					if (unit.id !== id) return unit;

					const nextWounds = clamp(
						unit.state.woundsCurrent + amount,
						0,
						unit.stats.woundsMax,
					);
					return {
						...unit,
						state: {
							...unit.state,
							woundsCurrent: nextWounds,
						},
					};
				}),
			};
		}

		case "TOGGLE_ORDER": {
			const { id } = action.payload;
			const targetUnit = state.game.find((unit) => unit.id === id);
			if (!targetUnit) return state;
			const prevOrder = targetUnit.state.order;
			const nextOrder = prevOrder === "conceal" ? "engage" : "conceal";

			const nextGame = state.game.map((unit) =>
				unit.id === id
					? {
							...unit,
							state: {
								...unit.state,
								order: nextOrder,
							},
						}
					: unit,
				);

			const entry = createLogEntry({
				type: "ORDER_CHANGED",
				summary: `${targetUnit.name}: order ${prevOrder}→${nextOrder}`,
				meta: {
					unitId: id,
					from: prevOrder,
					to: nextOrder,
				},
				undo: state.game,
				redo: nextGame,
			});

			return {
				...state,
				game: nextGame,
				log: pushLog(state.log, entry),
			};
		}

		case "SET_ORDER_OVERRIDE": {
			const { id, order } = action.payload;
			if (!id || (order !== "conceal" && order !== "engage")) return state;
			const targetUnit = state.game.find((unit) => unit.id === id);
			if (!targetUnit) return state;
			const prevOrder = targetUnit.state.order;
			if (prevOrder === order) return state;

			const nextGame = state.game.map((unit) =>
				unit.id === id
					? {
							...unit,
							state: {
								...unit.state,
								order,
							},
						}
					: unit,
			);

			const entry = createLogEntry({
				type: "ORDER_CHANGED",
				summary: `${targetUnit.name}: order ${prevOrder}→${order}`,
				meta: {
					unitId: id,
					from: prevOrder,
					to: order,
				},
				undo: state.game,
				redo: nextGame,
			});

			return {
				...state,
				game: nextGame,
				log: pushLog(state.log, entry),
			};
		}

		case "SET_SELECTED_WEAPON": {
			const { id, weaponName } = action.payload;
			return {
				...state,
				game: state.game.map((unit) =>
					unit.id === id
						? {
								...unit,
								state: {
									...unit.state,
									selectedWeapon: weaponName,
								},
						}
						: unit,
				),
			};
		}

		default:
			return state;
	}
}
