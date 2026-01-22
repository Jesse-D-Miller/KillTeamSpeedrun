import "./Actions.css";

function Actions({ attacker, hasTargets, onShoot }) {
  return (
    <section className="kt-action-card kt-action-card--vertical-label">
      <div className="kt-action-card__label">Actions</div>
      <div className="kt-action-card__body kt-action-card__body--wrap">
        <button className="kt-action-btn" type="button">
          Reposition
        </button>
        <button className="kt-action-btn" type="button">
          Dash
        </button>
        <button
          className="kt-action-btn"
          type="button"
          onClick={onShoot}
          disabled={!attacker || !hasTargets}
        >
          Shoot
        </button>
        <button className="kt-action-btn" type="button">
          Charge
        </button>
        <button className="kt-action-btn" type="button">
          Fight
        </button>
        <button className="kt-action-btn" type="button">
          Fall Back
        </button>
        <button className="kt-action-btn" type="button">
          Pick up Marker
        </button>
        <button className="kt-action-btn" type="button">
          Place Marker
        </button>
      </div>
    </section>
  );
}

export default Actions;
