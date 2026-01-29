import "./strategicPloys.css";

const ployModules = import.meta.glob(
  "../../data/killteams/**/**/*StratPloys.json",
  { eager: true },
);

const normalizeData = (moduleData) => moduleData?.default || moduleData || null;
const resolvePloyImage = (image) => {
  if (!image) return "/killteamSpeedrunLogo.png";
  if (typeof image !== "string") return "/killteamSpeedrunLogo.png";
  if (image.startsWith("http://") || image.startsWith("https://")) return image;
  if (image.startsWith("/")) return image;
  if (image.startsWith("public/")) return `/${image.slice("public/".length)}`;
  return `/${image}`;
};

function StrategicPloys({
  armyKey,
  isVisible,
  currentPlayerId,
  localPlayerId,
  isInteractive = true,
  activeChooserPlayerId = null,
  usedPloyIds = [],
  passedByPlayer = {},
  onUsePloy,
  onPass,
}) {
  if (!isVisible) return null;
  if (!armyKey) return null;

  const keyLower = String(armyKey).toLowerCase();
  const entry = Object.entries(ployModules).find(([path]) => {
    const normalized = path.toLowerCase();
    return (
      normalized.includes(`/${keyLower}/`) ||
      normalized.includes(`${keyLower}stratploys`)
    );
  });

  const data = normalizeData(entry?.[1]);
  const ploys = Array.isArray(data?.ploys) ? data.ploys : [];

  if (ploys.length === 0) return null;

  const isMyTurn = Boolean(currentPlayerId) && currentPlayerId === localPlayerId;
  const turnLabel = currentPlayerId ? `Player ${currentPlayerId} to act` : "Awaiting turn";
  const passedLabel = passedByPlayer?.[localPlayerId]
    ? `Player ${localPlayerId} passed`
    : null;
  const waitingLabel =
    !isInteractive && activeChooserPlayerId
      ? `Waiting for Player ${activeChooserPlayerId}...`
      : null;

  return (
    <section className="kt-ploys">
      <div className="kt-ploys__title">Strategic Ploys</div>
      <div className="kt-ploys__meta">
        <span className="kt-ploys__turn">{turnLabel}</span>
        {passedLabel && <span className="kt-ploys__passed">{passedLabel}</span>}
        {waitingLabel && <span className="kt-ploys__waiting">{waitingLabel}</span>}
      </div>
      <div className="kt-ploys__list">
        {ploys.map((ploy) => {
          const ployKey = ploy.id || ploy.name || "ploy";
          const cost = Number(ploy?.cost?.cp ?? 0);
          const hasCost = Number.isFinite(cost);
          const imageSrc = resolvePloyImage(ploy?.image);
          return (
            <button
              key={ployKey}
              className="kt-ploys__item"
              type="button"
              aria-label={ploy.name || ployKey}
              disabled={!isInteractive || !isMyTurn || usedPloyIds.includes(ploy.id)}
              onClick={() => onUsePloy?.(ploy)}
            >
              <img
                className="kt-ploys__image"
                src={imageSrc}
                alt={ploy.name || ployKey}
                loading="lazy"
              />
              {hasCost && (
                <span className="kt-ploys__cost-badge">{cost}CP</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="kt-ploys__actions">
        <button
          className="kt-ploys__pass"
          type="button"
          disabled={!isInteractive || !isMyTurn}
          onClick={() => onPass?.()}
        >
          Pass
        </button>
      </div>
    </section>
  );
}

export default StrategicPloys;
