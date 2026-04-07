import { clsx } from 'clsx';

interface Props {
  category: string;
  size?: 'sm' | 'md' | 'lg';
}

const CONFIG: Record<string, { label: string; className: string }> = {
  LOW:      { label: 'LOW RISK',      className: 'bg-green-100 text-green-800 border-green-200' },
  MEDIUM:   { label: 'MEDIUM RISK',   className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  HIGH:     { label: 'HIGH RISK',     className: 'bg-orange-100 text-orange-800 border-orange-200' },
  CRITICAL: { label: 'CRITICAL RISK', className: 'bg-red-100 text-red-800 border-red-200' },
  UNKNOWN:  { label: 'UNKNOWN',       className: 'bg-gray-100 text-gray-700 border-gray-200' },
  // Severity aliases
  low:      { label: 'LOW',           className: 'bg-green-100 text-green-700 border-green-200' },
  medium:   { label: 'MEDIUM',        className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  high:     { label: 'HIGH',          className: 'bg-orange-100 text-orange-700 border-orange-200' },
  critical: { label: 'CRITICAL',      className: 'bg-red-100 text-red-700 border-red-200' },
};

export function RiskBadge({ category, size = 'md' }: Props) {
  const cfg = CONFIG[category] || CONFIG.UNKNOWN;
  return (
    <span className={clsx(
      'inline-flex items-center font-bold border rounded-full',
      cfg.className,
      size === 'sm' && 'px-1.5 py-0.5 text-xs',
      size === 'md' && 'px-2 py-0.5 text-xs',
      size === 'lg' && 'px-3 py-1 text-sm',
    )}>
      {cfg.label}
    </span>
  );
}
