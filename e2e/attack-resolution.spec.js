import { test, expect } from "@playwright/test";

async function seedFirefight(page) {
	await page.evaluate(() => {
		const state = window.ktGetGameState?.();
		if (!state?.game?.length) return;
		const teamAUnit = state.game.find((unit) => unit.teamId === "alpha") || null;
		window.ktSetGameState?.({
			phase: "FIREFIGHT",
			topBar: { ...(state.topBar || {}), phase: "FIREFIGHT" },
			firefight: {
				...(state.firefight || {}),
				activePlayerId: "A",
				activeOperativeId: teamAUnit?.id || null,
				orderChosenThisActivation: false,
				awaitingOrder: false,
				awaitingActions: false,
			},
			ui: { actionFlow: null },
		});
	});
}

async function resetE2EEvents(page) {
	await page.evaluate(() => {
		window.__ktE2E_gameEvents = [];
		window.__ktE2E_combatEvents = [];
	});
}

async function relayEvents(from, to) {
	const { gameEvents, combatEvents } = await from.evaluate(() => ({
		gameEvents: window.__ktE2E_gameEvents || [],
		combatEvents: window.__ktE2E_combatEvents || [],
	}));

	await to.evaluate(
		({ gameEvents: nextGameEvents, combatEvents: nextCombatEvents }) => {
			nextGameEvents.forEach((event) => {
				window.ktDispatchGameEvent?.(event.type, event.payload);
			});
			nextCombatEvents.forEach((event) => {
				window.ktDispatchCombatEvent?.(event.type, event.payload);
			});
		},
		{ gameEvents, combatEvents },
	);
}

async function openAttackResolutionForBoth(browser, options = {}) {
	const { weaponRules, combatCtxOverrides } = options;
	const contextA = await browser.newContext();
	const contextB = await browser.newContext();
	const pageA = await contextA.newPage();
	const pageB = await contextB.newPage();

	await pageA.goto("/jesse/army?e2e=1&slot=A&armyKey=kommandos");
	await pageB.goto("/jesse/army?e2e=1&slot=B&armyKey=kommandos");

	if (Array.isArray(weaponRules)) {
		await pageA.evaluate((rules) => {
			window.__ktE2E_weaponRules = rules;
		}, weaponRules);
		await pageB.evaluate((rules) => {
			window.__ktE2E_weaponRules = rules;
		}, weaponRules);
	}
	if (combatCtxOverrides) {
		await pageA.evaluate((overrides) => {
			window.__ktE2E_combatCtxOverrides = overrides;
		}, combatCtxOverrides);
		await pageB.evaluate((overrides) => {
			window.__ktE2E_combatCtxOverrides = overrides;
		}, combatCtxOverrides);
	}

	await seedFirefight(pageA);
	await seedFirefight(pageB);
	await resetE2EEvents(pageA);
	await resetE2EEvents(pageB);

	const firstCard = pageA
		.getByTestId("unit-grid")
		.locator("[data-testid^='unit-card-']")
		.first();
	await firstCard.click();

	await expect(pageA.getByTestId("unit-focused")).toBeVisible();
	await pageA.getByTestId("action-activate-engage").click();
	await pageA.getByTestId("action-shoot").click();

	await expect(pageA.getByTestId("target-select-screen")).toBeVisible();
	await expect(pageA.getByTestId("target-select-modal")).toBeVisible();

	const enemyTarget = pageA.locator("[data-testid^='target-beta:']").first();
	await expect(enemyTarget).toBeVisible();
	await enemyTarget.focus();
	await pageA.keyboard.press("Enter");

	const confirmBtn = pageA.getByTestId("target-confirm");
	await expect(confirmBtn).toBeEnabled();
	await confirmBtn.click();

	const modalA = pageA.getByTestId("attack-resolution-modal");
	await expect(modalA).toBeVisible();

	await relayEvents(pageA, pageB);

	const modalB = pageB.getByTestId("attack-resolution-modal");
	await expect(modalB).toBeVisible();

	return { contextA, contextB, pageA, pageB };
}

