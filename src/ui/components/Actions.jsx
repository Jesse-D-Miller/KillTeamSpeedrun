import "./Actions.css";

function Actions({
  attacker,
  actionMarks,
  onAction,
  showActivate,
  onActivate,
  showActionButtons,
  onEndActivation,
  showCounteract,
  onCounteract,
  statusMessage,
}) {
  const getActionClass = (actionKey, baseClass) =>
    actionMarks?.[actionKey]
      ? `${baseClass} kt-action-btn--dark`
      : baseClass;

  return (
    <section className="kt-action-card kt-action-card--vertical-label">
      <div className="kt-action-card__label">Actions</div>
      <div className="kt-action-card__body kt-action-card__body--wrap">
        {statusMessage && (
          <div className="kt-action-card__status">{statusMessage}</div>
        )}
        {showActivate && (
          <button
            className="kt-action-btn"
            type="button"
            onClick={onActivate}
            disabled={!attacker}
          >
            Activate
          </button>
        )}
        {showCounteract && (
          <button
            className="kt-action-btn"
            type="button"
            onClick={onCounteract}
            disabled={!attacker}
          >
            Counteract
          </button>
        )}
        {showActionButtons && (
          <>
        <button
          className={getActionClass(
            "reposition",
            "kt-action-btn kt-action-btn--reposition",
          )}
          type="button"
          onClick={() => onAction?.("reposition")}
          disabled={!attacker}
        >
          Reposition
        </button>
        <button
          className={getActionClass("dash", "kt-action-btn kt-action-btn--dash")}
          type="button"
          onClick={() => onAction?.("dash")}
          disabled={!attacker}
        >
          Dash
        </button>
        <button
          className={getActionClass(
            "shoot",
            "kt-action-btn kt-action-btn--shoot",
          )}
          type="button"
          onClick={() => onAction?.("shoot")}
          disabled={!attacker}
        >
          Shoot
        </button>
        <button
          className={getActionClass(
            "charge",
            "kt-action-btn kt-action-btn--charge",
          )}
          type="button"
          onClick={() => onAction?.("charge")}
          disabled={!attacker}
        >
          Charge
        </button>
        <button
          className={getActionClass(
            "fight",
            "kt-action-btn kt-action-btn--fight",
          )}
          type="button"
          onClick={() => onAction?.("fight")}
          disabled={!attacker}
        >
          Fight
        </button>
        <button
          className={getActionClass(
            "fallBack",
            "kt-action-btn kt-action-btn--fallBack",
          )}
          type="button"
          onClick={() => onAction?.("fallBack")}
          disabled={!attacker}
        >
          Fall Back
        </button>
        <button
          className={getActionClass(
            "pickUpMarker",
            "kt-action-btn kt-action-btn--pickUpMarker",
          )}
          type="button"
          onClick={() => onAction?.("pickUpMarker")}
          disabled={!attacker}
        >
          Pick up Marker
        </button>
        <button
          className={getActionClass(
            "placeMarker",
            "kt-action-btn kt-action-btn--placeMarker",
          )}
          type="button"
          onClick={() => onAction?.("placeMarker")}
          disabled={!attacker}
        >
          Place Marker
        </button>
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
