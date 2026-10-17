import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api";
import { usePersistentState, cacheKey } from "../hooks/usePersistentState";

export default function AIModelTrainer() {
  const navigate   = useNavigate();
  const filename   = localStorage.getItem("uploadedFile");
  const [prompt,   setPrompt]   = usePersistentState(cacheKey("trainer:prompt", filename), "");
  const [analysis, setAnalysis] = usePersistentState(cacheKey("trainer:analysis", filename), null);
  const [training, setTraining] = useState(false);
  const [result,   setResult]   = usePersistentState(cacheKey("trainer:result", filename), null);
  const [error,    setError]    = useState("");
  const [step,     setStep]     = usePersistentState(cacheKey("trainer:step", filename), "idle"); // idle | analyzing | reviewed | training | done
  const [logs,     setLogs]     = usePersistentState(cacheKey("trainer:logs", filename), []);
  const logRef = useRef(null);

  // A request cannot survive a page change, so never restore an in-flight step.
  useEffect(() => {
    if (step === "analyzing") setStep(analysis ? "reviewed" : "idle");
    else if (step === "training") setStep(result ? "done" : "reviewed");
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const addLog = (msg) => setLogs((p) => [...p, msg]);

  // ── Step 1: Analyze project with AI ──────────────────────────────────────
  const handleAnalyze = async () => {
    if (!prompt.trim()) return;
    if (!filename) { setError("Upload a dataset first before analyzing."); return; }

    setStep("analyzing");
    setError("");
    setAnalysis(null);
    setResult(null);

    try {
      const res = await API.post("/ai/analyze", { prompt, filename });
      setAnalysis(res.data.analysis);
      setStep("reviewed");
    } catch (e) {
      setError(e.response?.data?.detail || e.message || "Analysis failed.");
      setStep("idle");
    }
  };

  // ── Step 2: Train with the config ────────────────────────────────────────
  const handleTrain = async () => {
    setStep("training");
    setTraining(true);
    setLogs([]);
    setError("");

    // Simulate live log while training runs
    const logSteps = [
      "Loading dataset...",
      `Target column: ${analysis.target_column || "None (clustering)"}`,
      `Problem type: ${analysis.problem_type}`,
      `Features selected: ${analysis.feature_columns?.length} columns`,
      analysis.handle_imbalance ? "Applying SMOTE for class imbalance..." : "Class balance check passed.",
      "Scaling features with StandardScaler...",
      "Splitting data: 80% train / 20% test...",
      ...analysis.models_to_train.map((m, i) => `Training model ${i + 1}: ${m}...`),
      "Evaluating models on test set...",
      "Selecting best model...",
      "Calculating feature importance...",
      "Saving model as .pkl...",
    ];

    let i = 0;
    const interval = setInterval(() => {
      if (i < logSteps.length) {
        addLog(logSteps[i]);
        i++;
      }
    }, 500);

    try {
      const res = await API.post("/ai/train", { filename, config: analysis });
      clearInterval(interval);

      // Flush remaining logs
      logSteps.slice(i).forEach((s) => addLog(s));
      addLog("Training complete.");

      setResult(res.data.result);
      setStep("done");
    } catch (e) {
      clearInterval(interval);
      setError(e.response?.data?.detail || e.message || "Training failed.");
      setStep("reviewed");
    } finally {
      setTraining(false);
    }
  };

  const reset = () => {
    setStep("idle");
    setPrompt("");
    setAnalysis(null);
    setResult(null);
    setError("");
    setLogs([]);
  };

  const isRegression  = analysis?.problem_type === "regression";
  const isClustering  = analysis?.problem_type === "clustering";

  const scoreColor = (v) =>
    v >= 90 ? "var(--green)" : v >= 75 ? "var(--accent)" : v >= 60 ? "var(--yellow)" : "var(--red)";

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>AI Model Trainer</h1>
            <p>Describe your project. AI will configure and train the right model for your dataset.</p>
          </div>
          {filename && <span className="badge badge-gray">Dataset: {filename}</span>}
        </div>
      </div>

      {!filename && (
        <div className="alert alert-error mb2">
          No dataset uploaded.{" "}
          <span className="text-accent" style={{ cursor: "pointer" }} onClick={() => navigate("/upload")}>
            Upload a dataset first.
          </span>
        </div>
      )}

      {error && <div className="alert alert-error mb2">{error}</div>}

      {/* ── Step 1: Describe project ─────────────────────────────────────── */}
      {(step === "idle" || step === "analyzing") && (
        <div className="card card-md mb2">
          <div className="section-title mb1">Step 1 — Describe your project</div>
          <div className="form-group">
            <label htmlFor="prompt">
              What are you building? Be specific about your goal.
            </label>
            <textarea
              id="prompt"
              rows={5}
              placeholder="e.g. I am building a healthcare application to predict whether a patient has diabetes based on their medical test results such as glucose level, BMI, age, and blood pressure."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={step === "analyzing"}
              style={{ resize: "vertical" }}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={handleAnalyze}
            disabled={!prompt.trim() || !filename || step === "analyzing"}
          >
            {step === "analyzing" ? "Analyzing project..." : "Analyze Project"}
          </button>
        </div>
      )}

      {/* ── Step 2: Show AI analysis ─────────────────────────────────────── */}
      {analysis && (step === "reviewed" || step === "training" || step === "done") && (
        <div className="card ai-response mb2">
          <div className="flex-between mb2">
            <div className="section-title" style={{ margin: 0 }}>
              Step 2 — Suggested Configuration
            </div>
            {step === "reviewed" && (
              <button className="btn btn-ghost btn-sm" onClick={reset}>Change description</button>
            )}
          </div>

          {/* Suitability banner — shown first */}
          <div className={`ai-fit-banner ${analysis.suitable === false ? "bad" : "ok"}`}>
            <div className="ai-fit-title">
              {analysis.suitable === false
                ? "This dataset is not suitable for your request"
                : "Dataset looks suitable for your request"}
            </div>
            <p>
              {analysis.suitability_summary ||
                (analysis.suitable === false
                  ? "The uploaded file does not match what you described."
                  : "Columns and samples align with your project description.")}
            </p>
            {analysis.suitable === false && analysis.mismatch_reason && (
              <p style={{ marginTop: "0.55rem" }}>{analysis.mismatch_reason}</p>
            )}

            {analysis.suitable === false && (
              <div className="ai-fit-grid">
                <div className="ai-fit-box">
                  <h4>Your dataset has</h4>
                  <ul>
                    {(analysis.dataset_has?.length
                      ? analysis.dataset_has
                      : ["Columns that do not match your described use case"]
                    ).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="ai-fit-box">
                  <h4>What you need</h4>
                  <ul>
                    {(analysis.what_you_need?.length
                      ? analysis.what_you_need
                      : ["A dataset with fields that match your prediction goal"]
                    ).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {analysis.suitable === false && step === "reviewed" && (
            <div className="flex-row flex-wrap mb2">
              <button className="btn btn-primary" onClick={() => navigate("/upload")}>
                Upload a better dataset
              </button>
              <button className="btn btn-secondary" onClick={reset}>
                Rewrite project description
              </button>
            </div>
          )}

          <div className="section-title">Training plan</div>
          <div className="ai-config-grid">
            <div className="ai-config-item">
              <div className="label">Domain</div>
              <div className="value">{analysis.domain || "—"}</div>
            </div>
            <div className="ai-config-item">
              <div className="label">Problem type</div>
              <div className="value">{analysis.problem_type?.replace(/_/g, " ") || "—"}</div>
            </div>
            <div className="ai-config-item">
              <div className="label">Target column</div>
              <div className="value">
                {analysis.target_column
                  ? <code>{analysis.target_column}</code>
                  : "None (unsupervised)"}
              </div>
            </div>
            <div className="ai-config-item">
              <div className="label">Evaluation metric</div>
              <div className="value"><code>{analysis.evaluation_metric || "—"}</code></div>
            </div>
            <div className="ai-config-item">
              <div className="label">Class imbalance</div>
              <div className="value">
                {analysis.handle_imbalance ? "Handled with SMOTE" : "Not required"}
              </div>
            </div>
            <div className="ai-config-item">
              <div className="label">Models to train</div>
              <div className="ai-chip-row">
                {(analysis.models_to_train || []).map((m) => (
                  <span key={m} className="ai-chip">{m}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="ai-config-grid" style={{ gridTemplateColumns: "1fr" }}>
            <div className="ai-config-item">
              <div className="label">Features to use</div>
              <div className="ai-chip-row">
                {(analysis.feature_columns || []).map((c) => (
                  <span key={c} className="ai-chip">{c}</span>
                ))}
                {!analysis.feature_columns?.length && <span className="text-muted text-sm">None</span>}
              </div>
            </div>
            <div className="ai-config-item">
              <div className="label">Columns to drop</div>
              <div className="ai-chip-row">
                {(analysis.drop_columns || []).map((c) => (
                  <span key={c} className="ai-chip muted">{c}</span>
                ))}
                {!analysis.drop_columns?.length && <span className="text-muted text-sm">None</span>}
              </div>
            </div>
          </div>

          {analysis.reasoning?.length > 0 && (
            <>
              <div className="section-title">Why these choices?</div>
              <div className="ai-reason-list">
                {analysis.reasoning.map((r, i) => (
                  <div key={i} className="ai-reason-item">{r}</div>
                ))}
              </div>
            </>
          )}

          {analysis.preprocessing_notes && (
            <>
              <div className="section-title">Preprocessing notes</div>
              <div className="ai-note mb2">{analysis.preprocessing_notes}</div>
            </>
          )}

          {step === "reviewed" && (
            <div className="flex-row flex-wrap">
              <button
                className="btn btn-primary"
                onClick={handleTrain}
                disabled={analysis.suitable === false}
                title={analysis.suitable === false ? "Upload a matching dataset before training" : undefined}
              >
                {analysis.suitable === false ? "Training blocked — dataset mismatch" : "Confirm and Train Model"}
              </button>
              {analysis.suitable === false && (
                <span className="text-muted text-sm">
                  Fix the mismatch above, then analyze again.
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Training log ─────────────────────────────────────────────────── */}
      {(step === "training" || step === "done") && logs.length > 0 && (
        <div className="card ai-response mb2">
          <div className="section-title mb1">Training Log</div>
          <div
            ref={logRef}
            className="code-block"
            style={{ height: 260, overflowY: "auto", lineHeight: 1.9 }}
          >
            {logs.map((line, i) => (
              <div key={i} style={{ color: line === "Training complete." ? "var(--ink-100)" : "var(--ink-200)" }}>
                {line === "Training complete." ? "✓ " : "› "}{line}
              </div>
            ))}
            {training && <div style={{ color: "var(--accent)" }}>▌</div>}
          </div>
        </div>
      )}

      {/* ── Step 3: Results ───────────────────────────────────────────────── */}
      {step === "done" && result && (
        <div className="card ai-response mb2">
          <div className="section-title mb1">Step 3 — Results</div>

          <div className="ai-note mb2">
            Best model: <strong style={{ color: "var(--ink-950)" }}>{result.best_model}</strong>
            {" — "}trained on <strong style={{ color: "var(--ink-950)" }}>{result.data_used}</strong>
          </div>

          {/* Metrics */}
          <div className="stat-grid mb2">
            {result.metrics?.accuracy != null && (
              <div className="stat-card">
                <div className="stat-value" style={{ color: scoreColor(result.metrics.accuracy) }}>
                  {result.metrics.accuracy}%
                </div>
                <div className="stat-label">Accuracy</div>
              </div>
            )}
            {result.metrics?.f1_score != null && (
              <div className="stat-card">
                <div className="stat-value" style={{ color: scoreColor(result.metrics.f1_score) }}>
                  {result.metrics.f1_score}%
                </div>
                <div className="stat-label">F1 Score</div>
              </div>
            )}
            {result.metrics?.precision != null && (
              <div className="stat-card">
                <div className="stat-value">{result.metrics.precision}%</div>
                <div className="stat-label">Precision</div>
              </div>
            )}
            {result.metrics?.recall != null && (
              <div className="stat-card">
                <div className="stat-value">{result.metrics.recall}%</div>
                <div className="stat-label">Recall</div>
              </div>
            )}
            {result.metrics?.r2 != null && (
              <div className="stat-card">
                <div className="stat-value">{result.metrics.r2}</div>
                <div className="stat-label">R² Score</div>
              </div>
            )}
            {result.metrics?.rmse != null && (
              <div className="stat-card">
                <div className="stat-value">{result.metrics.rmse}</div>
                <div className="stat-label">RMSE</div>
              </div>
            )}
            {result.metrics?.silhouette_score != null && (
              <div className="stat-card">
                <div className="stat-value">{result.metrics.silhouette_score}</div>
                <div className="stat-label">Silhouette Score</div>
              </div>
            )}
          </div>

          {/* Model comparison */}
          {Object.keys(result.all_results || {}).length > 1 && (
            <div className="section">
              <div className="section-title mb1">Model Comparison</div>
              <div className="table-wrap mb2">
                <table>
                  <thead>
                    <tr>
                      <th>Model</th>
                      {!isClustering && !isRegression && <><th>Accuracy</th><th>F1 Score</th></>}
                      {isRegression  && <><th>R²</th><th>RMSE</th></>}
                      {isClustering  && <><th>Silhouette</th><th>Clusters</th></>}
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(result.all_results).map(([name, metrics]) => (
                      <tr key={name}>
                        <td><strong>{name}</strong></td>
                        {metrics.error
                          ? <td colSpan={3} className="text-red text-sm">{metrics.error}</td>
                          : (
                            <>
                              {!isClustering && !isRegression && (
                                <><td>{metrics.accuracy}%</td><td>{metrics.f1_score}%</td></>
                              )}
                              {isRegression && (
                                <><td>{metrics.r2}</td><td>{metrics.rmse}</td></>
                              )}
                              {isClustering && (
                                <><td>{metrics.silhouette_score}</td><td>{metrics.n_clusters}</td></>
                              )}
                              <td>
                                {name === result.best_model
                                  ? <span className="badge badge-gray">Best</span>
                                  : <span className="badge badge-gray">Evaluated</span>}
                              </td>
                            </>
                          )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Feature importance */}
          {result.feature_importance && Object.keys(result.feature_importance).length > 0 && (
            <div className="section">
              <div className="section-title mb1">Feature Importance (Top 10)</div>
              <div className="table-wrap mb2">
                <table>
                  <thead><tr><th>Feature</th><th>Importance</th><th>Share</th></tr></thead>
                  <tbody>
                    {Object.entries(result.feature_importance).slice(0, 10).map(([col, val]) => {
                      const max = Object.values(result.feature_importance)[0];
                      const pct = max > 0 ? Math.round((val / max) * 1000) / 10 : 0;
                      return (
                        <tr key={col}>
                          <td><strong>{col}</strong></td>
                          <td className="pct-value">{val}</td>
                          <td className="pct-value">{pct}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Inference code */}
          {result.inference_code && (
            <div className="section">
              <div className="section-title mb1">Generated Inference Code</div>
              <div className="code-block mb2" style={{ fontSize: "0.78rem", lineHeight: 1.7, whiteSpace: "pre" }}>
                {result.inference_code}
              </div>
            </div>
          )}

          {/* Downloads */}
          <div className="section-title mb1">Downloads</div>
          <div className="flex-row flex-wrap mb2">
            {result.model_filename && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href     = `http://127.0.0.1:8000/ai/download/model/${result.model_filename}`;
                  a.download = result.model_filename;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }}
              >
                Download Model (.pkl)
              </button>
            )}
            <button
              className="btn btn-secondary"
              onClick={() => {
                const blob = new Blob([result.inference_code], { type: "text/plain" });
                const a    = document.createElement("a");
                a.href     = URL.createObjectURL(blob);
                a.download = "inference.py";
                a.click();
              }}
            >
              Download Inference Code
            </button>
          </div>

          <div className="flex-row mt1">
            <button className="btn btn-secondary" onClick={reset}>Train Another Model</button>
            <button className="btn btn-ghost" onClick={() => navigate("/monitoring")}>View MLflow</button>
          </div>
        </div>
      )}
    </div>
  );
}
