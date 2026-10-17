import { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api";
import { usePersistentState, cacheKey } from "../hooks/usePersistentState";

export default function RepairResult() {
  const navigate = useNavigate();
  const filename = localStorage.getItem("uploadedFile");
  const [strategy, setStrategy] = usePersistentState(cacheKey("repair:strategy", filename), "clip");
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = usePersistentState(cacheKey("repair", filename), null);
  const [error,    setError]    = useState("");

  if (!filename) {
    return (
      <div>
        <div className="page-header"><h1>Preprocessing</h1></div>
        <div className="alert alert-error">
          No file uploaded.{" "}
          <span className="text-accent" style={{ cursor: "pointer" }} onClick={() => navigate("/upload")}>Upload a file first.</span>
        </div>
      </div>
    );
  }

  const run = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await API.post(`/repair/${filename}?outlier_strategy=${strategy}`);
      setResult(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || e.message || "Preprocessing failed.");
    } finally {
      setLoading(false);
    }
  };

  const statusBadge = (count, zero = "None detected") =>
    count > 0
      ? <span className="badge badge-yellow">{count}</span>
      : <span className="badge badge-green">{zero}</span>;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Preprocessing</h1>
            <p>Full ML-ready cleaning pipeline for <strong style={{ color: "var(--accent)" }}>{filename}</strong></p>
          </div>
        </div>
      </div>

      {/* Config */}
      <div className="card card-md mb2">
        <div className="section-title mb1">Pipeline Configuration</div>
        <div className="form-group">
          <label htmlFor="strategy">Outlier handling strategy</label>
          <select id="strategy" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            <option value="clip">Clip to IQR bounds (recommended — preserves all rows)</option>
            <option value="remove">Remove outlier rows using Isolation Forest</option>
            <option value="flag">Flag outliers and keep rows</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={run} disabled={loading}>
          {loading ? "Running pipeline..." : "Run Preprocessing Pipeline"}
        </button>
      </div>

      {loading && (
        <div className="loading-state">
          Running preprocessing pipeline. This may take 30–90 seconds depending on dataset size...
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {result && !loading && (() => {
        const r = result.result;
        const audit = r?.audit;
        return (
          <>
            <div className="alert alert-success">Preprocessing complete. Dataset is ready for model training.</div>

            {/* Shape summary */}
            <div className="stat-grid mt1">
              <div className="stat-card">
                <div className="stat-value">{r.original_shape.rows.toLocaleString()}</div>
                <div className="stat-label">Original Rows</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: "var(--green)" }}>{r.cleaned_shape.rows.toLocaleString()}</div>
                <div className="stat-label">Cleaned Rows</div>
                {r.rows_removed > 0 && <div className="stat-sub text-yellow">−{r.rows_removed} removed</div>}
              </div>
              <div className="stat-card">
                <div className="stat-value">{r.original_shape.columns}</div>
                <div className="stat-label">Original Columns</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: "var(--green)" }}>{r.cleaned_shape.columns}</div>
                <div className="stat-label">Cleaned Columns</div>
                {r.columns_removed > 0 && <div className="stat-sub text-yellow">−{r.columns_removed} removed</div>}
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: "var(--green)" }}>{result.quality_after}%</div>
                <div className="stat-label">Quality After</div>
                <div className="stat-sub">was {result.quality_before}%</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: "var(--green)" }}>+{result.improvement}%</div>
                <div className="stat-label">Improvement</div>
              </div>
            </div>

            {/* Audit log */}
            {audit && (
              <div className="section mt2">
                <div className="section-title">Preprocessing Audit Log</div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Step</th><th>Action</th><th>Result</th></tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Structure</td>
                        <td>Column name cleanup, empty row/column removal</td>
                        <td>
                          {audit.structure?.empty_columns_dropped?.length > 0
                            ? <span className="badge badge-yellow">{audit.structure.empty_columns_dropped.length} empty columns dropped</span>
                            : <span className="badge badge-green">No issues</span>}
                          {audit.structure?.empty_rows_dropped > 0 &&
                            <span className="badge badge-yellow ml">{audit.structure.empty_rows_dropped} empty rows dropped</span>}
                        </td>
                      </tr>
                      <tr>
                        <td>Type inference</td>
                        <td>Auto-cast string columns to numeric or boolean</td>
                        <td>
                          {Object.keys(audit.type_inference?.type_changes || {}).length > 0
                            ? <span className="badge badge-blue">{Object.keys(audit.type_inference.type_changes).length} columns recast</span>
                            : <span className="badge badge-green">All types correct</span>}
                        </td>
                      </tr>
                      <tr>
                        <td>Duplicates</td>
                        <td>Exact duplicate row removal</td>
                        <td>{statusBadge(audit.duplicates?.duplicates_removed || 0, "None found")}</td>
                      </tr>
                      <tr>
                        <td>Missing values</td>
                        <td>KNN imputation (numeric) + Most-frequent (categorical)</td>
                        <td>
                          {(audit.missing_values?.numerical_imputed?.length > 0 || audit.missing_values?.categorical_imputed?.length > 0)
                            ? <span className="badge badge-yellow">
                                {audit.missing_values.numerical_imputed.length + audit.missing_values.categorical_imputed.length} columns imputed
                              </span>
                            : <span className="badge badge-green">No missing values</span>}
                          {audit.missing_values?.columns_dropped?.length > 0 &&
                            <span className="badge badge-red" style={{ marginLeft: "0.4rem" }}>
                              {audit.missing_values.columns_dropped.length} sparse columns dropped
                            </span>}
                        </td>
                      </tr>
                      <tr>
                        <td>Outliers</td>
                        <td>Strategy: {r.outlier_strategy}</td>
                        <td>
                          {audit.outliers?.columns_clipped?.length > 0
                            ? <span className="badge badge-yellow">{audit.outliers.columns_clipped.length} columns clipped</span>
                            : audit.outliers?.rows_removed > 0
                              ? <span className="badge badge-yellow">{audit.outliers.rows_removed} rows removed</span>
                              : audit.outliers?.outliers_flagged > 0
                                ? <span className="badge badge-yellow">{audit.outliers.outliers_flagged} rows flagged</span>
                                : <span className="badge badge-green">None detected</span>}
                        </td>
                      </tr>
                      <tr>
                        <td>Low variance</td>
                        <td>Constant and near-constant column removal</td>
                        <td>
                          {(audit.low_variance?.constant_columns_dropped?.length > 0 || audit.low_variance?.near_constant_dropped?.length > 0)
                            ? <span className="badge badge-yellow">
                                {(audit.low_variance.constant_columns_dropped?.length || 0) + (audit.low_variance.near_constant_dropped?.length || 0)} columns removed
                              </span>
                            : <span className="badge badge-green">None found</span>}
                        </td>
                      </tr>
                      <tr>
                        <td>Duplicate columns</td>
                        <td>Identical column detection and removal</td>
                        <td>
                          {audit.duplicate_columns?.duplicate_columns_dropped?.length > 0
                            ? <span className="badge badge-yellow">{audit.duplicate_columns.duplicate_columns_dropped.length} removed</span>
                            : <span className="badge badge-green">None found</span>}
                        </td>
                      </tr>
                      <tr>
                        <td>Label quality</td>
                        <td>CleanLab label error detection</td>
                        <td>
                          {audit.label_errors?.skipped
                            ? <span className="badge badge-gray">{audit.label_errors.reason}</span>
                            : audit.label_errors?.label_errors_found > 0
                              ? <span className="badge badge-yellow">
                                  {audit.label_errors.label_errors_found} suspicious labels in &ldquo;{audit.label_errors.target_column}&rdquo;
                                </span>
                              : <span className="badge badge-green">No label errors</span>}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Type changes detail */}
            {audit?.type_inference && Object.keys(audit.type_inference.type_changes || {}).length > 0 && (
              <div className="section">
                <div className="section-title">Type Inference Details</div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Column</th><th>Change</th></tr></thead>
                    <tbody>
                      {Object.entries(audit.type_inference.type_changes).map(([col, change]) => (
                        <tr key={col}>
                          <td><strong>{col}</strong></td>
                          <td><code>{change}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* MLflow */}
            {result.mlflow && result.mlflow.run_id !== "error" && (
              <div className="card mt1">
                <div className="section-title mb1">MLflow Run</div>
                <div className="table-wrap">
                  <table>
                    <tbody>
                      <tr><td className="text-muted">Run ID</td><td><code>{result.mlflow.run_id}</code></td></tr>
                      <tr><td className="text-muted">Experiment</td><td>{result.mlflow.experiment}</td></tr>
                      <tr><td className="text-muted">Execution time</td><td>{result.mlflow.execution_time}s</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex-row mt2">
              <button className="btn btn-primary" onClick={() => navigate("/quality")}>
                View Quality Report
              </button>
              <button className="btn btn-secondary" onClick={() => navigate("/analysis")}>
                Back to Analysis
              </button>
            </div>
          </>
        );
      })()}
    </div>
  );
}
