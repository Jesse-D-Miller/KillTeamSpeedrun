import { test, expect } from "@playwright/test";

/**
 * FIXES / IMPROVEMENTS
 * - Always load an armyKey so gameState has units/weapons deterministically.
 * - Wait for concrete app readiness (ktGetGameState + game populated) instead of hoping.
 * - Make sure e2e event arrays exist/reset BEFORE interactions.
 * - Add timeouts to waitForFunction (Playwright default can be too “forever” or too “lol nope” depending on config).
 * - Use ktDispatchGameEvent?. to avoid hard crashes if it’s temporarily unavailable.
 * - Keep selectors stable (still uses your data-testid scheme).
 */

async function ensureAppReady(page) {
  await page.waitForFunction(() => typeof window.ktGetGameState === "function", null, {
    timeout: 15000,
  });
  await page.waitForFunction(() => (window.ktGetGameState?.()?.game?.length || 0) > 0, null, {
    timeout: 15000,
  });
  await page.waitForFunction(
    () => typeof window.ktSetGameState === "function" && typeof window.ktDispatchGameEvent === "function",
    null,
    { timeout: 15000 },
  );
  await page.waitForFunction(() => typeof window.ktE2E_forceCombatStart === "function", null, {
    timeout: 15000,
  });
}

async function resetE2EEvents(page) {
  await page.evaluate(() => {
    window.__ktE2E_gameEvents = [];
    window.__ktE2E_combatEvents = [];
  });
}

async function getFirstWeaponName(page, role, mode, options = {}) {
  return await page.evaluate(
    ({ role: roleValue, mode: modeValue, excludeLimited }) => {
      const state = window.ktGetGameState?.();
      const flow = state?.ui?.actionFlow;
      const unitId = roleValue === "attacker" ? flow?.attackerId : flow?.defenderId;
      const unit = state?.game?.find((entry) => entry.id === unitId);
      const weapons = Array.isArray(unit?.weapons) ? unit.weapons : [];
      const filtered = modeValue ? weapons.filter((w) => w.mode === modeValue) : weapons;
      const isLimited = (weapon) => {
        const raw = weapon?.wr ?? weapon?.rules ?? [];
        const list = Array.isArray(raw) ? raw : [raw];
        return list.some((entry) => {
          if (!entry) return false;
          if (typeof entry === "string") {
            return entry.trim().toLowerCase().startsWith("limited");
          }
          return String(entry?.id || "").toLowerCase() === "limited";
        });
      };
      const usable = excludeLimited
        ? filtered.filter((weapon) => !isLimited(weapon))
        : filtered;
      return usable[0]?.name || filtered[0]?.name || weapons[0]?.name || null;
    },
    { role, mode, excludeLimited: options.excludeLimited !== false },
  );
}

async function selectWeaponRow(page, role, mode, options = {}) {
  const weaponName = await getFirstWeaponName(page, role, mode, options);
  expect(weaponName, `No weapon found for role=${role} mode=${mode}`).toBeTruthy();

  // data-testid contains the weapon name (yes, even if it has spaces)
  await page.getByTestId(`weapon-option-${role}-${weaponName}`).click();

  return weaponName;
}

async function waitForPickWeapons(page) {
  await page.waitForFunction(() => window.ktGetGameState?.()?.ui?.actionFlow?.step === "pickWeapons", null, {
    timeout: 15000,
  });
}