test("roll instructions render", async ({ browser }) => {
	const { contextA, contextB, pageA, pageB } =
		await openAttackResolutionForBoth(browser);

	const expected = await pageA.evaluate(() => {
		const state = window.ktGetGameState?.();
		const weapon = state?.combatState?.weaponProfile || null;
		const defenderId = state?.combatState?.defendingOperativeId || null;
		const defender = state?.game?.find((unit) => unit.id === defenderId) || null;
		const isFight =
			weapon?.mode === "melee" ||
			String(state?.combatState?.stage || "")
				.toLowerCase()
				.includes("fight");
		const attackerSuccessThreshold = Number(weapon?.hit ?? 6);
		const defenderSuccessThreshold = isFight
			? Number(
				defender?.state?.selectedWeaponHit ?? defender?.meleeHit ?? weapon?.hit ?? 6,
			)
			: Number(defender?.stats?.save ?? 6);
		const maxAttackDice = Number(weapon?.atk ?? 0);
		const maxDefenseDice = Number(3);
		return {
			maxAttackDice,
			attackerSuccessThreshold,
			maxDefenseDice,
			defenderSuccessThreshold,
		};
	});

	const instructionsA = pageA.getByTestId("roll-instructions");
	const instructionsB = pageB.getByTestId("roll-instructions");
	await expect(instructionsA).toBeVisible();
	await expect(instructionsB).toBeVisible();
	await expect(instructionsA).toContainText(`Roll ${expected.maxAttackDice}`);
	await expect(instructionsA).toContainText(
		`success on ${expected.attackerSuccessThreshold}+`,
	);
	await expect(instructionsA).toContainText("crit on 6+");
	await expect(instructionsA).toContainText(`Roll ${expected.maxDefenseDice}`);
	await expect(instructionsA).toContainText(
		`success on ${expected.defenderSuccessThreshold}+`,
	);

	await contextA.close();
	await contextB.close();
});

test("weapon rule click shows tooltip", async ({ browser }) => {
	const { contextA, contextB, pageA, pageB } =
		await openAttackResolutionForBoth(browser, { weaponRules: ["silent"] });

	const silentChip = pageA.locator(".wr-chip", { hasText: "Silent" });
	await expect(silentChip).toBeVisible();
	await silentChip.click();

	const popover = pageA.getByTestId("weapon-rules-popover");
	await expect(popover).toContainText("Silent");
	await expect(popover).toContainText("You can Shoot while on Conceal.");

	await contextA.close();
	await contextB.close();
});

test("weapon rules popover uses deterministic rules list", async ({ browser }) => {
	const { contextA, contextB, pageA, pageB } =
		await openAttackResolutionForBoth(browser, {
			weaponRules: [
				{ id: "lethal", value: 5 },
				{ id: "devastating", value: 3 },
				"balanced",
			],
			combatCtxOverrides: { inputs: { attackLockedIn: false } },
		});

	await expect(pageA.getByTestId("weapon-rules-panel")).toBeVisible();
	await expect(pageA.locator(".wr-chip", { hasText: "Lethal 5+" })).toBeVisible();
	await expect(pageA.locator(".wr-chip", { hasText: "Devastating 3" })).toBeVisible();
	await expect(pageA.locator(".wr-chip", { hasText: "Balanced" })).toBeVisible();

	await contextA.close();
	await contextB.close();
});

test("weapon rules popover shows label + boiled down text", async ({ browser }) => {
	const { contextA, contextB, pageA, pageB } =
		await openAttackResolutionForBoth(browser, {
			weaponRules: [{ id: "lethal", value: 5 }],
		});

	const lethalChip = pageA.locator(".wr-chip", { hasText: "Lethal 5+" });
	await lethalChip.click();

	const popover = pageA.getByTestId("weapon-rules-popover");
	await expect(popover).toContainText("Lethal 5+");
	await expect(popover).toContainText("Critical successes are 5+");

	await contextA.close();
	await contextB.close();
});

