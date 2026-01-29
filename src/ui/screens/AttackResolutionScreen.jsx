// AttackResolutionScreen.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import "./AttackResolutionScreen.css";
import UnitCard from "../components/UnitCard";
import WeaponRulesPanel from "../components/WeaponRulesPanel";
import { normalizeWeaponRules } from "../../engine/rules/weaponRules";
import { allocateDefense } from "../../engine/rules/resolveDice";
import { applyConditionNotes } from "../../engine/rules/combatConditions";
import { shouldOpenHotModal } from "../../engine/rules/hotResolution";
import { getLimitedValue, makeWeaponUsageKey } from "../../engine/rules/limitedWeapon";

// Load all faction firefight ploys (eager so it works in UI immediately)
const firefightPloyModules = import.meta.glob(
  "../../data/killteams/**/**/*FirefightPloys.json",
  { eager: true },
);

const PHASES = {
  PRE_ROLL: "PRE_ROLL",
  ROLL: "ROLL",
  POST_ROLL: "POST_ROLL",
  RESOLVED: "RESOLVED",
};

const clampInt = (value, min, max) => {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
};

const normKey = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const extractTeamKeyFromPath = (path) => {
  const match = String(path || "").match(/\/killteams\/([^/]+)\//i);
  return match ? match[1] : null;
};

function normalizeDataset(mod) {
  if (!mod) return null;
  const data = mod.default ?? mod;
  if (!data?.ploys) return null;
  return data;
}

function getKillTeamHint(attacker, defender) {
  const candidates = [
    attacker?.killTeam,
    attacker?.killTeamName,
    attacker?.faction,
    attacker?.teamName,
    attacker?.meta?.killTeam,
    defender?.killTeam,
    defender?.killTeamName,
    defender?.faction,
    defender?.teamName,
    defender?.meta?.killTeam,
  ].filter(Boolean);
  return candidates[0] || "";
}

function computeDamagePreview({
  weapon,
  attackHits,
  attackCrits,
  defenseHits,
  defenseCrits,
}) {
  const [normalDmg, critDmg] = String(weapon?.dmg || "0/0")
    .split("/")
    .map((v) => Number(v));

  const normalDamage = Number.isFinite(normalDmg) ? normalDmg : 0;
  const critDamage = Number.isFinite(critDmg) ? critDmg : 0;

  const allocation = allocateDefense({
    attackHits,
    attackCrits,
    defenseHits,
    defenseCrits,
    normalDamage,
    critDamage,
  });

  const totalDamage =
    allocation.remainingHits * normalDamage +
    allocation.remainingCrits * critDamage;

  return {
    normalDamage,
    critDamage,
    remainingHits: allocation.remainingHits,
    remainingCrits: allocation.remainingCrits,
    totalDamage,
  };
}

/**
 * Counter input: typing (no clamp per keystroke) + +/- buttons.
 * Clamp on blur and on +/-.
 */
function CountInput({ label, value, max, min = 0, onChange, disabled, testId }) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (next) => {
    const safe = clampInt(next, min, max);
    onChange(safe);
    setDraft(String(safe));
  };

  const onType = (e) => {
    const next = e.target.value;
    if (next === "" || /^-?\d+$/.test(next)) setDraft(next);
  };

  const onBlur = () => {
    if (draft === "") return commit(min);
    commit(draft);
  };

  return (
    <div className="attack-resolution__count">
      <div className="attack-resolution__label">{label}</div>
      <div className="attack-resolution__count-row">
        <button
          type="button"
          className="attack-resolution__count-btn"
          aria-label={`${label} minus`}
          onClick={() => commit((Number(value) || 0) - 1)}
          disabled={disabled || (Number(value) || 0) <= min}
        >
          −
        </button>

        <input
          className="attack-resolution__input attack-resolution__count-input"
          inputMode="numeric"
          value={draft}
          onChange={onType}
          onBlur={onBlur}
          aria-label={label}
          data-testid={testId}
          disabled={disabled}
        />

        <button
          type="button"
          className="attack-resolution__count-btn"
          aria-label={`${label} plus`}
          onClick={() => commit((Number(value) || 0) + 1)}
          disabled={disabled || (Number(value) || 0) >= max}
        >
          +
        </button>
      </div>

      <div className="attack-resolution__count-hint">0–{max}</div>
    </div>
  );
}

