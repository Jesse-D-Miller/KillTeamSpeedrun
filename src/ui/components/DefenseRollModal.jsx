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
  onSetDefenseRoll,
  onLockDefense,
  onClose,
  readOnly,
  statusMessage,
}) {
  const [defenseDice, setDefenseDice] = useState(() =>
    buildInitialDice(defenseDiceCount || 0),
  );
  const [autoRoll, setAutoRoll] = useState(false);
  const autoRollOnceRef = useRef(false);

  const rollDiceNumbers = (count) =>
    Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6));

  const resetDice = useMemo(
    () => () => setDefenseDice(buildInitialDice(defenseDiceCount || 0)),
    [defenseDiceCount],
  );

  useEffect(() => {
    if (!open) return;
    if (stage !== "DEFENSE_ROLLING") return;
    if (!autoRoll || readOnly) {
      autoRollOnceRef.current = false;
      return;
    }
    if (autoRollOnceRef.current) return;
    autoRollOnceRef.current = true;
    const timer = setTimeout(() => {
      const rolled = rollDiceNumbers(defenseDiceCount || 0);
      setDefenseDice(rolled.map(String));
      onSetDefenseRoll?.(rolled);
    }, 2000);
    return () => clearTimeout(timer);
  }, [open, stage, autoRoll, readOnly, defenseDiceCount, onSetDefenseRoll]);

  useEffect(() => {
    if (!open) return;
    if (stage !== "DEFENSE_ROLLING") return;
    resetDice();
  }, [open, stage, resetDice]);

  useEffect(() => {
    if (!open) return;
    if (stage !== "DEFENSE_ROLLING") {
      setAutoRoll(false);
      autoRollOnceRef.current = false;
      resetDice();
    }
  }, [open, stage, resetDice]);

  if (!open) return null;

  const parseDice = (dice) =>
    dice
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 1 && value <= 6);

  const isSummaryStage = stage === "READY_TO_RESOLVE_DAMAGE" || stage === "DONE";

  return (
    <div className="kt-modal">
      <div className="kt-modal__backdrop" />
      <div className="kt-modal__panel">
        <div className="kt-modal__header">
          <div className="kt-modal__title">Defense Roll</div>
          <div className="kt-modal__subtitle">
            {attacker?.name || "Attacker"} → {defender?.name || "Defender"}
          </div>
          {statusMessage && <div className="kt-modal__subtitle">{statusMessage}</div>}
        </div>

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
                      disabled={readOnly}
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

        <div className="kt-modal__actions">
          <label className="dice-input__toggle-label dice-input__toggle-label--compact">
            <input
              type="checkbox"
              checked={autoRoll}
              onChange={(event) => setAutoRoll(event.target.checked)}
              disabled={readOnly}
            />
            Auto-roll
          </label>
          <button
            className="kt-modal__btn"
            type="button"
            onClick={() => onClose?.()}
          >
            Cancel
          </button>
          <button
            className="kt-modal__btn kt-modal__btn--primary"
            type="button"
            disabled={readOnly}
            onClick={() => {
              const parsed = parseDice(defenseDice);
              onSetDefenseRoll?.(parsed);
              onLockDefense?.();
            }}
          >
            Lock In Defense
          </button>
        </div>
      </div>
    </div>
  );
}

export default DefenseRollModal;
