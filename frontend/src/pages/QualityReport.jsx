import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api";
import { usePersistentState, cacheKey } from "../hooks/usePersistentState";

const scoreColor = (s) => s >= 90 ? "var(--green)" : s >= 75 ? "var(--accent)" : s >= 60 ? "var(--yellow)" : "var(--red)";
const scoreBarClass = (s) => s >= 90 ? "progress-green" : s >= 75 ? "progress-blue" : s >= 60 ? "progress-yellow" : "progress-red";

export default function QualityReport() {
  const navigate  = useNavigate();
  const filename  = localStorage.getItem("uploadedFile");
  const [data,    setData]    = usePersistentState(cacheKey("quality", filename), null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  useEffect(() => {
    if (!filename) { setError("No file uploaded."); return; }
    if (data) return;
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await API.get(`/quality/${filename}`);
      setData(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || e.message || "Failed to load quality data.");
    } finally {
      setLoading(false);
    }
  };

  const download = (type) => {
    const base = filename.replace(".csv", "");
    const map  = {
      pdf:  { url: `/report/download/pdf/${filename}`,  name: `${base}_report.pdf` },
      json: { url: `/report/download/json/${filename}`, name: `${base}_summary.json` },
      csv:  { url: `/report/download/csv/${filename}`,  name: `${base}_cleaned.csv` },
    };
    const a = document.createElement("a");
    a.href     = `http://127.0.0.1:8000${map[type].url}`;
    a.download = map[type].name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!filename) {
    return (
      <div>
        <div className="page-header"><h1>Quality Report</h1></div>
        <div className="alert alert-error">
          No file uploaded.{" "}
          <span className="text-accent" style={{ cursor: "pointer" }} onClick={() => navigate("/upload")}>Upload a file first.</span>
        </div>
      </div>
    );
  }

  const metrics = [
    { key: "completeness", label: "Completeness", weight: "30%", desc: "Cells with non-null values" },
    { key: "uniqueness",   label: "Uniqueness",   weight: "25%", desc: "Rows without duplicates" },
    { key: "validity",     label: "Validity",     weight: "25%", desc: "Values within expected ranges" },
    { key: "consistency",  label: "Consistency",  weight: "20%", desc: "Uniform column data types" },
  ];

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Quality Report</h1>
            <p>Data quality scores for <strong style={{ color: "var(--accent)" }}>{filename}</strong></p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>Refresh</button>
        </div>
      </div>

      {loading && <div className="loading-state">Calculating quality scores...</div>}
      {error   && <div className="alert alert-error">{error}</div>}

      {data && !loading && (() => {
        const before   = data.before;
        const after    = data.after;
        const hasAfter = !!after;

        return (
          <>
            {/* Overall score */}
            <div className={`grid2 mb2`} style={{ gap: "1rem" }}>
              <div className="card">
                <div className="section-title mb1">Before Preprocessing</div>
                <div style={{ fontSize: "3rem", fontWeight: 700, color: scoreColor(before.overall_score), lineHeight: 1 }}>
                  {before.overall_score}%
                </div>
                <div className="text-muted text-sm mt1">Grade: <strong>{before.grade}</strong></div>
                <div className="progress mt1">
                  <div className={`progress-bar ${scoreBarClass(before.overall_score)}`}
                       style={{ width: `${before.overall_score}%` }} />
                </div>
                <div className="mt2">
                  {metrics.map(({ key, label }) => {
                    const v = before.individual_scores[key];
                    return (
                      <div key={key} style={{ marginBottom: "0.6rem" }}>
                        <div className="flex-between text-xs mb1">
                          <span className="text-muted">{label}</span>
                          <span style={{ color: scoreColor(v) }}>{v}%</span>
                        </div>
                        <div className="progress">
                          <div className={`progress-bar ${scoreBarClass(v)}`} style={{ width: `${v}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {hasAfter ? (
                <div className="card" style={{ borderColor: "var(--green)" }}>
                  <div className="section-title mb1">After Preprocessing</div>
                  <div style={{ fontSize: "3rem", fontWeight: 700, color: scoreColor(after.overall_score), lineHeight: 1 }}>
                    {after.overall_score}%
                  </div>
                  <div className="flex-row mt1">
                    <span className="text-muted text-sm">Grade: <strong>{after.grade}</strong></span>
                    {data.improvement > 0 &&
                      <span className="badge badge-green">+{data.improvement}%</span>}
                  </div>
                  <div className="progress mt1">
                    <div className={`progress-bar ${scoreBarClass(after.overall_score)}`}
                         style={{ width: `${after.overall_score}%` }} />
                  </div>
                  <div className="mt2">
                    {metrics.map(({ key, label }) => {
                      const v = after.individual_scores[key];
                      return (
                        <div key={key} style={{ marginBottom: "0.6rem" }}>
                          <div className="flex-between text-xs mb1">
                            <span className="text-muted">{label}</span>
                            <span style={{ color: scoreColor(v) }}>{v}%</span>
                          </div>
                          <div className="progress">
                            <div className={`progress-bar ${scoreBarClass(v)}`} style={{ width: `${v}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.75rem" }}>
                  <p style={{ textAlign: "center" }}>Run preprocessing to see the quality improvement.</p>
                  <button className="btn btn-primary" onClick={() => navigate("/repair")}>Run Preprocessing</button>
                </div>
              )}
            </div>

            {/* Breakdown table */}
            {hasAfter && (
              <div className="section">
                <div className="section-title">Score Breakdown</div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Metric</th><th>Weight</th><th>Description</th><th>Before</th><th>After</th><th>Change</th></tr>
                    </thead>
                    <tbody>
                      {metrics.map(({ key, label, weight, desc }) => {
                        const b    = before.individual_scores[key];
                        const a    = after.individual_scores[key];
                        const diff = parseFloat((a - b).toFixed(2));
                        return (
                          <tr key={key}>
                            <td><strong>{label}</strong></td>
                            <td><span className="badge badge-gray">{weight}</span></td>
                            <td className="text-muted text-xs">{desc}</td>
                            <td style={{ color: scoreColor(b) }}>{b}%</td>
                            <td style={{ color: scoreColor(a) }}>{a}%</td>
                            <td>
                              <span className={`badge ${diff > 0 ? "badge-green" : diff < 0 ? "badge-red" : "badge-gray"}`}>
                                {diff > 0 ? "+" : ""}{diff}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      <tr>
                        <td><strong>Overall</strong></td>
                        <td><span className="badge badge-gray">100%</span></td>
                        <td className="text-muted text-xs">Weighted average</td>
                        <td style={{ color: scoreColor(before.overall_score) }}><strong>{before.overall_score}%</strong></td>
                        <td style={{ color: scoreColor(after.overall_score) }}><strong>{after.overall_score}%</strong></td>
                        <td>
                          <span className={`badge ${data.improvement > 0 ? "badge-green" : "badge-gray"}`}>
                            {data.improvement > 0 ? "+" : ""}{data.improvement}%
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Downloads */}
            <div className="card mt1">
              <div className="section-title mb1">Downloads</div>
              <p className="mb2">
                {hasAfter
                  ? "The preprocessed dataset and quality report are ready."
                  : "Run preprocessing first to generate the cleaned dataset and PDF report."}
              </p>
              <div className="flex-row flex-wrap">
                {hasAfter && (
                  <>
                    <button className="btn btn-primary" onClick={() => download("csv")}>
                      Download Cleaned Dataset
                    </button>
                    <button className="btn btn-secondary" onClick={() => download("pdf")}>
                      Download PDF Report
                    </button>
                    <button className="btn btn-ghost" onClick={() => download("json")}>
                      Download JSON Summary
                    </button>
                  </>
                )}
                {!hasAfter && (
                  <button className="btn btn-primary" onClick={() => navigate("/repair")}>
                    Run Preprocessing
                  </button>
                )}
              </div>
            </div>

            <div className="flex-row mt2">
              <button className="btn btn-secondary" onClick={() => navigate("/repair")}>Back to Preprocessing</button>
              <button className="btn btn-ghost" onClick={() => navigate("/monitoring")}>View MLflow</button>
            </div>
          </>
        );
      })()}
    </div>
  );
}
