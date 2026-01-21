import "./ShootActionCard.css";

function ShootActionCard({ attacker, hasTargets, onShoot }) {
  return (
    <section className="kt-action-card">
      <div className="kt-action-card__header">Actions</div>
      <div className="kt-action-card__body">
        <button
          className="kt-action-btn"
          type="button"
          onClick={onShoot}
          disabled={!attacker || !hasTargets}
        >
          Shoot
        </button>
      </div>
    </section>
  );
}

export default ShootActionCard;