test("weapon rules popover closes via close, outside, and escape", async ({ browser }) => {
	const { contextA, contextB, pageA, pageB } =
		await openAttackResolutionForBoth(browser, {
			weaponRules: ["balanced"],
		});

	const chip = pageA.locator(".wr-chip", { hasText: "Balanced" });
	await chip.click();
	await expect(pageA.getByTestId("weapon-rules-popover")).toBeVisible();

	await pageA.getByLabel("Close").click();
	await expect(pageA.getByTestId("weapon-rules-popover")).toBeHidden();

	await chip.click();
	await expect(pageA.getByTestId("weapon-rules-popover")).toBeVisible();
	await pageA.locator(".attack-resolution__main").click({ position: { x: 10, y: 10 } });
	await expect(pageA.getByTestId("weapon-rules-popover")).toBeHidden();

	await chip.click();
	await expect(pageA.getByTestId("weapon-rules-popover")).toBeVisible();
	await pageA.keyboard.press("Escape");
	await expect(pageA.getByTestId("weapon-rules-popover")).toBeHidden();

	await contextA.close();
	await contextB.close();
});

test("weapon rules popover repositions on scroll", async ({ browser }) => {
	const { contextA, contextB, pageA, pageB } =
		await openAttackResolutionForBoth(browser, {
			weaponRules: ["balanced"],
		});

	await pageA.locator(".wr-chip", { hasText: "Balanced" }).click();
	const popover = pageA.getByTestId("weapon-rules-popover");
	await expect(popover).toBeVisible();

	const before = await popover.boundingBox();
	await pageA.evaluate(() => {
		const main = document.querySelector(".attack-resolution__main");
		if (!main) return;
		main.style.paddingBottom = "2000px";
		main.scrollTop = main.scrollTop + 200;
	});
	await pageA.waitForTimeout(50);
	const after = await popover.boundingBox();

	if (before && after) {
		await expect(after.y).not.toEqual(before.y);
	}

	await contextA.close();
	await contextB.close();
});

test("disabled rule chips do not open popover", async ({ browser }) => {
	const { contextA, contextB, pageA, pageB } =
		await openAttackResolutionForBoth(browser, {
			weaponRules: [{ id: "devastating", value: 3 }],
			combatCtxOverrides: { inputs: { attackLockedIn: false } },
		});

	const disabledChip = pageA.locator(".wr-chip", { hasText: "Devastating 3" });
	await expect(disabledChip).toBeDisabled();
	await disabledChip.click({ trial: true, force: true });
	await expect(pageA.getByTestId("weapon-rules-popover")).toBeHidden();

	await contextA.close();
	await contextB.close();
});

test("clicking a second rule updates popover content", async ({ browser }) => {
	const { contextA, contextB, pageA, pageB } =
		await openAttackResolutionForBoth(browser, {
			weaponRules: [
				{ id: "lethal", value: 5 },
				"balanced",
			],
		});

	await pageA.locator(".wr-chip", { hasText: "Balanced" }).click();
	const popover = pageA.getByTestId("weapon-rules-popover");
	await expect(popover).toContainText("Balanced");

	await pageA.locator(".wr-chip", { hasText: "Lethal 5+" }).click();
	await expect(popover).toContainText("Lethal 5+");
	await expect(popover).toContainText("Critical successes are 5+");

	await contextA.close();
	await contextB.close();
});

test("popover does not create extra modal overlays", async ({ browser }) => {
	const { contextA, contextB, pageA, pageB } =
		await openAttackResolutionForBoth(browser, {
			weaponRules: ["balanced"],
		});

	await pageA.locator(".wr-chip", { hasText: "Balanced" }).click();
	await expect(pageA.getByTestId("weapon-rules-popover")).toBeVisible();

	const modalCount = await pageA.locator(".kt-modal").count();
	await expect(modalCount).toBe(1);

	await contextA.close();
	await contextB.close();
});

