import "./WeaponSelectModal.css";
import UnitCard from "./UnitCard";
import {
  canUseLimitedWeapon,
  getLimitedValue,
  makeWeaponUsageKey,
} from "../../engine/rules/limitedWeapon";

function WeaponSelectModal({
  open,
  mode,
  attackerUnit,
  defenderUnit,
  attackerWeapon,
  defenderWeapon,
  attackerReady,
  defenderReady,
  localRole = null,
  weaponUsage = {},
  onSetWeapon,
  onReady,
  onCancel,
}) {
  if (!open) return null;

  const weaponMode = mode === "fight" ? "melee" : "ranged";
  const attackerWeapons = Array.isArray(attackerUnit?.weapons)
    ? attackerUnit.weapons.filter((weapon) => weapon.mode === weaponMode)
    : [];
  const defenderWeapons = Array.isArray(defenderUnit?.weapons)
    ? defenderUnit.weapons.filter((weapon) => weapon.mode === weaponMode)
    : [];

  const getLocalButtonState = (selectedWeapon, isReady, selectedWeaponUsable) => {
    if (!selectedWeapon) {
      return { label: "Select weapon", disabled: true, showSpinner: false };
    }
    if (!selectedWeaponUsable) {
      return { label: "Limited used", disabled: true, showSpinner: false };
    }
    if (!isReady) {
      return { label: "READY", disabled: false, showSpinner: false };
    }
    if (attackerReady && defenderReady) {
      return { label: "READY ✅", disabled: true, showSpinner: false };
    }
    return { label: "WAITING…", disabled: true, showSpinner: true };
  };

  const renderSide = ({ role, unit, weapons, selectedWeapon, isReady }) => {
    const isLocal = localRole === role;
    const canPick = isLocal && !isReady;
    const roleLabel = role === "attacker" ? "Attacker" : "Defender";
    const selectionLabel = `${roleLabel} weapon selected: ${selectedWeapon || "None"}`;
    const readyTestId = role === "attacker" ? "weapon-ready-attacker" : "weapon-ready-defender";
    const statusTestId =
      role === "attacker" ? "weapon-status-attacker" : "weapon-status-defender";
    const hasValidWeapons = weapons.length > 0;
    const bothReady = attackerReady && defenderReady;

    const selectedWeaponProfile = weapons.find((weapon) => weapon.name === selectedWeapon);
    const selectedWeaponUsable =
      role !== "attacker" || !selectedWeaponProfile
        ? true
        : canUseLimitedWeapon({
            weaponProfile: selectedWeaponProfile,
            operativeId: unit?.id,
            weaponName: selectedWeaponProfile?.name ?? selectedWeapon,
            weaponUsage,
          });
    const getWeaponLimitedUsage = (weapon) => {
      const limit = getLimitedValue(weapon);
      if (!limit) return null;
      const key = makeWeaponUsageKey(unit?.id, weapon?.name);
      const used = Number(weaponUsage?.[key]?.used ?? 0);
      return { limit, used };
    };
    const localButtonState = getLocalButtonState(
      selectedWeapon,
      isReady,
      selectedWeaponUsable,
    );
    const localStatusLabel = localButtonState.label;
    const opponentStatusLabel = isReady ? "Opponent ready ✅" : "Opponent selecting…";

    return (
      <div
        className="kt-modal__tile weapon-select__tile"
        data-testid={`weapon-select-${role}`}
      >
        <div className="kt-modal__tile-name">
          {roleLabel}: {unit?.name || "Unknown"}
        </div>
        <div className="kt-modal__tile-sub weapon-select__selection">
          {selectionLabel}
        </div>
        <div className="kt-modal__tile-sub weapon-select__card-wrap">
          <UnitCard
            unit={unit}
            dispatch={() => {}}
            canChooseOrder={false}
            onChooseOrder={() => {}}
            weaponMode={weaponMode}
            className="weapon-select__card"
            weaponSelectionEnabled={canPick}
            onSelectWeapon={(weaponName) => onSetWeapon?.(role, weaponName)}
            selectedWeaponNameOverride={selectedWeapon}
            autoSelectFirstWeapon={false}
            emptyWeaponsLabel="No valid weapons"
            weaponOptionRole={role}
            isWeaponSelectable={(weapon) =>
              role !== "attacker"
                ? true
                : canUseLimitedWeapon({
                    weaponProfile: weapon,
                    operativeId: unit?.id,
                    weaponName: weapon?.name,
                    weaponUsage,
                  })
            }
            getWeaponDisabledReason={(weapon) => {
              if (role !== "attacker") return null;
              const usage = getWeaponLimitedUsage(weapon);
              if (!usage) return null;
              return usage.used >= usage.limit ? "Limited uses spent." : null;
            }}
            getWeaponBadge={(weapon) => {
              if (role !== "attacker") return null;
              const usage = getWeaponLimitedUsage(weapon);
              if (!usage || usage.used < usage.limit) return null;
              return {
                label: "LIMITED USED",
                detail: `Limited ${usage.limit} — used`,
                testId: `weapon-limited-badge-${role}-${weapon?.name}`,
              };
            }}
          />
        </div>
        <div className="weapon-select__controls">
          {isLocal ? (
            <>
              <div className="weapon-select__status" data-testid={statusTestId}>
                {localStatusLabel}
              </div>
            </>
          ) : (
            <div className="weapon-select__status" data-testid={statusTestId}>
              {opponentStatusLabel}
              {!isReady && (
                <span className="unit-selector__spinner" aria-hidden="true" />
              )}
            </div>
          )}
          {isLocal && (
            <button
              className="kt-modal__btn kt-modal__btn--primary"
              type="button"
              data-testid={readyTestId}
              onClick={() => onReady?.(role)}
              disabled={localButtonState.disabled}
            >
              {localButtonState.showSpinner && (
                <span className="unit-selector__spinner" aria-hidden="true" />
              )}
              {localButtonState.label}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="kt-modal" data-testid="weapon-select-modal">
      <div className="kt-modal__backdrop" onClick={() => onCancel?.()} />
      <div className="kt-modal__panel">
        <button
          className="kt-modal__close"
          type="button"
          onClick={() => onCancel?.()}
          aria-label="Close"
          title="Close"
        >
          ×
        </button>
        <div className="kt-modal__layout weapon-select__layout">
          <div className="kt-modal__content weapon-select__content">
            <div className="kt-modal__grid weapon-select__grid">
              {renderSide({
                role: "attacker",
                unit: attackerUnit,
                weapons: attackerWeapons,
                selectedWeapon: attackerWeapon,
                isReady: attackerReady,
              })}
              {renderSide({
                role: "defender",
                unit: defenderUnit,
                weapons: defenderWeapons,
                selectedWeapon: defenderWeapon,
                isReady: defenderReady,
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WeaponSelectModal;