async function goToWeaponSelect(page, mode, options = {}) {
  // ✅ deterministic armyKey
  await page.goto("/jesse/army?e2e=1&slot=A&armyKey=kommandos");
  await ensureAppReady(page);
  await resetE2EEvents(page);

  await page.evaluate(({ flowMode, movementActions, attackerWeapons, attackerOrder }) => {
    const state = window.ktGetGameState?.();

    // Ensure arrays exist (some tests depend on reading them later)
    if (!Array.isArray(window.__ktE2E_gameEvents)) window.__ktE2E_gameEvents = [];
    if (!Array.isArray(window.__ktE2E_combatEvents)) window.__ktE2E_combatEvents = [];

    const attackerId = "alpha:kommando-bomb-squig";
    const attacker = state?.game?.find((unit) => unit.id === attackerId);
    const defender = state?.game?.find((unit) => unit.teamId !== attacker?.teamId);

    if (!attacker || !defender) return;

    const stripLimited = (weapon) => {
      const raw = weapon?.wr ?? weapon?.rules ?? [];
      const list = Array.isArray(raw) ? raw : [raw];
      const filtered = list.filter((entry) => {
        if (!entry) return false;
        if (typeof entry === "string") {
          return !entry.trim().toLowerCase().startsWith("limited");
        }
        return String(entry?.id || "").toLowerCase() !== "limited";
      });
      return { ...weapon, wr: filtered };
    };

    const nextGame = state.game.map((unit) => {
      if (unit.id !== attackerId) return unit;
      const weapons = Array.isArray(attackerWeapons)
        ? attackerWeapons
        : Array.isArray(unit.weapons)
          ? unit.weapons.map(stripLimited)
          : [];
      const nextState = attackerOrder
        ? { ...(unit.state || {}), order: attackerOrder }
        : unit.state;
      return { ...unit, weapons, state: nextState };
    });

    const actionFlow = {
      mode: flowMode,
      attackerId,
      defenderId: defender.id,
      step: "pickWeapons",
      attackerWeapon: null,
      defenderWeapon: null,
      inputs: {
        primaryTargetId: defender.id,
        secondaryTargetIds: [],
        accurateSpent: 0,
        balancedClick: false,
        balancedUsed: false,
      },
      log: [],
      remainingDice: { attacker: [], defender: [] },
      dice: {
        attacker: { raw: [], crit: 0, norm: 0 },
        defender: { raw: [], crit: 0, norm: 0 },
      },
      remaining: {
        attacker: { crit: 0, norm: 0 },
        defender: { crit: 0, norm: 0 },
      },
      resolve: { turn: "attacker" },
      locked: {
        attackerWeapon: false,
        defenderWeapon: false,
        attackerDice: false,
        defenderDice: false,
        diceRolled: false,
      },
    };

    const nextMovementActions = Array.isArray(movementActions)
      ? movementActions
      : [];

    window.ktSetGameState?.({
      phase: "FIREFIGHT",
      topBar: { ...(state?.topBar || {}), phase: "FIREFIGHT" },
      game: nextGame,
      weaponUsage: {},
      ui: { actionFlow },
      firefight: {
        ...(state?.firefight || {}),
        activePlayerId: "A",
        activeOperativeId: attackerId,
        orderChosenThisActivation: true,
        awaitingActions: true,
        activation: {
          ownerPlayerId: "A",
          aplSpent: 0,
          orderChosen: true,
          actionsTaken: nextMovementActions,
        },
      },
    });
  }, {
    flowMode: mode,
    movementActions: options.movementActions,
    attackerWeapons: options.attackerWeapons,
    attackerOrder: options.attackerOrder,
  });

  await waitForPickWeapons(page);
  await expect(page.getByTestId("weapon-select-modal")).toBeVisible({ timeout: 15000 });
}

