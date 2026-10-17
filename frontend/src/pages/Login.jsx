import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

export default function Login() {
  const navigate = useNavigate();
  const [form,  setForm]  = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError("Email and password are required.");
      return;
    }
    localStorage.setItem("user", form.email);
    navigate("/dashboard");
  };

  return (
    <div className="page-center">
      <div className="capsule-card card-sm" style={{ width: "100%" }}>
        <div style={{ marginBottom: "1.75rem" }}>
          <h1 className="text-gradient text-gradient-glow" style={{ fontSize: "1.3rem" }}>Sign In</h1>
          <p>Access the DataPrep platform</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email address</label>
            <input id="email" type="email" placeholder="you@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" placeholder="Enter password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <motion.button
            className="btn btn-primary btn-full"
            type="submit"
            whileTap={{ scale: 0.97 }}
          >
            Sign In
          </motion.button>
        </form>

        <div className="glow-divider" />
        <div style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--ink-400)" }}>
          No account?{" "}
          <span style={{ color: "var(--violet-400)", cursor: "pointer" }}
                onClick={() => navigate("/dashboard")}>
            Continue as guest
          </span>
        </div>
      </div>
    </div>
  );
}
