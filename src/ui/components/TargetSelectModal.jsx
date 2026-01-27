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

  return (
    <div className="kt-target-page">
      <button
        className="kt-target-page__close"
        type="button"
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
          <UnitCard
            key={unit.id}
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
            onCardClick={() => {
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
          />
        ))
      )}
      <button
        className="kt-target-page__confirm"
        type="button"
        onClick={onConfirm}
        disabled={!primaryTargetId}
      >
        {confirmLabel}
      </button>
    </div>
  );
}

export default TargetSelectModal;