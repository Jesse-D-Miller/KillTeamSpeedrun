import React, { useEffect, useMemo, useRef, useState } from "react";
import "./WeaponRulesPanel.css";
import { applyAutoRulesForPhase, getClickableWeaponRulesForPhase } from "../../engine/rules/weaponRuleUi";
import { getEffectiveWeaponRules } from "../../engine/rules/effectiveWeaponRules";

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

export default function WeaponRulesPanel({
  ctx,
  phase,
  onCtxChange,
  testId,
  enablePopover = true,
}) {
  const effectiveRules = useMemo(() => {
    const rules = getEffectiveWeaponRules(ctx) || [];
    const accurateValue = Number(ctx?.modifiers?.vantageState?.accurateValue);
    if (!Number.isFinite(accurateValue) || accurateValue <= 0) return rules;
    const hasAccurate = rules.some((rule) =>
      typeof rule === "string"
        ? String(rule).toLowerCase().includes("accurate")
        : rule?.id === "accurate" && Number(rule?.value) === accurateValue,
    );
    if (hasAccurate) return rules;
    return [
      ...rules,
      {
        id: "accurate",
        value: accurateValue,
        source: "vantage",
      },
    ];
  }, [ctx]);
  const effectiveCtx = useMemo(
    () => (ctx ? { ...ctx, weaponRules: effectiveRules } : ctx),
    [ctx, effectiveRules],
  );

  const items = useMemo(
    () => getClickableWeaponRulesForPhase(effectiveCtx, phase),
    [effectiveCtx, phase],
  );

  const [popover, setPopover] = useState(null);
  const popRef = useRef(null);
  useOutsideClick(popRef, () => setPopover(null));

  useEffect(() => {
    if (!enablePopover) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setPopover(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enablePopover]);

  useEffect(() => {
    if (!enablePopover) return undefined;
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
  }, [enablePopover, popover?.ruleId]);

  useEffect(() => {
    if (!onCtxChange) return;
    const result = applyAutoRulesForPhase(effectiveCtx, phase);
    if (result.changed) {
      onCtxChange(result.ctx);
    }
  }, [effectiveCtx, phase, onCtxChange]);

  if (!items.length) return null;

  const openPopoverFor = (anchorId, title, text) => {
    if (!enablePopover) return;
    const el = document.querySelector(`[data-wr-anchor="${anchorId}"]`);
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

    setPopover({ ruleId: anchorId, title, text, x, y, width });
  };

  return (
    <div className="wr-panel" data-testid={testId || "weapon-rules-panel"}>
      <div className="wr-title">
        Weapon Rules — {phase.replace("_", " ").toLowerCase()}
      </div>

      <div className="wr-grid">
        {items.map((it) => (
          <button
            key={`${phase}-${it.anchorId}`}
            data-wr-anchor={it.anchorId}
            type="button"
            className={`wr-chip ${it.colorClass || ""} ${
              it.applied ? "is-applied" : ""
            } ${it.enabled ? "" : "is-disabled"}`}
            aria-disabled={!it.enabled}
            data-testid={
              it.id === "accurate" && Number.isFinite(Number(it.value))
                ? it.source === "vantage"
                  ? `wr-chip-accurate-vantage-${Number(it.value)}`
                  : `wr-chip-accurate-${Number(it.value)}`
                : `rule-chip-${it.id}-${phase.toLowerCase()}`
            }
            onClick={() => {
              if (it.enabled) {
                it.onClick({ preview: it.responsibility !== "SEMI" });
              }

              if (Array.isArray(effectiveCtx?.log)) {
                effectiveCtx.log.push({
                  type: "UI_WR_CLICK",
                  detail: { ruleId: it.id, phase },
                });
              }

              onCtxChange?.({
                ...effectiveCtx,
                ui: { ...(effectiveCtx?.ui || {}) },
                modifiers: { ...(effectiveCtx?.modifiers || {}) },
                log: [...(effectiveCtx?.log || [])],
              });

              const tooltipText = it.disabledReason ? it.disabledReason : it.preview;
              openPopoverFor(it.anchorId, it.label, tooltipText);
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

      {enablePopover && popover ? (
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
