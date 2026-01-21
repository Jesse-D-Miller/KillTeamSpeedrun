import "./App.css";
import UnitCard from "./ui/components/UnitCard";
import kommandos from "./data/killteams/kommandos.json";
import { gameReducer } from "./state/gameReducer";
import { useReducer, useState } from "react";

const initialStateFromJson = kommandos;

function App() {
  const [state, dispatch] = useReducer(gameReducer, initialStateFromJson);
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
