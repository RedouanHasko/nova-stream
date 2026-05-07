import { cn } from '../lib/utils';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function Logo({ className, size = 'md' }: LogoProps) {
  const sizes = {
    sm: { icon: 'w-7 h-7', text: 'text-xl', sub: 'text-[11px]', gap: 'gap-2.5' },
    md: { icon: 'w-11 h-11', text: 'text-[30px]', sub: 'text-[13px]', gap: 'gap-3' },
    lg: { icon: 'w-16 h-16', text: 'text-6xl', sub: 'text-[22px]', gap: 'gap-4.5' },
  };

  const s = sizes[size];

  return (
    <div className={cn("flex items-center", s.gap, className)}>
      <img src="images/favicon.png" alt="Nova Stream" className={cn("object-contain", s.icon)} />
      <div className="flex flex-col leading-none">
        <span className={cn("text-white font-extrabold tracking-[-0.02em]", s.text)}>NOVA</span>
        <span className={cn("text-primary font-bold tracking-[0.24em] uppercase", s.sub)}>PLAYER</span>
      </div>
    </div>
  );
}
