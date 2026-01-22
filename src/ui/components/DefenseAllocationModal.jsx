import { useMemo, useState } from "react";
import "./DefenseAllocationModal.css";

function classifyDice(dice, threshold, critThreshold = 6) {
  return dice.map((value, index) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return { id: index, value, type: "miss" };
    }
    if (numeric >= critThreshold) {
      return { id: index, value: numeric, type: "crit" };
    }
    if (numeric >= threshold) return { id: index, value: numeric, type: "hit" };
    return { id: index, value: numeric, type: "miss" };
  });
}

function pipIndicesForValue(value) {
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
}

function DefenseAllocationModal({
  open,
  attacker,
  defender,
  weapon,
  attackDice,
  defenseDice,
  hitThreshold,
  saveThreshold,
  attackCritThreshold,
  onClose,
  onConfirm,
}) {
  const attackEntries = useMemo(
    () => classifyDice(attackDice, hitThreshold, attackCritThreshold ?? 6),
    [attackDice, hitThreshold, attackCritThreshold],
  );
  const defenseEntries = useMemo(
    () => classifyDice(defenseDice, saveThreshold, 6),
    [defenseDice, saveThreshold],
  );

  const [selectedDefenseId, setSelectedDefenseId] = useState(null);
  const [allocations, setAllocations] = useState({});
  const [draggedDefenseId, setDraggedDefenseId] = useState(null);

  if (!open) return null;

  const reset = () => {
    setSelectedDefenseId(null);
    setAllocations({});
    setDraggedDefenseId(null);
  };
  const handleDrop = (attackId) => {
    if (draggedDefenseId == null) return;

    const defense = defenseEntries.find((entry) => entry.id === draggedDefenseId);
    const attack = attackEntries.find((entry) => entry.id === attackId);

    if (!canAssignDefenseToAttack(defense, attack)) return;

    setAllocations((prev) => ({
      ...prev,
      [draggedDefenseId]: attackId,
    }));
    setDraggedDefenseId(null);
  };

  const allocationCounts = attackEntries.reduce((acc, attack) => {
    const allocatedDefenseIds = Object.entries(allocations)
      .filter(([, attackId]) => Number(attackId) === attack.id)
      .map(([defenseId]) => Number(defenseId));

    const defenseTypes = allocatedDefenseIds.map(
      (id) => defenseEntries.find((entry) => entry.id === id)?.type,
    );

    acc[attack.id] = {
      crits: defenseTypes.filter((type) => type === "crit").length,
      hits: defenseTypes.filter((type) => type === "hit").length,
    };
    return acc;
  }, {});

  const canAssignDefenseToAttack = (defense, attack) => {
    if (!defense || defense.type === "miss") return false;
    if (!attack || attack.type === "miss") return false;

    const counts = allocationCounts[attack.id] || { crits: 0, hits: 0 };

    if (attack.type === "hit") {
      if (counts.crits > 0 || counts.hits > 0) return false;
      return defense.type === "hit" || defense.type === "crit";
    }

    if (attack.type === "crit") {
      if (counts.crits > 0) return false;
      if (defense.type === "crit") return counts.hits === 0;
      if (defense.type === "hit") return counts.hits < 2;
    }

    return false;
  };

  const handleAttackClick = (attackId) => {
    if (selectedDefenseId == null) return;

    const defense = defenseEntries.find((entry) => entry.id === selectedDefenseId);
    const attack = attackEntries.find((entry) => entry.id === attackId);

    if (!canAssignDefenseToAttack(defense, attack)) return;

    setAllocations((prev) => ({
      ...prev,
      [selectedDefenseId]: attackId,
    }));
    setSelectedDefenseId(null);
  };

  const removeAllocation = (defenseId) => {
    setAllocations((prev) => {
      const next = { ...prev };
      delete next[defenseId];
      return next;
    });
  };

  const successfulDefenseIds = defenseEntries
    .filter((entry) => entry.type === "hit" || entry.type === "crit")
    .map((entry) => entry.id);

  const computeRemaining = () => {
    let remainingHits = 0;
    let remainingCrits = 0;

    attackEntries.forEach((attack) => {
      if (attack.type === "miss") return;
      const counts = allocationCounts[attack.id] || { crits: 0, hits: 0 };

      if (attack.type === "hit") {
        if (counts.crits + counts.hits === 0) remainingHits += 1;
      }

      if (attack.type === "crit") {
        if (counts.crits > 0) return;
        if (counts.hits >= 2) return;
        remainingCrits += 1;
      }
    });

    return { remainingHits, remainingCrits };
  };

  const handleConfirm = () => {
    const { remainingHits, remainingCrits } = computeRemaining();
    onConfirm({
      allocations,
      remainingHits,
      remainingCrits,
      defenseEntries,
      attackEntries,
    });
    reset();
  };

  return (
    <div className="kt-modal">
      <div
        className="kt-modal__backdrop"
        onClick={() => {
          reset();
          onClose();
        }}
      />
      <div className="kt-modal__panel">
        <button
          className="kt-modal__close"
          type="button"
          onClick={() => {
            reset();
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
                Assign defense dice to block hits.
              </div>
            </div>
            <div className="kt-modal__sidebar-footer">
              <button
                className="kt-modal__btn kt-modal__btn--primary"
                type="button"
                onClick={handleConfirm}
              >
                Resolve
              </button>
            </div>
          </aside>
          <div className="kt-modal__content">
            <div className="kt-modal__header">
              <div className="kt-modal__title">Allocate Defense Dice</div>
              <div className="kt-modal__subtitle">
                {attacker?.name || "Attacker"} — {weapon?.name || "Weapon"} vs {defender?.name || "Defender"}
              </div>
            </div>

            <div className="allocation">
              <div className="allocation__block">
                <div className="allocation__label">Attack Dice</div>
                <div className="allocation__grid">
                  {attackEntries.map((attack) => {
                    const allocationsForAttack = Object.entries(allocations)
                      .filter(([, attackId]) => Number(attackId) === attack.id)
                      .map(([defenseId]) => Number(defenseId));
                    const counts = allocationCounts[attack.id] || { crits: 0, hits: 0 };
                    const isNegated =
                      attack.type === "hit"
                        ? counts.crits + counts.hits >= 1
                        : attack.type === "crit"
                          ? counts.crits >= 1 || counts.hits >= 2
                          : false;

                    return (
                      <button
                        key={attack.id}
                        type="button"
                        className={`allocation__die allocation__die--${attack.type} ${
                          draggedDefenseId != null ? "allocation__die--droppable" : ""
                        } ${isNegated ? "allocation__die--negated" : ""}`}
                        onClick={() => handleAttackClick(attack.id)}
                        onDragOver={(event) => {
                          event.preventDefault();
                        }}
                        onDrop={() => handleDrop(attack.id)}
                      >
                        <div className="allocation__pips">
                          {Array.from({ length: 9 }).map((_, pipIndex) => (
                            <span
                              key={pipIndex}
                              className={`allocation__pip ${
                                pipIndicesForValue(attack.value).includes(pipIndex)
                                  ? "allocation__pip--on"
                                  : ""
                              }`}
                            />
                          ))}
                        </div>
                        {allocationsForAttack.length > 0 && (
                          <div className="allocation__assigned">
                            {allocationsForAttack.map((defenseId) => {
                              const defense = defenseEntries.find((d) => d.id === defenseId);
                              const tagClass =
                                defense?.type === "crit"
                                  ? "allocation__assigned-tag allocation__assigned-tag--crit"
                                  : "allocation__assigned-tag";
                              return (
                                <span key={defenseId} className={tagClass}>
                                  {defense?.type === "crit" ? "C" : "S"}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="allocation__block">
                <div className="allocation__label">Defense Dice</div>
                <div className="allocation__grid">
                  {defenseEntries.map((defense) => {
                    const isSelected = selectedDefenseId === defense.id;
                    const allocatedAttackId = allocations[defense.id];
                    const isAllocated = allocatedAttackId != null;

                    return (
                      <button
                        key={defense.id}
                        type="button"
                        className={`allocation__die allocation__die--${defense.type} ${
                          isSelected ? "allocation__die--selected" : ""
                        } ${isAllocated ? "allocation__die--allocated" : ""}`}
                        draggable={defense.type !== "miss" && !isAllocated}
                        onDragStart={() => {
                          if (defense.type === "miss" || isAllocated) return;
                          setDraggedDefenseId(defense.id);
                        }}
                        onDragEnd={() => setDraggedDefenseId(null)}
                        onClick={() => {
                          if (isAllocated) {
                            removeAllocation(defense.id);
                            return;
                          }
                          if (defense.type === "miss") return;
                          setSelectedDefenseId(defense.id);
                        }}
                      >
                        <div className="allocation__pips">
                          {Array.from({ length: 9 }).map((_, pipIndex) => (
                            <span
                              key={pipIndex}
                              className={`allocation__pip ${
                                pipIndicesForValue(defense.value).includes(pipIndex)
                                  ? "allocation__pip--on"
                                  : ""
                              }`}
                            />
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export default DefenseAllocationModal;