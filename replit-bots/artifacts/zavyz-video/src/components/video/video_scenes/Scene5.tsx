import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 2500),
      setTimeout(() => setPhase(4), 5000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 bg-[#E07A5F] flex flex-col items-center justify-center overflow-hidden"
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.8, ease: "easeInOut" }}
    >
      <div className="absolute inset-0 opacity-10 bg-repeat" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/knit_texture.jpg)`, backgroundSize: 'cover' }}></div>

      <motion.div
        className="w-[80vw] h-[80vw] absolute bg-[#3D5A47] rounded-full opacity-20 blur-3xl"
        animate={{ scale: [1, 1.2, 1], rotate: [0, 90, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
      />

      <div className="relative z-10 flex flex-col items-center text-center">
        <motion.div
          className="bg-[#F5F1E7] text-[#E07A5F] px-10 py-4 rounded-full text-[2.5vw] font-bold mb-8 uppercase tracking-widest"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6 }}
        >
          Готовы начать?
        </motion.div>

        <motion.h1
          className="text-[8vw] font-bold text-[#F5F1E7] mb-6 leading-none"
          style={{ fontFamily: 'var(--font-display)' }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={phase >= 2 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.5 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        >
          Попробуй прямо сейчас
        </motion.h1>

        <motion.div
          className="text-[5vw] text-[#2A363B] font-bold bg-[#EADCB6] px-12 py-6 rounded-2xl shadow-2xl mt-4"
          initial={{ opacity: 0, y: 50, rotateX: 90 }}
          animate={phase >= 3 ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: 50, rotateX: 90 }}
          transition={{ type: "spring", stiffness: 150, damping: 15 }}
          style={{ perspective: 1000 }}
        >
          zavyz.ru
        </motion.div>
        
        <motion.p
          className="text-[2vw] text-[#F5F1E7] mt-8 opacity-80"
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ delay: 0.5 }}
        >
          или в Telegram @knitwearguru_bot
        </motion.p>
      </div>
    </motion.div>
  );
}
