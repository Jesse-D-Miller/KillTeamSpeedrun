import { useLocation, useNavigate, useParams } from "react-router-dom";
import "./UnitCardFocused.css";
import UnitCard from "../components/UnitCard";
import TopBar from "../components/TopBar";
import LogNotice from "../components/LogNotice";

function UnitCardFocused() {
  const navigate = useNavigate();
  const location = useLocation();
  const { username } = useParams();
  const unit = location.state?.unit || null;
  const slot = location.state?.slot || null;
  const gameCode = location.state?.gameCode || null;
  const topBar = location.state?.topBar || {};
  const latestLogSummary = location.state?.latestLogSummary || "";

  const backTarget = `/${username}/army`;
  const backState = {
    ...(slot ? { slot } : {}),
    ...(gameCode ? { gameCode } : {}),
  };

  if (!unit) {
    return (
      <div className="unit-card-focused">
        <div className="unit-card-focused__panel">
          <div className="unit-card-focused__empty">No unit selected.</div>
          <button
            className="unit-card-focused__back"
            type="button"
            onClick={() =>
              navigate(username ? backTarget : "/", {
                state: backState,
              })
            }
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="unit-card-focused">
      <div className="unit-card-focused__panel">
        <div className="unit-card-focused__header">
          <TopBar
            cp={topBar.cp ?? 0}
            vp={topBar.vp ?? 0}
            turningPoint={topBar.turningPoint ?? 0}
            phase={topBar.phase ?? "SETUP"}
            initiativePlayerId={topBar.initiativePlayerId ?? null}
          />
          <LogNotice summary={latestLogSummary} />
          <div className="unit-card-focused__actions">
            <button
              className="unit-card-focused__back"
              type="button"
              onClick={() =>
                navigate(backTarget, {
                  state: backState,
                })
              }
            >
              Back to army
            </button>
          </div>
        </div>
        <div className="unit-card-focused__card">
          <UnitCard unit={unit} dispatch={() => {}} canChooseOrder={false} />
        </div>
      </div>
    </div>
  );
}

export default UnitCardFocused;
