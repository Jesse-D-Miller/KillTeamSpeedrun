import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
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

  return (
    <div className="army-selector">
      <div className="army-selector__panel">
        <h1 className="army-selector__title">Army Selector</h1>
        <p className="army-selector__subtitle">
          Player: <span className="army-selector__name">{username}</span>
        </p>
        <div className="army-selector__grid">
          {armies.map((army) => (
            <button
              key={army.path}
              className="army-selector__tile"
              type="button"
              onClick={() =>
                navigate(`/${username}/army`, { state: { armyKey: army.key } })
              }
            >
              <div className="army-selector__tile-name">{army.name}</div>
              <div className="army-selector__tile-sub">{army.unitCount} units</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ArmySelector;
