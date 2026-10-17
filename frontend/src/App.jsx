import { useState } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import Sidebar from "./components/Sidebar";
import Starfield from "./components/Starfield";
import PageTransition from "./components/PageTransition";
import SplashScreen from "./components/SplashScreen";
import Landing        from "./pages/Landing";
import Login          from "./pages/Login";
import Dashboard      from "./pages/Dashboard";
import Upload         from "./pages/Upload";
import Analysis       from "./pages/Analysis";
import RepairResult   from "./pages/RepairResult";
import QualityReport  from "./pages/QualityReport";
import AIModelTrainer from "./pages/AIModelTrainer";
import Monitoring     from "./pages/Monitoring";
import Settings       from "./pages/Settings";

const WithSidebar = ({ children }) => {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebarCollapsed") === "1");

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebarCollapsed", next ? "1" : "0");
      return next;
    });
  };

  return (
    <div className={`layout ${collapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      <div className="main">{children}</div>
    </div>
  );
};

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* Public pages — no sidebar */}
        <Route path="/"      element={<PageTransition><Landing /></PageTransition>} />
        <Route path="/login" element={<PageTransition><Login /></PageTransition>} />

        {/* App pages — with sidebar */}
        <Route path="/dashboard" element={<WithSidebar><PageTransition><Dashboard /></PageTransition></WithSidebar>} />
        <Route path="/upload"    element={<WithSidebar><PageTransition><Upload /></PageTransition></WithSidebar>} />
        <Route path="/analysis"  element={<WithSidebar><PageTransition><Analysis /></PageTransition></WithSidebar>} />
        <Route path="/repair"    element={<WithSidebar><PageTransition><RepairResult /></PageTransition></WithSidebar>} />
        <Route path="/quality"    element={<WithSidebar><PageTransition><QualityReport /></PageTransition></WithSidebar>} />
        <Route path="/ai-trainer" element={<WithSidebar><PageTransition><AIModelTrainer /></PageTransition></WithSidebar>} />
        <Route path="/monitoring" element={<WithSidebar><PageTransition><Monitoring /></PageTransition></WithSidebar>} />
        <Route path="/settings"  element={<WithSidebar><PageTransition><Settings /></PageTransition></WithSidebar>} />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <BrowserRouter>
      <Starfield />
      <AnimatedRoutes />
      <AnimatePresence>
        {showSplash && <SplashScreen key="splash" onDone={() => setShowSplash(false)} />}
      </AnimatePresence>
    </BrowserRouter>
  );
}
