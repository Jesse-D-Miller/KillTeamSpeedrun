import { useEffect, useMemo, useRef, useState } from "react";
import {
  normalizeWeaponRules,
  runWeaponRuleHook,
} from "../../engine/rules/weaponRules";
import "./DiceInputModal.css";

function buildInitialDice(count) {
  return Array.from({ length: count }, () => "");
}

function DiceInputModal({
  open,
  attacker,
  defender,
  attackDiceCount,
  defenseDiceCount,
  attackHitThreshold,
  hasCeaseless,
  accurateMax,
  combatInputs,
  combatStage,
  combatAttackRoll,
  combatDefenseRoll,
  combatSummary,
  onSetCombatAttackRoll,
  onSetCombatInputs,
  onLockAttack,
  readOnly,
  statusMessage,
  onAutoRoll,
  onClose,
  onConfirm,
  weaponProfile,
  hasBalanced,
}) {
  const [attackDice, setAttackDice] = useState(() =>
    buildInitialDice(attackDiceCount),
  );
  const [defenseDice, setDefenseDice] = useState(() =>
    buildInitialDice(defenseDiceCount),
  );
  const [isRolling, setIsRolling] = useState(false);
  const rollIntervalRef = useRef(null);
  const rollTimeoutRef = useRef(null);
  const [ceaselessApplied, setCeaselessApplied] = useState(false);
  const [accurateSpent, setAccurateSpent] = useState(
    Math.max(
      0,
      Math.min(
        Number(accurateMax || 0),
        Number(combatInputs?.accurateSpent ?? 0),
      ),
    ),
  );
  const [balancedUsed, setBalancedUsed] = useState(
    Boolean(combatInputs?.balancedUsed),
  );
  const autoLoggedRef = useRef(false);
  const lastCeaselessRef = useRef(null);

  // ✅ Normalize rules once, and reuse everywhere (Balanced, Brutal UI, Devastating, etc)
  const weaponRules = useMemo(
    () => normalizeWeaponRules(weaponProfile),
    [weaponProfile],
  );

  const rollDiceNumbers = (count) =>
    Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6));

  const applyAutoRoll = () => {
    const remainingCount = Math.max(
      0,
      Number(attackDiceCount || 0) - Math.max(0, Number(accurateSpent || 0)),
    );
    const retained = buildRetainedDice(accurateSpent);
    const rolled = rollDiceNumbers(remainingCount);
    const initialAttack = [...retained, ...rolled];
    const attackAfterCeaseless = initialAttack;
    const defenseRoll = rollDiceNumbers(defenseDiceCount);

    setAttackDice(rolled.map(String));
    setDefenseDice(defenseRoll.map(String));
    setCeaselessApplied(false);
    lastCeaselessRef.current = null;

    autoLoggedRef.current = true;
    onAutoRoll?.({
      attackBefore: initialAttack,
      attackAfter: attackAfterCeaseless,
      defenseDice: defenseRoll,
      ceaseless: null,
    });
  };

  const resetDice = useMemo(
    () => () => {
      setAttackDice(buildInitialDice(attackDiceCount));
      setDefenseDice(buildInitialDice(defenseDiceCount));
      setCeaselessApplied(false);
      lastCeaselessRef.current = null;
      setAccurateSpent(0);
      autoLoggedRef.current = false;
    },
    [attackDiceCount, defenseDiceCount],
  );

  const pipIndicesForValue = (value) => {
    const numeric = Number(value);
    switch (numeric) {
      case 1:
        return [4];
      case 2:
        return [0, 8];
      case 3:
        return [0, 4, 8];
      case 4:
        return [0, 2, 6, 8];
      case 5:
        return [0, 2, 4, 6, 8];
      case 6:
        return [0, 2, 3, 5, 6, 8];
      default:
        return [];
    }
  };

  const parseDice = (dice) =>
    dice
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 1 && value <= 6);

  const pickCeaselessValue = (dice, threshold) => {
    const misses = dice.filter((value) => value < threshold);
    if (misses.length === 0) return null;

    const counts = misses.reduce((acc, value) => {
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});

    return (
      Object.entries(counts)
        .map(([value, count]) => ({ value: Number(value), count }))
        .sort((a, b) => b.count - a.count || a.value - b.value)[0]?.value ?? null
    );
  };

  const applyCeaseless = (dice, value) =>
    dice.map((die) => (die === value ? 1 + Math.floor(Math.random() * 6) : die));

  const buildRetainedDice = (count) => {
    const hitValue = Number(attackHitThreshold);
    if (!Number.isFinite(hitValue)) return [];
    return Array.from({ length: count }, () => hitValue);
  };

  const handleRollClick = () => {
    if (readOnly || isRolling) return;
    const remainingCount = Math.max(
      0,
      Number(attackDiceCount || 0) - Math.max(0, Number(accurateSpent || 0)),
    );
    if (remainingCount <= 0) return;
    setIsRolling(true);
    const previewDefenseCount = Math.max(0, Number(defenseDiceCount || 0));
    rollIntervalRef.current = setInterval(() => {
      setAttackDice(rollDiceNumbers(remainingCount).map(String));
      if (previewDefenseCount > 0) {
        setDefenseDice(rollDiceNumbers(previewDefenseCount).map(String));
      }
    }, 100);
    rollTimeoutRef.current = setTimeout(() => {
      if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
      rollIntervalRef.current = null;
      setIsRolling(false);
      if (combatStage === "ATTACK_ROLLING") {
        const retained = buildRetainedDice(accurateSpent);
        const rolled = rollDiceNumbers(remainingCount);
        const initialAttack = [...retained, ...rolled];
        const attackAfterCeaseless = initialAttack;

        setAttackDice(rolled.map(String));
        onSetCombatAttackRoll?.(attackAfterCeaseless, { accurateSpent });
        setCeaselessApplied(false);
        lastCeaselessRef.current = null;
        autoLoggedRef.current = true;

        onAutoRoll?.({
          attackBefore: initialAttack,
          attackAfter: attackAfterCeaseless,
          defenseDice: [],
          ceaseless: null,
        });
        return;
      }

      applyAutoRoll();
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
      if (rollTimeoutRef.current) clearTimeout(rollTimeoutRef.current);
    };
  }, []);

  const handleAccurateClick = () => {
    const max = Number(accurateMax || 0);
    if (!Number.isFinite(max) || max <= 0) return;
    if (readOnly) return;
    const next = Math.max(0, Math.min(max, accurateSpent + 1));
    if (next === accurateSpent) return;
    const remainingCount = Math.max(
      0,
      Number(attackDiceCount || 0) - Math.max(0, Number(next || 0)),
    );
    const currentRolled = parseDice(attackDice).slice(0, remainingCount);
    const retained = buildRetainedDice(next);
    const combined = [...retained, ...currentRolled];
    setAccurateSpent(next);
    onSetCombatInputs?.({ accurateSpent: next });
    if (Array.isArray(combatAttackRoll) && combatAttackRoll.length > 0) {
      onSetCombatAttackRoll?.(combined, { accurateSpent: next });
    }
  };

  const handleCeaselessClick = () => {
    if (readOnly || !hasCeaseless || ceaselessApplied) return;
    const currentAttack =
      Array.isArray(combatAttackRoll) && combatAttackRoll.length > 0
        ? combatAttackRoll
        : parseDice(attackDice);
    if (currentAttack.length === 0) return;

    const threshold = Number(attackHitThreshold);
    if (!Number.isFinite(threshold)) return;
    const ceaselessValue = pickCeaselessValue(currentAttack, threshold);
    if (ceaselessValue == null) return;

    const attackAfterCeaseless = applyCeaseless(currentAttack, ceaselessValue);
    setAttackDice(attackAfterCeaseless.map(String));
    onSetCombatAttackRoll?.(attackAfterCeaseless, { accurateSpent });
    setCeaselessApplied(true);

    lastCeaselessRef.current = {
      before: currentAttack,
      after: attackAfterCeaseless,
      rerolled: currentAttack
        .map((value, index) => (value === ceaselessValue ? index : null))
        .filter((value) => value != null),
      value: ceaselessValue,
    };

    autoLoggedRef.current = true;
    onAutoRoll?.({
      attackBefore: currentAttack,
      attackAfter: attackAfterCeaseless,
      defenseDice: [],
      ceaseless: lastCeaselessRef.current,
    });
  };

  const handleConfirm = () => {
    const parsedAttack = parseDice(attackDice);
    const parsedDefense = parseDice(defenseDice);
    const finalAttack = parsedAttack;

    const finalDefense = parsedDefense.length > 0 ? parsedDefense : parsedDefense;

    onConfirm({
      attackDice: finalAttack,
      defenseDice: finalDefense,
      ceaseless: lastCeaselessRef.current,
      autoLogged: autoLoggedRef.current,
    });
    resetDice();
  };

  useEffect(() => {
    if (!combatStage) return;
    const next = Array.isArray(combatAttackRoll)
      ? combatAttackRoll.map(String)
      : buildInitialDice(attackDiceCount);
    setAttackDice(next);
    if (combatStage === "ATTACK_ROLLING") {
      if (!Array.isArray(combatAttackRoll) || combatAttackRoll.length === 0) {
        setCeaselessApplied(false);
        lastCeaselessRef.current = null;
        setAccurateSpent(0);
        onSetCombatInputs?.({ accurateSpent: 0 });
        setBalancedUsed(false);
        onSetCombatInputs?.({ balancedClick: false, balancedUsed: false });
      }
    }
  }, [combatStage, combatAttackRoll, attackDiceCount]);

  useEffect(() => {
    const max = Number(accurateMax || 0);
    const incoming = Number(combatInputs?.accurateSpent ?? 0);
    if (!Number.isFinite(max) || max <= 0) {
      if (accurateSpent !== 0) setAccurateSpent(0);
      return;
    }
    const next = Math.max(0, Math.min(max, Math.floor(incoming)));
    if (next !== accurateSpent) setAccurateSpent(next);
  }, [accurateMax, combatInputs?.accurateSpent]);

  useEffect(() => {
    if (typeof combatInputs?.balancedUsed === "boolean") {
      setBalancedUsed(combatInputs.balancedUsed);
    }
  }, [combatInputs?.balancedUsed]);

  const handleBalancedClick = () => {
    if (readOnly || !hasBalanced || balancedUsed) return;
    if (!Array.isArray(combatAttackRoll) || combatAttackRoll.length === 0) return;

    const lethalRule = weaponRules.find((rule) => rule.id === "lethal");
    const lethalValue = Number(lethalRule?.value);

    const ctx = {
      weapon: weaponProfile,
      weaponProfile,
      weaponRules,
      attackDice: combatAttackRoll.map((value) => ({
        value: Number(value),
        kept: true,
        tags: [],
      })),
      modifiers: {
        lethalThreshold: Number.isFinite(lethalValue) ? lethalValue : null,
        balancedUsed: false,
      },
      inputs: {
        balancedClick: true,
      },
      log: [],
    };

    runWeaponRuleHook(ctx, "ON_BALANCED");

    const nextRoll = ctx.attackDice.map((die) => die.value);
    onSetCombatAttackRoll?.(nextRoll, {
      accurateSpent,
      balancedClick: true,
      balancedUsed: Boolean(ctx.modifiers?.balancedUsed),
    });
    setBalancedUsed(Boolean(ctx.modifiers?.balancedUsed));
    onSetCombatInputs?.({ balancedClick: true, balancedUsed: true });
  };

  useEffect(() => {
    if (!open) return;
    if (combatStage !== "ATTACK_ROLLING") return;
    setDefenseDice([]);
  }, [open, combatStage, defenseDiceCount]);

  const displayDefenseDice = combatStage
    ? Array.isArray(combatDefenseRoll)
      ? combatDefenseRoll.map(String)
      : []
    : defenseDice;

  if (!open) return null;

  const isSummaryStage =
    combatStage === "READY_TO_RESOLVE_DAMAGE" || combatStage === "DONE";
  const hasAttackRoll = combatStage
    ? Array.isArray(combatAttackRoll) && combatAttackRoll.length > 0
    : parseDice(attackDice).length > 0;
  const remainingAttackDiceCount = Math.max(
    0,
    Number(attackDiceCount || 0) - Math.max(0, Number(accurateSpent || 0)),
  );

  const normalizeWeaponRulesList = (wr) => {
    if (!wr || wr === "-") return [];
    return Array.isArray(wr) ? wr : [wr];
  };

  const formatWeaponRules = (wr) => {
    const list = normalizeWeaponRulesList(wr)
      .map((rule) => {
        if (!rule) return "";
        if (typeof rule === "string") return rule;
        const id = rule.id || "";
        const value =
          rule.value !== undefined && rule.value !== null ? ` ${rule.value}` : "";
        const note = rule.note ? ` (${rule.note})` : "";
        return `${id}${value}${note}`.trim();
      })
      .filter(Boolean);
    return list.length ? list.join(", ") : "-";
  };

  const renderUnitTile = (unit, label, weapon) => {
    if (!unit) return null;
    const woundsMax = Number(unit.stats?.woundsMax ?? 0);
    const woundsCurrent = Number(unit.state?.woundsCurrent ?? 0);
    const pct =
      woundsMax === 0 ? 0 : Math.max(0, Math.min(100, (woundsCurrent / woundsMax) * 100));
    const injured = woundsCurrent < woundsMax / 2;
    return (
      <div className="kt-modal__tile">
        <div className="kt-modal__tile-name">
          {label}: {unit.name}
        </div>
        {weapon ? (
          <table className="kt-table fight-weapon__table">
            <thead>
              <tr>
                <th className="left">NAME</th>
                <th>ATK</th>
                <th>HIT</th>
                <th>DMG</th>
                <th className="left">WR</th>
              </tr>
            </thead>
            <tbody>
              <tr className="kt-row kt-row--selected">
                <td className="left">{weapon.name}</td>
                <td>{weapon.atk}</td>
                <td>{weapon.hit}+</td>
                <td>{weapon.dmg}</td>
                <td className="left">{formatWeaponRules(weapon.wr)}</td>
              </tr>
            </tbody>
          </table>
        ) : null}
        <div className="kt-modal__tile-sub">
          W {woundsCurrent}/{woundsMax}
        </div>
        <div className="kt-modal__bar">
          <div
            className={`kt-modal__bar-fill ${injured ? "kt-modal__bar-fill--injured" : ""}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  };

  // ✅ NEW: lock-in handler that procs Devastating (and any future lock-in rules)
  const handleLockInAttackClick = () => {
    if (readOnly) return;

    const attackValues = Array.isArray(combatAttackRoll)
      ? combatAttackRoll
      : parseDice(attackDice);

    // still allow parent to handle “lock-in” even if no dice (it can show error)
    const hit = Number(attackHitThreshold);
    const lethalRule = weaponRules.find((r) => r.id === "lethal");
    const lethalValue = Number(lethalRule?.value);

    // Crit threshold priority:
    // - Lethal X if present
    // - else default 6 (your tests/engine default)
    const critThreshold =
      Number.isFinite(lethalValue) && lethalValue >= 2 && lethalValue <= 6
        ? lethalValue
        : 6;

    // Tag dice so Devastating can count retained crits.
    // Assumption (matches your current flow): at lock-in, all successes are retained.
    const attackDiceForCtx = attackValues
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v >= 1 && v <= 6)
      .map((v) => {
        const tags = [];
        if (Number.isFinite(hit) && v >= hit) tags.push("success", "retained");
        if (v >= critThreshold) tags.push("crit");
        return { value: v, tags };
      });

    const ctx = {
      weapon: weaponProfile,
      weaponProfile,
      weaponRules,
      attackDice: attackDiceForCtx,
      modifiers: {
        // if your Devastating rule uses lethal threshold, this is available
        lethalThreshold: critThreshold,
      },
      inputs: {
        attackLockedIn: true,
      },
      log: [],
      // Target wounds are needed for “can kill immediately” behavior
      target: {
        id: defender?.id ?? null,
        woundsCurrent: Number(defender?.state?.woundsCurrent ?? 0),
        woundsMax: Number(defender?.stats?.woundsMax ?? 0),
      },
    };

    // 🔥 THIS is where Devastating (and future lock-in rules) proc
    runWeaponRuleHook(ctx, "ON_LOCK_IN_ATTACK");

    // Persist details so parent can apply state changes
    const ruleLogEntry = ctx.log.find((entry) => entry.type === "RULE_DEVASTATING");
    const devastatingDamage = Number(ruleLogEntry?.detail?.damage ?? 0);

    const devastatingPayload = {
      targetId: ctx.target.id,
      woundsCurrent: ctx.target.woundsCurrent,
      woundsMax: ctx.target.woundsMax,
      // if your rule sets these, great; if not, parent can ignore
      combatEnded: Boolean(ctx.modifiers?.combatEnded),
      killed: Boolean(ctx.modifiers?.targetKilled || ctx.modifiers?.combatEnded),
      // helpful for logging/UX
      log: ctx.log,
      modifiers: {
        ...ctx.modifiers,
        devastatingDamage,
      },
    };

    // Also store in combatInputs so you can show status in UI if you want
    onSetCombatInputs?.({
      ...combatInputs,
      lockInApplied: true,
      devastating: devastatingPayload,
    });

    // Call parent “lock attack” (won’t break if parent ignores the argument)
    onLockAttack?.(devastatingPayload);
  };

  return (
    <div className="kt-modal" data-testid="dice-attack-modal">
      <div
        className="kt-modal__backdrop"
        onClick={() => {
          resetDice();
          onClose();
        }}
      />
      <div className="kt-modal__panel">
        <button
          className="kt-modal__close"
          type="button"
          onClick={() => {
            resetDice();
            onClose();
          }}
          aria-label="Close"
          title="Close"
        >
          ×
        </button>
        <div className="kt-modal__layout">
          <aside className="kt-modal__sidebar">
            <div className="kt-modal__sidebar-group">
              <div className="kt-modal__sidebar-title">Actions</div>
              <div className="kt-modal__sidebar-empty">
                Roll attack dice, then lock them in.
              </div>
              <button
                className="kt-modal__btn kt-modal__btn--success"
                type="button"
                onClick={handleRollClick}
                disabled={readOnly || isRolling || hasAttackRoll || remainingAttackDiceCount <= 0}
              >
                Roll
              </button>
              {Number(accurateMax) > 0 && (
                <button
                  className="kt-modal__btn kt-modal__btn--primary"
                  type="button"
                  onClick={handleAccurateClick}
                  disabled={readOnly || hasAttackRoll || accurateSpent >= Number(accurateMax)}
                >
                  Accurate {accurateSpent}/{accurateMax}
                </button>
              )}
              {hasBalanced && (
                <button
                  className="kt-modal__btn kt-modal__btn--primary"
                  type="button"
                  onClick={handleBalancedClick}
                  disabled={readOnly || !hasAttackRoll || balancedUsed}
                >
                  Balanced
                </button>
              )}
              {hasCeaseless && (
                <button
                  className="kt-modal__btn kt-modal__btn--primary"
                  type="button"
                  onClick={handleCeaselessClick}
                  disabled={readOnly || !hasAttackRoll || ceaselessApplied}
                >
                  Ceaseless
                </button>
              )}
            </div>
            {combatStage && (
              <div className="kt-modal__sidebar-footer">
                {combatStage === "READY_TO_RESOLVE_DAMAGE" && (
                  <button
                    className="kt-modal__btn kt-modal__btn--primary"
                    type="button"
                    onClick={() => onConfirm?.({
                      attackDice: combatAttackRoll || [],
                      defenseDice: [],
                      ceaseless: null,
                      autoLogged: true,
                    })}
                  >
                    Resolve Combat
                  </button>
                )}
                <button
                  className="kt-modal__btn kt-modal__btn--primary"
                  type="button"
                  disabled={combatStage !== "ATTACK_ROLLING" || !hasAttackRoll}
                  onClick={handleLockInAttackClick}
                  data-testid="lock-in-attack"
                >
                  Lock In Attack
                </button>
              </div>
            )}
          </aside>
          <div className="kt-modal__content">
            <div className="kt-modal__header">
              <div className="kt-modal__title">Attack Roll</div>
              <div className="kt-modal__subtitle">
                {attacker?.name || "Attacker"} → {defender?.name || "Defender"}
              </div>
              {statusMessage && (
                <div className="kt-modal__subtitle">{statusMessage}</div>
              )}
            </div>

            <div className="kt-modal__grid">
              {renderUnitTile(attacker, "Attacker", weaponProfile)}
              {renderUnitTile(defender, "Defender", null)}
            </div>

            {isSummaryStage && combatSummary && (
              <div className="defense-roll__section">
                <div className="defense-roll__label">Attack Roll</div>
                <div className="defense-roll__placeholder">Dice cleared</div>
                <div className="defense-roll__label">Defense Roll</div>
                <div className="defense-roll__placeholder">Dice cleared</div>
                <div className="defense-roll__label">Combat Result</div>
                <div className="defense-roll__dice defense-roll__dice--summary">
                  <span className="defense-roll__die defense-roll__die--summary">H {combatSummary.hits}</span>
                  <span className="defense-roll__die defense-roll__die--summary">C {combatSummary.crits}</span>
                  <span className="defense-roll__die defense-roll__die--summary">DMG {combatSummary.damage}</span>
                </div>
              </div>
            )}

            {!isSummaryStage && (
              <>
                <div className="defense-roll__section">
                  <div className="defense-roll__label">Attack Dice</div>
                  {accurateSpent > 0 && !hasAttackRoll && Number.isFinite(Number(attackHitThreshold)) && (
                    <div className="defense-roll__dice">
                      {Array.from({ length: accurateSpent }).map((_, index) => (
                        <span
                          key={`acc-${index}`}
                          className="defense-roll__die defense-roll__die--retained"
                        >
                          {attackHitThreshold}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="defense-roll__dice">
                    {attackDice.map((value, index) => (
                      <div key={`atk-${index}`} className="defense-roll__input">
                        <input
                          className="defense-roll__field"
                          inputMode="numeric"
                          value={value}
                          disabled={readOnly || isRolling}
                          onChange={(event) => {
                            const next = [...attackDice];
                            next[index] = event.target.value;
                            setAttackDice(next);
                            autoLoggedRef.current = false;
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="defense-roll__section">
                  <div className="defense-roll__label">Defense Dice</div>
                  <div className="defense-roll__dice">
                    {displayDefenseDice.length > 0 ? (
                      displayDefenseDice.map((value, index) => (
                        <span key={`def-${index}`} className="defense-roll__die">
                          {value || "-"}
                        </span>
                      ))
                    ) : (
                      <span className="defense-roll__placeholder">Defender rolling…</span>
                    )}
                  </div>
                </div>
              </>
            )}

            {!combatStage && (
              <div className="kt-modal__actions">
                <button
                  className="kt-modal__btn kt-modal__btn--primary"
                  type="button"
                  onClick={handleConfirm}
                >
                  Resolve
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DiceInputModal;