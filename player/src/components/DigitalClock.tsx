import { useState, useEffect } from 'react';
import { usePlaylist } from '../context/PlaylistContext';
import { motion } from 'motion/react';

export default function DigitalClock() {
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
