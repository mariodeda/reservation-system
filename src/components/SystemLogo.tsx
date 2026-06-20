export default function SystemLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      {/* Badge circle */}
      <circle cx="50" cy="26" r="22" />
      {/* Checkmark */}
      <polyline
        points="38,26.5 46,35 64,17"
        fill="none"
        stroke="white"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Left chair back */}
      <rect x="4" y="46" width="18" height="26" rx="5" />
      {/* Left chair seat */}
      <rect x="3" y="63" width="28" height="9" rx="4" />
      {/* Left chair legs */}
      <rect x="5.5" y="72" width="5" height="14" rx="2.5" />
      <rect x="15.5" y="72" width="5" height="14" rx="2.5" />

      {/* Right chair back */}
      <rect x="78" y="46" width="18" height="26" rx="5" />
      {/* Right chair seat */}
      <rect x="69" y="63" width="28" height="9" rx="4" />
      {/* Right chair legs */}
      <rect x="79.5" y="72" width="5" height="14" rx="2.5" />
      <rect x="89.5" y="72" width="5" height="14" rx="2.5" />

      {/* Table top */}
      <rect x="27" y="60" width="46" height="12" rx="6" />
      {/* Table pedestal */}
      <rect x="44" y="72" width="12" height="9" rx="2" />
      {/* Table base */}
      <rect x="35" y="81" width="30" height="6" rx="3" />
    </svg>
  );
}
