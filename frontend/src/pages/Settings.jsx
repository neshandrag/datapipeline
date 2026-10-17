import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearPersistedState } from "../hooks/usePersistentState";

export default function Settings() {
  const navigate   = useNavigate();
  const [saved,    setSaved]    = useState(false);
  const [apiUrl,   setApiUrl]   = useState(localStorage.getItem("apiUrl") || "http://127.0.0.1:8000");

  const save = () => {
    localStorage.setItem("apiUrl", apiUrl);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const logout = () => {
    localStorage.clear();
    clearPersistedState();
    navigate("/");
  };

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Platform configuration.</p>
      </div>

      <div style={{ maxWidth: 520 }}>
        <div className="card mb2">
          <div className="section-title mb1">Backend</div>
          <div className="form-group">
            <label htmlFor="apiUrl">API base URL</label>
            <input id="apiUrl" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
          </div>
          {saved && <div className="alert alert-success mb1">Settings saved.</div>}
          <button className="btn btn-primary btn-sm" onClick={save}>Save</button>
        </div>

        <div className="card mb2">
          <div className="section-title mb1">MLflow</div>
          <div className="form-group">
            <label>Tracking URI</label>
            <input value="sqlite:///mlflow.db" readOnly style={{ opacity: 0.6 }} />
          </div>
          <p className="text-sm">
            Start with:{" "}
            <code>mlflow ui --backend-store-uri sqlite:///mlflow.db --workers 1</code>
          </p>
        </div>

        <div className="card">
          <div className="section-title mb1">Session</div>
          <p className="mb2">Signed in as: <strong>{localStorage.getItem("user") || "Guest"}</strong></p>
          <button className="btn btn-danger btn-sm" onClick={logout}>Sign Out</button>
        </div>
      </div>
    </div>
  );
}
