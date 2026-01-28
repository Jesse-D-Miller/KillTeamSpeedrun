import React from "react";
import "./WeaponRulesPanel.css";
import { getClickableWeaponRulesForPhase } from "../../engine/rules/weaponRuleUi";

export default function WeaponRulesPanel({ ctx, phase, onCtxChange }) {
  const items = getClickableWeaponRulesForPhase(ctx, phase);

  if (!items.length) return null;

  return (
    <div className="wr-panel">
      <div className="wr-title">
        Weapon Rules — {phase.replace("_", " ").toLowerCase()}
      </div>

      <div className="wr-grid">
        {items.map((it) => (
          <button
            key={`${phase}-${it.id}-${it.label}`}
            className={`wr-chip ${it.enabled ? "" : "is-disabled"}`}
            disabled={!it.enabled}
            title={it.disabledReason || it.preview}
            onClick={() => {
              // IMPORTANT: click mutates ctx (by design here). If you prefer immutability, clone ctx first.
              it.onClick({});
              onCtxChange?.({
                ...ctx,
                ui: { ...ctx.ui },
                modifiers: { ...ctx.modifiers },
                log: [...ctx.log],
              });
            }}
          >
            <div className="wr-chip-label">{it.label}</div>
            <div className="wr-chip-preview">{it.preview}</div>
            {!it.enabled && it.disabledReason ? (
              <div className="wr-chip-reason">{it.disabledReason}</div>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
