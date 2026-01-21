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
                {unit.name}
              </button>
            ))
          )}
        </div>

        <div className="kt-modal__actions">
          <button className="kt-modal__btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="kt-modal__btn kt-modal__btn--primary"
            type="button"
            onClick={onConfirm}
            disabled={!selectedTargetId}
          >
            Shoot
          </button>
        </div>
      </div>
    </div>
  );
}

export default TargetSelectModal;