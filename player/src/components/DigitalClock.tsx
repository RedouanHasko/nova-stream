import { useState, useEffect } from 'react';
import { usePlaylist } from '../context/PlaylistContext';
import { motion } from 'motion/react';

type DigitalClockProps = {
  variant?: 'default' | 'hero' | 'compact';
};

export default function DigitalClock({ variant = 'default' }: DigitalClockProps) {
  const { settings } = usePlaylist();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeString = time.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: settings.timeFormat === '12h'
  });

  const dateString = time.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });

  const fullDateString = time.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  if (variant === 'compact') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex min-w-[176px] flex-col items-start justify-center"
      >
        <span className="text-[46px] font-semibold leading-none tracking-[-0.04em] text-white">{timeString}</span>
        <span className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/46">{dateString}</span>
        <span className="mt-0.5 text-[13px] font-medium text-white/68">{fullDateString}</span>
      </motion.div>
    );
  }

  if (variant === 'hero') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="home-time-hero flex min-w-[260px] flex-col items-center justify-center px-4 py-2 text-center"
      >
        <span className="text-[72px] font-semibold leading-none tracking-[-0.06em] text-white">{timeString}</span>
        <span className="mt-2 text-[11px] uppercase tracking-[0.34em] text-white/30">{dateString}</span>
        <span className="mt-3 text-[15px] font-medium text-white/66">{fullDateString}</span>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex flex-col items-end bg-white/5 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 min-w-[120px]"
    >
      <span className="text-xl font-bold text-white leading-none">{timeString}</span>
      <span className="text-[10px] text-white/40 uppercase tracking-wider mt-1">{dateString}</span>
    </motion.div>
  );
}
