import "./TargetSelectModal.css";

function TargetSelectModal({
  open,
  attacker,
  targets,
  primaryTargetId,
  secondaryTargetIds,
  onSelectPrimary,
  onToggleSecondary,
  onConfirm,
  onClose,
  allowSecondarySelection,
  confirmLabel = "Shoot",
}) {
  if (!open) return null;

  const secondarySet = new Set(secondaryTargetIds || []);
  const findTargetName = (id) => targets.find((unit) => unit.id === id)?.name || "Unknown";

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
              disabled={!primaryTargetId}
            >
              {confirmLabel}
            </button>
            {allowSecondarySelection && (
              <div className="kt-modal__sidebar-empty">
                <div><strong>PRIMARY TARGET:</strong></div>
                <div>{primaryTargetId ? findTargetName(primaryTargetId) : "None"}</div>
                <div style={{ marginTop: 8 }}><strong>BLAST TARGET(S):</strong></div>
                {secondaryTargetIds && secondaryTargetIds.length > 0 ? (
                  <div>
                    {secondaryTargetIds.map((id) => (
                      <div key={id}>{findTargetName(id)}</div>
                    ))}
                  </div>
                ) : (
                  <div>None</div>
                )}
              </div>
            )}
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
                      unit.id === primaryTargetId
                        ? "kt-modal__tile--primary"
                        : secondarySet.has(unit.id)
                          ? "kt-modal__tile--secondary"
                          : ""
                    }`}
                    type="button"
                    onClick={() => {
                      if (unit.id === primaryTargetId) {
                        onSelectPrimary?.(null);
                        return;
                      }
                      if (!primaryTargetId) {
                        onSelectPrimary?.(unit.id);
                        return;
                      }
                      if (allowSecondarySelection) {
                        onToggleSecondary?.(unit.id);
                      }
                    }}
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