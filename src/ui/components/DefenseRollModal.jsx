import { useEffect, useMemo, useRef, useState } from "react";
import "./DefenseRollModal.css";

function buildInitialDice(count) {
  return Array.from({ length: count }, () => "");
}

function DefenseRollModal({
  open,
  stage,
  attacker,
  defender,
  attackRoll,
  combatSummary,
  defenseDiceCount,
  weaponProfile,
  onSetDefenseRoll,
  onLockDefense,
  onClose,
  readOnly,
  statusMessage,
}) {
  const [defenseDice, setDefenseDice] = useState(() =>
    buildInitialDice(defenseDiceCount || 0),
  );
  const [isRolling, setIsRolling] = useState(false);
  const rollIntervalRef = useRef(null);
  const rollTimeoutRef = useRef(null);

  const rollDiceNumbers = (count) =>
    Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6));

  const resetDice = useMemo(
    () => () => setDefenseDice(buildInitialDice(defenseDiceCount || 0)),
    [defenseDiceCount],
  );

  useEffect(() => {
    if (!open) return;
    if (stage !== "DEFENSE_ROLLING") return;
    resetDice();
  }, [open, stage, resetDice]);

  useEffect(() => {
    if (!open) return;
    if (stage !== "DEFENSE_ROLLING") {
      resetDice();
    }
  }, [open, stage, resetDice]);

  const normalizeWeaponRulesList = (wr) => {
    if (!wr || wr === "-") return [];
    return Array.isArray(wr) ? wr : [wr];
  };

  const formatWeaponRules = (wr) => {
    const list = normalizeWeaponRulesList(wr)
      .map((rule) => {
        if (!rule) return "";
        if (typeof rule === "string") return rule;
        const id = rule.id || "";
        const value =
          rule.value !== undefined && rule.value !== null ? ` ${rule.value}` : "";
        const note = rule.note ? ` (${rule.note})` : "";
        return `${id}${value}${note}`.trim();
      })
      .filter(Boolean);
    return list.length ? list.join(", ") : "-";
  };

  const renderUnitTile = (unit, label) => {
    if (!unit) return null;
    const woundsMax = Number(unit.stats?.woundsMax ?? 0);
    const woundsCurrent = Number(unit.state?.woundsCurrent ?? 0);
    const pct =
      woundsMax === 0 ? 0 : Math.max(0, Math.min(100, (woundsCurrent / woundsMax) * 100));
    const injured = woundsCurrent < woundsMax / 2;
    return (
      <div className="kt-modal__tile">
        <div className="kt-modal__tile-name">
          {label}: {unit.name}
        </div>
        <div className="kt-modal__tile-sub">
          W {woundsCurrent}/{woundsMax}
        </div>
        <div className="kt-modal__bar">
          <div
            className={`kt-modal__bar-fill ${injured ? "kt-modal__bar-fill--injured" : ""}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  };

  const parseDice = (dice) =>
    dice
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 1 && value <= 6);
  const hasDefenseRoll = parseDice(defenseDice).length > 0;

  const handleRollClick = () => {
    if (readOnly || isRolling) return;
    const rolled = rollDiceNumbers(defenseDiceCount || 0);
    setIsRolling(true);
    rollIntervalRef.current = setInterval(() => {
      setDefenseDice(rollDiceNumbers(defenseDiceCount || 0).map(String));
    }, 100);
    rollTimeoutRef.current = setTimeout(() => {
      if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
      rollIntervalRef.current = null;
      setIsRolling(false);
      setDefenseDice(rolled.map(String));
      onSetDefenseRoll?.(rolled);
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
      if (rollTimeoutRef.current) clearTimeout(rollTimeoutRef.current);
    };
  }, []);

  const isSummaryStage = stage === "READY_TO_RESOLVE_DAMAGE" || stage === "DONE";

  if (!open) return null;

  return (
    <div className="kt-modal">
      <div className="kt-modal__backdrop" />
      <div className="kt-modal__panel">
        <button
          className="kt-modal__close"
          type="button"
          onClick={() => onClose?.()}
          aria-label="Close"
          title="Close"
        >
          ×
        </button>
        <div className="kt-modal__layout">
          <aside className="kt-modal__sidebar">
            <div className="kt-modal__sidebar-group">
              <div className="kt-modal__sidebar-title">Actions</div>
              <div className="kt-modal__sidebar-empty">
                Roll defense dice, then lock them in.
              </div>
              <button
                className="kt-modal__btn kt-modal__btn--success"
                type="button"
                onClick={handleRollClick}
                disabled={readOnly || isRolling}
              >
                Roll
              </button>
            </div>
            <div className="kt-modal__sidebar-footer">
              <button
                className="kt-modal__btn kt-modal__btn--primary"
                type="button"
                disabled={readOnly || isRolling || !hasDefenseRoll}
                onClick={() => {
                  const parsed = parseDice(defenseDice);
                  onSetDefenseRoll?.(parsed);
                  onLockDefense?.();
                }}
              >
                Lock In Defense
              </button>
            </div>
          </aside>
          <div className="kt-modal__content">
            <div className="kt-modal__header">
              <div className="kt-modal__title">Defense Roll</div>
              <div className="kt-modal__subtitle">
                {attacker?.name || "Attacker"} → {defender?.name || "Defender"}
              </div>
              {statusMessage && <div className="kt-modal__subtitle">{statusMessage}</div>}
            </div>

            <div className="kt-modal__grid">
              {renderUnitTile(attacker, "Attacker")}
              {renderUnitTile(defender, "Defender")}
            </div>

            {weaponProfile && (
              <table className="kt-table fight-weapon__table">
                <thead>
                  <tr>
                    <th className="left">NAME</th>
                    <th>ATK</th>
                    <th>HIT</th>
                    <th>DMG</th>
                    <th className="left">WR</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="kt-row kt-row--selected">
                    <td className="left">{weaponProfile.name}</td>
                    <td>{weaponProfile.atk}</td>
                    <td>{weaponProfile.hit}+</td>
                    <td>{weaponProfile.dmg}</td>
                    <td className="left">{formatWeaponRules(weaponProfile.wr)}</td>
                  </tr>
                </tbody>
              </table>
            )}

            {isSummaryStage ? (
              <div className="defense-roll__section">
                <div className="defense-roll__label">Attack Roll</div>
                <div className="defense-roll__placeholder">Dice cleared</div>
                <div className="defense-roll__label">Defense Roll</div>
                <div className="defense-roll__placeholder">Dice cleared</div>
                {combatSummary && (
                  <>
                    <div className="defense-roll__label">Combat Result</div>
                    <div className="defense-roll__dice defense-roll__dice--summary">
                      <span className="defense-roll__die defense-roll__die--summary">H {combatSummary.hits}</span>
                      <span className="defense-roll__die defense-roll__die--summary">C {combatSummary.crits}</span>
                      <span className="defense-roll__die defense-roll__die--summary">DMG {combatSummary.damage}</span>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="defense-roll__section">
                  <div className="defense-roll__label">Attacker Dice</div>
                  <div className="defense-roll__dice">
                    {Array.isArray(attackRoll) && attackRoll.length > 0 ? (
                      attackRoll.map((value, index) => (
                        <span key={`${value}-${index}`} className="defense-roll__die">
                          {value}
                        </span>
                      ))
                    ) : (
                      <span className="defense-roll__placeholder">—</span>
                    )}
                  </div>
                </div>

                <div className="defense-roll__section">
                  <div className="defense-roll__label">Defense Dice</div>
                  <div className="defense-roll__dice">
                    {defenseDice.map((value, index) => (
                      <div key={`def-${index}`} className="defense-roll__input">
                        <input
                          className="defense-roll__field"
                          inputMode="numeric"
                          value={value}
                          disabled={readOnly || isRolling}
                          onChange={(event) => {
                            const next = [...defenseDice];
                            next[index] = event.target.value;
                            setDefenseDice(next);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

export default DefenseRollModal;
