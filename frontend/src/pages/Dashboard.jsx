import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api";
import { FileIcon } from "../components/NavIcons";
import { usePersistentState, cacheKey, clearPersistedState } from "../hooks/usePersistentState";

const safeNum = (v, d = 2) => (v == null || isNaN(v)) ? "—" : Number(v).toFixed(d);

export default function Dashboard() {
  const navigate     = useNavigate();
  const [online,     setOnline]  = useState(null);
  const [stats,      setStats]   = usePersistentState(cacheKey("monitoring:stats"), null);
  const uploadedFile = localStorage.getItem("uploadedFile");

  useEffect(() => {
    API.get("/").then(() => setOnline(true)).catch(() => setOnline(false));
    API.get("/monitoring/stats").then((res) => setStats(res.data)).catch(() => {});
  }, []);

  const steps = [
    { step: "01", label: "Upload Dataset",   desc: "Upload a CSV file to begin",       route: "/upload",     done: !!uploadedFile },
    { step: "02", label: "Analyse & Prep",   desc: "Profile, clean, and score quality", route: "/analysis",   done: !!uploadedFile },
    { step: "03", label: "AI Model Trainer", desc: "Configure and train predictors",    route: "/ai-trainer", done: false },
    { step: "04", label: "Monitor",          desc: "Track runs, drift, and models",     route: "/monitoring", done: false },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Clean data, train models, and ship predictions — in one place.</p>
      </div>

      {/* Status row */}
      <div className="dashboard-status-row">
        <div className={`status-pill status-pill-${online === null ? "pending" : online ? "online" : "offline"}`}>
          <span className="status-dot" />
          {online === null && "Connecting to backend…"}
          {online === true  && <>Backend Connected <span className="status-pill-sub">127.0.0.1:8000</span></>}
          {online === false && "Backend offline — start uvicorn on :8000"}
        </div>

        {uploadedFile && (
          <div className="file-chip">
            <FileIcon size={13} />
            <span className="file-chip-name">{uploadedFile}</span>
            <button
              className="file-chip-clear"
              onClick={() => {
                localStorage.removeItem("uploadedFile");
                clearPersistedState();
                window.location.reload();
              }}
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Monitoring snapshot */}
      {stats && (
        <div className="section mt2">
          <div className="flex-between mb1">
            <div className="section-title" style={{ marginBottom: 0 }}>Monitoring</div>
            <span className="text-accent" style={{ cursor: "pointer", fontSize: "0.8rem" }} onClick={() => navigate("/monitoring")}>
              View details →
            </span>
          </div>
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
              <div className="stat-value">{safeNum(stats.average_repair_time_seconds)}s</div>
              <div className="stat-label">Avg Repair Time</div>
            </div>
          </div>
        </div>
      )}

      {/* Pipeline */}
      <div className="section mt2">
        <div className="section-title">Pipeline</div>
        <div className="grid2" style={{ gap: "0.75rem" }}>
          {steps.map((s) => (
            <div
              key={s.step}
              className="card"
              style={{ cursor: "pointer", borderColor: s.done ? "var(--green)" : "var(--border)" }}
              onClick={() => navigate(s.route)}
            >
              <div className="flex-between mb1">
                <span className="text-xs text-muted mono">STEP {s.step}</span>
                <span className={`badge ${s.done ? "badge-green" : "badge-gray"}`}>
                  {s.done ? "Ready" : "Pending"}
                </span>
              </div>
              <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.2rem" }}>{s.label}</div>
              <div className="text-sm text-muted">{s.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="section">
        <div className="section-title">Quick Actions</div>
        <div className="flex-row flex-wrap">
          <button className="btn btn-primary" onClick={() => navigate("/upload")}>
            {uploadedFile ? "Upload New File" : "Upload Dataset"}
          </button>
          {uploadedFile && (
            <button className="btn btn-secondary" onClick={() => navigate("/analysis")}>
              View Analysis
            </button>
          )}
          {uploadedFile && (
            <button className="btn btn-secondary" onClick={() => navigate("/repair")}>
              Run Preprocessing
            </button>
          )}
          {uploadedFile && (
            <button className="btn btn-secondary" onClick={() => navigate("/ai-trainer")}>
              AI Model Trainer
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => navigate("/monitoring")}>
            MLflow Runs
          </button>
        </div>
      </div>

      {/* Endpoints reference */}
      <div className="section">
        <div className="section-title">API Reference</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Method</th><th>Endpoint</th><th>Description</th></tr>
            </thead>
            <tbody>
              {[
                ["POST", "/upload",               "Upload and validate a CSV file"],
                ["GET",  "/profile/{file}",        "Statistical profiling of the dataset"],
                ["POST", "/repair/{file}",         "Full preprocessing pipeline"],
                ["GET",  "/quality/{file}",        "Quality score before and after"],
                ["POST", "/report/{file}",         "Generate PDF and JSON report"],
                ["GET",  "/report/download/pdf",   "Download PDF report"],
                ["GET",  "/report/download/csv",   "Download cleaned dataset"],
              ].map(([m, e, d]) => (
                <tr key={e}>
                  <td><span className={`badge ${m === "POST" ? "badge-yellow" : "badge-blue"}`}>{m}</span></td>
                  <td><code>{e}</code></td>
                  <td className="text-muted">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt1 text-sm">
          Interactive docs:{" "}
          <a href="http://127.0.0.1:8000/docs" target="_blank" rel="noreferrer"
             style={{ color: "var(--accent)" }}>
            http://127.0.0.1:8000/docs
          </a>
        </p>
      </div>
    </div>
  );
}
