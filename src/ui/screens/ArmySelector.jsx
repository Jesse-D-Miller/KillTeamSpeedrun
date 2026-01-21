import { useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import "./ArmySelector.css";

const killteamModules = import.meta.glob("../../data/killteams/*.json", {
  eager: true,
});

function normalizeKillteamData(moduleData) {
  if (Array.isArray(moduleData)) return moduleData;
  if (Array.isArray(moduleData?.default)) return moduleData.default;
  return [];
}

function formatArmyName(filePath) {
  const file = filePath.split("/").pop() || "";
  const raw = file.replace(".json", "");
  return raw.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ArmySelector() {
  const { username } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const slot = location.state?.slot;
  const isSingleSelect = Boolean(slot);
  const [armyKey, setArmyKey] = useState(null);
  const [armyKeyA, setArmyKeyA] = useState(null);
  const [armyKeyB, setArmyKeyB] = useState(null);
  const armies = useMemo(
    () =>
      Object.entries(killteamModules).map(([path, data]) => ({
        path,
        key: path.split("/").pop()?.replace(".json", "") || path,
        name: formatArmyName(path),
        unitCount: normalizeKillteamData(data).length,
      })),
    [],
  );

  const handleSelect = (key) => {
    if (isSingleSelect) {
      setArmyKey((prev) => (prev === key ? null : key));
      return;
    }
    if (armyKeyA === key) {
      setArmyKeyA(null);
      return;
    }
    if (armyKeyB === key) {
      setArmyKeyB(null);
      return;
    }
    if (!armyKeyA) {
      setArmyKeyA(key);
      return;
    }
    if (!armyKeyB) {
      setArmyKeyB(key);
      return;
    }
    setArmyKeyB(key);
  };

  return (
    <div className="army-selector">
      <div className="army-selector__panel">
        <h1 className="army-selector__title">
          {isSingleSelect ? "Select Your Army" : "Army Selector"}
        </h1>
        <p className="army-selector__subtitle">
          Player: <span className="army-selector__name">{username}</span>
        </p>
        <div className="army-selector__teams">
          {isSingleSelect ? (
            <div className="army-selector__team">
              <span className="army-selector__team-label">
                {slot ? `Player ${slot}` : "Your Army"}
              </span>
              <span className="army-selector__team-name">
                {armyKey
                  ? armies.find((army) => army.key === armyKey)?.name
                  : "Select an army"}
              </span>
            </div>
          ) : (
            <>
              <div className="army-selector__team">
                <span className="army-selector__team-label">Team A</span>
                <span className="army-selector__team-name">
                  {armyKeyA
                    ? armies.find((army) => army.key === armyKeyA)?.name
                    : "Select an army"}
                </span>
              </div>
              <div className="army-selector__team">
                <span className="army-selector__team-label">Team B</span>
                <span className="army-selector__team-name">
                  {armyKeyB
                    ? armies.find((army) => army.key === armyKeyB)?.name
                    : "Select an army"}
                </span>
              </div>
            </>
          )}
        </div>
        <div className="army-selector__grid">
          {armies.map((army) => (
            <button
              key={army.path}
              className={`army-selector__tile ${
                isSingleSelect
                  ? army.key === armyKey
                    ? "army-selector__tile--a"
                    : ""
                  : army.key === armyKeyA
                    ? "army-selector__tile--a"
                    : army.key === armyKeyB
                      ? "army-selector__tile--b"
                      : ""
              }`}
              type="button"
              onClick={() => handleSelect(army.key)}
            >
              <div className="army-selector__tile-name">{army.name}</div>
              <div className="army-selector__tile-sub">{army.unitCount} units</div>
            </button>
          ))}
        </div>
        <div className="army-selector__actions">
          <button
            className="army-selector__next"
            type="button"
            disabled={isSingleSelect ? !armyKey : !armyKeyA || !armyKeyB}
            onClick={() =>
              navigate(`/${username}/unit-selector`, {
                state: isSingleSelect
                  ? { armyKey, slot }
                  : { armyKeyA, armyKeyB },
              })
            }
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

export default ArmySelector;
