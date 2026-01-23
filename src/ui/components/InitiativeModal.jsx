import React from "react";
import "./InitiativeModal.css";

export default function InitiativeModal({
  isOpen,
  isPlayerA,
  onSelectWinner,
  onClose,
}) {
  if (!isOpen || !isPlayerA) return null;

  function handleSelect(player) {
    if (typeof onSelectWinner === "function") onSelectWinner(player);
    if (typeof onClose === "function") onClose();
  }

  return (
    <div className="kt-init-modal__backdrop" role="presentation">
      <div
        className="kt-init-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kt-init-title"
      >
        <header className="kt-init-modal__header">
          <h2 id="kt-init-title" className="kt-init-modal__title">
            Initiative
          </h2>
        </header>

        <div className="kt-init-modal__body">
          <p className="kt-init-modal__hint">
            Roll in real life, then tap the winner.
          </p>

          <div className="kt-init-modal__buttons">
            <button
              type="button"
              className="kt-init-btn kt-init-btn--a"
              onClick={() => handleSelect("A")}
            >
              A
            </button>

            <button
              type="button"
              className="kt-init-btn kt-init-btn--b"
              onClick={() => handleSelect("B")}
            >
              B
            </button>
          </div>
        </div>

        <footer className="kt-init-modal__footer">
          <button
            type="button"
            className="kt-init-modal__close"
            onClick={onClose}
          >
            Cancel
          </button>
        </footer>
      </div>
    </div>
  );
}
