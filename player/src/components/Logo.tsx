import { Sparkle } from 'lucide-react';
import { cn } from '../lib/utils';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function Logo({ className, size = 'md' }: LogoProps) {
  const sizes = {
    sm: { icon: 'w-4 h-4', text: 'text-lg', sub: 'text-xs', gap: 'gap-2', box: 'p-0.5 rounded' },
    md: { icon: 'w-6 h-6', text: 'text-2xl', sub: 'text-sm', gap: 'gap-3', box: 'p-1 rounded-lg' },
    lg: { icon: 'w-10 h-10', text: 'text-5xl', sub: 'text-2xl', gap: 'gap-4', box: 'p-2 rounded-xl' },
  };

  const s = sizes[size];

  return (
    <div className={cn("flex items-center", s.gap, className)}>
      <div className={cn("bg-primary shadow-lg shadow-primary/20 flex items-center justify-center relative", s.box)}>
        <Sparkle className={cn("text-white fill-white", s.icon)} />
        <div className={cn("absolute -top-1 -right-1 bg-white rounded-full border-2 border-primary", size === 'lg' ? 'w-4 h-4' : 'w-2 h-2')} />
      </div>
      <div className="flex flex-col leading-none">
        <span className={cn("text-white font-black tracking-tighter italic", s.text)}>NOVA</span>
        <span className={cn("text-primary font-black tracking-widest uppercase", s.sub)}>PLAYER</span>
      </div>
    </div>
  );
}
