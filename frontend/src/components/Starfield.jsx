import { motion, useReducedMotion } from "framer-motion";

export default function Starfield() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="starfield" aria-hidden="true">
      <div className="starfield-base" />

      {/* Slow continuous zoom-in wash */}
      <motion.div
        className="starfield-zoom"
        initial={reduceMotion ? false : { scale: 1, opacity: 0.85 }}
        animate={
          reduceMotion
            ? { scale: 1, opacity: 0.9 }
            : { scale: [1, 1.18, 1], opacity: [0.75, 1, 0.75] }
        }
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 22, ease: "easeInOut", repeat: Infinity, repeatType: "mirror" }
        }
      />

      {/* Soft blue orbs drifting + scaling */}
      <motion.div
        className="starfield-orb starfield-orb-a"
        initial={reduceMotion ? false : { scale: 0.92, x: "-6%", y: "-4%" }}
        animate={
          reduceMotion
            ? { scale: 1 }
            : {
                scale: [0.92, 1.2, 0.95],
                x: ["-6%", "4%", "-2%"],
                y: ["-4%", "2%", "-6%"],
              }
        }
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 28, ease: "easeInOut", repeat: Infinity, repeatType: "mirror" }
        }
      />
      <motion.div
        className="starfield-orb starfield-orb-b"
        initial={reduceMotion ? false : { scale: 1.05, x: "8%", y: "10%" }}
        animate={
          reduceMotion
            ? { scale: 1 }
            : {
                scale: [1.05, 1.28, 1.08],
                x: ["8%", "-4%", "6%"],
                y: ["10%", "2%", "12%"],
              }
        }
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 34, ease: "easeInOut", repeat: Infinity, repeatType: "mirror", delay: 1.5 }
        }
      />
    </div>
  );
}