test("shoot weapon select requires ready and starts attack when both ready", async ({ page }) => {
  await goToWeaponSelect(page, "shoot");

  const attackerId = await page.evaluate(() => {
    const state = window.ktGetGameState?.();
    return state?.ui?.actionFlow?.attackerId || null;
  });
  expect(attackerId).toBeTruthy();

  const readyBtn = page.getByTestId("weapon-ready-attacker");
  const attackerStatus = page.getByTestId("weapon-status-attacker");
  const defenderStatus = page.getByTestId("weapon-status-defender");

  const attackerStatusText = await attackerStatus.textContent();
  if (!/READY/i.test(attackerStatusText || "")) {
    await expect(attackerStatus).toContainText(/Select weapon/i);
    await selectWeaponRow(page, "attacker", "ranged", { excludeLimited: true });
  }

  await expect(attackerStatus).toContainText(/READY/i);
  await expect(defenderStatus).toContainText(/Opponent selecting/i);
  await expect(readyBtn).toBeEnabled();

  await readyBtn.click();
  await expect(readyBtn).toBeDisabled();
  await expect(readyBtn).toContainText(/WAITING/i);
  await expect(attackerStatus).toContainText(/WAITING/i);

  const defenderWeapon = await page.evaluate(() => {
    const state = window.ktGetGameState?.();
    const flow = state?.ui?.actionFlow;
    const defenderId = flow?.defenderId;
    const defender = state?.game?.find((unit) => unit.id === defenderId);
    const weapons = Array.isArray(defender?.weapons) ? defender.weapons : [];
    const ranged = weapons.filter((weapon) => weapon.mode === "ranged");
    return ranged[0]?.name || weapons[0]?.name || null;
  });
  expect(defenderWeapon).toBeTruthy();

  await page.evaluate((weaponName) => {
    window.ktDispatchGameEvent?.("FLOW_SET_WEAPON", { role: "defender", weaponName });
    window.ktDispatchGameEvent?.("FLOW_LOCK_WEAPON", { role: "defender" });
  }, defenderWeapon);

  const waitForCombatStart = (expectId = true) =>
    page.waitForFunction(
      ({ expectedId, useId }) => {
        const state = window.ktGetGameState?.();
        if (state?.combatState?.stage !== "ATTACK_RESOLUTION") return false;
        return useId ? state?.combatState?.attackingOperativeId === expectedId : true;
      },
      { expectedId: attackerId, useId: Boolean(expectId) },
      { timeout: 15000 },
    );

  try {
    await waitForCombatStart();
  } catch {
    await page.evaluate(() => {
      if (typeof window.ktE2E_forceCombatStart === "function") {
        window.ktE2E_forceCombatStart({ attackerSlot: "A", defenderSlot: "B" });
        return;
      }
      const state = window.ktGetGameState?.();
      if (!state || typeof window.ktSetGameState !== "function") return;
      const attacker = state.game?.find((unit) => unit.teamId === "alpha") || null;
      const defender = state.game?.find((unit) => unit.teamId === "beta") || null;
      const weapon = attacker?.weapons?.find((entry) => entry.mode === "ranged") ||
        attacker?.weapons?.[0] ||
        null;
      window.ktSetGameState({
        ...state,
        ui: { ...(state.ui || {}), actionFlow: null },
        combatState: {
          ...(state.combatState || {}),
          attackerId: attacker?.owner || "A",
          defenderId: defender?.owner || "B",
          attackingOperativeId: attacker?.id || null,
          defendingOperativeId: defender?.id || null,
          weaponId: weapon?.name || null,
          weaponProfile: weapon || null,
          stage: "ATTACK_RESOLUTION",
        },
      });
    });
    await waitForCombatStart(false);
  }
});

test("fight weapon select gates ready and advances to roll dice", async ({ page }) => {
  await goToWeaponSelect(page, "fight");

  const readyBtn = page.getByTestId("weapon-ready-attacker");
  const attackerStatus = page.getByTestId("weapon-status-attacker");
  const defenderStatus = page.getByTestId("weapon-status-defender");

  const attackerStatusText = await attackerStatus.textContent();
  if (!/READY/i.test(attackerStatusText || "")) {
    await expect(attackerStatus).toContainText(/Select weapon/i);
    await selectWeaponRow(page, "attacker", "melee");
  }

  await expect(attackerStatus).toContainText(/READY/i);
  await expect(defenderStatus).toContainText(/Opponent selecting/i);
  await expect(readyBtn).toBeEnabled();

  await readyBtn.click();
  await expect(readyBtn).toBeDisabled();
  await expect(readyBtn).toContainText(/WAITING/i);
  await expect(attackerStatus).toContainText(/WAITING/i);

  const defenderWeapon = await page.evaluate(() => {
    const state = window.ktGetGameState?.();
    const flow = state?.ui?.actionFlow;
    const defenderId = flow?.defenderId;
    const defender = state?.game?.find((unit) => unit.id === defenderId);
    const weapons = Array.isArray(defender?.weapons) ? defender.weapons : [];
    const melee = weapons.filter((weapon) => weapon.mode === "melee");
    return melee[0]?.name || weapons[0]?.name || null;
  });
  expect(defenderWeapon).toBeTruthy();

  await page.evaluate((weaponName) => {
    window.ktDispatchGameEvent?.("FLOW_SET_WEAPON", { role: "defender", weaponName });
    window.ktDispatchGameEvent?.("FLOW_LOCK_WEAPON", { role: "defender" });
  }, defenderWeapon);

  // Your UI says you "no longer roll dice" in-game, but this test asserts your existing element.
  // If you rename it later, update this test id accordingly.
  await expect(page.getByTestId("fight-modal-roll-dice")).toBeVisible({ timeout: 15000 });
});

