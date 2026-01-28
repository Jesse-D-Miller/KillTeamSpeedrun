import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import TargetSelectModal from "../components/TargetSelectModal";
import { normalizeWeaponRules } from "../../engine/rules/weaponRules";

function TargetSelectScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { username } = useParams();
  const params = new URLSearchParams(location.search);
  const mode = location.state?.mode || params.get("mode") || "shoot";
  const slot = location.state?.slot || params.get("slot") || "A";
  const gameCode = location.state?.gameCode || params.get("gameCode") || "E2E";
  const attackerId = location.state?.attackerId || params.get("attackerId") || null;

  const [gameState, setGameState] = useState(() =>
    typeof window !== "undefined" && typeof window.ktGetGameState === "function"
      ? window.ktGetGameState()
      : null,
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (typeof window.ktSubscribeGameState === "function") {
      const unsubscribe = window.ktSubscribeGameState((nextState) => {
        setGameState(nextState);
      });
      return () => unsubscribe?.();
    }
    const handleState = (event) => {
      setGameState(event.detail?.state || null);
    };
    window.addEventListener("kt:state", handleState);
    return () => window.removeEventListener("kt:state", handleState);
  }, []);

  const backTarget = `/${username}/army`;
  const backState = {
    ...(slot ? { slot } : {}),
    ...(gameCode ? { gameCode } : {}),
  };

  const resolvedAttackerId =
    attackerId ||
    gameState?.ui?.actionFlow?.attackerId ||
    gameState?.firefight?.activeOperativeId ||
    null;

  const attacker = useMemo(() => {
    if (!gameState?.game) return null;
    if (resolvedAttackerId) {
      const direct = gameState.game.find((unit) => unit.id === resolvedAttackerId) || null;
      if (direct) return direct;
    }
    const slotTeamId = slot === "B" ? "beta" : "alpha";
    return gameState.game.find((unit) => unit.teamId === slotTeamId) || null;
  }, [gameState, resolvedAttackerId, slot]);

  const targets = useMemo(() => {
    if (!gameState?.game || !attacker?.teamId) return [];
    return gameState.game.filter((unit) => unit.teamId !== attacker.teamId);
  }, [gameState, attacker]);

  const [primaryTargetId, setPrimaryTargetId] = useState(null);
  const [secondaryTargetIds, setSecondaryTargetIds] = useState([]);

  const selectedWeaponName =
    attacker?.state?.selectedWeapon || attacker?.weapons?.[0]?.name;
  const selectedWeapon =
    attacker?.weapons?.find((w) => w.name === selectedWeaponName) ||
    attacker?.weapons?.[0] ||
    null;

  const hasBlast = useMemo(() => {
    if (!selectedWeapon) return false;
    return normalizeWeaponRules(selectedWeapon).some((rule) => rule.id === "blast");
  }, [selectedWeapon]);

  const dispatchGameEvent = (type, payload = {}) => {
    if (typeof window !== "undefined" && typeof window.ktDispatchGameEvent === "function") {
      window.ktDispatchGameEvent(type, payload);
    }
  };

  const handleClose = () => {
    if (mode === "shoot" || mode === "fight") {
      dispatchGameEvent("FLOW_CANCEL");
    }
    navigate(backTarget, { state: backState });
  };

  const handleConfirm = () => {
    if (!primaryTargetId) return;
    if (mode === "fight") {
      dispatchGameEvent("FLOW_SET_TARGET", { defenderId: primaryTargetId });
      navigate(backTarget, { state: backState });
      return;
    }

    dispatchGameEvent("FLOW_SET_TARGET", {
      defenderId: primaryTargetId,
      primaryTargetId,
      secondaryTargetIds,
    });

    navigate(backTarget, { state: backState });
  };

  const confirmLabel = mode === "fight" ? "Fight" : "Shoot";
  const weaponMode = mode === "fight" ? "melee" : "ranged";

  return (
    <div data-testid="target-select-screen">
      <TargetSelectModal
        open={true}
        attacker={attacker}
        targets={targets}
        primaryTargetId={primaryTargetId}
        secondaryTargetIds={secondaryTargetIds}
        allowSecondarySelection={mode === "shoot" && hasBlast}
        confirmLabel={confirmLabel}
        weaponMode={weaponMode}
        onSelectPrimary={(id) => {
          setPrimaryTargetId(id);
          setSecondaryTargetIds([]);
        }}
        onToggleSecondary={(id) => {
          setSecondaryTargetIds((prev) =>
            prev.includes(id)
              ? prev.filter((entry) => entry !== id)
              : [...prev, id],
          );
        }}
        onClose={handleClose}
        onConfirm={handleConfirm}
      />
    </div>
  );
}

export default TargetSelectScreen;
