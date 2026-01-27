import "./LogsWindow.css";

function LogsWindow({ entries, cursor, onUndo, onRedo, units = [], debug = false }) {
  const canUndo = cursor > 0;
  const canRedo = cursor < entries.length;
  const visibleEntries = [...entries].reverse();

  const getUnit = (unitId) => units.find((unit) => unit.id === unitId) || null;

  const getOwnerPrefix = (meta = {}) => {
    if (meta.playerId) return `${meta.playerId}:`;
    const id = meta.operativeId || meta.attackerId || meta.defenderId;
    const unit = id ? getUnit(id) : null;
    return unit?.owner ? `${unit.owner}:` : "";
  };

  const getPrefix = (meta = {}) => {
    const parts = [];
    if (Number.isFinite(Number(meta.turningPoint))) {
      parts.push(`TP${Number(meta.turningPoint)}`);
    }
    if (meta.phase) {
      parts.push(String(meta.phase).toUpperCase());
    }
    return parts.length ? `[${parts.join("][")}]` : "";
  };

  const formatEntry = (entry) => {
    const meta = entry.meta || {};
    const actorPrefix = getOwnerPrefix(meta);
    const nameFor = (id, fallback) => getUnit(id)?.name || fallback;
    switch (entry.type) {
      case "LOCK_TEAMS":
        return "Rosters locked";
      case "DEPLOY_OPERATIVES":
        return "Operatives deployed";
      case "BEGIN_BATTLE":
        return "Battle begins";
      case "TURNING_POINT_START":
        return `Turning Point ${meta.turningPoint ?? "?"} begins`;
      case "TURNING_POINT_END":
        return `Turning Point ${meta.turningPoint ?? "?"} ended`;
      case "SET_INITIATIVE":
        return `Initiative: Player ${meta.playerId ?? "?"}`;
      case "GAIN_CP":
        return `Player ${meta.playerId ?? "?"} gains ${meta.amount ?? 0} CP`;
      case "READY_ALL_OPERATIVES":
        return "All operatives readied";
      case "USE_STRATEGIC_PLOY":
        return `Player ${meta.playerId ?? "?"} used: ${meta.ployId ?? "ploy"}`;
      case "PASS_STRATEGIC_PLOY":
        return `Player ${meta.playerId ?? "?"} passed`;
      case "SET_ACTIVE_OPERATIVE":
        return `Player ${meta.playerId ?? "?"} activates ${nameFor(meta.operativeId, "operative")}${meta.order ? ` (${meta.order})` : ""}`;
      case "SET_ORDER":
        return `${nameFor(meta.operativeId, "operative")} set to ${meta.order ?? "?"}`;
      case "ACTION_USE":
      case "COUNTERACT_ACTION_USE": {
        const label = meta.actionKey || "action";
        const counteract = entry.type === "COUNTERACT_ACTION_USE" ? " counteract" : "";
        return `${nameFor(meta.operativeId, "operative")}${counteract}: ${label} (cost ${meta.apCost ?? 0})`;
      }
      case "END_ACTIVATION":
        return `${nameFor(meta.operativeId, "operative")} activation ended`;
      case "SKIP_ACTIVATION":
        return `Player ${meta.playerId ?? "?"} has no ready operatives (skipped)`;
      case "COUNTERACT_WINDOW_OPEN":
        return `Counteract available for Player ${meta.playerId ?? "?"}`;
      case "PASS_COUNTERACT_WINDOW":
        return `Player ${meta.playerId ?? "?"} passed counteract`;
      case "COUNTERACT":
        return `${nameFor(meta.operativeId, "operative")} counteracts (1 free action)`;
      case "COUNTERACT_COMPLETE":
        return `${nameFor(meta.operativeId, "operative")} counteract complete`;
      case "SHOOT_DECLARED":
        return `${nameFor(meta.attackerId, "attacker")} declared Shoot vs ${nameFor(meta.defenderId, "defender")}`;
      case "ATTACK_ROLL_SET":
        return `${nameFor(meta.attackerId, "attacker")} attack dice: ${(meta.roll || []).join(", ")}`;
      case "CEASELESS_REROLL":
        return `Ceaseless reroll: ${(meta.after || []).join(", ")}`;
      case "ATTACK_LOCKED":
        return `${nameFor(meta.attackerId, "attacker")} locked attack roll`;
      case "DEFENSE_ROLL_SET":
        return `${nameFor(meta.defenderId, "defender")} defense dice: ${(meta.roll || []).join(", ")}`;
      case "DEFENSE_LOCKED":
        return `${nameFor(meta.defenderId, "defender")} locked defense roll`;
      case "BLOCKS_SET":
        return `Blocks assigned: hits left ${meta.remainingHits ?? 0}, crits left ${meta.remainingCrits ?? 0}`;
      case "DAMAGE_APPLIED":
        return `Damage: ${nameFor(meta.targetUnitId, "defender")} took ${meta.damage ?? 0}`;
      case "COMBAT_RESOLVED":
        return "Attack resolved";
      case "FIGHT_DECLARED":
        return `${nameFor(meta.attackerId, "attacker")} declared Fight`;
      case "FIGHT_TARGET":
        return `Target: ${nameFor(meta.attackerId, "attacker")} -> ${nameFor(meta.defenderId, "defender")}`;
      case "FIGHT_WEAPONS_SELECTED":
        return `${meta.role ?? "role"} selected ${meta.weaponName ?? "weapon"}`;
      case "FIGHT_ROLLS":
        return `Fight rolls: attacker ${(meta.attacker?.raw || []).join(", ")} defender ${(meta.defender?.raw || []).join(", ")}`.trim();
      case "FIGHT_RESOLVE_STEP":
        return `${meta.actorRole ?? "actor"} ${meta.actionType ?? "action"} (${meta.dieType ?? "?"}${meta.blockedType ? ` vs ${meta.blockedType}` : ""})`;
      default:
        return entry.summary || entry.type;
    }
  };

  const hiddenTypes = new Set(["ACTION_REJECTED"]);

  return (
    <div className="kt-log">
      <div className="kt-log__actions">
        <button
          className="kt-log__btn"
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
        >
          Undo
        </button>
        <button
          className="kt-log__btn"
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
        >
          Redo
        </button>
      </div>

      <div className="kt-log__list">
        {visibleEntries.length === 0 ? (
          <div className="kt-log__empty">No log entries yet</div>
        ) : (
          visibleEntries
            .filter((entry) => debug || !hiddenTypes.has(entry.type))
            .map((entry) => {
              const prefix = getPrefix(entry.meta || {});
              const actor = getOwnerPrefix(entry.meta || {});
              const summary = formatEntry(entry);
              return (
                <div key={entry.id} className="kt-log__item">
                  <div className="kt-log__summary">
                    {prefix && <span>{prefix} </span>}
                    {actor && <span>{actor} </span>}
                    {summary}
                  </div>
                  <div className="kt-log__meta">{entry.type}</div>
                </div>
              );
            })
        )}
      </div>
    </div>
  );
}

export default LogsWindow;
