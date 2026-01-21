import { createLogEntry } from "./actionCreator";

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
