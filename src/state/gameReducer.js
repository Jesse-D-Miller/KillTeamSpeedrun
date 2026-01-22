import { createLogEntry } from "./actionCreator";

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
	inputs: {
		accurateSpent: 0,
		balancedClick: false,
		balancedUsed: false,
	},
};

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
					inputs: {
						accurateSpent: 0,
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
