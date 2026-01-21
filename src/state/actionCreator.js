export function createLogEntry({ type, summary, meta = {}, undo = null, redo = null }) {
	return {
		id: typeof crypto !== "undefined" && crypto.randomUUID
			? crypto.randomUUID()
			: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
		ts: Date.now(),
		type,
		summary,
		meta,
		undo,
		redo,
	};
}

export function logPush(entry) {
	return {
		type: "LOG_PUSH",
		payload: entry,
	};
}

export function undo() {
	return { type: "UNDO" };
}

export function redo() {
	return { type: "REDO" };
}

export function applyDamage(targetUnitId, damage) {
	return {
		type: "APPLY_DAMAGE",
		payload: {
			targetUnitId,
			damage,
		},
	};
}
