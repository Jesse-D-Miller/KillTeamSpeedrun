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
  showCounteractWindow,
  onCounteract,
  onPassCounteract,
  counteractOptions,
  onSelectCounteractOperative,
  allowedActions,
  actionAvailability = null,
  statusMessage,
  isCounteractActive = false,
  counteractActionsTaken = 0,
}) {
  const isActionAvailable = (actionKey) =>
    !actionAvailability || actionAvailability[actionKey] !== false;

  const getActionClass = (actionKey, baseClass) => {
    const marked = Boolean(actionMarks?.[actionKey]);
    const unavailable = !isActionAvailable(actionKey);
    return marked || unavailable
      ? `${baseClass} kt-action-btn--dark`
      : baseClass;
  };

  const isAllowed = (actionKey) =>
    !Array.isArray(allowedActions) || allowedActions.includes(actionKey);

  return (
    <section className="kt-action-card kt-action-card--vertical-label">
      <div className="kt-action-card__label">Actions</div>
      <div className="kt-action-card__body kt-action-card__body--wrap">
        {statusMessage && (
          <div className="kt-action-card__status kt-action-card__status--vertical">
            {statusMessage}
          </div>
        )}
        {showActivate && (
          <div className="kt-action-card__activate">
            <button
              className="kt-action-btn kt-action-btn--activate-conceal"
              type="button"
              onClick={onActivateConceal}
              disabled={!attacker}
              data-testid="action-activate-conceal"
            >
              <span>Activate</span>
              <span>Conceal</span>
            </button>
            <button
              className="kt-action-btn kt-action-btn--activate-engage"
              type="button"
              onClick={onActivateEngage}
              disabled={!attacker}
              data-testid="action-activate-engage"
            >
              <span>Activate</span>
              <span>Engage</span>
            </button>
          </div>
        )}
        {showCounteractWindow && (
          <div className="kt-action-card__counteract">
            <div className="kt-action-card__counteract-actions">
              <button
                className="kt-action-btn"
                type="button"
                onClick={onCounteract}
                disabled={!attacker || !showCounteract}
                data-testid="action-counteract"
              >
                Counteract
              </button>
              <button
                className="kt-action-btn kt-action-btn--ghost"
                type="button"
                onClick={onPassCounteract}
                disabled={!attacker}
              >
                Pass
              </button>
            </div>
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
            disabled={!attacker || !canUseActions || !isActionAvailable("reposition")}
            data-testid="action-reposition"
          >
            Reposition
          </button>
        )}
        {isAllowed("dash") && (
          <button
            className={getActionClass("dash", "kt-action-btn kt-action-btn--dash")}
            type="button"
            onClick={() => onAction?.("dash")}
            disabled={!attacker || !canUseActions || !isActionAvailable("dash")}
            data-testid="action-dash"
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
            disabled={!attacker || !canUseActions || !isActionAvailable("shoot")}
            data-testid="action-shoot"
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
            disabled={!attacker || !canUseActions || !isActionAvailable("charge")}
            data-testid="action-charge"
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
            disabled={!attacker || !canUseActions || !isActionAvailable("fight")}
            data-testid="action-fight"
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
            disabled={!attacker || !canUseActions || !isActionAvailable("fallBack")}
            data-testid="action-fall-back"
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
            disabled={!attacker || !canUseActions || !isActionAvailable("pickUpMarker")}
            data-testid="action-pick-up-marker"
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
            disabled={!attacker || !canUseActions || !isActionAvailable("placeMarker")}
            data-testid="action-place-marker"
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
          disabled={!attacker || (isCounteractActive && counteractActionsTaken <= 0)}
          data-testid="action-end-activation"
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
