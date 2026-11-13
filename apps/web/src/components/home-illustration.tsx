export function HomeIllustration() {
  return (
    <svg
      viewBox="0 0 320 240"
      aria-hidden="true"
      focusable="false"
      className="mx-auto h-auto w-full max-w-sm"
    >
      <circle cx="226" cy="66" r="34" className="fill-accent/30" />
      <circle cx="72" cy="180" r="26" className="fill-secondary-brand/20" />
      <path
        d="M58 120 160 42l102 78v78a12 12 0 0 1-12 12H70a12 12 0 0 1-12-12v-78Z"
        className="fill-card stroke-border"
        strokeWidth="2"
      />
      <path
        d="M80 110 160 50l80 60"
        fill="none"
        className="stroke-primary-brand"
        strokeLinecap="round"
        strokeWidth="10"
      />
      <rect
        x="98"
        y="128"
        width="42"
        height="38"
        rx="5"
        className="fill-secondary-brand/20 stroke-border"
        strokeWidth="2"
      />
      <path d="M119 128v38M98 147h42" fill="none" className="stroke-border" strokeWidth="2" />
      <rect
        x="198"
        y="128"
        width="38"
        height="38"
        rx="5"
        className="fill-accent/25 stroke-border"
        strokeWidth="2"
      />
      <path d="M217 128v38M198 147h38" fill="none" className="stroke-border" strokeWidth="2" />
      <rect x="142" y="160" width="36" height="50" rx="6" className="fill-primary-brand" />
      <circle cx="169" cy="186" r="3" className="fill-background" />
      <path
        d="M248 150c0-14 10-20 10-31 8 8 13 16 13 27a12 12 0 0 1-24 0c0-4 2-8 5-12 1 7 5 9 5 16 0 4-2 7-5 9-2-2-4-5-4-9Z"
        className="fill-secondary-brand"
      />
      <path
        d="M238 182h42l-5 28h-32l-5-28Z"
        className="fill-secondary-brand/20 stroke-border"
        strokeWidth="2"
      />
      <path
        d="M40 210h240"
        fill="none"
        className="stroke-border"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </svg>
  );
}
