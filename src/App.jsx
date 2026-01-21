import "./App.css";
import UnitCard from "./ui/components/UnitCard";
import UnitListNav from "./ui/components/UnitListNav";
import LogsWindow from "./ui/components/LogsWindow";
import Login from "./ui/screens/Login";
import ArmySelector from "./ui/screens/ArmySelector";
import UnitSelector from "./ui/screens/UnitSelector";
import { gameReducer } from "./state/gameReducer";
import { createLogEntry } from "./state/actionCreator";
import { useEffect, useReducer, useState } from "react";
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
  const [state, dispatch] = useReducer(gameReducer, {
    game: initialUnits,
    log: {
      entries: [],
      cursor: 0,
    },
  });
  const [attackerId, setAttackerId] = useState(null);
  const [defenderId, setDefenderId] = useState(null);
  const [leftTab, setLeftTab] = useState("units");

  const logEntry = ({ type, summary, meta }) => {
    const entry = createLogEntry({
      type,
      summary,
      meta,
      undo: state.game,
      redo: state.game,
    });
    dispatch({ type: "LOG_PUSH", payload: entry });
  };

  const [selectedUnitId, setSelectedUnitId] = useState(
    initialUnits?.[0]?.id ?? null,
  );

  const attacker = state.game.find((u) => u.id === attackerId);
  const defender = state.game.find((u) => u.id === defenderId);

  const selectedUnit =
    state.game.find((u) => u.id === selectedUnitId) ??
    state.game[0] ??
    null;

  useEffect(() => {
    if (!selectedUnit && state.game.length > 0) {
      setSelectedUnitId(state.game[0].id);
    }
  }, [selectedUnit, state.game]);

  return (
    <div className="App">
      <div className="kt-shell">
        <aside className="kt-nav">
          <div className="kt-nav__tabs">
            <button
              type="button"
              className={`kt-nav__tab ${leftTab === "units" ? "kt-nav__tab--active" : ""}`}
              onClick={() => setLeftTab("units")}
            >
              Units
            </button>
            <button
              type="button"
              className={`kt-nav__tab ${leftTab === "log" ? "kt-nav__tab--active" : ""}`}
              onClick={() => setLeftTab("log")}
            >
              Log
            </button>
          </div>

          {leftTab === "units" ? (
            <UnitListNav
              units={state.game}
              selectedUnitId={selectedUnit?.id}
              onSelectUnit={setSelectedUnitId}
            />
          ) : (
            <LogsWindow
              entries={state.log.entries}
              cursor={state.log.cursor}
              onUndo={() => dispatch({ type: "UNDO" })}
              onRedo={() => dispatch({ type: "REDO" })}
            />
          )}
        </aside>

        <main className="kt-detail">
          {selectedUnit ? (
            <UnitCard
              key={selectedUnit.id}
              unit={selectedUnit}
              dispatch={dispatch}
              attackerId={attackerId}
              defenderId={defenderId}
              setAttackerId={setAttackerId}
              setDefenderId={setDefenderId}
              attacker={attacker}
              defender={defender}
              onLog={logEntry}
            />
          ) : (
            <div className="kt-empty">No units loaded</div>
          )}
        </main>
      </div>
    </div>
  );
}

function ArmyOverlayRoute() {
  const location = useLocation();
  const selectedKey = location.state?.armyKey;
  const selectedUnitIds = location.state?.selectedUnitIds;
  const selectedArmy = armies.find((army) => army.key === selectedKey);
  const fallbackArmy = armies[0];
  const units = (selectedArmy || fallbackArmy)?.units ?? [];
  const filteredUnits = Array.isArray(selectedUnitIds)
    ? units.filter((unit) => selectedUnitIds.includes(unit.id))
    : units;

  return (
    <GameOverlay
      key={selectedArmy?.key || fallbackArmy?.key}
      initialUnits={filteredUnits}
    />
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/:username/army-selector" element={<ArmySelector />} />
      <Route path="/:username/unit-selector" element={<UnitSelector />} />
      <Route path="/:username/army" element={<ArmyOverlayRoute />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