function AttackResolutionScreen({
  open,
  role,
  attacker,
  defender,
  weapon,
  combatStage,
  attackRoll,
  defenseRoll,
  combatModifiers,
  weaponUsage,
  teamKeys,
  rollsLocked: rollsLockedFromState,
  attackLocked,
  defenseLocked,
  attackDiceCount,
  defenseDiceCount,
  onSetAttackRoll,
  onLockAttack,
  onSetDefenseRoll,
  onLockDefense,
  onSetCombatModifiers,
  onApplyDamage,
  onResolveComplete,
  onCancel,
}) {
  const [phase, setPhase] = useState(PHASES.PRE_ROLL);
  const [uiState, setUiState] = useState(() => ({
    ui: { prompts: [], notes: [], appliedRules: {} },
    effects: { attacker: [], defender: [] },
    modifiers: {},
    log: [],
  }));

  // Final-entry (attacker only; ignores defender blocks)
  const [finalAttackHits, setFinalAttackHits] = useState(0);
  const [finalAttackCrits, setFinalAttackCrits] = useState(0);

  const [usedRules, setUsedRules] = useState({});
  const [preRollFlags, setPreRollFlags] = useState({
    cover: false,
    obscured: false,
  });

  const [rollsLocked, setRollsLocked] = useState(false);

  const [logs, setLogs] = useState([]);
  const logIdRef = useRef(0);

  const [hotModalOpen, setHotModalOpen] = useState(false);
  const [hotDamageDraft, setHotDamageDraft] = useState("0");
  const [vantageChooserOpen, setVantageChooserOpen] = useState(false);

  const isFight =
    weapon?.mode === "melee" ||
    String(combatStage || "").toLowerCase().includes("fight");

  const attackerSuccessThreshold = Number(weapon?.hit ?? 6);
  const coverDisabledByVantage = Boolean(combatModifiers?.coverDisabledByVantage);
  const defenderSuccessThreshold = isFight
    ? Number(
        defender?.state?.selectedWeaponHit ??
          defender?.meleeHit ??
          weapon?.hit ??
          6,
      )
    : Number(defender?.stats?.save ?? 6);

  const maxAttackDice = Math.max(0, Number(attackDiceCount || 0));
  const maxDefenseDice = Math.max(0, Number(defenseDiceCount || 0));

  const isAttackerRole = role === "attacker";
  const isDefenderRole = role === "defender";
  const attackerReady = Boolean(rollsLocked || attackLocked);
  const defenderReady = Boolean(rollsLocked || defenseLocked);
  const youReady = isAttackerRole ? attackerReady : isDefenderRole ? defenderReady : false;
  const opponentReady = isAttackerRole
    ? defenderReady
    : isDefenderRole
      ? attackerReady
      : false;

  const limitedValue = getLimitedValue(weapon);
  const limitedKey =
    isAttackerRole && attacker?.id && weapon?.name
      ? makeWeaponUsageKey(attacker.id, weapon.name)
      : null;
  const limitedUsed = Number(
    limitedKey ? weaponUsage?.[limitedKey]?.used ?? 0 : 0,
  );
  const isLimited = Number.isFinite(limitedValue) && limitedValue > 0;
  const isLimitedExhausted = isLimited && limitedUsed >= limitedValue;
  const limitedRemaining = isLimited
    ? Math.max(0, Number(limitedValue) - Number(limitedUsed))
    : 0;

  const addLog = (group, message) => {
    logIdRef.current += 1;
    const entry = { id: logIdRef.current, group, message, ts: Date.now() };
    setLogs((prev) => [entry, ...prev]); // newest first
  };

  const handleCtxChange = (nextCtx) => {
    if (!nextCtx) return;
    setUiState((prev) => ({
      ...prev,
      ui: nextCtx.ui || prev.ui,
      effects: nextCtx.effects || prev.effects,
      modifiers: nextCtx.modifiers || prev.modifiers,
      log: nextCtx.log || prev.log,
    }));

    const last = Array.isArray(nextCtx.log) ? nextCtx.log.at(-1) : null;
    if (last?.type === "UI_WR_CLICK") {
      addLog("Rules", `WR click: ${last.detail?.ruleId || "unknown"}`);
    }
  };

  const conditionFlags = useMemo(
    () => ({
      cover: preRollFlags.cover && !coverDisabledByVantage,
      obscured: preRollFlags.obscured,
      vantage: false,
    }),
    [preRollFlags.cover, preRollFlags.obscured, coverDisabledByVantage],
  );

  useEffect(() => {
    setUiState((prev) => {
      const next = applyConditionNotes(prev, conditionFlags);
      return { ...prev, ui: next.ui };
    });
  }, [conditionFlags]);

  useEffect(() => {
    if (!open) return;

    setUsedRules({});
    setLogs([]);
    setUiState({
      ui: { prompts: [], notes: [], appliedRules: {} },
      effects: { attacker: [], defender: [] },
      modifiers: {},
      log: [],
    });

    setFinalAttackHits(0);
    setFinalAttackCrits(0);

    setPreRollFlags({ cover: false, obscured: false });
    setRollsLocked(Boolean(rollsLockedFromState));
    setVantageChooserOpen(false);

    // Keep this simple: both players start on PRE_ROLL visually.
    // Your multiplayer stage can still exist; we just aren't gatekeeping UI anymore.
    setPhase(PHASES.PRE_ROLL);
  }, [open, role, combatStage, rollsLockedFromState]);

  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;
    const overrides = window.__ktE2E_attackResOverrides;
    if (!overrides) return;

    if (overrides.combatModifiers) {
      onSetCombatModifiers?.(overrides.combatModifiers);
    }
    if (overrides.preRollFlags && role === "defender") {
      setPreRollFlags((prev) => ({ ...prev, ...overrides.preRollFlags }));
    }
  }, [open, role, onSetCombatModifiers]);

  const baseCtx = useMemo(() => {
    if (!open) return null;
    const e2eOverrideRules =
      typeof window !== "undefined" && Array.isArray(window.__ktE2E_weaponRules)
        ? window.__ktE2E_weaponRules
        : null;
    const e2eOverrides =
      typeof window !== "undefined" && window.__ktE2E_combatCtxOverrides
        ? window.__ktE2E_combatCtxOverrides
        : null;
    const normalizedRules = e2eOverrideRules
      ? normalizeWeaponRules({ wr: e2eOverrideRules })
      : weapon
        ? normalizeWeaponRules(weapon)
        : [];
    const filteredRules = normalizedRules.filter(
      (rule) => String(rule?.id || "").toLowerCase() !== "range",
    );
    const hasSaturate = normalizedRules.some(
      (rule) => String(rule?.id || "").toLowerCase() === "saturate",
    );
    const normalizedAttackDice = Array.isArray(attackRoll)
      ? attackRoll.map((value) => ({ value: Number(value), tags: [] }))
      : [];
    const attackCritsFromRoll = Array.isArray(attackRoll)
      ? attackRoll.filter((value) => Number(value) >= 6).length
      : 0;
    const attackCrits = Math.max(attackCritsFromRoll, finalAttackCrits);

    return {
      phase,
      weaponRules: filteredRules,
      attackDice: Array.isArray(e2eOverrides?.attackDice)
        ? e2eOverrides.attackDice
        : normalizedAttackDice,
      inputs: {
        role,
        attackCrits,
        ...(e2eOverrides?.inputs || {}),
      },
      modifiers: {
        ...(combatModifiers || {}),
        ...(e2eOverrides?.modifiers || {}),
        coverSelected: preRollFlags.cover,
        coverDisabledBySaturate:
          hasSaturate ||
          Boolean(combatModifiers?.coverDisabledBySaturate) ||
          Boolean(e2eOverrides?.modifiers?.coverDisabledBySaturate),
      },
      ui: { prompts: [], notes: [], appliedRules: {} },
      effects: { attacker: [], defender: [] },
      log: [],
    };
  }, [
    open,
    phase,
    weapon,
    attackRoll,
    role,
    finalAttackCrits,
    preRollFlags.cover,
    combatModifiers,
  ]);

  const mergeCombatCtx = (base, overlay) => {
    if (!base) return null;
    return {
      ...base,
      modifiers: { ...base.modifiers, ...overlay.modifiers },
      ui: {
        ...(base.ui || {}),
        ...(overlay.ui || {}),
        prompts: Array.isArray(overlay.ui?.prompts) ? overlay.ui.prompts : [],
        notes: Array.isArray(overlay.ui?.notes) ? overlay.ui.notes : [],
        appliedRules: { ...(overlay.ui?.appliedRules || {}) },
      },
      effects: overlay.effects || base.effects,
      log: Array.isArray(overlay.log) ? overlay.log : base.log,
    };
  };

  const combatCtx = useMemo(() => mergeCombatCtx(baseCtx, uiState), [baseCtx, uiState]);
  const coverDisabledBySaturate = Boolean(
    combatModifiers?.coverDisabledBySaturate ||
      combatCtx?.ui?.disabledOptions?.retainCover,
  );
  const isCoverDisabled = coverDisabledByVantage || coverDisabledBySaturate;
  const attackerCritThreshold = (() => {
    const fromModifier = Number(combatCtx?.modifiers?.lethalThreshold);
    if (Number.isFinite(fromModifier) && fromModifier >= 2 && fromModifier <= 6) {
      return fromModifier;
    }
    const lethalRule = (combatCtx?.weaponRules || []).find(
      (rule) => String(rule?.id || "").toLowerCase() === "lethal",
    );
    const fromRule = Number(lethalRule?.value);
    if (Number.isFinite(fromRule) && fromRule >= 2 && fromRule <= 6) {
      return fromRule;
    }
    return 6;
  })();

  const setCombatCtx = (updater) => {
    setUiState((prevOverlay) => {
      if (!baseCtx) return prevOverlay;
      const prevCombat = mergeCombatCtx(baseCtx, prevOverlay);
      const nextCombat = typeof updater === "function" ? updater(prevCombat) : updater;

      return {
        ...prevOverlay,
        ui: nextCombat?.ui || prevOverlay.ui,
        effects: nextCombat?.effects || prevOverlay.effects,
        modifiers: nextCombat?.modifiers || prevOverlay.modifiers,
        log: nextCombat?.log || prevOverlay.log,
      };
    });
  };

  const modifiersRef = useRef(null);
  const areModifiersEqual = (left, right) => {
    if (left === right) return true;
    if (!left || !right) return false;
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key) => Object.is(left[key], right[key]));
  };

  useEffect(() => {
    if (!onSetCombatModifiers) return;
    if (!combatCtx?.modifiers) return;
    if (areModifiersEqual(modifiersRef.current, combatCtx.modifiers)) return;
    modifiersRef.current = combatCtx.modifiers;
    onSetCombatModifiers(combatCtx.modifiers);
  }, [combatCtx?.modifiers, onSetCombatModifiers]);

  useEffect(() => {
    if (!open) return;
    if (typeof rollsLockedFromState !== "boolean") return;
    setRollsLocked(rollsLockedFromState);
  }, [open, rollsLockedFromState]);

  useEffect(() => {
    if (!open) return;
    if (rollsLocked) {
      setPhase(PHASES.POST_ROLL);
    }
  }, [open, rollsLocked]);

  // Firefight ploys dataset selection
  const firefightPloys = useMemo(() => {
    const datasets = Object.entries(firefightPloyModules)
      .map(([path, mod]) => {
        const data = normalizeDataset(mod);
        if (!data) return null;
        const teamKey = extractTeamKeyFromPath(path);
        return {
          data,
          normalizedTeamKey: normKey(teamKey),
          normalizedKillTeam: normKey(data.killTeam),
        };
      })
      .filter(Boolean);

    if (datasets.length === 0) return { label: "No ploys found", ploys: [] };

    const owner = role === "defender" ? defender?.owner : attacker?.owner;
    const teamKeyFromOwner =
      owner === "B" ? teamKeys?.beta ?? teamKeys?.alpha : teamKeys?.alpha ?? teamKeys?.beta;
    const teamKeyTarget = normKey(teamKeyFromOwner);

    const exactByTeam = teamKeyTarget
      ? datasets.find((d) =>
          [d.normalizedTeamKey, d.normalizedKillTeam].includes(teamKeyTarget),
        )
      : null;

    const hint = getKillTeamHint(attacker, defender);
    const hintTarget = normKey(hint);
    const exactByHint = hintTarget
      ? datasets.find((d) => d.normalizedKillTeam === hintTarget)
      : null;

    const fallback = exactByTeam || exactByHint || datasets[0];
    const data = fallback?.data || null;

    return {
      label: data?.killTeam ? `${data.killTeam} Firefight Ploys` : "Firefight Ploys",
      ploys: Array.isArray(data?.ploys) ? data.ploys : [],
    };
  }, [attacker, defender, role, teamKeys]);

  const markPostRollRuleUsed = (ruleId, label) => {
    if (usedRules[ruleId]) return;
    if (!rollsLocked) return;
    setUsedRules((prev) => ({ ...prev, [ruleId]: true }));
    addLog("Post-Roll", `${label} applied.`);
  };

  // Final entry ignores defender blocks
  const finalPreview = useMemo(() => {
    return computeDamagePreview({
      weapon,
      attackHits: finalAttackHits,
      attackCrits: finalAttackCrits,
      defenseHits: 0,
      defenseCrits: 0,
    });
  }, [weapon, finalAttackHits, finalAttackCrits]);

  const resolveFromFinalWindow = () => {
    addLog(
      "Damage",
      `Final: hits ${finalAttackHits}, crits ${finalAttackCrits}. Total damage ${finalPreview.totalDamage}.`,
    );

    if (defender?.id && finalPreview.totalDamage > 0) {
      onApplyDamage?.(defender.id, finalPreview.totalDamage);
    }

    const hotPending = shouldOpenHotModal(combatCtx);

    if (hotPending) {
      setHotDamageDraft("0");
      setHotModalOpen(true);
      setPhase(PHASES.RESOLVED);
      return;
    }

    onResolveComplete?.();
    setPhase(PHASES.RESOLVED);
  };

  const isVantageApplied = Boolean(combatCtx?.modifiers?.vantageState);
  const clearVantage = () => {
    setCombatCtx((prev) => ({
      ...prev,
      modifiers: {
        ...(prev.modifiers || {}),
        vantageState: null,
        coverDisabledByVantage: false,
      },
    }));
    setVantageChooserOpen(false);
  };

  useEffect(() => {
    if (!open || role !== "defender") return;
    if (!isCoverDisabled) return;
    if (typeof combatCtx?.modifiers?.coverWasCheckedBeforeVantage !== "boolean") {
      setCombatCtx((prev) => ({
        ...prev,
        modifiers: {
          ...(prev.modifiers || {}),
          coverWasCheckedBeforeVantage: Boolean(preRollFlags.cover),
        },
      }));
    }
    if (!preRollFlags.cover) return;
    setPreRollFlags((prev) => ({ ...prev, cover: false }));
    addLog(
      "Pre-Roll",
      coverDisabledBySaturate ? "Cover cleared by Saturate." : "Cover cleared by Vantage.",
    );
  }, [
    open,
    role,
    isCoverDisabled,
    preRollFlags.cover,
    coverDisabledBySaturate,
    combatCtx?.modifiers?.coverWasCheckedBeforeVantage,
  ]);

  useEffect(() => {
    if (!open || role !== "defender") return;
    if (coverDisabledByVantage) return;
    const saved = combatCtx?.modifiers?.coverWasCheckedBeforeVantage;
    if (typeof saved !== "boolean") return;
    setPreRollFlags((prev) => ({ ...prev, cover: saved }));
    setCombatCtx((prev) => ({
      ...prev,
      modifiers: {
        ...(prev.modifiers || {}),
        coverDisabledByVantage: false,
        vantageState: null,
        coverWasCheckedBeforeVantage: undefined,
      },
    }));
  }, [open, role, coverDisabledByVantage, combatCtx?.modifiers?.coverWasCheckedBeforeVantage]);

  useEffect(() => {
    if (!open || role !== "defender") return;
    if (!coverDisabledBySaturate) return;
    if (!preRollFlags.cover) return;
    setPreRollFlags((prev) => ({ ...prev, cover: false }));
  }, [open, role, coverDisabledBySaturate, preRollFlags.cover]);

  if (!open || !attacker || !defender || !weapon || !combatCtx) return null;

  const defenderSuccessLabel = isFight ? "HIT" : "SAVE";
  const defenderCritLabel = isFight ? "CRIT" : "CRIT SAVE";
  const defenderRollLabel = isFight ? "Hits" : "Saves";
  const defenderCritRollLabel = isFight ? "Crits" : "Crit Saves";

  return (
    <div
      className="kt-modal"
      data-testid="attack-resolution-modal"
      data-attack-mode={isFight ? "fight" : "shoot"}
    >
      <div className="kt-modal__backdrop" onClick={() => onCancel?.()} />
      <div className="kt-modal__panel attack-resolution__modal-panel">
        <button
          className="kt-modal__close"
          type="button"
          onClick={() => onCancel?.()}
          aria-label="Dismiss modal"
          title="Dismiss modal"
        >
          ×
        </button>

        <div className="attack-resolution">
          {hotModalOpen && (
            <div className="attack-resolution__hot-modal" role="dialog" aria-label="Hot Damage">
              <div className="attack-resolution__hot-panel">
                <div className="attack-resolution__hot-title">Resolve Hot</div>
                <div className="attack-resolution__hot-text">
                  Enter the self-inflicted Hot damage to apply.
                </div>
                <input
                  className="attack-resolution__hot-input"
                  type="number"
                  min="0"
                  value={hotDamageDraft}
                  onChange={(event) => setHotDamageDraft(event.target.value)}
                  data-testid="hot-damage-input"
                />
                <div className="attack-resolution__hot-actions">
                  <button
                    type="button"
                    className="kt-modal__btn"
                    data-testid="hot-damage-confirm"
                    onClick={() => {
                      const dmg = clampInt(hotDamageDraft, 0, 99);
                      if (attacker?.id && dmg > 0) {
                        onApplyDamage?.(attacker.id, dmg);
                      }
                      setUiState((prev) => ({
                        ...prev,
                        effects: {
                          attacker: (prev.effects?.attacker || []).filter(
                            (effect) => effect?.id !== "hot",
                          ),
                          defender: prev.effects?.defender || [],
                        },
                        log: [
                          ...(prev.log || []),
                          {
                            type: "HOT_RESOLVED",
                            detail: { damage: dmg, attackerId: attacker?.id || null },
                          },
                        ],
                      }));
                      addLog("Hot", `Hot resolved for ${dmg} damage.`);
                      setHotModalOpen(false);
                      onResolveComplete?.();
                    }}
                  >
                    Apply Hot Damage
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* LEFT: Battle Log */}
          <aside className="attack-resolution__log">
            <div className="attack-resolution__log-title">Battle Log</div>
            <div className="attack-resolution__log-list">
              {logs.length === 0 && (
                <div className="attack-resolution__log-empty">No entries yet.</div>
              )}
              {logs.map((entry) => (
                <div key={entry.id} className="attack-resolution__log-entry">
                  <span className="attack-resolution__log-group">
                    {entry.group}
                  </span>
                  <span>{entry.message}</span>
                </div>
              ))}
            </div>
          </aside>

          {/* RIGHT: Main */}
          <section className="attack-resolution__main">
            {/* Header cards */}
            <div className="attack-resolution__header">
              <div className="attack-resolution__unit-col">
                <UnitCard
                  unit={attacker}
                  dispatch={() => {}}
                  canChooseOrder={false}
                  onChooseOrder={() => {}}
                  className="attack-resolution__unit-card"
                  weaponMode={weapon?.mode ?? null}
                  selectedWeaponNameOverride={weapon?.name ?? null}
                  autoSelectFirstWeapon={false}
                  collapsibleSections={true}
                  showWoundsText={false}
                  showInjuredInHeader={true}
                />
                {combatCtx.effects?.attacker?.length ? (
                  <div className="attack-resolution__effects-row">
                    {combatCtx.effects.attacker.map((effect) => (
                      <span
                        key={`${effect.id}-${effect.label}`}
                        className={`pill pill--${effect.pillColor || "red"}`}
                        data-testid={`effect-pill-${effect.id}-attacker`}
                      >
                        {String(effect.label || effect.id || "").toUpperCase()}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="attack-resolution__unit-col">
                <UnitCard
                  unit={defender}
                  dispatch={() => {}}
                  canChooseOrder={false}
                  onChooseOrder={() => {}}
                  className="attack-resolution__unit-card"
                  weaponMode={weapon?.mode ?? null}
                  selectedWeaponNameOverride={weapon?.name ?? null}
                  autoSelectFirstWeapon={false}
                  collapsibleSections={true}
                  showWoundsText={false}
                  showInjuredInHeader={true}
                />
                {combatCtx.effects?.defender?.length ? (
                  <div className="attack-resolution__effects-row">
                    {combatCtx.effects.defender.map((effect) => (
                      <span
                        key={`${effect.id}-${effect.label}`}
                        className={`pill pill--${effect.pillColor || "red"}`}
                        data-testid={`effect-pill-${effect.id}-defender`}
                      >
                        {String(effect.label || effect.id || "").toUpperCase()}
                      </span>
                    ))}
                  </div>
                ) : null}
                {null}
              </div>
            </div>



            {/* Summary */}
            <div className="attack-resolution__summary-row">
              <div className="attack-resolution__summary-col">
                <span>ATK {maxAttackDice}</span>
                <span>HIT {attackerSuccessThreshold}+</span>
                <span>CRIT {attackerCritThreshold}+</span>
              </div>
              <div className="attack-resolution__summary-col">
                <span>
                  {defenderSuccessLabel} {defenderSuccessThreshold}+
                </span>
                <span>{defenderCritLabel} 6+</span>
              </div>
            </div>

            {/* Pre-roll */}
            <div className="attack-resolution__panel">
              <div className="attack-resolution__section">
                <div className="attack-resolution__section-title">Pre-Roll</div>

                <div className="attack-resolution__rules">
                  <div className="wr-panel attack-resolution__conditions">
                    <div className="wr-title">Combat Conditions</div>
                    <div className="wr-grid">
                      {role === "defender" ? (
                        <>
                          <button
                            type="button"
                            className={`wr-chip wr-chip--player ${
                              preRollFlags.cover && !isCoverDisabled
                                ? "is-applied"
                                : ""
                            } ${isCoverDisabled ? "is-disabled" : ""}`}
                            disabled={isCoverDisabled}
                            aria-disabled={isCoverDisabled}
                            data-testid="condition-cover"
                            onClick={() => {
                              if (isCoverDisabled) return;
                              setPreRollFlags((prev) => ({
                                ...prev,
                                cover: !prev.cover,
                              }));
                              addLog(
                                "Pre-Roll",
                                `Cover ${!preRollFlags.cover ? "enabled" : "cleared"}.`,
                              );
                            }}
                          >
                            <div className="wr-chip-label">Cover Save</div>
                            <div className="wr-chip-preview">
                              Defender can retain 1 success from cover.
                            </div>
                            <div className="wr-chip-badges">
                              {preRollFlags.cover && !coverDisabledByVantage ? (
                                <span className="wr-chip-badge wr-chip-badge--applied">
                                  Applied
                                </span>
                              ) : null}
                            </div>
                          </button>

                          <button
                            type="button"
                            className={`wr-chip wr-chip--player ${
                              preRollFlags.obscured ? "is-applied" : ""
                            }`}
                            aria-disabled="false"
                            data-testid="condition-obscured"
                            onClick={() => {
                              setPreRollFlags((prev) => ({
                                ...prev,
                                obscured: !prev.obscured,
                              }));
                              addLog(
                                "Pre-Roll",
                                `Obscured ${!preRollFlags.obscured ? "enabled" : "cleared"}.`,
                              );
                            }}
                          >
                            <div className="wr-chip-label">Obscured</div>
                            <div className="wr-chip-preview">
                              Obscured affects hit retention.
                            </div>
                            <div className="wr-chip-badges">
                              {preRollFlags.obscured ? (
                                <span className="wr-chip-badge wr-chip-badge--applied">
                                  Applied
                                </span>
                              ) : null}
                            </div>
                          </button>
                        </>
                      ) : (
                        <div className="attack-resolution__vantage">
                          <button
                            type="button"
                            className={`wr-chip wr-chip--semi ${
                              isVantageApplied ? "is-applied" : ""
                            }`}
                            aria-disabled="false"
                            data-testid="condition-vantage"
                            onClick={() => {
                              if (isVantageApplied) {
                                clearVantage();
                                addLog("Pre-Roll", "Vantage cleared.");
                                return;
                              }
                              setVantageChooserOpen(true);
                            }}
                          >
                            <div className="wr-chip-label">Vantage</div>
                            <div className="wr-chip-preview">
                              Vantage may deny cover retains.
                            </div>
                            <div className="wr-chip-badges">
                              {isVantageApplied ? (
                                <span className="wr-chip-badge wr-chip-badge--applied">
                                  Applied
                                </span>
                              ) : null}
                            </div>
                          </button>
                          {vantageChooserOpen ? (
                            <div
                              className="attack-resolution__vantage-chooser"
                              data-testid="vantage-chooser"
                            >
                              <button
                                type="button"
                                className="kt-modal__btn"
                                data-testid="vantage-choose-4"
                                onClick={() => {
                                  setCombatCtx((prev) => ({
                                    ...prev,
                                    modifiers: {
                                      ...(prev.modifiers || {}),
                                      vantageState: { mode: "4in", accurateValue: 2 },
                                      coverDisabledByVantage: true,
                                    },
                                  }));
                                  setVantageChooserOpen(false);
                                  addLog("Pre-Roll", "Vantage 4\" selected (Accurate 2).");
                                }}
                              >
                                4" Vantage
                              </button>
                              <button
                                type="button"
                                className="kt-modal__btn"
                                data-testid="vantage-choose-2"
                                onClick={() => {
                                  setCombatCtx((prev) => ({
                                    ...prev,
                                    modifiers: {
                                      ...(prev.modifiers || {}),
                                      vantageState: { mode: "2in", accurateValue: 1 },
                                      coverDisabledByVantage: true,
                                    },
                                  }));
                                  setVantageChooserOpen(false);
                                  addLog("Pre-Roll", "Vantage 2\" selected (Accurate 1).");
                                }}
                              >
                                2" Vantage
                              </button>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="attack-resolution__e2e-state">
                    <div data-testid="vantage-state">
                      {combatCtx.modifiers?.vantageState?.mode || "none"}
                    </div>
                    <div data-testid="cover-state">
                      {preRollFlags.cover && !coverDisabledByVantage ? "on" : "off"}
                    </div>
                  </div>

                  {role !== "attacker" ? (
                    <div className="attack-resolution__empty">
                      No pre-roll rules for defender yet.
                    </div>
                  ) : (
                    <WeaponRulesPanel
                      ctx={combatCtx}
                      phase={PHASES.PRE_ROLL}
                      onCtxChange={handleCtxChange}
                      testId={undefined}
                    />
                  )}

                  {isAttackerRole && isLimited ? (
                    <div className="attack-resolution__inline-note">
                      {isLimitedExhausted
                        ? `Limited ${limitedValue} — this weapon has no uses left after this attack.`
                        : `Limited ${limitedValue} — ${limitedRemaining} use${
                            limitedRemaining === 1 ? "" : "s"
                          } remaining after this attack.`}
                    </div>
                  ) : null}

                  {isAttackerRole && isLimitedExhausted ? (
                    <div
                      className="attack-resolution__inline-note"
                      data-testid="limited-exhausted"
                    >
                      Limited exhausted.
                    </div>
                  ) : null}
                </div>

                <div className="attack-resolution__dice-strip">
                  <div className="attack-resolution__dice-line">
                    <strong>Attacker:</strong>&nbsp;Roll {maxAttackDice} · success
                    on {attackerSuccessThreshold}+ · crit on {attackerCritThreshold}+
                  </div>
                  <div className="attack-resolution__dice-line">
                    <strong>Defender:</strong>&nbsp;Roll {maxDefenseDice} · success
                    on {defenderSuccessThreshold}+ · crit on 6+
                  </div>
                </div>

              </div>
            </div>

            {/* Roll section (centered; attacker row then defender row) */}
            <div className="attack-resolution__panel">
              <div className="attack-resolution__section">
                <div className="attack-resolution__section-title">Roll</div>

                <div className="attack-resolution__instruction" data-testid="roll-instructions">
                  <div className="attack-resolution__instruction-title">
                    Roll your dice now
                  </div>
                  <div className="attack-resolution__instruction-line">
                    <strong>Attacker:</strong> Roll {maxAttackDice} · success on
                    {" "}{attackerSuccessThreshold}+ · crit on {attackerCritThreshold}+
                  </div>
                  <div className="attack-resolution__instruction-line">
                    <strong>Defender:</strong> Roll {maxDefenseDice} · success on
                    {" "}{defenderSuccessThreshold}+ · crit on 6+
                  </div>

                </div>

                {role !== "attacker" ? (
                  <div className="attack-resolution__empty">
                    (Attacker-only for now — defender rules not wired yet.)
                  </div>
                ) : (
                  <div className="attack-resolution__postroll">
                    <WeaponRulesPanel
                      ctx={combatCtx}
                      phase={PHASES.ROLL}
                      onCtxChange={handleCtxChange}
                      testId="weapon-rules-panel"
                    />
                  </div>
                )}

                {role !== "attacker" ? null : (
                  <div className="attack-resolution__postroll">
                    {!rollsLocked ? (
                      <div className="attack-resolution__empty">
                        Lock rolls first to use post-roll rules.
                      </div>
                    ) : null}

                    <WeaponRulesPanel
                      ctx={combatCtx}
                      phase={PHASES.POST_ROLL}
                      onCtxChange={handleCtxChange}
                      testId={undefined}
                    />
                    <button
                      className="attack-resolution__rule attack-resolution__rule--secondary"
                      type="button"
                      onClick={() => addLog("Post-Roll", "CP re-roll used (placeholder).")}
                      disabled={!rollsLocked}
                      title={!rollsLocked ? "Lock rolls first" : undefined}
                    >
                      CP Re-roll
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Final entry (attacker only; ignores defender blocks) */}
            <div className="attack-resolution__panel">
              <div className="attack-resolution__section">
                <div className="attack-resolution__section-title">Final Entry</div>

                <div className="attack-resolution__roll-grid">
                  <div className="attack-resolution__roll-row attack-resolution__roll-row--final">
                    <CountInput
                      label="Final Hits"
                      value={finalAttackHits}
                      max={maxAttackDice}
                      onChange={(next) => setFinalAttackHits(next)}
                      disabled={!isAttackerRole}
                      testId="final-hits"
                    />
                    <CountInput
                      label="Final Crits"
                      value={finalAttackCrits}
                      max={maxAttackDice}
                      onChange={(next) => setFinalAttackCrits(next)}
                      disabled={!isAttackerRole}
                      testId="final-crits"
                    />
                  </div>
                </div>

                <div className="attack-resolution__damage-preview">
                  <div className="attack-resolution__damage-line">
                    <span>Remaining:</span>
                    <strong>
                      {finalPreview.remainingHits} hits ·{" "}
                      {finalPreview.remainingCrits} crits
                    </strong>
                  </div>
                  <div className="attack-resolution__damage-line">
                    <span>Weapon:</span>
                    <strong>
                      {finalPreview.normalDamage}/{finalPreview.critDamage}
                    </strong>
                  </div>
                  <div className="attack-resolution__damage-total">
                    Total Damage: <strong>{finalPreview.totalDamage}</strong>
                  </div>
                  <div className="attack-resolution__damage-sub">
                    (Final entry ignores defender blocks — fast mode.)
                  </div>
                </div>

                <button
                  className="kt-modal__btn kt-modal__btn--primary"
                  type="button"
                  onClick={() => {
                    addLog("Final", "Resolved via final entry window.");
                    resolveFromFinalWindow();
                  }}
                  disabled={!isAttackerRole}
                >
                  Apply Damage
                </button>
              </div>
            </div>

            {/* Firefight Ploys (row style) */}
            <div className="attack-resolution__ploys">
              <div className="attack-resolution__section-title">
                {firefightPloys.label}
              </div>

              {firefightPloys.ploys.length === 0 ? (
                <div className="attack-resolution__empty">No ploys available.</div>
              ) : (
                <div className="attack-resolution__ploy-list">
                  {firefightPloys.ploys.map((ploy) => (
                    <button
                      key={ploy.id}
                      type="button"
                      className="attack-resolution__ploy"
                      onClick={() => {
                        const cost = ploy?.cost?.cp ? `${ploy.cost.cp}CP` : "—";
                        addLog("Ploy", `Used ${ploy.name} (${cost}).`);
                      }}
                      aria-label={ploy.name || ploy.id}
                    >
                      <img
                        className="attack-resolution__ploy-image"
                        src={(() => {
                          const image = ploy?.image;
                          if (!image || typeof image !== "string") return "/killteamSpeedrunLogo.png";
                          if (image.startsWith("http://") || image.startsWith("https://")) return image;
                          if (image.startsWith("/")) return image;
                          if (image.startsWith("public/")) return `/${image.slice("public/".length)}`;
                          return `/${image}`;
                        })()}
                        alt={ploy.name || ploy.id}
                        loading="lazy"
                      />
                      {ploy?.cost?.cp != null && (
                        <span className="attack-resolution__ploy-cost-badge">
                          {ploy.cost.cp}CP
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default AttackResolutionScreen;
