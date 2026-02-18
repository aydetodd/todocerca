/**
 * Centralized vehicle SVG icons for maps.
 * 
 * Color scheme:
 * - Público (urbana): White (#FFFFFF)
 * - Foráneo: Blue (#3B82F6)
 * - Privado: Yellow (#FDB813)
 * - Taxi disponible: Green (#22c55e)
 * - Taxi ocupado: Yellow (#FDB813)
 */

// ── Taxi sedan SVG (elegant, realistic top-down sedan) ──────────────────

export const getTaxiSvg = (color: { body: string; stroke: string }, label?: string) => `
  <svg width="18" height="30" viewBox="0 0 36 60" xmlns="http://www.w3.org/2000/svg">
    <!-- Shadow -->
    <ellipse cx="18" cy="57" rx="12" ry="2.5" fill="rgba(0,0,0,0.25)"/>

    <!-- Rear wheels -->
    <ellipse cx="7" cy="47" rx="3.5" ry="4" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
    <ellipse cx="7" cy="47" rx="1.8" ry="2.5" fill="#4a4a4a"/>
    <ellipse cx="29" cy="47" rx="3.5" ry="4" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
    <ellipse cx="29" cy="47" rx="1.8" ry="2.5" fill="#4a4a4a"/>

    <!-- Car body -->
    <rect x="8" y="8" width="20" height="44" rx="5" fill="#1a1a1a" stroke="#333" stroke-width="0.8"/>

    <!-- Front wheels -->
    <ellipse cx="7" cy="17" rx="3.5" ry="4" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
    <ellipse cx="7" cy="17" rx="1.8" ry="2.5" fill="#4a4a4a"/>
    <ellipse cx="29" cy="17" rx="3.5" ry="4" fill="#1a1a1a" stroke="#333" stroke-width="0.6"/>
    <ellipse cx="29" cy="17" rx="1.8" ry="2.5" fill="#4a4a4a"/>

    <!-- Colored roof / hood -->
    <rect x="11" y="10" width="14" height="40" rx="3.5" fill="${color.body}" stroke="${color.stroke}" stroke-width="0.5"/>

    <!-- Front windshield -->
    <path d="M 13 12 Q 18 9 23 12 L 23 18 L 13 18 Z" fill="#87CEEB" opacity="0.85" stroke="#555" stroke-width="0.5"/>

    <!-- Rear window -->
    <path d="M 13 48 L 23 48 L 23 43 Q 18 45 13 43 Z" fill="#87CEEB" opacity="0.75" stroke="#555" stroke-width="0.5"/>

    <!-- Side windows (left) -->
    <rect x="8" y="20" width="3" height="6" rx="1" fill="#87CEEB" stroke="#555" stroke-width="0.4"/>
    <rect x="8" y="28" width="3" height="6" rx="1" fill="#87CEEB" stroke="#555" stroke-width="0.4"/>
    <rect x="8" y="36" width="3" height="6" rx="1" fill="#87CEEB" stroke="#555" stroke-width="0.4"/>

    <!-- Side windows (right) -->
    <rect x="25" y="20" width="3" height="6" rx="1" fill="#87CEEB" stroke="#555" stroke-width="0.4"/>
    <rect x="25" y="28" width="3" height="6" rx="1" fill="#87CEEB" stroke="#555" stroke-width="0.4"/>
    <rect x="25" y="36" width="3" height="6" rx="1" fill="#87CEEB" stroke="#555" stroke-width="0.4"/>

    <!-- Headlights -->
    <circle cx="13" cy="10" r="1.3" fill="#FFFF99" stroke="#666" stroke-width="0.4"/>
    <circle cx="23" cy="10" r="1.3" fill="#FFFF99" stroke="#666" stroke-width="0.4"/>

    <!-- Taillights -->
    <rect x="12" y="49" width="3" height="1.5" rx="0.5" fill="#FF4444" stroke="#333" stroke-width="0.3"/>
    <rect x="21" y="49" width="3" height="1.5" rx="0.5" fill="#FF4444" stroke="#333" stroke-width="0.3"/>

    <!-- Taxi sign on roof -->
    <rect x="14" y="24" width="8" height="4" rx="1.2" fill="#FFFFFF" stroke="#888" stroke-width="0.4"/>
    <text x="18" y="27.5" font-family="Arial, sans-serif" font-size="3.5" font-weight="700" fill="#333" text-anchor="middle">TAXI</text>

    <!-- Label on roof -->
    ${label ? `<text x="18" y="36" font-family="Arial, sans-serif" font-size="5" font-weight="700" fill="${color.body === '#22c55e' || color.body === '#FDB813' ? '#1a1a1a' : '#FFFFFF'}" text-anchor="middle">${label}</text>` : ''}
  </svg>
`;

// ── Taxi color presets ──────────────────────────────────────────────────

export const TAXI_COLORS = {
  available: { body: '#22c55e', stroke: '#16a34a' },   // Green
  busy: { body: '#FDB813', stroke: '#D4960A' },         // Yellow
  offline: { body: '#ef4444', stroke: '#dc2626' },       // Red
} as const;

/** Map a provider status string to taxi colors */
export const getTaxiColorByStatus = (status: string) =>
  TAXI_COLORS[status as keyof typeof TAXI_COLORS] || TAXI_COLORS.available;

// ── Small taxi SVG for UI panels (DriverProfilePanel, etc.) ────────────

export const getTaxiSmallSvg = (status: string = 'available') => {
  const color = getTaxiColorByStatus(status);
  return getTaxiSvg(color);
};