test("post-roll checklist is disabled before readiness", async ({ browser }) => {
	const { contextA, contextB, pageA, pageB } =
		await openAttackResolutionForBoth(browser);

	const ruleButtons = pageA.locator(
		".attack-resolution__rule-steps .attack-resolution__rule:not(.attack-resolution__rule--secondary)",
	);
	if ((await ruleButtons.count()) === 0) {
		test.skip(true, "No post-roll rules available for this weapon.");
	}

	await expect(ruleButtons.first()).toBeDisabled();
	const ruleButtonsB = pageB.locator(
		".attack-resolution__rule-steps .attack-resolution__rule:not(.attack-resolution__rule--secondary)",
	);
	await expect(ruleButtonsB.first()).toBeDisabled();

	await contextA.close();
	await contextB.close();
});

test("final entry applies damage + closes modal", async ({ browser }) => {
	const { contextA, contextB, pageA, pageB } =
		await openAttackResolutionForBoth(browser);

	const defenderInfo = await pageA.evaluate(() => {
		const state = window.ktGetGameState?.();
		const defenderId =
			state?.combatState?.defendingOperativeId ||
			state?.ui?.actionFlow?.defenderId ||
			null;
		const defender = state?.game?.find((unit) => unit.id === defenderId);
		return {
			defenderId,
			woundsCurrent: defender?.state?.woundsCurrent ?? null,
		};
	});

	await pageA.getByTestId("final-hits").fill("1");
	await pageA.getByTestId("final-crits").fill("0");

	await pageA.getByRole("button", { name: /apply damage/i }).click();

	await pageA.waitForFunction(
		(prev) => {
			const state = window.ktGetGameState?.();
			const defender = state?.game?.find((unit) => unit.id === prev.defenderId);
			if (!defender) return false;
			const current = Number(defender.state?.woundsCurrent ?? 0);
			const before = Number(prev.woundsCurrent ?? current);
			return current < before;
		},
		defenderInfo,
	);

	await relayEvents(pageA, pageB);

	await expect(pageA.getByTestId("attack-resolution-modal")).toBeHidden();
	await expect(pageB.getByTestId("attack-resolution-modal")).toBeHidden();

	await contextA.close();
	await contextB.close();
});

test("attack resolution resolves with zero damage when final hits and crits are zero", async ({ browser }) => {
	const { contextA, contextB, pageA, pageB } =
		await openAttackResolutionForBoth(browser);

	await expect(pageA.getByTestId("attack-resolution-modal")).toBeVisible();
	await expect(pageB.getByTestId("attack-resolution-modal")).toBeVisible();

	await expect(pageA.getByTestId("final-hits")).toBeVisible();
	await expect(pageA.getByTestId("final-crits")).toBeVisible();

	const defenderInfo = await pageA.evaluate(() => {
		const state = window.ktGetGameState?.();
		const defenderId =
			state?.combatState?.defendingOperativeId ||
			state?.ui?.actionFlow?.defenderId ||
			null;
		const defender = state?.game?.find((unit) => unit.id === defenderId);
		return {
			defenderId,
			woundsCurrent: defender?.state?.woundsCurrent ?? null,
		};
	});

	await pageA.getByTestId("final-hits").fill("0");
	await pageA.getByTestId("final-crits").fill("0");

	await expect(pageA.locator("text=Total Damage:")).toContainText("0");

	await pageA.getByRole("button", { name: "Apply Damage" }).click();

	await pageA.waitForFunction((prev) => {
		const state = window.ktGetGameState?.();
		const defender = state?.game?.find((unit) => unit.id === prev.defenderId);
		const current = defender?.state?.woundsCurrent ?? null;
		const combat = state?.combatState || null;
		const cleared =
			!combat ||
			(combat.attackingOperativeId == null && combat.defendingOperativeId == null);
		return current === prev.woundsCurrent && cleared;
	}, defenderInfo);

	await relayEvents(pageA, pageB);

	await expect(pageA.getByTestId("attack-resolution-modal")).toBeHidden();
	await expect(pageB.getByTestId("attack-resolution-modal")).toBeHidden();

	const finalState = await pageA.evaluate(() => window.ktGetGameState?.());
	expect(finalState?.firefight?.awaitingActions).toBe(true);
	expect(finalState?.combatState?.attackingOperativeId).toBeNull();
	expect(finalState?.combatState?.defendingOperativeId).toBeNull();

	await contextA.close();
	await contextB.close();
});
