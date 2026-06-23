import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2000),
      setTimeout(() => setPhase(4), 4000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const text = "Zavyz";

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center bg-[#F5F1E7]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.8 }}
    >
      <div className="absolute inset-0 opacity-10 bg-repeat pointer-events-none" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/knit_texture.jpg)`, backgroundSize: 'cover' }}></div>
      
      <div className="relative z-10 flex flex-col items-center">
        <motion.div
          className="w-32 h-32 mb-8 rounded-full bg-[#E07A5F] flex items-center justify-center shadow-xl"
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: phase >= 1 ? 1 : 0, rotate: phase >= 1 ? 0 : -90 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        >
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"></path>
            <path d="M8 12l3 3 5-5"></path>
          </svg>
        </motion.div>

        <h1 className="text-[10vw] font-bold text-[#2A363B] leading-none mb-4 tracking-tighter" style={{ fontFamily: 'var(--font-display)' }}>
          {text.split('').map((char, i) => (
            <motion.span
              key={i}
              className="inline-block"
              initial={{ opacity: 0, y: 50 }}
              animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: phase >= 2 ? i * 0.1 : 0 }}
            >
              {char}
            </motion.span>
          ))}
        </h1>

        <motion.p
          className="text-[3vw] text-[#3D5A47] font-semibold"
          initial={{ opacity: 0, filter: "blur(10px)", y: 20 }}
          animate={phase >= 3 ? { opacity: 1, filter: "blur(0px)", y: 0 } : { opacity: 0, filter: "blur(10px)", y: 20 }}
          transition={{ duration: 0.8 }}
        >
          Умный помощник для вязания
        </motion.p>
      </div>

    </motion.div>
  );
}
