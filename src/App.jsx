import "./App.css";
import UnitCard from "./ui/components/UnitCard";
import UnitListNav from "./ui/components/UnitListNav";
import LogsWindow from "./ui/components/LogsWindow";
import ShootActionCard from "./ui/components/ShootActionCard";
import TargetSelectModal from "./ui/components/TargetSelectModal";
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
  const [shootModalOpen, setShootModalOpen] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState(null);

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
  const teamAUnits = state.game.filter((unit) => unit.teamId === "alpha");
  const teamBUnits = state.game.filter((unit) => unit.teamId === "beta");

  const selectedUnit =
    teamAUnits.find((u) => u.id === selectedUnitId) ??
    teamAUnits[0] ??
    null;

  useEffect(() => {
    if (!selectedUnit && teamAUnits.length > 0) {
      setSelectedUnitId(teamAUnits[0].id);
    }
  }, [selectedUnit, teamAUnits]);

  useEffect(() => {
    if (!shootModalOpen) return;
    if (teamBUnits.length > 0 && !selectedTargetId) {
      setSelectedTargetId(teamBUnits[0].id);
    }
  }, [shootModalOpen, teamBUnits, selectedTargetId]);

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
              units={teamAUnits}
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
            <>
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
              <ShootActionCard
                attacker={selectedUnit}
                hasTargets={teamBUnits.length > 0}
                onShoot={() => {
                  setAttackerId(selectedUnit.id);
                  setShootModalOpen(true);
                }}
              />
            </>
          ) : (
            <div className="kt-empty">No units loaded</div>
          )}
        </main>
      </div>

      <TargetSelectModal
        open={shootModalOpen}
        attacker={selectedUnit}
        targets={teamBUnits}
        selectedTargetId={selectedTargetId}
        onSelectTarget={setSelectedTargetId}
        onClose={() => setShootModalOpen(false)}
        onConfirm={() => {
          if (!selectedTargetId) return;
          setDefenderId(selectedTargetId);
          logEntry({
            type: "SHOOT_DECLARED",
            summary: `${selectedUnit?.name || "Attacker"} declared Shoot vs ${teamBUnits.find((u) => u.id === selectedTargetId)?.name || "defender"}`,
            meta: {
              attackerId: selectedUnit?.id,
              defenderId: selectedTargetId,
            },
          });
          setShootModalOpen(false);
        }}
      />
    </div>
  );
}

function ArmyOverlayRoute() {
  const location = useLocation();
  const armyKeyA = location.state?.armyKeyA || location.state?.armyKey;
  const armyKeyB = location.state?.armyKeyB || location.state?.armyKey;
  const selectedUnitIdsA = location.state?.selectedUnitIdsA;
  const selectedUnitIdsB = location.state?.selectedUnitIdsB;

  const teamA = armies.find((army) => army.key === armyKeyA) || armies[0];
  const teamB = armies.find((army) => army.key === armyKeyB) || teamA;

  const filteredUnitsA = Array.isArray(selectedUnitIdsA)
    ? teamA.units.filter((unit) => selectedUnitIdsA.includes(unit.id))
    : teamA.units;

  const filteredUnitsB = Array.isArray(selectedUnitIdsB)
    ? teamB.units.filter((unit) => selectedUnitIdsB.includes(unit.id))
    : teamB.units;

  const buildTeamUnits = (units, teamId) =>
    units.map((unit) => ({
      ...unit,
      id: `${teamId}:${unit.id}`,
      baseId: unit.id,
      teamId,
      stats: { ...unit.stats },
      state: { ...unit.state },
      weapons: unit.weapons?.map((weapon) => ({ ...weapon })) ?? [],
      rules: unit.rules?.map((rule) => ({ ...rule })) ?? [],
      abilities: unit.abilities?.map((ability) => ({ ...ability })) ?? [],
    }));

  const combinedUnits = [
    ...buildTeamUnits(filteredUnitsA, "alpha"),
    ...buildTeamUnits(filteredUnitsB, "beta"),
  ];

  return (
    <GameOverlay
      key={`${teamA?.key || "team-a"}-${teamB?.key || "team-b"}`}
      initialUnits={combinedUnits}
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
