import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene3() {
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
      className="absolute inset-0 bg-[#3D5A47]"
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ scale: 0.8, opacity: 0 }}
      transition={{ duration: 0.8, ease: "easeInOut" }}
    >
      <div className="absolute inset-0 opacity-10 bg-repeat" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/knit_texture.jpg)`, backgroundSize: 'cover' }}></div>
      
      <div className="w-full h-full flex items-center justify-center p-20">
        <motion.div 
          className="bg-[#F5F1E7] w-full max-w-[60vw] rounded-3xl p-10 shadow-2xl relative"
          initial={{ opacity: 0, rotateX: 90 }}
          animate={phase >= 1 ? { opacity: 1, rotateX: 0 } : { opacity: 0, rotateX: 90 }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
          style={{ perspective: 1000 }}
        >
          <div className="flex items-center gap-6 mb-8 border-b-2 border-[#EADCB6] pb-6">
            <div className="w-16 h-16 rounded-full bg-[#E07A5F] flex items-center justify-center text-white font-bold text-2xl">Z</div>
            <div className="text-[3vw] font-bold text-[#2A363B]" style={{ fontFamily: 'var(--font-display)' }}>Zavyz</div>
          </div>
          
          <div className="space-y-6">
            <motion.div 
              className="bg-[#EADCB6] text-[#2A363B] p-6 rounded-2xl rounded-tr-none self-end max-w-[80%] ml-auto text-[1.8vw]"
              initial={{ opacity: 0, x: 20 }}
              animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
            >
              Как связать этот свитер?
            </motion.div>

            <motion.div 
              className="bg-[#3D5A47] text-[#F5F1E7] p-6 rounded-2xl rounded-tl-none self-start max-w-[90%] text-[1.8vw]"
              initial={{ opacity: 0, x: -20 }}
              animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
            >
              Для этого свитера вам понадобится 5 мотков шерсти мериноса (50г/120м), спицы №4. Вот схема узора...
            </motion.div>
          </div>
          
          <motion.div 
            className="absolute -right-10 -bottom-10 bg-[#E07A5F] text-[#F5F1E7] p-6 rounded-full text-[2vw] font-bold shadow-xl rotate-[-10deg]"
            initial={{ scale: 0, opacity: 0 }}
            animate={phase >= 3 ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
            transition={{ type: "spring", bounce: 0.5, delay: 0.5 }}
          >
            Мгновенный ответ!
          </motion.div>

        </motion.div>
      </div>

    </motion.div>
  );
}
