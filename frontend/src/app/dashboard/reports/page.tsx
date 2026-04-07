'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { FileText, Search, ArrowRight, Filter } from 'lucide-react';
import { searchApi } from '@/lib/api';
import { RiskBadge } from '@/components/ui/risk-badge';
import { formatDistanceToNow } from 'date-fns';

const STATUS_FILTERS = ['all', 'completed', 'running', 'failed', 'pending'];

export default function ReportsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['searches', page],
    queryFn: () => searchApi.list(page, 15),
  });

  const searches = data?.data || [];
  const filtered = statusFilter === 'all'
    ? searches
    : searches.filter((s: any) => s.status === statusFilter);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Reports</h1>
          <p className="text-gray-500 text-sm mt-1">{data?.total || 0} total searches</p>
        </div>
        <Link href="/dashboard/search" className="btn-primary">
          <Search className="w-4 h-4" />
          New Search
        </Link>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === f
                ? 'bg-brand-700 text-white border-brand-700'
                : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16">
          <FileText className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-500">No searches found.</p>
          <Link href="/dashboard/search" className="btn-primary mt-4 inline-flex">
            Start a new search
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((s: any) => (
            <Link
              key={s.id}
              href={`/dashboard/report/${s.id}`}
              className="card hover:shadow-md transition-shadow flex items-center gap-4 group"
            >
              <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-brand-600" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 text-sm">
                    {s.surveyNumber ? `Survey: ${s.surveyNumber}` : `Doc: ${s.documentNumber}`}
                  </span>
                  <StatusChip status={s.status} />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {s.district}
                  {s.sro ? ` · ${s.sro}` : ''}
                  {s.taluk ? ` · ${s.taluk}` : ''}
                  {' · '}
                  {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}
                </p>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                {s.riskReport && (
                  <div className="hidden sm:flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">Risk:</span>
                    <RiskBadge category={s.riskReport.riskCategory} />
                  </div>
                )}
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-brand-500" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.total > 15 && (
        <div className="flex justify-center gap-2 pt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-outline disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-sm text-gray-500">
            Page {page} of {Math.ceil(data.total / 15)}
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page >= Math.ceil(data.total / 15)}
            className="btn-outline disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    completed: 'bg-green-100 text-green-700',
    running: 'bg-yellow-100 text-yellow-700',
    queued: 'bg-blue-100 text-blue-700',
    pending: 'bg-gray-100 text-gray-500',
    failed: 'bg-red-100 text-red-700',
    captcha_required: 'bg-orange-100 text-orange-700',
    manual_required: 'bg-purple-100 text-purple-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg[status] || 'bg-gray-100 text-gray-600'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
