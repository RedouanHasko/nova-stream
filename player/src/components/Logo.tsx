import { cn } from '../lib/utils';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function Logo({ className, size = 'md' }: LogoProps) {
  const sizes = {
    sm: { icon: 'w-6 h-6', text: 'text-lg', sub: 'text-xs', gap: 'gap-2' },
    md: { icon: 'w-9 h-9', text: 'text-2xl', sub: 'text-sm', gap: 'gap-3' },
    lg: { icon: 'w-14 h-14', text: 'text-5xl', sub: 'text-2xl', gap: 'gap-4' },
  };

  const s = sizes[size];

  return (
    <div className={cn("flex items-center", s.gap, className)}>
      <img src="/images/favicon.png" alt="Nova Stream" className={cn("object-contain", s.icon)} />
      <div className="flex flex-col leading-none">
        <span className={cn("text-white font-black tracking-tighter italic", s.text)}>NOVA</span>
        <span className={cn("text-primary font-black tracking-widest uppercase", s.sub)}>PLAYER</span>
      </div>
    </div>
  );
}
