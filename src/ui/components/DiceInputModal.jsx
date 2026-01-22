import { useEffect, useMemo, useRef, useState } from "react";
import "./DiceInputModal.css";

function buildInitialDice(count) {
  return Array.from({ length: count }, () => "");
}

function DiceInputModal({
  open,
  attacker,
  defender,
  attackDiceCount,
  defenseDiceCount,
  attackHitThreshold,
  hasCeaseless,
  combatStage,
  combatAttackRoll,
  combatDefenseRoll,
  combatSummary,
  onSetCombatAttackRoll,
  onLockAttack,
  readOnly,
  statusMessage,
  onAutoRoll,
  onClose,
  onConfirm,
}) {
  const [attackDice, setAttackDice] = useState(() => buildInitialDice(attackDiceCount));
  const [defenseDice, setDefenseDice] = useState(() => buildInitialDice(defenseDiceCount));
  const [ceaselessApplied, setCeaselessApplied] = useState(false);
  const autoLoggedRef = useRef(false);
  const lastCeaselessRef = useRef(null);

  const rollDiceNumbers = (count) =>
    Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6));

  const applyAutoRoll = () => {
    const initialAttack = rollDiceNumbers(attackDiceCount);
    const attackAfterCeaseless = initialAttack;
    const defenseRoll = rollDiceNumbers(defenseDiceCount);

    setAttackDice(attackAfterCeaseless.map(String));
    setDefenseDice(defenseRoll.map(String));
    setCeaselessApplied(false);
    lastCeaselessRef.current = null;

    autoLoggedRef.current = true;
    onAutoRoll?.({
      attackBefore: initialAttack,
      attackAfter: attackAfterCeaseless,
      defenseDice: defenseRoll,
      ceaseless: null,
    });
  };

  const resetDice = useMemo(
    () => () => {
      setAttackDice(buildInitialDice(attackDiceCount));
      setDefenseDice(buildInitialDice(defenseDiceCount));
      setCeaselessApplied(false);
      lastCeaselessRef.current = null;
      autoLoggedRef.current = false;
    },
    [attackDiceCount, defenseDiceCount],
  );

  const pipIndicesForValue = (value) => {
    const numeric = Number(value);
    switch (numeric) {
      case 1:
        return [4];
      case 2:
        return [0, 8];
      case 3:
        return [0, 4, 8];
      case 4:
        return [0, 2, 6, 8];
      case 5:
        return [0, 2, 4, 6, 8];
      case 6:
        return [0, 2, 3, 5, 6, 8];
      default:
        return [];
    }
  };

  const parseDice = (dice) =>
    dice
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 1 && value <= 6);

  const pickCeaselessValue = (dice, threshold) => {
    const misses = dice.filter((value) => value < threshold);
    if (misses.length === 0) return null;

    const counts = misses.reduce((acc, value) => {
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts)
      .map(([value, count]) => ({ value: Number(value), count }))
      .sort((a, b) => (b.count - a.count) || (a.value - b.value))[0]?.value ?? null;
  };

  const applyCeaseless = (dice, value) =>
    dice.map((die) => (die === value ? 1 + Math.floor(Math.random() * 6) : die));

  const handleRollClick = () => {
    if (readOnly) return;
    if (combatStage === "ATTACK_ROLLING") {
      const initialAttack = rollDiceNumbers(attackDiceCount);
      const attackAfterCeaseless = initialAttack;

      setAttackDice(attackAfterCeaseless.map(String));
      onSetCombatAttackRoll?.(attackAfterCeaseless);
      setCeaselessApplied(false);
      lastCeaselessRef.current = null;
      autoLoggedRef.current = true;

      onAutoRoll?.({
        attackBefore: initialAttack,
        attackAfter: attackAfterCeaseless,
        defenseDice: [],
        ceaseless: null,
      });
      return;
    }

    applyAutoRoll();
  };

  const handleCeaselessClick = () => {
    if (readOnly || !hasCeaseless || ceaselessApplied) return;
    const currentAttack = Array.isArray(combatAttackRoll) && combatAttackRoll.length > 0
      ? combatAttackRoll
      : parseDice(attackDice);
    if (currentAttack.length === 0) return;

    const threshold = Number(attackHitThreshold);
    if (!Number.isFinite(threshold)) return;
    const ceaselessValue = pickCeaselessValue(currentAttack, threshold);
    if (ceaselessValue == null) return;

    const attackAfterCeaseless = applyCeaseless(currentAttack, ceaselessValue);
    setAttackDice(attackAfterCeaseless.map(String));
    onSetCombatAttackRoll?.(attackAfterCeaseless);
    setCeaselessApplied(true);

    lastCeaselessRef.current = {
      before: currentAttack,
      after: attackAfterCeaseless,
      rerolled: currentAttack
        .map((value, index) => (value === ceaselessValue ? index : null))
        .filter((value) => value != null),
      value: ceaselessValue,
    };

    autoLoggedRef.current = true;
    onAutoRoll?.({
      attackBefore: currentAttack,
      attackAfter: attackAfterCeaseless,
      defenseDice: [],
      ceaseless: lastCeaselessRef.current,
    });
  };

  const handleConfirm = () => {
    const parsedAttack = parseDice(attackDice);
    const parsedDefense = parseDice(defenseDice);
    const finalAttack = parsedAttack;

    const finalDefense = parsedDefense.length > 0 ? parsedDefense : parsedDefense;

    onConfirm({
      attackDice: finalAttack,
      defenseDice: finalDefense,
      ceaseless: lastCeaselessRef.current,
      autoLogged: autoLoggedRef.current,
    });
    resetDice();
  };

  useEffect(() => {
    if (!combatStage) return;
    const next = Array.isArray(combatAttackRoll)
      ? combatAttackRoll.map(String)
      : buildInitialDice(attackDiceCount);
    setAttackDice(next);
    if (combatStage === "ATTACK_ROLLING") {
      if (!Array.isArray(combatAttackRoll) || combatAttackRoll.length === 0) {
        setCeaselessApplied(false);
        lastCeaselessRef.current = null;
      }
    }
  }, [combatStage, combatAttackRoll, attackDiceCount]);

  useEffect(() => {
    if (!open) return;
    if (combatStage !== "ATTACK_ROLLING") return;
    setDefenseDice([]);
  }, [open, combatStage, defenseDiceCount]);

  const displayDefenseDice = combatStage
    ? Array.isArray(combatDefenseRoll)
      ? combatDefenseRoll.map(String)
      : []
    : defenseDice;

  if (!open) return null;

  const isSummaryStage =
    combatStage === "READY_TO_RESOLVE_DAMAGE" || combatStage === "DONE";
  const hasAttackRoll = combatStage
    ? Array.isArray(combatAttackRoll) && combatAttackRoll.length > 0
    : parseDice(attackDice).length > 0;

  return (
    <div className="kt-modal">
      <div
        className="kt-modal__backdrop"
        onClick={() => {
          resetDice();
          onClose();
        }}
      />
      <div className="kt-modal__panel">
        <button
          className="kt-modal__close"
          type="button"
          onClick={() => {
            resetDice();
            onClose();
          }}
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
                Roll attack dice, then lock them in.
              </div>
              <button
                className="kt-modal__btn kt-modal__btn--success"
                type="button"
                onClick={handleRollClick}
                disabled={readOnly || hasAttackRoll}
              >
                Roll
              </button>
              {hasCeaseless && (
                <button
                  className="kt-modal__btn kt-modal__btn--primary"
                  type="button"
                  onClick={handleCeaselessClick}
                  disabled={readOnly || !hasAttackRoll || ceaselessApplied}
                >
                  Ceaseless
                </button>
              )}
            </div>
            {combatStage && (
              <div className="kt-modal__sidebar-footer">
                {combatStage === "READY_TO_RESOLVE_DAMAGE" && (
                  <button
                    className="kt-modal__btn kt-modal__btn--primary"
                    type="button"
                    onClick={() => onConfirm?.({
                      attackDice: combatAttackRoll || [],
                      defenseDice: [],
                      ceaseless: null,
                      autoLogged: true,
                    })}
                  >
                    Resolve Combat
                  </button>
                )}
                <button
                  className="kt-modal__btn kt-modal__btn--primary"
                  type="button"
                  disabled={combatStage !== "ATTACK_ROLLING"}
                  onClick={() => {
                    onLockAttack?.();
                  }}
                >
                  Lock In Attack
                </button>
              </div>
            )}
          </aside>
          <div className="kt-modal__content">
            <div className="kt-modal__header">
              <div className="kt-modal__title">Attack Roll</div>
              <div className="kt-modal__subtitle">
                {attacker?.name || "Attacker"} → {defender?.name || "Defender"}
              </div>
              {statusMessage && (
                <div className="kt-modal__subtitle">{statusMessage}</div>
              )}
            </div>

            {isSummaryStage && combatSummary && (
              <div className="defense-roll__section">
                <div className="defense-roll__label">Attack Roll</div>
                <div className="defense-roll__placeholder">Dice cleared</div>
                <div className="defense-roll__label">Defense Roll</div>
                <div className="defense-roll__placeholder">Dice cleared</div>
                <div className="defense-roll__label">Combat Result</div>
                <div className="defense-roll__dice defense-roll__dice--summary">
                  <span className="defense-roll__die defense-roll__die--summary">H {combatSummary.hits}</span>
                  <span className="defense-roll__die defense-roll__die--summary">C {combatSummary.crits}</span>
                  <span className="defense-roll__die defense-roll__die--summary">DMG {combatSummary.damage}</span>
                </div>
              </div>
            )}

            {!isSummaryStage && (
              <>
                <div className="defense-roll__section">
                  <div className="defense-roll__label">Attack Dice</div>
                  <div className="defense-roll__dice">
                    {attackDice.map((value, index) => (
                      <div key={`atk-${index}`} className="defense-roll__input">
                        <input
                          className="defense-roll__field"
                          inputMode="numeric"
                          value={value}
                          disabled={readOnly}
                          onChange={(event) => {
                            const next = [...attackDice];
                            next[index] = event.target.value;
                            setAttackDice(next);
                            autoLoggedRef.current = false;
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="defense-roll__section">
                  <div className="defense-roll__label">Defense Dice</div>
                  <div className="defense-roll__dice">
                    {displayDefenseDice.length > 0 ? (
                      displayDefenseDice.map((value, index) => (
                        <span key={`def-${index}`} className="defense-roll__die">
                          {value || "-"}
                        </span>
                      ))
                    ) : (
                      <span className="defense-roll__placeholder">Defender rolling…</span>
                    )}
                  </div>
                </div>
              </>
            )}

            {!combatStage && (
              <div className="kt-modal__actions">
                <button
                  className="kt-modal__btn kt-modal__btn--primary"
                  type="button"
                  onClick={handleConfirm}
                >
                  Resolve
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DiceInputModal;