export function LogoMark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="vml-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c4dff" />
          <stop offset="1" stopColor="#5b21d6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#vml-g)" />
      <path d="M8 10l5.2 12h1.6L20 10" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M23.5 7.5v6M20.5 10.5h6" stroke="#c4f04d" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <LogoMark />
      <div className="leading-none">
        <div className="text-[13px] font-semibold tracking-tight">
          VoteMais <span className="text-primary">Leads</span>
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">Prospecção comercial</div>
      </div>
    </div>
  );
}
