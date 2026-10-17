import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api";
import { usePersistentState, cacheKey } from "../hooks/usePersistentState";

const scoreColor = (v) => v >= 90 ? "var(--green)" : v >= 60 ? "var(--yellow)" : "var(--red)";
const safeNum = (v, d = 4) => (v == null || isNaN(v)) ? "—" : Number(v).toFixed(d);

export default function Analysis() {
  const navigate  = useNavigate();
  const filename  = localStorage.getItem("uploadedFile");
  const [data,    setData]    = usePersistentState(cacheKey("analysis", filename), null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  useEffect(() => {
    if (!filename) { setError("No file uploaded yet."); return; }
    if (data) return;
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await API.get(`/profile/${filename}`);
      setData(res.data.profile);
    } catch (e) {
      setError(e.response?.data?.detail || e.message || "Profiling failed.");
    } finally {
      setLoading(false);
    }
  };

  if (!filename) {
    return (
      <div>
        <div className="page-header"><h1>Analysis</h1></div>
        <div className="alert alert-error">
          No file uploaded.{" "}
          <span className="text-accent" style={{ cursor: "pointer" }} onClick={() => navigate("/upload")}>
            Upload a file to continue.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Analysis</h1>
            <p>Statistical profile of <strong style={{ color: "var(--accent)" }}>{filename}</strong></p>
          </div>
          <div className="flex-row">
            <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
              Refresh
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => navigate("/repair")}>
              Run Preprocessing
            </button>
          </div>
        </div>
      </div>

      {loading && <div className="loading-state">Loading profile...</div>}
      {error && (
        <div className="alert alert-error">
          {error}
          <div className="mt1">
            <button className="btn btn-secondary btn-sm" onClick={() => navigate("/upload")}>Back to Upload</button>
          </div>
        </div>
      )}

      {data && !loading && (() => {
        const b  = data.basic_info;
        const mv = data.missing_values;
        const d  = data.duplicates;
        const ns = data.numerical_stats   || {};
        const cs = data.categorical_stats || {};
        const cr = data.correlation_matrix || {};

        return (
          <>
            {/* Overview */}
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-value">{b.rows.toLocaleString()}</div>
                <div className="stat-label">Rows</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{b.columns}</div>
                <div className="stat-label">Columns</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{b.numerical_columns.length}</div>
                <div className="stat-label">Numerical</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{b.categorical_columns.length}</div>
                <div className="stat-label">Categorical</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: mv.total_missing > 0 ? "var(--yellow)" : "var(--green)" }}>
                  {mv.total_missing.toLocaleString()}
                </div>
                <div className="stat-label">Missing Values</div>
                <div className="stat-sub">{mv.total_missing_percent}% of cells</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: d.duplicate_rows > 0 ? "var(--yellow)" : "var(--green)" }}>
                  {d.duplicate_rows.toLocaleString()}
                </div>
                <div className="stat-label">Duplicate Rows</div>
                <div className="stat-sub">{d.duplicate_percent}% of rows</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{b.memory_usage_kb}</div>
                <div className="stat-label">Memory (KB)</div>
              </div>
            </div>

            {/* Column overview */}
            <div className="section">
              <div className="section-title">Column Overview</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Column</th><th>Type</th><th>Dtype</th>
                      <th>Missing</th><th>Missing %</th><th>Completeness</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(mv.per_column).map(([col, v]) => {
                      const isNum  = b.numerical_columns.includes(col);
                      const fill   = 100 - v.missing_percent;
                      const barClr = v.missing_percent === 0 ? "progress-green" : v.missing_percent < 20 ? "progress-yellow" : "progress-red";
                      return (
                        <tr key={col}>
                          <td><strong>{col}</strong></td>
                          <td><span className={`badge ${isNum ? "badge-blue" : "badge-yellow"}`}>{isNum ? "numeric" : "categorical"}</span></td>
                          <td><code>{b.dtypes[col]}</code></td>
                          <td>{v.missing_count}</td>
                          <td>{v.missing_percent}%</td>
                          <td style={{ width: 140 }}>
                            <div className="progress">
                              <div className={`progress-bar ${barClr}`} style={{ width: `${fill}%` }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Numerical stats */}
            {Object.keys(ns).length > 0 && (
              <div className="section">
                <div className="section-title">Numerical Statistics</div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Column</th><th>Mean</th><th>Median</th><th>Std Dev</th>
                        <th>Min</th><th>Max</th><th>Q1</th><th>Q3</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(ns).map(([col, s]) => (
                        <tr key={col}>
                          <td><strong>{col}</strong></td>
                          <td>{safeNum(s.mean)}</td>
                          <td>{safeNum(s.median)}</td>
                          <td>{safeNum(s.std)}</td>
                          <td>{safeNum(s.min)}</td>
                          <td>{safeNum(s.max)}</td>
                          <td>{safeNum(s.q1)}</td>
                          <td>{safeNum(s.q3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Categorical stats */}
            {Object.keys(cs).length > 0 && (
              <div className="section">
                <div className="section-title">Categorical Statistics</div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Column</th><th>Unique</th><th>Most Frequent</th>
                        <th>Count</th><th>Frequency %</th><th>Top Values</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(cs).map(([col, s]) => (
                        <tr key={col}>
                          <td><strong>{col}</strong></td>
                          <td>{s.unique_values}</td>
                          <td><code>{s.most_frequent}</code></td>
                          <td>{s.most_frequent_count}</td>
                          <td>{s.most_frequent_percent}%</td>
                          <td className="text-muted text-xs">
                            {s.value_counts
                              ? Object.entries(s.value_counts).slice(0, 5)
                                  .map(([k, v]) => `${k} (${v})`).join(", ")
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Correlation */}
            {Object.keys(cr).length > 0 && (
              <div className="section">
                <div className="section-title">Correlation Matrix</div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th></th>
                        {Object.keys(cr).map((c) => <th key={c}>{c}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(cr).map(([row, vals]) => (
                        <tr key={row}>
                          <td><strong>{row}</strong></td>
                          {Object.values(vals).map((v, i) => {
                            if (v === null) return <td key={i} className="text-muted">—</td>;
                            const abs = Math.abs(v);
                            const bg  = v === 1 ? "var(--accent-dim)" : abs > 0.7 ? "var(--red-dim)" : abs > 0.4 ? "var(--yellow-dim)" : "transparent";
                            return (
                              <td key={i} style={{ background: bg, textAlign: "center", fontFamily: "var(--mono)", fontSize: "0.75rem" }}>
                                {v.toFixed(3)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex-row mt2">
              <button className="btn btn-primary" onClick={() => navigate("/repair")}>
                Run Preprocessing
              </button>
              <button className="btn btn-secondary" onClick={() => navigate("/upload")}>
                Upload Different File
              </button>
            </div>
          </>
        );
      })()}
    </div>
  );
}
