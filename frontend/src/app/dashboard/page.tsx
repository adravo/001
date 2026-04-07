'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Search, FileText, AlertTriangle, CheckCircle, Clock, ArrowRight } from 'lucide-react';
import { searchApi } from '@/lib/api';
import { RiskBadge } from '@/components/ui/risk-badge';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/lib/auth-context';

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['searches'],
    queryFn: () => searchApi.list(1, 5),
  });

  const searches = data?.data || [];

  const stats = {
    total: data?.total || 0,
    completed: searches.filter((s: any) => s.status === 'completed').length,
    pending: searches.filter((s: any) =>
      ['pending', 'queued', 'running'].includes(s.status)).length,
    highRisk: searches.filter((s: any) =>
      ['HIGH', 'CRITICAL'].includes(s.riskReport?.riskCategory)).length,
  };

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.name?.split(' ')[0] || 'there'} 👋
        </h1>
        <p className="text-gray-500 mt-1">Here&apos;s your land verification overview.</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Searches', value: stats.total, icon: Search, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Completed', value: stats.completed, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'In Progress', value: stats.pending, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50' },
          { label: 'High Risk', value: stats.highRisk, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
        ].map((s) => (
          <div key={s.label} className="card flex items-center gap-4">
            <div className={`w-10 h-10 ${s.bg} rounded-lg flex items-center justify-center`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick action */}
      <div className="card bg-gradient-to-r from-brand-900 to-brand-700 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-lg">Verify a Property</h2>
            <p className="text-white/70 text-sm mt-1">
              Enter survey number, district, and SRO to start verification.
            </p>
          </div>
          <Link href="/dashboard/search" className="btn-primary bg-yellow-400 text-gray-900 hover:bg-yellow-300 whitespace-nowrap">
            New Search
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Recent searches */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Recent Searches</h2>
          <Link href="/dashboard/reports" className="text-sm text-brand-600 hover:underline">
            View all
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : searches.length === 0 ? (
          <div className="text-center py-10">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No searches yet.</p>
            <Link href="/dashboard/search" className="btn-primary mt-3 text-sm">
              Start your first search
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {searches.map((s: any) => (
              <Link
                key={s.id}
                href={`/dashboard/report/${s.id}`}
                className="flex items-center justify-between py-3 hover:bg-gray-50 -mx-1 px-1 rounded-lg transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {s.surveyNumber ? `Survey: ${s.surveyNumber}` : `Doc: ${s.documentNumber}`}
                    </span>
                    <StatusPill status={s.status} />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {s.district} · {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  {s.riskReport && <RiskBadge category={s.riskReport.riskCategory} />}
                  <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-gray-100 text-gray-600' },
    queued: { label: 'Queued', className: 'bg-blue-100 text-blue-700' },
    running: { label: 'Running', className: 'bg-yellow-100 text-yellow-700 animate-pulse' },
    captcha_required: { label: 'CAPTCHA', className: 'bg-orange-100 text-orange-700' },
    completed: { label: 'Done', className: 'bg-green-100 text-green-700' },
    failed: { label: 'Failed', className: 'bg-red-100 text-red-700' },
    manual_required: { label: 'Manual', className: 'bg-purple-100 text-purple-700' },
  };
  const s = map[status] || { label: status, className: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
}
