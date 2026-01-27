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

async function openAttackResolutionForBoth(browser) {
	const contextA = await browser.newContext();
	const contextB = await browser.newContext();
	const pageA = await contextA.newPage();
	const pageB = await contextB.newPage();

	await pageA.goto("/jesse/army?e2e=1&slot=A&armyKey=kommandos");
	await pageB.goto("/jesse/army?e2e=1&slot=B&armyKey=kommandos");

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
