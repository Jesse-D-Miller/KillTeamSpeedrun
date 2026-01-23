import "./Actions.css";

function Actions({
  attacker,
  actionMarks,
  onAction,
  showActivate,
  onActivateConceal,
  onActivateEngage,
  showActionButtons,
  canUseActions,
  onEndActivation,
  showCounteract,
  onCounteract,
  counteractOptions,
  onSelectCounteractOperative,
  allowedActions,
  statusMessage,
}) {
  const getActionClass = (actionKey, baseClass) =>
    actionMarks?.[actionKey]
      ? `${baseClass} kt-action-btn--dark`
      : baseClass;

  const isAllowed = (actionKey) =>
    !Array.isArray(allowedActions) || allowedActions.includes(actionKey);

  return (
    <section className="kt-action-card kt-action-card--vertical-label">
      <div className="kt-action-card__label">Actions</div>
      <div className="kt-action-card__body kt-action-card__body--wrap">
        {statusMessage && (
          <div className="kt-action-card__status">{statusMessage}</div>
        )}
        {showActivate && (
          <div className="kt-action-card__activate">
            <button
              className="kt-action-btn kt-action-btn--activate-conceal"
              type="button"
              onClick={onActivateConceal}
              disabled={!attacker}
            >
              <span>Activate</span>
              <span>Conceal</span>
            </button>
            <button
              className="kt-action-btn kt-action-btn--activate-engage"
              type="button"
              onClick={onActivateEngage}
              disabled={!attacker}
            >
              <span>Activate</span>
              <span>Engage</span>
            </button>
          </div>
        )}
        {showCounteract && (
          <div className="kt-action-card__counteract">
            <button
              className="kt-action-btn"
              type="button"
              onClick={onCounteract}
              disabled={!attacker}
            >
              Counteract
            </button>
            {Array.isArray(counteractOptions) && counteractOptions.length > 0 && (
              <div className="kt-action-card__counteract-list">
                {counteractOptions.map((unit) => (
                  <button
                    key={unit.id}
                    type="button"
                    className="kt-action-card__counteract-option"
                    onClick={() => onSelectCounteractOperative?.(unit.id)}
                  >
                    {unit.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {showActionButtons && (
          <>
        {isAllowed("reposition") && (
          <button
            className={getActionClass(
              "reposition",
              "kt-action-btn kt-action-btn--reposition",
            )}
            type="button"
            onClick={() => onAction?.("reposition")}
            disabled={!attacker || !canUseActions}
          >
            Reposition
          </button>
        )}
        {isAllowed("dash") && (
          <button
            className={getActionClass("dash", "kt-action-btn kt-action-btn--dash")}
            type="button"
            onClick={() => onAction?.("dash")}
            disabled={!attacker || !canUseActions}
          >
            Dash
          </button>
        )}
        {isAllowed("shoot") && (
          <button
            className={getActionClass(
              "shoot",
              "kt-action-btn kt-action-btn--shoot",
            )}
            type="button"
            onClick={() => onAction?.("shoot")}
            disabled={!attacker || !canUseActions}
          >
            Shoot
          </button>
        )}
        {isAllowed("charge") && (
          <button
            className={getActionClass(
              "charge",
              "kt-action-btn kt-action-btn--charge",
            )}
            type="button"
            onClick={() => onAction?.("charge")}
            disabled={!attacker || !canUseActions}
          >
            Charge
          </button>
        )}
        {isAllowed("fight") && (
          <button
            className={getActionClass(
              "fight",
              "kt-action-btn kt-action-btn--fight",
            )}
            type="button"
            onClick={() => onAction?.("fight")}
            disabled={!attacker || !canUseActions}
          >
            Fight
          </button>
        )}
        {isAllowed("fallBack") && (
          <button
            className={getActionClass(
              "fallBack",
              "kt-action-btn kt-action-btn--fallBack",
            )}
            type="button"
            onClick={() => onAction?.("fallBack")}
            disabled={!attacker || !canUseActions}
          >
            Fall Back
          </button>
        )}
        {isAllowed("pickUpMarker") && (
          <button
            className={getActionClass(
              "pickUpMarker",
              "kt-action-btn kt-action-btn--pickUpMarker",
            )}
            type="button"
            onClick={() => onAction?.("pickUpMarker")}
            disabled={!attacker || !canUseActions}
          >
            Pick up Marker
          </button>
        )}
        {isAllowed("placeMarker") && (
          <button
            className={getActionClass(
              "placeMarker",
              "kt-action-btn kt-action-btn--placeMarker",
            )}
            type="button"
            onClick={() => onAction?.("placeMarker")}
            disabled={!attacker || !canUseActions}
          >
            Place Marker
          </button>
        )}
        <button
          className={getActionClass(
            "endActivation",
            "kt-action-btn kt-action-btn--endActivation",
          )}
          type="button"
          onClick={() => onEndActivation?.()}
          disabled={!attacker}
        >
          End Activation
        </button>
          </>
        )}
      </div>
    </section>
  );
}

export default Actions;