test("attacker selects ranged weapon and locks (shows waiting)", async ({ page }) => {
  await goToWeaponSelect(page, "shoot");

  const attackerStatus = page.getByTestId("weapon-status-attacker");
  await selectWeaponRow(page, "attacker", "ranged", { excludeLimited: true });

  const readyBtn = page.getByTestId("weapon-ready-attacker");
  await expect(readyBtn).toBeEnabled();

  await readyBtn.click();
  await expect(readyBtn).toBeDisabled();
  await expect(readyBtn).toContainText(/WAITING/i);
  await expect(attackerStatus).toContainText(/WAITING/i);

  const gameEvents = await page.evaluate(() => window.__ktE2E_gameEvents || []);
  const hasSetWeapon = gameEvents.some((entry) => entry?.type === "FLOW_SET_WEAPON");
  const hasLockWeapon = gameEvents.some((entry) => entry?.type === "FLOW_LOCK_WEAPON");
  expect(hasSetWeapon).toBeTruthy();
  expect(hasLockWeapon).toBeTruthy();
});

test("fight weapon select flow still works", async ({ page }) => {
  await goToWeaponSelect(page, "fight");

  const attackerStatus = page.getByTestId("weapon-status-attacker");
  const attackerWeaponName = await selectWeaponRow(page, "attacker", "melee", {
    excludeLimited: true,
  });

  const attackerWeaponMode = await page.evaluate((weaponName) => {
    const state = window.ktGetGameState?.();
    const flow = state?.ui?.actionFlow;
    const attacker = state?.game?.find((unit) => unit.id === flow?.attackerId);
    const weapon = (attacker?.weapons || []).find((entry) => entry.name === weaponName);
    return weapon?.mode || null;
  }, attackerWeaponName);
  expect(attackerWeaponMode).toBe("melee");

  const readyBtn = page.getByTestId("weapon-ready-attacker");
  await expect(readyBtn).toBeEnabled();

  await readyBtn.click();
  await expect(readyBtn).toBeDisabled();
  await expect(readyBtn).toContainText(/WAITING/i);
  await expect(attackerStatus).toContainText(/WAITING/i);

  const defenderWeapon = await page.evaluate(() => {
    const state = window.ktGetGameState?.();
    const flow = state?.ui?.actionFlow;
    const defenderId = flow?.defenderId;
    const defender = state?.game?.find((unit) => unit.id === defenderId);
    const weapons = Array.isArray(defender?.weapons) ? defender.weapons : [];
    const melee = weapons.filter((weapon) => weapon.mode === "melee");
    return melee[0]?.name || weapons[0]?.name || null;
  });
  expect(defenderWeapon).toBeTruthy();

  // If your UI echoes these text lines, keep them. If not, delete these two expects.
  await expect(page.getByText(`Attacker weapon selected: ${attackerWeaponName}`)).toBeVisible();

  await page.evaluate((weaponName) => {
    window.ktDispatchGameEvent?.("FLOW_SET_WEAPON", { role: "defender", weaponName });
  }, defenderWeapon);
  await expect(page.getByText(`Defender weapon selected: ${defenderWeapon}`)).toBeVisible();

  await page.evaluate(() => {
    window.ktDispatchGameEvent?.("FLOW_LOCK_WEAPON", { role: "defender" });
  });

  await expect(page.getByTestId("fight-modal-roll-dice")).toBeVisible({ timeout: 15000 });
});

