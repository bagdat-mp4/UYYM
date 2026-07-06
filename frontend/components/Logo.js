export default function Logo({ size = 36, wordSize = 22, white = false }) {
  return (
    <div className="logo">
      <svg width={size} height={size} viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect width="120" height="120" rx="26" fill="#DC2626" />
        <g stroke="#fff" strokeWidth="5" strokeLinecap="round">
          <line x1="60" y1="60" x2="32" y2="36" />
          <line x1="60" y1="60" x2="90" y2="38" />
          <line x1="60" y1="60" x2="40" y2="90" />
          <line x1="60" y1="60" x2="88" y2="86" />
        </g>
        <g fill="#fff">
          <circle cx="32" cy="36" r="7" />
          <circle cx="90" cy="38" r="7" />
          <circle cx="40" cy="90" r="7" />
          <circle cx="88" cy="86" r="7" />
          <circle cx="60" cy="60" r="12" />
        </g>
      </svg>
      <span className={white ? 'logo-word on-red' : 'logo-word'} style={{ fontSize: wordSize }}>UYYM</span>
    </div>
  );
}
