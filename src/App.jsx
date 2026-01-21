import "./App.css";
import UnitCard from "./ui/components/UnitCard";
import Login from "./ui/screens/Login";
import ArmySelector from "./ui/screens/ArmySelector";
import { gameReducer } from "./state/gameReducer";
import { useReducer, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

const killteamModules = import.meta.glob("./data/killteams/*.json", {
  eager: true,
});

function getArmyKey(filePath) {
  const file = filePath.split("/").pop() || "";
  return file.replace(".json", "");
}

function normalizeKillteamData(moduleData) {
  if (Array.isArray(moduleData)) return moduleData;
  if (Array.isArray(moduleData?.default)) return moduleData.default;
  return [];
}

const armies = Object.entries(killteamModules).map(([path, data]) => ({
  key: getArmyKey(path),
  name: getArmyKey(path).replace(/[-_]+/g, " "),
  units: normalizeKillteamData(data),
}));

function GameOverlay({ initialUnits }) {
  const [state, dispatch] = useReducer(gameReducer, initialUnits);
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

function ArmyOverlayRoute() {
  const location = useLocation();
  const selectedKey = location.state?.armyKey;
  const selectedArmy = armies.find((army) => army.key === selectedKey);
  const fallbackArmy = armies[0];
  const units = (selectedArmy || fallbackArmy)?.units ?? [];

  return <GameOverlay key={selectedArmy?.key || fallbackArmy?.key} initialUnits={units} />;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/:username/army-selector" element={<ArmySelector />} />
      <Route path="/:username/army" element={<ArmyOverlayRoute />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
