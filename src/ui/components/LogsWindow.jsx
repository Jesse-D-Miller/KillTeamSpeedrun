import "./LogsWindow.css";

function LogsWindow({ entries, cursor, onUndo, onRedo }) {
  const canUndo = cursor > 0;
  const canRedo = cursor < entries.length;
  const visibleEntries = [...entries].reverse();

  return (
    <div className="kt-log">
      <div className="kt-log__actions">
        <button
          className="kt-log__btn"
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
        >
          Undo
        </button>
        <button
          className="kt-log__btn"
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
        >
          Redo
        </button>
      </div>

      <div className="kt-log__list">
        {visibleEntries.length === 0 ? (
          <div className="kt-log__empty">No log entries yet</div>
        ) : (
          visibleEntries.map((entry) => (
            <div key={entry.id} className="kt-log__item">
              <div className="kt-log__summary">{entry.summary}</div>
              <div className="kt-log__meta">{entry.type}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default LogsWindow;
