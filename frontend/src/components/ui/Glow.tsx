"use client";
import { motion } from 'framer-motion';

interface GlowProps {
  color: string;
}

export function Glow({ color }: GlowProps) {
  return (
    <motion.div
      className="absolute inset-0 z-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 1.5 } }}
    >
      <motion.div
        className="absolute -inset-4"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 50%, ${color} 0%, transparent 50%)`,
        }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.5, 0.7, 0.5],
        }}
        transition={{
          duration: 5,
          repeat: Infinity,
          repeatType: 'mirror',
        }}
      />
    </motion.div>
  );
}
