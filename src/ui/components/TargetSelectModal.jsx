import "./TargetSelectModal.css";

function TargetSelectModal({
  open,
  attacker,
  targets,
  selectedTargetId,
  onSelectTarget,
  onConfirm,
  onClose,
}) {
  if (!open) return null;

  return (
    <div className="kt-modal">
      <div className="kt-modal__backdrop" onClick={onClose} />
      <div className="kt-modal__panel">
        <button
          className="kt-modal__close"
          type="button"
          onClick={onClose}
          aria-label="Close"
          title="Close"
        >
          ×
        </button>
        <div className="kt-modal__layout">
          <aside className="kt-modal__sidebar">
            <div className="kt-modal__sidebar-title">Actions</div>
            <div className="kt-modal__sidebar-empty">
              Choose a target to continue.
            </div>
            <button
              className="kt-modal__btn kt-modal__btn--primary"
              type="button"
              onClick={onConfirm}
              disabled={!selectedTargetId}
            >
              Shoot
            </button>
          </aside>
          <div className="kt-modal__content">
            <div className="kt-modal__header">
              <div className="kt-modal__title">Select Target</div>
              <div className="kt-modal__subtitle">
                Attacker: <span>{attacker?.name || "Unknown"}</span>
              </div>
            </div>

            <div className="kt-modal__grid">
              {targets.length === 0 ? (
                <div className="kt-modal__empty">No valid targets</div>
              ) : (
                targets.map((unit) => (
                  <button
                    key={unit.id}
                    className={`kt-modal__tile ${
                      unit.id === selectedTargetId ? "kt-modal__tile--selected" : ""
                    }`}
                    type="button"
                    onClick={() => onSelectTarget(unit.id)}
                  >
                    <div className="kt-modal__tile-name">{unit.name}</div>
                    <div className="kt-modal__tile-sub">SV {unit.stats.save}+</div>
                    <div className="kt-modal__bar">
                      <div
                        className={`kt-modal__bar-fill ${
                          unit.state.woundsCurrent < unit.stats.woundsMax / 2
                            ? "kt-modal__bar-fill--injured"
                            : ""
                        }`}
                        style={{
                          width: `${Math.max(
                            0,
                            Math.min(
                              100,
                              unit.stats.woundsMax === 0
                                ? 0
                                : (unit.state.woundsCurrent / unit.stats.woundsMax) * 100,
                            ),
                          )}%`,
                        }}
                      />
                    </div>
                  </button>
                ))
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export default TargetSelectModal;