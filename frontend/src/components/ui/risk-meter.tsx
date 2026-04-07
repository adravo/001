'use client';

interface Props {
  score: number;
  category: string;
}

const COLORS: Record<string, string> = {
  LOW: '#059669',
  MEDIUM: '#d97706',
  HIGH: '#dc2626',
  CRITICAL: '#7f1d1d',
  UNKNOWN: '#6b7280',
};

export function RiskMeter({ score, category }: Props) {
  const color = COLORS[category] || COLORS.UNKNOWN;
  const pct = Math.min(100, Math.max(0, score));

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between">
        <div>
          <span className="text-4xl font-extrabold" style={{ color }}>{score}</span>
          <span className="text-lg text-gray-400 ml-1">/100</span>
        </div>
        <div className="text-right text-xs text-gray-400">
          <div>0 — Safe</div>
          <div>100 — Critical</div>
        </div>
      </div>

      {/* Track */}
      <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 rounded-full" style={{
          background: 'linear-gradient(to right, #059669 0%, #d97706 50%, #dc2626 100%)',
          opacity: 0.2,
        }} />
        {/* Score bar */}
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
        {/* Pointer */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow-md"
          style={{ left: `${pct}%` }}
        />
      </div>

      <div className="flex justify-between text-xs text-gray-400">
        <span>LOW</span>
        <span>MEDIUM</span>
        <span>HIGH</span>
        <span>CRITICAL</span>
      </div>
    </div>
  );
}
