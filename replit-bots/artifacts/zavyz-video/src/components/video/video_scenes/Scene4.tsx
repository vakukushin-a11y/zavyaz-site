import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1000),
      setTimeout(() => setPhase(3), 1500),
      setTimeout(() => setPhase(4), 2000),
      setTimeout(() => setPhase(5), 2500),
      setTimeout(() => setPhase(6), 4500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const features = [
    { title: "Чат на сайте", color: "bg-[#E07A5F]" },
    { title: "Telegram-бот", color: "bg-[#3D5A47]" },
    { title: "Новости вязания", color: "bg-[#2A363B]" },
    { title: "Энциклопедия", color: "bg-[#E07A5F]" }
  ];

  return (
    <motion.div 
      className="absolute inset-0 bg-[#F5F1E7] overflow-hidden flex flex-col items-center justify-center"
      initial={{ scale: 1.2, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ x: "-100%", opacity: 0 }}
      transition={{ duration: 0.8, ease: "easeInOut" }}
    >
      <div className="absolute inset-0 opacity-5 bg-repeat" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/yarn.jpg)`, backgroundSize: 'cover' }}></div>

      <motion.h2 
        className="text-[5vw] font-bold text-[#2A363B] mb-12 relative z-10 text-center"
        style={{ fontFamily: 'var(--font-display)' }}
        initial={{ opacity: 0, y: -30 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -30 }}
      >
        Всё для вязания в одном месте
      </motion.h2>

      <div className="grid grid-cols-2 gap-8 w-[80vw] max-w-[1000px] relative z-10">
        {features.map((feature, i) => (
          <motion.div
            key={i}
            className={`${feature.color} text-[#F5F1E7] p-8 rounded-3xl flex items-center justify-center text-center shadow-lg text-[2.5vw] font-semibold`}
            initial={{ opacity: 0, scale: 0.8, rotate: i % 2 === 0 ? -5 : 5 }}
            animate={phase >= (i + 2) ? { opacity: 1, scale: 1, rotate: 0 } : { opacity: 0, scale: 0.8, rotate: i % 2 === 0 ? -5 : 5 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
          >
            {feature.title}
          </motion.div>
        ))}
      </div>

    </motion.div>
  );
}
