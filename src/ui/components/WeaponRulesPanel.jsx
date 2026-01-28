import React, { useEffect, useMemo, useRef, useState } from "react";
import "./WeaponRulesPanel.css";
import { applyAutoRulesForPhase, getClickableWeaponRulesForPhase } from "../../engine/rules/weaponRuleUi";

function useOutsideClick(ref, onOutside) {
  useEffect(() => {
    const handler = (e) => {
      if (!ref.current) return;
      if (ref.current.contains(e.target)) return;
      onOutside?.();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [ref, onOutside]);
}

export default function WeaponRulesPanel({ ctx, phase, onCtxChange, testId }) {
  const items = useMemo(
    () => getClickableWeaponRulesForPhase(ctx, phase),
    [ctx, phase],
  );

  const [popover, setPopover] = useState(null);
  const popRef = useRef(null);
  useOutsideClick(popRef, () => setPopover(null));

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setPopover(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!popover?.ruleId) return;

    const reposition = () => {
      const el = document.querySelector(
        `[data-wr-anchor="${popover.ruleId}"]`,
      );
      if (!el) return;

      const r = el.getBoundingClientRect();
      const scrollX = window.scrollX || window.pageXOffset || 0;
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const width = Math.min(360, Math.max(240, r.width));
      const x = Math.max(
        12,
        Math.min(
          window.innerWidth - width - 12 + scrollX,
          r.left + r.width / 2 - width / 2 + scrollX,
        ),
      );
      const y = Math.min(window.innerHeight - 12 + scrollY, r.bottom + 8 + scrollY);

      setPopover((prev) => (prev ? { ...prev, x, y, width } : prev));
    };

    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [popover?.ruleId]);

  useEffect(() => {
    if (!onCtxChange) return;
    const result = applyAutoRulesForPhase(ctx, phase);
    if (result.changed) {
      onCtxChange(result.ctx);
    }
  }, [ctx, phase, onCtxChange]);

  if (!items.length) return null;

  const openPopoverFor = (ruleId, title, text) => {
    const el = document.querySelector(`[data-wr-anchor="${ruleId}"]`);
    const r = el?.getBoundingClientRect?.();
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const width = Math.min(360, Math.max(240, r?.width ?? 260));
    const x = r
      ? Math.max(
          12,
          Math.min(
            window.innerWidth - width - 12 + scrollX,
            r.left + r.width / 2 - width / 2 + scrollX,
          ),
        )
      : 12;
    const y = r
      ? Math.min(window.innerHeight - 12 + scrollY, r.bottom + 8 + scrollY)
      : 80;

    setPopover({ ruleId, title, text, x, y, width });
  };

  return (
    <div className="wr-panel" data-testid={testId}>
      <div className="wr-title">
        Weapon Rules — {phase.replace("_", " ").toLowerCase()}
      </div>

      <div className="wr-grid">
        {items.map((it) => (
          <button
            key={`${phase}-${it.id}-${it.label}`}
            data-wr-anchor={it.id}
            type="button"
            className={`wr-chip ${it.colorClass || ""} ${
              it.applied ? "is-applied" : ""
            } ${it.enabled ? "" : "is-disabled"}`}
            aria-disabled={!it.enabled}
            data-testid={`rule-chip-${it.id}-${phase.toLowerCase()}`}
            onClick={() => {
              if (!it.enabled) return;
              it.onClick({ preview: it.responsibility !== "SEMI" });

              onCtxChange?.({
                ...ctx,
                ui: { ...ctx.ui },
                modifiers: { ...ctx.modifiers },
                log: [...(ctx.log || [])],
              });

              const tooltipText = it.disabledReason ? it.disabledReason : it.preview;
              openPopoverFor(it.id, it.label, tooltipText);
            }}
            aria-label={it.label}
          >
            <div className="wr-chip-label">{it.label}</div>
            <div className="wr-chip-preview">{it.preview}</div>
            <div className="wr-chip-badges">
              {it.applied && it.responsibility === "AUTO" ? (
                <span className="wr-chip-badge wr-chip-badge--applied">Applied</span>
              ) : null}
              {it.responsibility === "SEMI" ? (
                <span className="wr-chip-badge wr-chip-badge--effect">
                  Effect{it.pillPreview ? `: ${it.pillPreview}` : ""}
                </span>
              ) : null}
            </div>
            {!it.enabled && it.disabledReason ? (
              <div className="wr-chip-reason">{it.disabledReason}</div>
            ) : null}
          </button>
        ))}
      </div>

      {popover ? (
        <div
          ref={popRef}
          className="wr-popover"
          style={{
            left: `${popover.x}px`,
            top: `${popover.y}px`,
            width: `${popover.width}px`,
          }}
          role="dialog"
          aria-label={`Weapon rule: ${popover.title}`}
          data-testid="weapon-rules-popover"
        >
          <div className="wr-popover__header">
            <div className="wr-popover__title">{popover.title}</div>
            <button
              type="button"
              className="wr-popover__close"
              aria-label="Close"
              onClick={() => setPopover(null)}
            >
              ×
            </button>
          </div>

          <div className="wr-popover__body">{popover.text}</div>

          <div className="wr-popover__hint">Tap outside to close</div>
        </div>
      ) : null}
    </div>
  );
}
