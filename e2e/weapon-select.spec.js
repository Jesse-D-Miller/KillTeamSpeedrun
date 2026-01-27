import { test, expect } from "@playwright/test";

async function getFirstWeaponName(page, role, mode) {
  return await page.evaluate(
    ({ role: roleValue, mode: modeValue }) => {
      const state = window.ktGetGameState?.();
      const flow = state?.ui?.actionFlow;
      const unitId = roleValue === "attacker" ? flow?.attackerId : flow?.defenderId;
      const unit = state?.game?.find((entry) => entry.id === unitId);
      const weapons = Array.isArray(unit?.weapons) ? unit.weapons : [];
      const filtered = modeValue ? weapons.filter((w) => w.mode === modeValue) : weapons;
      return filtered[0]?.name || weapons[0]?.name || null;
    },
    { role, mode },
  );
}

async function selectWeaponRow(page, role, mode) {
  const weaponName = await getFirstWeaponName(page, role, mode);
  expect(weaponName).toBeTruthy();
  await page.getByTestId(`weapon-option-${role}-${weaponName}`).click();
  return weaponName;
}

async function waitForPickWeapons(page) {
  await page.waitForFunction(() => {
    const state = window.ktGetGameState?.();
    return state?.ui?.actionFlow?.step === "pickWeapons";
  });
}

async function goToWeaponSelect(page, mode) {
  await page.goto("/jesse/army?e2e=1&slot=A");

  await page.evaluate((flowMode) => {
    if (!Array.isArray(window.__ktE2E_gameEvents)) {
      window.__ktE2E_gameEvents = [];
    }
    if (!Array.isArray(window.__ktE2E_combatEvents)) {
      window.__ktE2E_combatEvents = [];
    }
    const state = window.ktGetGameState?.();
    const attackerId = "alpha:kommando-bomb-squig";
    const attacker = state?.game?.find((unit) => unit.id === attackerId);
    const defender = state?.game?.find((unit) => unit.teamId !== attacker?.teamId);
    if (!attacker || !defender) return;

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
      remainingDice: {
        attacker: [],
        defender: [],
      },
      dice: {
        attacker: { raw: [], crit: 0, norm: 0 },
        defender: { raw: [], crit: 0, norm: 0 },
      },
      remaining: {
        attacker: { crit: 0, norm: 0 },
        defender: { crit: 0, norm: 0 },
      },
      resolve: {
        turn: "attacker",
      },
      locked: {
        attackerWeapon: false,
        defenderWeapon: false,
        attackerDice: false,
        defenderDice: false,
        diceRolled: false,
      },
    };

    window.ktSetGameState?.({
      phase: "FIREFIGHT",
      topBar: { ...(state?.topBar || {}), phase: "FIREFIGHT" },
      ui: { actionFlow },
    });
  }, mode);

  await waitForPickWeapons(page);
  await expect(page.getByTestId("weapon-select-modal")).toBeVisible();
}

test("shoot weapon select requires ready and starts attack when both ready", async ({ page }) => {
  await goToWeaponSelect(page, "shoot");

  const readyBtn = page.getByTestId("weapon-ready-attacker");
  const attackerStatus = page.getByTestId("weapon-status-attacker");
  const defenderStatus = page.getByTestId("weapon-status-defender");
  const attackerStatusText = await attackerStatus.textContent();
  if (!/READY/i.test(attackerStatusText || "")) {
    await expect(attackerStatus).toContainText(/Select weapon/i);
    await selectWeaponRow(page, "attacker", "ranged");
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
    window.ktDispatchGameEvent("FLOW_SET_WEAPON", {
      role: "defender",
      weaponName,
    });
    window.ktDispatchGameEvent("FLOW_LOCK_WEAPON", { role: "defender" });
  }, defenderWeapon);

  await page.waitForFunction(() => {
    const state = window.ktGetGameState?.();
    return (
      state?.combatState?.attackingOperativeId === "alpha:kommando-bomb-squig" &&
      state?.combatState?.stage === "ATTACK_ROLLING"
    );
  });
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
    window.ktDispatchGameEvent("FLOW_SET_WEAPON", {
      role: "defender",
      weaponName,
    });
    window.ktDispatchGameEvent("FLOW_LOCK_WEAPON", { role: "defender" });
  }, defenderWeapon);

  await expect(page.getByTestId("fight-modal-roll-dice")).toBeVisible();
});

test("attacker selects ranged weapon and locks (shows waiting)", async ({ page }) => {
  await goToWeaponSelect(page, "shoot");

  const attackerStatus = page.getByTestId("weapon-status-attacker");
  await selectWeaponRow(page, "attacker", "ranged");

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
  const attackerWeaponName = await selectWeaponRow(page, "attacker", "melee");
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
  await expect(
    page.getByText(`Attacker weapon selected: ${attackerWeaponName}`),
  ).toBeVisible();
  await page.evaluate((weaponName) => {
    window.ktDispatchGameEvent("FLOW_SET_WEAPON", {
      role: "defender",
      weaponName,
    });
  }, defenderWeapon);
  await expect(
    page.getByText(`Defender weapon selected: ${defenderWeapon}`),
  ).toBeVisible();
  await page.evaluate(() => {
    window.ktDispatchGameEvent("FLOW_LOCK_WEAPON", { role: "defender" });
  });

  await expect(page.getByTestId("fight-modal-roll-dice")).toBeVisible();
});

test("shoot flow shows no valid weapons when attacker lacks ranged", async ({ page }) => {
  await page.goto("/jesse/army?e2e=1&slot=A");

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
      remainingDice: {
        attacker: [],
        defender: [],
      },
      dice: {
        attacker: { raw: [], crit: 0, norm: 0 },
        defender: { raw: [], crit: 0, norm: 0 },
      },
      remaining: {
        attacker: { crit: 0, norm: 0 },
        defender: { crit: 0, norm: 0 },
      },
      resolve: {
        turn: "attacker",
      },
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

  await expect(page.getByTestId("weapon-select-modal")).toBeVisible();
  await expect(page.getByText("No valid weapons")).toBeVisible();
  await expect(page.getByTestId("weapon-ready-attacker")).toBeDisabled();
});
