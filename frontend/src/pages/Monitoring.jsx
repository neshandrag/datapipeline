import { useEffect, useState } from "react";
import API from "../api";
import { usePersistentState, cacheKey } from "../hooks/usePersistentState";

const safeNum = (v, d = 2) => (v == null || isNaN(v)) ? "—" : Number(v).toFixed(d);

const stageBadge = (stage) => {
  if (stage === "Production") return "badge-green";
  if (stage === "Staging")    return "badge-yellow";
  if (stage === "Archived")   return "badge-gray";
  return "badge-gray";
};

export default function Monitoring() {
  const [stats,   setStats]   = usePersistentState(cacheKey("monitoring:stats"), null);
  const [models,  setModels]  = usePersistentState(cacheKey("monitoring:models"), null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const load = async () => {
    try {
      const [statsRes, registryRes] = await Promise.all([
        API.get("/monitoring/stats"),
        API.get("/registry/models"),
      ]);
      setStats(statsRes.data);
      setModels(registryRes.data.models);
      setError("");
    } catch (e) {
      setError(e.response?.data?.detail || e.message || "Failed to load monitoring stats.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Monitoring</h1>
        <p>Live platform metrics, plus MLflow experiment tracking for all preprocessing runs.</p>
      </div>

      {error && <div className="alert alert-error mb2">{error}</div>}

      {loading && !stats && <div className="loading-state">Loading stats…</div>}

      {stats && (
        <div className="section">
          <div className="section-title">Platform Metrics</div>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.upload_count}</div>
              <div className="stat-label">Upload Count</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: stats.failure_count > 0 ? "var(--yellow)" : "var(--green)" }}>
                {stats.failure_count}
              </div>
              <div className="stat-label">Failure Count</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: "var(--green)" }}>
                {safeNum(stats.average_quality_score)}{stats.average_quality_score != null ? "%" : ""}
              </div>
              <div className="stat-label">Avg Quality Score</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{safeNum(stats.average_repair_time_seconds, 2)}s</div>
              <div className="stat-label">Avg Repair Time</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{safeNum(stats.average_processing_time_seconds, 2)}s</div>
              <div className="stat-label">Avg Processing Time</div>
            </div>
          </div>

          <div className="section-title">Recent Activity</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Type</th><th>File</th><th>Status</th><th>Duration</th><th>Quality</th><th>When</th></tr>
              </thead>
              <tbody>
                {stats.recent_events.length === 0 && (
                  <tr><td colSpan={6} className="text-muted">No activity yet — upload a dataset to get started.</td></tr>
                )}
                {stats.recent_events.map((e, i) => (
                  <tr key={i}>
                    <td className="mono text-xs">{e.event_type}</td>
                    <td>{e.filename || "—"}</td>
                    <td>
                      <span className={`badge ${e.status === "success" ? "badge-green" : "badge-yellow"}`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="text-muted text-xs">{safeNum(e.duration_seconds, 3)}s</td>
                    <td className="text-muted text-xs">{e.quality_score != null ? `${safeNum(e.quality_score)}%` : "—"}</td>
                    <td className="text-muted text-xs">{new Date(e.created_at * 1000).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {models && (
        <div className="section">
          <div className="section-title">Model Registry</div>
          {models.length === 0 && (
            <p className="text-muted text-sm">
              No models registered yet — run a repair (or trigger a drift-driven auto-retrain) to register the first version.
            </p>
          )}
          {models.map((model) => (
            <div key={model.name} className="table-wrap mb1">
              <table>
                <thead>
                  <tr><th colSpan={3}>{model.name}</th></tr>
                  <tr><th>Version</th><th>Stage</th><th>Run ID</th></tr>
                </thead>
                <tbody>
                  {model.versions.map((v) => (
                    <tr key={v.version}>
                      <td>v{v.version}</td>
                      <td><span className={`badge ${stageBadge(v.stage)}`}>{v.stage}</span></td>
                      <td className="mono text-xs text-muted">{v.run_id?.slice(0, 12) || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <div className="card card-md mb2 mt2">
        <div className="section-title mb1">Start MLflow UI</div>
        <p className="mb1">For full experiment/run detail (params, metrics, artifacts, registered models), run this in a new terminal from the backend folder:</p>
        <div className="code-block">
          cd backend{"\n"}
          venv\Scripts\activate{"\n"}
          mlflow ui --backend-store-uri sqlite:///mlflow.db --workers 1
        </div>
        <p className="mt1 text-sm">
          Then open:{" "}
          <a href="http://localhost:5000" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
            http://localhost:5000
          </a>
        </p>
      </div>

      <div className="section">
        <div className="section-title">What Gets Tracked Per Run</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Category</th><th>Metrics / Parameters</th></tr></thead>
            <tbody>
              {[
                ["Dataset",        "dataset_name, rows_before, rows_after"],
                ["Missing Values", "numerical_imputed count, categorical_imputed count"],
                ["Duplicates",     "duplicates_found, duplicates_removed"],
                ["Outliers",       "outliers_detected, strategy used"],
                ["Redundant Columns", "redundant_columns_removed (constant / near-constant / duplicate)"],
                ["Label Errors",   "label_errors_found, target_column"],
                ["Quality Before", "completeness, uniqueness, validity, consistency, overall"],
                ["Quality After",  "completeness, uniqueness, validity, consistency, overall"],
                ["Performance",    "quality_improvement, execution_time_seconds"],
                ["Registered Models", "KNNImputer / IsolationForest — versioned + staged per run"],
                ["Artifacts",      "cleaned_dataset.csv, PDF report"],
              ].map(([cat, items]) => (
                <tr key={cat}>
                  <td><strong>{cat}</strong></td>
                  <td className="text-muted text-xs">{items}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section">
        <div className="section-title">Configuration</div>
        <div className="table-wrap">
          <table>
            <tbody>
              <tr><td className="text-muted">Experiment name</td><td><code>Dataset-Repair-Pipeline</code></td></tr>
              <tr><td className="text-muted">Backend store</td><td><code>sqlite:///mlflow.db</code></td></tr>
              <tr><td className="text-muted">Location</td><td><code>backend/mlflow.db</code></td></tr>
              <tr><td className="text-muted">Platform metrics store</td><td><code>backend/monitoring.db</code></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
