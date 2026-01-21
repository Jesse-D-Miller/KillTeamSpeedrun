import "./App.css";
import UnitCard from "./ui/components/UnitCard";
import kommandos from "./data/killteams/kommandos.json";
import { useReducer, useState } from "react";

const initialStateFromJson = kommandos;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function computeInjured(woundsCurrent, woundsMax) {
  return woundsCurrent < woundsMax / 2;
}

function reducer(state, action) {
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

        const nextInjured = computeInjured(nextWounds, unit.stats.woundsMax);

        return {
          ...unit,
          state: {
            ...unit.state,
            woundsCurrent: nextWounds,
            injured: nextInjured,
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

        const nextInjured = computeInjured(nextWounds, unit.stats.woundsMax);

        return {
          ...unit,
          state: {
            ...unit.state,
            woundsCurrent: nextWounds,
            injured: nextInjured,
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

function App() {
  const [state, dispatch] = useReducer(reducer, initialStateFromJson);
  const [attackerId, setAttackerId] = useState(null);
  const [defenderId, setDefenderId] = useState(null);

  const attacker = state.find((u) => u.id === attackerId);
  const defender = state.find((u) => u.id === defenderId);

  return (
    <div className="App">
      {state.map((unit) => (
        <UnitCard
          key={unit.id}
          unit={unit}
          dispatch={dispatch}
          attackerId={attackerId}
          defenderId={defenderId}
          setAttackerId={setAttackerId}
          setDefenderId={setDefenderId}
          attacker={attacker}
          defender={defender}
        />
      ))}
    </div>
  );
}

export default App;
