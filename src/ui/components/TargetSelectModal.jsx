import "./TargetSelectModal.css";
import UnitCard from "./UnitCard";

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
  weaponMode = null,
  confirmLabel = "Shoot",
}) {
  if (!open) return null;

  const secondarySet = new Set(secondaryTargetIds || []);
  const findTargetName = (id) => targets.find((unit) => unit.id === id)?.name || "Unknown";

  const handleTargetClick = (event, unit) => {
    if (event?.defaultPrevented) return;
    const interactive = event?.target?.closest?.(
      "button, a, input, select, textarea, [role='button']",
    );
    if (interactive && interactive !== event.currentTarget) return;

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
  };

  return (
    <div className="kt-target-page" data-testid="target-select-modal">
      <button
        className="kt-target-page__close"
        type="button"
        data-testid="target-cancel"
        onClick={onClose}
        aria-label="Close"
        title="Close"
      >
        ×
      </button>
      {targets.length === 0 ? (
        <div className="kt-target-page__empty">No valid targets</div>
      ) : (
        targets.map((unit) => (
          <div
            key={unit.id}
            data-testid={`target-${unit.id}`}
            role="button"
            tabIndex={0}
            onClick={(event) => handleTargetClick(event, unit)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                handleTargetClick(event, unit);
                event.preventDefault();
              }
            }}
          >
            <UnitCard
              unit={unit}
              dispatch={() => {}}
              canChooseOrder={false}
              collapsibleSections={true}
              showWoundsText={true}
              showInjuredInHeader={true}
              weaponMode={weaponMode}
              className={`kt-target-page__card ${
                unit.id === primaryTargetId
                  ? "kt-target-page__card--primary"
                  : secondarySet.has(unit.id)
                    ? "kt-target-page__card--secondary"
                    : ""
              }`}
            />
          </div>
        ))
      )}
      <button
        className="kt-target-page__confirm"
        type="button"
        data-testid="target-confirm"
        onClick={onConfirm}
        disabled={!primaryTargetId}
      >
        {confirmLabel}
      </button>
    </div>
  );
}

export default TargetSelectModal;