import "./strategicPloys.css";

const ployModules = import.meta.glob(
  "../../data/killteams/**/**/*StratPloys.json",
  { eager: true },
);

const normalizeData = (moduleData) => moduleData?.default || moduleData || null;

function StrategicPloys({
  armyKey,
  isVisible,
  currentPlayerId,
  localPlayerId,
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

  return (
    <section className="kt-ploys">
      <div className="kt-ploys__title">Strategic Ploys</div>
      <div className="kt-ploys__meta">
        <span className="kt-ploys__turn">{turnLabel}</span>
        {passedLabel && <span className="kt-ploys__passed">{passedLabel}</span>}
      </div>
      <div className="kt-ploys__list">
        {ploys.map((ploy) => (
          <button
            key={ploy.id || ploy.name}
            className="kt-ploys__item"
            type="button"
            disabled={!isMyTurn || usedPloyIds.includes(ploy.id)}
            onClick={() => onUsePloy?.(ploy)}
          >
            <div className="kt-ploys__name">{ploy.name}</div>
            {ploy.cost?.cp != null && (
              <div className="kt-ploys__cost">CP {ploy.cost.cp}</div>
            )}
          </button>
        ))}
      </div>
      <div className="kt-ploys__actions">
        <button
          className="kt-ploys__pass"
          type="button"
          disabled={!isMyTurn}
          onClick={() => onPass?.()}
        >
          Pass
        </button>
      </div>
    </section>
  );
}

export default StrategicPloys;
