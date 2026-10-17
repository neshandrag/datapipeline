import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const features = [
  { n: "01", title: "Dataset Prep",     desc: "Upload, profile, and repair raw CSVs into ML-ready data" },
  { n: "02", title: "Quality & Drift",  desc: "Score data quality, export reports, and watch for drift" },
  { n: "03", title: "Experiment Track", desc: "Log every preprocessing run in MLflow with full audit trail" },
  { n: "04", title: "AI Model Trainer", desc: "Describe your goal — AI picks the problem type, features, and models" },
  { n: "05", title: "Train & Compare",  desc: "Train multiple models, evaluate metrics, and select the best one" },
  { n: "06", title: "Predict Ready",    desc: "Download a trained model (.pkl) ready for prediction pipelines" },
];

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] },
});

// Scroll-triggered cascade for the Core Modules section: parent fires once at
// 25% in view, children (label -> title -> desc -> each card) stagger off it.
const sectionReveal = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.14, delayChildren: 0.05 } },
};
const itemReveal = {
  hidden: { opacity: 0, y: 60 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.9, ease: "easeOut" } },
};

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div>
      {/* Top nav */}
      <div className="top-nav">
        <div className="top-nav-brand text-gradient">DataPrep</div>
        <div className="top-nav-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate("/dashboard")}>Dashboard</button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate("/login")}>Sign In</button>
        </div>
      </div>

      {/* Hero — left-aligned typography, Apple/Linear style */}
      <div className="hero-section">
        <div className="hero-glow" aria-hidden="true" />

        <motion.div className="hero-kicker" {...fadeUp(0)}>
          Dataset Repair · AI Model Training · MLOps
        </motion.div>

        <motion.h1 className="hero-heading" {...fadeUp(0.08)}>
          <span className="hero-heading-line">From Raw Data</span>
          <span className="hero-heading-line">
            To <span className="text-gradient">Trained Models.</span>
          </span>
        </motion.h1>

        <motion.p className="hero-desc" {...fadeUp(0.16)}>
          Clean and score your datasets, then go further — describe what you want to predict
          and let the AI Model Trainer choose features, train models, and deliver a downloadable
          predictor. Two core modules, one platform: clean data and train models.
        </motion.p>

        <motion.div className="hero-cta-row" {...fadeUp(0.22)}>
          <motion.button className="btn btn-primary btn-lg" whileTap={{ scale: 0.97 }} onClick={() => navigate("/login")}>
            Get Started
          </motion.button>
          <motion.button className="btn btn-secondary btn-lg" whileTap={{ scale: 0.97 }} onClick={() => navigate("/dashboard")}>
            Go to Dashboard
          </motion.button>
        </motion.div>
      </div>

      {/* Content section — hidden until scrolled into view, then cascades in */}
      <motion.div
        className="landing-content-section"
        variants={sectionReveal}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.25 }}
      >
        <motion.div className="landing-section-label" variants={itemReveal}>Core Modules</motion.div>
        <motion.h2 className="landing-section-title" variants={itemReveal}>
          Clean data. Train models. Ship predictions.
        </motion.h2>
        <motion.p className="landing-section-desc" variants={itemReveal}>
          Dataset Prep gets your CSV production-ready. AI Model Trainer turns that data into a
          trained prediction model — guided by your project description, not just hardcoded rules.
        </motion.p>

        <div className="grid3 landing-module-grid">
          {features.map((f) => (
            <motion.div
              className="card landing-module-card"
              key={f.title}
              variants={itemReveal}
              whileHover={{ y: -6 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <div className="landing-module-number">{f.n}</div>
              <div className="landing-module-title">{f.title}</div>
              <div className="landing-module-desc">{f.desc}</div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
