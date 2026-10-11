/** Plaza orb: a world with one ring. Used on the landing; PNGs are rasterized from the same geometry. */
export function Mark({ size = 56, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <path d="M11 32A21 7.5 0 0 0 53 32" transform="rotate(-20 32 32)" stroke="#5EE7FF" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="32" cy="32" r="13" fill="#0052FF" />
      <path d="M11 32A21 7.5 0 0 1 53 32" transform="rotate(-20 32 32)" stroke="#5EE7FF" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
