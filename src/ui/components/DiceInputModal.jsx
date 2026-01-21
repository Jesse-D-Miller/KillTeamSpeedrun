import { useMemo, useState } from "react";
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
  onClose,
  onConfirm,
}) {
  const [attackDice, setAttackDice] = useState(() => buildInitialDice(attackDiceCount));
  const [defenseDice, setDefenseDice] = useState(() => buildInitialDice(defenseDiceCount));

  const resetDice = useMemo(
    () => () => {
      setAttackDice(buildInitialDice(attackDiceCount));
      setDefenseDice(buildInitialDice(defenseDiceCount));
    },
    [attackDiceCount, defenseDiceCount],
  );

  if (!open) return null;

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

  const handleConfirm = () => {
    onConfirm({
      attackDice: parseDice(attackDice),
      defenseDice: parseDice(defenseDice),
    });
    resetDice();
  };

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
          <div className="kt-modal__title">Enter Dice</div>
          <div className="kt-modal__subtitle">
            {attacker?.name || "Attacker"} → {defender?.name || "Defender"}
          </div>
        </div>

        <div className="dice-input">
          <div className="dice-input__block">
            <div className="dice-input__label">Attack Dice</div>
            <div className="dice-input__grid">
              {attackDice.map((value, index) => {
                const pipIndices = pipIndicesForValue(value);
                return (
                  <div key={`atk-${index}`} className="dice-input__die">
                    <input
                      className="dice-input__input"
                      inputMode="numeric"
                      value={value}
                      onChange={(event) => {
                        const next = [...attackDice];
                        next[index] = event.target.value;
                        setAttackDice(next);
                      }}
                    />
                    <div className="dice-input__pips">
                      {Array.from({ length: 9 }).map((_, pipIndex) => (
                        <span
                          key={pipIndex}
                          className={`dice-input__pip ${
                            pipIndices.includes(pipIndex) ? "dice-input__pip--on" : ""
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="dice-input__block">
            <div className="dice-input__label">Defense Dice</div>
            <div className="dice-input__grid">
              {defenseDice.map((value, index) => {
                const pipIndices = pipIndicesForValue(value);
                return (
                  <div key={`def-${index}`} className="dice-input__die">
                    <input
                      className="dice-input__input"
                      inputMode="numeric"
                      value={value}
                      onChange={(event) => {
                        const next = [...defenseDice];
                        next[index] = event.target.value;
                        setDefenseDice(next);
                      }}
                    />
                    <div className="dice-input__pips">
                      {Array.from({ length: 9 }).map((_, pipIndex) => (
                        <span
                          key={pipIndex}
                          className={`dice-input__pip ${
                            pipIndices.includes(pipIndex) ? "dice-input__pip--on" : ""
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="kt-modal__actions">
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
        </div>
      </div>
    </div>
  );
}

export default DiceInputModal;