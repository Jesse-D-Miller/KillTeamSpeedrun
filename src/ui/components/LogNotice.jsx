import "./LogNotice.css";

function LogNotice({ summary = "", label = "Latest log" }) {
  return (
    <div className="kt-notice">
      <span className="kt-notice__label">{label}</span>
      <span className="kt-notice__text">{summary || "No log entries yet"}</span>
    </div>
  );
}

export default LogNotice;
