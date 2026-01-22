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
  const [autoRoll, setAutoRoll] = useState(false);
  const [useCeaseless, setUseCeaseless] = useState(false);
  const ceaselessAppliedRef = useRef(false);
  const autoRollOnceRef = useRef(false);
  const autoRollCallbackRef = useRef(onAutoRoll);

  useEffect(() => {
    autoRollCallbackRef.current = onAutoRoll;
  }, [onAutoRoll]);

  const rollDice = (count) =>
    Array.from({ length: count }, () => String(1 + Math.floor(Math.random() * 6)));

  const rollDiceNumbers = (count) =>
    Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6));

  const applyAutoRoll = () => {
    const initialAttack = rollDiceNumbers(attackDiceCount);
    const threshold = Number(attackHitThreshold);
    const shouldCeaseless = useCeaseless && hasCeaseless;
    const ceaselessValue =
      shouldCeaseless && Number.isFinite(threshold)
        ? pickCeaselessValue(initialAttack, threshold)
        : null;
    const attackAfterCeaseless =
      shouldCeaseless && ceaselessValue != null
        ? applyCeaseless(initialAttack, ceaselessValue)
        : initialAttack;
    const defenseRoll = rollDiceNumbers(defenseDiceCount);

    setAttackDice(attackAfterCeaseless.map(String));
    setDefenseDice(defenseRoll.map(String));

    if (autoRollCallbackRef.current) {
      autoRollCallbackRef.current({
        attackBefore: initialAttack,
        attackAfter: attackAfterCeaseless,
        defenseDice: defenseRoll,
        ceaseless:
          shouldCeaseless && ceaselessValue != null
            ? {
                before: initialAttack,
                after: attackAfterCeaseless,
                rerolled: initialAttack
                  .map((value, index) => (value === ceaselessValue ? index : null))
                  .filter((value) => value != null),
                value: ceaselessValue,
              }
            : null,
      });
    }
  };

  const resetDice = useMemo(
    () => () => {
      setAttackDice(buildInitialDice(attackDiceCount));
      setDefenseDice(buildInitialDice(defenseDiceCount));
    },
    [attackDiceCount, defenseDiceCount],
  );

  useEffect(() => {
    if (!open || !autoRoll) {
      autoRollOnceRef.current = false;
      return;
    }
    if (autoRollOnceRef.current) return;
    autoRollOnceRef.current = true;
    if (combatStage === "ATTACK_ROLLING") {
      if (!Array.isArray(combatAttackRoll) || combatAttackRoll.length === 0) {
        const initialAttack = rollDiceNumbers(attackDiceCount);
        onSetCombatAttackRoll?.(initialAttack);
      }
      return;
    }
    if (!combatStage) {
      applyAutoRoll();
    }
  }, [
    open,
    autoRoll,
    attackDiceCount,
    defenseDiceCount,
    attackHitThreshold,
    hasCeaseless,
    useCeaseless,
    combatStage,
    combatAttackRoll,
    onSetCombatAttackRoll,
  ]);

  useEffect(() => {
    if (!open) return;
    if (combatStage !== "ATTACK_ROLLING") return;
    if (!autoRoll || !useCeaseless || !hasCeaseless) return;
    if (!Array.isArray(combatAttackRoll) || combatAttackRoll.length === 0) return;
    if (ceaselessAppliedRef.current) return;

    ceaselessAppliedRef.current = true;
    const timer = setTimeout(() => {
      const threshold = Number(attackHitThreshold);
      if (!Number.isFinite(threshold)) return;
      const ceaselessValue = pickCeaselessValue(combatAttackRoll, threshold);
      if (ceaselessValue == null) return;
      const after = applyCeaseless(combatAttackRoll, ceaselessValue);
      onSetCombatAttackRoll?.(after);
      if (autoRollCallbackRef.current) {
        autoRollCallbackRef.current({
          attackBefore: combatAttackRoll,
          attackAfter: after,
          defenseDice: [],
          ceaseless: {
            before: combatAttackRoll,
            after,
            rerolled: combatAttackRoll
              .map((value, index) => (value === ceaselessValue ? index : null))
              .filter((value) => value != null),
            value: ceaselessValue,
          },
        });
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [
    open,
    combatStage,
    autoRoll,
    useCeaseless,
    hasCeaseless,
    combatAttackRoll,
    attackHitThreshold,
    onSetCombatAttackRoll,
  ]);

  useEffect(() => {
    if (combatStage !== "ATTACK_ROLLING" || !open) {
      ceaselessAppliedRef.current = false;
    }
  }, [combatStage, open]);

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

  const handleConfirm = () => {
    const parsedAttack = parseDice(attackDice);
    const parsedDefense = parseDice(defenseDice);
    const shouldCeaseless = useCeaseless && hasCeaseless;
    const beforeCeaseless = shouldCeaseless ? [...parsedAttack] : null;
    const threshold = Number(attackHitThreshold);
    const ceaselessValue =
      shouldCeaseless && Number.isFinite(threshold)
        ? pickCeaselessValue(parsedAttack, threshold)
        : null;
    const finalAttack =
      shouldCeaseless && ceaselessValue != null
        ? applyCeaseless(parsedAttack, ceaselessValue)
        : parsedAttack;
    const rerolled = shouldCeaseless
      ? beforeCeaseless
          .map((value, index) => (value === ceaselessValue ? index : null))
          .filter((value) => value != null)
      : [];

    const finalDefense = parsedDefense.length > 0 ? parsedDefense : parsedDefense;

    onConfirm({
      attackDice: finalAttack,
      defenseDice: finalDefense,
      ceaseless:
        shouldCeaseless && beforeCeaseless
          ? {
              before: beforeCeaseless,
              after: finalAttack,
              rerolled,
              value: ceaselessValue,
            }
          : null,
      autoLogged: autoRoll,
    });
    resetDice();
  };

  useEffect(() => {
    if (!combatStage) return;
    const next = Array.isArray(combatAttackRoll)
      ? combatAttackRoll.map(String)
      : buildInitialDice(attackDiceCount);
    setAttackDice(next);
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

        {combatStage === "READY_TO_RESOLVE_DAMAGE" && (
          <div className="kt-modal__actions">
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
          <label className="dice-input__toggle-label dice-input__toggle-label--compact">
            <input
              type="checkbox"
              checked={useCeaseless}
              onChange={(event) => setUseCeaseless(event.target.checked)}
              disabled={!hasCeaseless || readOnly}
            />
            Ceaseless (reroll most common miss)
          </label>
          {combatStage ? (
            <>
              <button
                className="kt-modal__btn"
                type="button"
                onClick={() => {
                  resetDice();
                  onClose();
                }}
              >
                Cancel
              </button>
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
            </>
          ) : (
            <>
              <button
                className="kt-modal__btn"
                type="button"
                onClick={() => {
                  resetDice();
                  onClose();
                }}
              >
                Cancel
              </button>
              <button
                className="kt-modal__btn kt-modal__btn--primary"
                type="button"
                onClick={handleConfirm}
              >
                Resolve
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default DiceInputModal;