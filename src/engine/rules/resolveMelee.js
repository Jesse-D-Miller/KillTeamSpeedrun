export function resolveMelee(ctx) {
  ctx.phase = "ERROR";
  ctx.log.push({
    type: "MELEE_NOT_IMPLEMENTED",
    detail: { message: "Melee not implemented yet" },
  });
  return ctx;
}
