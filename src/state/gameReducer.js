import { createLogEntry } from "./actionCreator";
import { ACTION_CONFIG } from "../engine/rules/actionsCore";

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
			const actionConfig = ACTION_CONFIG[actionKey];
			if (!actionConfig) return state;

			const operative = state.game.find((unit) => unit.id === operativeId);
			if (!operative) return state;

			const cost = Number(actionConfig.cost) || 0;
			const prevAp = Number(operative.state?.apCurrent ?? 0);
			const nextAp = prevAp - cost;
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

			return {
				...state,
				game: nextGame,
				log: pushLog(state.log, entry),
				ui: {
					...(state.ui || {}),
					actionFlow: nextActionFlow,
				},
			};
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
