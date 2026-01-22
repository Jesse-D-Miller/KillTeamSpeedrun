import { useEffect, useMemo, useState } from "react";
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

  if (!open) return null;

  const parseDice = (dice) =>
    dice
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 1 && value <= 6);

  const handleRollClick = () => {
    if (readOnly) return;
    const rolled = rollDiceNumbers(defenseDiceCount || 0);
    setDefenseDice(rolled.map(String));
    onSetDefenseRoll?.(rolled);
  };

  const isSummaryStage = stage === "READY_TO_RESOLVE_DAMAGE" || stage === "DONE";

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
                disabled={readOnly}
              >
                Roll
              </button>
            </div>
            <div className="kt-modal__sidebar-footer">
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
          </aside>
          <div className="kt-modal__content">
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

          </div>
        </div>
      </div>
    </div>
  );
}

export default DefenseRollModal;
