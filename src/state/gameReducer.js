
function clamp(n, min, max) {
	return Math.max(min, Math.min(max, n));
}

export function gameReducer(state, action) {
	switch (action.type) {
		case "DAMAGE_UNIT": {
			const { id, amount = 1 } = action.payload;
			return state.map((unit) => {
				if (unit.id !== id) return unit;

				const nextWounds = clamp(
					unit.state.woundsCurrent - amount,
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
			});
		}

		case "HEAL_UNIT": {
			const { id, amount = 1 } = action.payload;
			return state.map((unit) => {
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
			});
		}

		case "TOGGLE_ORDER": {
			const { id } = action.payload;
			return state.map((unit) =>
				unit.id === id
					? {
							...unit,
							state: {
								...unit.state,
								order: unit.state.order === "conceal" ? "engage" : "conceal",
							},
						}
					: unit,
			);
		}

		case "SET_SELECTED_WEAPON": {
			const { id, weaponName } = action.payload;
			return state.map((unit) =>
				unit.id === id
					? {
							...unit,
							state: {
								...unit.state,
								selectedWeapon: weaponName,
							},
						}
					: unit,
			);
		}

		default:
			return state;
	}
}