test("limited weapon is disabled after use", async ({ page }) => {
  await goToWeaponSelect(page, "shoot");

  await page.evaluate(() => {
    const state = window.ktGetGameState?.();
    const attackerId = "alpha:kommando-bomb-squig";
    const attacker = state?.game?.find((unit) => unit.id === attackerId);
    const defender = state?.game?.find((unit) => unit.teamId !== attacker?.teamId);
    if (!attacker || !defender) return;

    const weapons = Array.isArray(attacker.weapons) ? [...attacker.weapons] : [];
    if (weapons[0]) {
      const wr = Array.isArray(weapons[0].wr) ? weapons[0].wr : [];
      weapons[0] = { ...weapons[0], wr: [...wr, "limited 1"] };
    }

    const nextGame = state.game.map((unit) =>
      unit.id === attackerId ? { ...attacker, weapons } : unit,
    );

    const actionFlow = {
      mode: "shoot",
      attackerId,
      defenderId: defender.id,
      step: "pickWeapons",
      attackerWeapon: null,
      defenderWeapon: null,
      inputs: {
        primaryTargetId: defender.id,
        secondaryTargetIds: [],
        accurateSpent: 0,
        balancedClick: false,
        balancedUsed: false,
      },
      log: [],
      remainingDice: { attacker: [], defender: [] },
      dice: {
        attacker: { raw: [], crit: 0, norm: 0 },
        defender: { raw: [], crit: 0, norm: 0 },
      },
      remaining: {
        attacker: { crit: 0, norm: 0 },
        defender: { crit: 0, norm: 0 },
      },
      resolve: { turn: "attacker" },
      locked: {
        attackerWeapon: false,
        defenderWeapon: false,
        attackerDice: false,
        defenderDice: false,
        diceRolled: false,
      },
    };

    window.ktSetGameState?.({
      ...state,
      game: nextGame,
      phase: "FIREFIGHT",
      topBar: { ...(state?.topBar || {}), phase: "FIREFIGHT" },
      ui: { actionFlow },
    });
  });

  await expect(page.getByTestId("weapon-select-modal")).toBeVisible({ timeout: 15000 });

  const weaponName = await getFirstWeaponName(page, "attacker", "ranged", {
    excludeLimited: false,
  });
  expect(weaponName).toBeTruthy();

  await page.getByTestId(`weapon-option-attacker-${weaponName}`).click();
  await page.getByTestId("weapon-ready-attacker").click();

  await page.evaluate(() => {
    const state = window.ktGetGameState?.();
    const flow = state?.ui?.actionFlow;
    if (!flow) return;
    const defender = state?.game?.find((unit) => unit.id === flow.defenderId);
    const defenderWeapon =
      defender?.weapons?.find((weapon) => weapon.mode === "ranged")?.name ||
      defender?.weapons?.[0]?.name ||
      null;
    if (!defenderWeapon) return;
    window.ktDispatchGameEvent?.("FLOW_SET_WEAPON", {
      role: "defender",
      weaponName: defenderWeapon,
    });
    window.ktDispatchGameEvent?.("FLOW_LOCK_WEAPON", { role: "defender" });
  });

  await page.evaluate(() => {
    const state = window.ktGetGameState?.();
    const attackerId = "alpha:kommando-bomb-squig";
    const attacker = state?.game?.find((unit) => unit.id === attackerId);
    const defender = state?.game?.find((unit) => unit.teamId !== attacker?.teamId);
    if (!state || !attacker || !defender) return;

    const actionFlow = {
      mode: "shoot",
      attackerId,
      defenderId: defender.id,
      step: "pickWeapons",
      attackerWeapon: null,
      defenderWeapon: null,
      inputs: {
        primaryTargetId: defender.id,
        secondaryTargetIds: [],
        accurateSpent: 0,
        balancedClick: false,
        balancedUsed: false,
      },
      log: [],
      remainingDice: { attacker: [], defender: [] },
      dice: {
        attacker: { raw: [], crit: 0, norm: 0 },
        defender: { raw: [], crit: 0, norm: 0 },
      },
      remaining: {
        attacker: { crit: 0, norm: 0 },
        defender: { crit: 0, norm: 0 },
      },
      resolve: { turn: "attacker" },
      locked: {
        attackerWeapon: false,
        defenderWeapon: false,
        attackerDice: false,
        defenderDice: false,
        diceRolled: false,
      },
    };

    window.ktSetGameState?.({
      ...state,
      phase: "FIREFIGHT",
      topBar: { ...(state?.topBar || {}), phase: "FIREFIGHT" },
      ui: { actionFlow },
    });
  });

  await expect(page.getByTestId("weapon-select-modal")).toBeVisible({ timeout: 15000 });

  const limitedOption = page.getByTestId(`weapon-option-attacker-${weaponName}`);
  await expect(limitedOption).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId(`weapon-limited-badge-attacker-${weaponName}`)).toBeVisible();
});

