import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import {
  DashboardIcon, UploadIcon, AnalysisIcon, PreprocessIcon,
  QualityIcon, AITrainerIcon, MonitoringIcon, SettingsIcon, ChevronIcon,
} from "./NavIcons";

const nav = [
  { to: "/dashboard",  label: "Dashboard",        Icon: DashboardIcon },
  { to: "/upload",     label: "Upload",            Icon: UploadIcon },
  { to: "/analysis",   label: "Analysis",          Icon: AnalysisIcon },
  { to: "/repair",     label: "Preprocessing",     Icon: PreprocessIcon },
  { to: "/quality",    label: "Quality Report",    Icon: QualityIcon },
  { to: "/ai-trainer", label: "AI Model Trainer",  Icon: AITrainerIcon },
  { to: "/monitoring", label: "Monitoring",        Icon: MonitoringIcon },
  { to: "/settings",   label: "Settings",          Icon: SettingsIcon },
];

const MotionNavLink = motion.create(NavLink);

export default function Sidebar({ collapsed = false, onToggle }) {
  const file = localStorage.getItem("uploadedFile");

  return (
    <div className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-brand">
        <h1>{collapsed ? "DP" : "DataPrep"}</h1>
        {!collapsed && <p>Prep · Train · Monitor</p>}
      </div>

      <nav className="sidebar-nav">
        {!collapsed && <span className="sidebar-section-label">Navigation</span>}
        {nav.map((n) => (
          <MotionNavLink
            key={n.to}
            to={n.to}
            title={collapsed ? n.label : undefined}
            className={({ isActive }) => (isActive ? "active" : "")}
            whileHover={{ scale: 1.025, x: collapsed ? 0 : 2 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="nav-pill"
                    className="nav-pill"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="sidebar-icon-bubble">
                  <n.Icon />
                </span>
                {!collapsed && <span className="nav-label">{n.label}</span>}
              </>
            )}
          </MotionNavLink>
        ))}
      </nav>

      {file && !collapsed && (
        <motion.div
          className="sidebar-footer"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="text-xs text-muted mb1">Active file</div>
          <div className="sidebar-file-chip">{file}</div>
        </motion.div>
      )}

      <button className="sidebar-toggle" onClick={onToggle} title="Toggle sidebar">
        <ChevronIcon />
      </button>
    </div>
  );
}
