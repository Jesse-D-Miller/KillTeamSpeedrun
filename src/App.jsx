import './App.css'
import UnitCard from './components/UnitCard'
import kommandos from './data/kommandos.json'
import { useReducer } from 'react'

const initialStateFromJson = kommandos;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
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
          unit.stats.woundsMax
        );

        return {
          ...unit,
          state: { ...unit.state, woundsCurrent: nextWounds },
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
          unit.stats.woundsMax
        );

        return {
          ...unit,
          state: { ...unit.state, woundsCurrent: nextWounds },
        };
      });
    }

    case "TOGGLE_INJURED": {
      const { id } = action.payload;
      return state.map((unit) =>
        unit.id === id
          ? { ...unit, state: { ...unit.state, injured: !unit.state.injured } }
          : unit
      );
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
          : unit
      );
    }

    default:
      return state;
  }
}

function App() {
  const [state, dispatch] = useReducer(reducer, initialStateFromJson);


  return (
    <div className="App">
      {state.map((unit) => (
        <UnitCard key={unit.id} unit={unit} dispatch={dispatch} />
      ))}
    </div>
  )
}

export default App
