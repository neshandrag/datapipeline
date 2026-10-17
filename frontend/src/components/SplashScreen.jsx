import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

const PHRASES = [
  "Initializing pipeline",
  "Cleaning data",
  "Detecting outliers",
  "Scoring quality",
  "Almost ready",
];

const WORD_INTERVAL = 480;

export default function SplashScreen({ onDone }) {
  const [index, setIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (index >= PHRASES.length - 1) {
      const t = setTimeout(onDone, WORD_INTERVAL + 260);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setIndex((i) => i + 1), WORD_INTERVAL);
    return () => clearTimeout(t);
  }, [index, onDone]);

  const progress = ((index + 1) / PHRASES.length) * 100;

  return (
    <motion.div
      className="splash"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        className="splash-mark"
        initial={reduceMotion ? false : { scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="splash-ring" />
        <span className="splash-logo">DP</span>
      </motion.div>

      <div className="splash-word-wrap">
        <AnimatePresence mode="wait">
          <motion.span
            key={PHRASES[index]}
            className="splash-word"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {PHRASES[index]}
            <span className="splash-dots" aria-hidden="true">
              <span>.</span><span>.</span><span>.</span>
            </span>
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="splash-progress-track">
        <motion.div
          className="splash-progress-fill"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
    </motion.div>
  );
}