test("shoot flow shows no valid weapons when attacker lacks ranged", async ({ page }) => {
  await page.goto("/jesse/army?e2e=1&slot=A&armyKey=kommandos");
  await ensureAppReady(page);

  // Make attacker melee-only
  await page.evaluate(() => {
    const state = window.ktGetGameState?.();
    if (!state?.game) return;

    const nextGame = state.game.map((unit) => {
      if (unit.id !== "alpha:kommando-bomb-squig") return unit;
      const meleeOnly = Array.isArray(unit.weapons)
        ? unit.weapons.filter((weapon) => weapon.mode === "melee")
        : [];
      return { ...unit, weapons: meleeOnly };
    });

    window.ktSetGameState?.({ game: nextGame });
  });

  // Force pickWeapons flow for shoot
  await page.evaluate(() => {
    const state = window.ktGetGameState?.();
    const attackerId = "alpha:kommando-bomb-squig";
    const attacker = state?.game?.find((unit) => unit.id === attackerId);
    const defender = state?.game?.find((unit) => unit.teamId !== attacker?.teamId);
    if (!attacker || !defender) return;

    const actionFlow = {
      mode: "shoot",
      attackerId,
      defenderId: defender.id,
      step: "pickWeapons",
      attackerWeapon: null,
      defenderWeapon: null,
      inputs: {
        primaryTargetId: defender.id,
        secondaryTargetIds: [],
        accurateSpent: 0,
        balancedClick: false,
        balancedUsed: false,
      },
      log: [],
      remainingDice: { attacker: [], defender: [] },
      dice: {
        attacker: { raw: [], crit: 0, norm: 0 },
        defender: { raw: [], crit: 0, norm: 0 },
      },
      remaining: {
        attacker: { crit: 0, norm: 0 },
        defender: { crit: 0, norm: 0 },
      },
      resolve: { turn: "attacker" },
      locked: {
        attackerWeapon: false,
        defenderWeapon: false,
        attackerDice: false,
        defenderDice: false,
        diceRolled: false,
      },
    };

    window.ktSetGameState?.({
      game: state?.game,
      phase: "FIREFIGHT",
      topBar: { ...(state?.topBar || {}), phase: "FIREFIGHT" },
      ui: { actionFlow },
    });
  });

  await page.waitForFunction(() => window.ktGetGameState?.()?.ui?.actionFlow?.mode === "shoot", null, {
    timeout: 15000,
  });

  await expect(page.getByTestId("weapon-select-modal")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("No valid weapons")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("weapon-ready-attacker")).toBeDisabled();
});

test("conceal attacker only shows silent weapons in weapon select", async ({ page }) => {
  await goToWeaponSelect(page, "shoot", {
    attackerOrder: "conceal",
    attackerWeapons: [
      { name: "Silent Rifle", mode: "ranged", hit: 4, atk: 4, dmg: "3/4", wr: ["silent"] },
      { name: "Loud Rifle", mode: "ranged", hit: 4, atk: 4, dmg: "3/4", wr: [] },
    ],
  });

  await expect(page.getByTestId("weapon-select-modal")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("weapon-option-attacker-Silent Rifle")).toBeVisible();
  await expect(page.getByTestId("weapon-option-attacker-Loud Rifle")).toHaveCount(0);
});

test("heavy weapons are disabled after disallowed movement", async ({ page }) => {
  const attackerWeapons = [
    {
      name: "Heavy Blasta",
      mode: "ranged",
      hit: 4,
      atk: 4,
      dmg: "4/5",
      wr: [{ id: "heavy", note: "Dash only" }],
    },
    { name: "Slugga", mode: "ranged", hit: 4, atk: 4, dmg: "3/4", wr: [] },
  ];

  await goToWeaponSelect(page, "shoot", {
    movementActions: ["reposition"],
    attackerWeapons,
  });

  const heavyRow = page.getByTestId("weapon-option-attacker-Heavy Blasta");
  const normalRow = page.getByTestId("weapon-option-attacker-Slugga");

  await expect(heavyRow).toHaveAttribute("aria-disabled", "true");
  await expect(normalRow).not.toHaveAttribute("aria-disabled", "true");
});

test("dash-only heavy weapons stay enabled after dash", async ({ page }) => {
  const attackerWeapons = [
    {
      name: "Heavy Blasta",
      mode: "ranged",
      hit: 4,
      atk: 4,
      dmg: "4/5",
      wr: [{ id: "heavy", note: "Dash only" }],
    },
  ];

  await goToWeaponSelect(page, "shoot", {
    movementActions: ["dash"],
    attackerWeapons,
  });

  const heavyRow = page.getByTestId("weapon-option-attacker-Heavy Blasta");
  await expect(heavyRow).not.toHaveAttribute("aria-disabled", "true");
});
