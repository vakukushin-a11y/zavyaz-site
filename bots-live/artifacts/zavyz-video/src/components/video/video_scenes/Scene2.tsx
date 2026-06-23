import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 2500),
      setTimeout(() => setPhase(4), 3500),
      setTimeout(() => setPhase(5), 5000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const questions = [
    "Какую пряжу выбрать?",
    "Как рассчитать размер?",
    "Где найти этот узор?"
  ];

  return (
    <motion.div 
      className="absolute inset-0 bg-[#2A363B] overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: "-100%" }}
      transition={{ duration: 0.8, ease: "easeInOut" }}
    >
      <div className="absolute inset-0 opacity-20 bg-repeat" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/yarn.jpg)`, backgroundSize: 'cover' }}></div>
      
      <div className="absolute top-10 left-10 text-[#EADCB6] text-[4vw] font-bold" style={{ fontFamily: 'var(--font-display)' }}>
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
          transition={{ duration: 0.6 }}
        >
          Много вопросов...
        </motion.div>
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-8">
        {questions.map((q, i) => (
          <motion.div
            key={i}
            className="bg-[#F5F1E7] text-[#2A363B] px-8 py-4 rounded-full text-[2.5vw] font-semibold shadow-lg max-w-[80%] text-center"
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={phase >= (i + 2) ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            style={{ alignSelf: i % 2 === 0 ? 'flex-start' : 'flex-end', marginLeft: i % 2 === 0 ? '10vw' : '0', marginRight: i % 2 !== 0 ? '10vw' : '0' }}
          >
            {q}
          </motion.div>
        ))}
      </div>

      <motion.div
        className="absolute bottom-10 right-10 text-[#E07A5F] text-[3vw] font-bold"
        initial={{ opacity: 0, x: 50 }}
        animate={phase >= 4 ? { opacity: 1, x: 0 } : { opacity: 0, x: 50 }}
        transition={{ duration: 0.6 }}
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Сложно найти ответ?
      </motion.div>
    </motion.div>
  );
}
