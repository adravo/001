'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  AlertTriangle, CheckCircle, Clock, Download, Upload,
  RefreshCw, Shield, User, MapPin, FileText, TrendingUp,
} from 'lucide-react';
import { searchApi, reportsApi, uploadApi } from '@/lib/api';
import { subscribeToSearch, CaptchaRequiredEvent } from '@/lib/websocket';
import { RiskBadge } from '@/components/ui/risk-badge';
import { RiskMeter } from '@/components/ui/risk-meter';
import { CaptchaModal } from '@/components/automation/captcha-modal';
import { AutomationProgress } from '@/components/automation/automation-progress';
import { TransactionTimeline } from '@/components/ui/transaction-timeline';
import { formatDistanceToNow } from 'date-fns';

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [captchaEvent, setCaptchaEvent] = useState<CaptchaRequiredEvent | null>(null);
  const [progress, setProgress] = useState({ step: 'Initializing...', pct: 0 });
  const [status, setStatus] = useState('');
  const [failed, setFailed] = useState<{ reason: string; fallback: string } | null>(null);

  const { data: search, isLoading, refetch } = useQuery({
    queryKey: ['search', id],
    queryFn: () => searchApi.get(id),
    refetchInterval: (data) => {
      const runningStatuses = ['pending', 'queued', 'running', 'captcha_required'];
      return runningStatuses.includes(data?.status) ? 3000 : false;
    },
  });

  // Subscribe to WebSocket events
  useEffect(() => {
    const unsub = subscribeToSearch(id, {
      onStatusUpdate: (evt) => {
        setStatus(evt.message);
        queryClient.invalidateQueries({ queryKey: ['search', id] });
      },
      onProgress: (evt) => {
        setProgress({ step: evt.step, pct: evt.percentage });
      },
      onCaptchaRequired: (evt) => {
        setCaptchaEvent(evt);
        toast('CAPTCHA detected — your input needed', { icon: '🔒' });
      },
      onCompleted: () => {
        toast.success('Verification complete!');
        queryClient.invalidateQueries({ queryKey: ['search', id] });
        setProgress({ step: 'Complete', pct: 100 });
      },
      onFailed: (evt) => {
        setFailed({ reason: evt.reason, fallback: evt.fallback });
        toast.error('Automation failed. See fallback options.');
        queryClient.invalidateQueries({ queryKey: ['search', id] });
      },
    });
    return unsub;
  }, [id, queryClient]);

  const handleDownloadReport = async () => {
    try {
      const report = await reportsApi.get(id);
      if (report.reportPdfSignedUrl && !report.reportPdfSignedUrl.startsWith('#')) {
        window.open(report.reportPdfSignedUrl, '_blank');
      } else {
        toast('PDF will be available once S3 is configured.', { icon: '📄' });
      }
    } catch {
      toast.error('Could not load report');
    }
  };

  const handleEcUpload = async (file: File) => {
    try {
      await uploadApi.uploadEc(id, file);
      toast.success('EC uploaded successfully! Our team will review it.');
      refetch();
    } catch {
      toast.error('Upload failed. Try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!search) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Search not found.</p>
        <button onClick={() => router.push('/dashboard')} className="btn-primary mt-4">
          Go to Dashboard
        </button>
      </div>
    );
  }

  const isRunning = ['pending', 'queued', 'running'].includes(search.status);
  const isCaptcha = search.status === 'captcha_required';
  const isComplete = search.status === 'completed';
  const isFailed = search.status === 'failed' || search.status === 'manual_required';
  const land = search.landRecord;
  const risk = search.riskReport;

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Land Verification Report</h1>
          <p className="text-sm text-gray-400 mt-1">
            {search.district} ·{' '}
            {search.surveyNumber ? `Survey ${search.surveyNumber}` : `Doc ${search.documentNumber}`} ·{' '}
            {formatDistanceToNow(new Date(search.createdAt), { addSuffix: true })}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {isComplete && (
            <button onClick={handleDownloadReport} className="btn-outline text-sm">
              <Download className="w-4 h-4" />
              PDF Report
            </button>
          )}
          <button onClick={() => refetch()} className="btn-outline text-sm">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Automation Progress */}
      {(isRunning || isCaptcha) && (
        <AutomationProgress
          step={progress.step}
          percentage={progress.pct}
          status={status}
          isCaptcha={isCaptcha}
        />
      )}

      {/* CAPTCHA Modal */}
      {captchaEvent && (
        <CaptchaModal
          event={captchaEvent}
          searchId={id}
          onResolved={() => {
            setCaptchaEvent(null);
            toast.success('CAPTCHA solved. Resuming automation...');
            refetch();
          }}
          onClose={() => setCaptchaEvent(null)}
        />
      )}

      {/* Failed / Fallback */}
      {isFailed && (
        <div className="card border-red-200 bg-red-50">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-800 mb-1">Automation Failed</h3>
              <p className="text-sm text-red-700 mb-3">
                {search.errorMessage || failed?.reason || 'Unknown error'}
              </p>
              <p className="text-sm text-gray-700 mb-4">
                {failed?.fallback || 'You can manually upload the EC document below.'}
              </p>
              <EcUploadFallback onUpload={handleEcUpload} />
            </div>
          </div>
        </div>
      )}

      {/* Risk Score */}
      {risk && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Risk Assessment</h2>
            <RiskBadge category={risk.riskCategory} size="lg" />
          </div>
          <RiskMeter score={risk.riskScore} category={risk.riskCategory} />
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-sm text-gray-700 whitespace-pre-line">{risk.summary}</p>
          </div>
        </div>
      )}

      {/* Land Details */}
      {land && (
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-brand-600" />
            Land Details
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { label: 'Owner Name', value: land.ownerName, icon: User },
              { label: "Father's Name", value: land.fatherName, icon: User },
              { label: 'Survey Number', value: land.surveyNumber || search.surveyNumber },
              { label: 'Patta Number', value: land.pattaNumber },
              { label: 'District', value: land.district || search.district },
              { label: 'Taluk', value: land.taluk || search.taluk },
              { label: 'Village', value: land.village || search.village },
              { label: 'Land Classification', value: land.landClassification },
              { label: 'Extent (Hectares)', value: land.extentHectares },
              { label: 'Has Encumbrance', value: land.hasEncumbrance ? '⚠ Yes' : '✓ No' },
            ].filter(f => f.value).map((f) => (
              <div key={f.label} className="flex gap-3 bg-gray-50 rounded-lg p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500">{f.label}</p>
                  <p className="text-sm font-medium text-gray-900 mt-0.5">{String(f.value)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk Factors */}
      {risk?.riskFactors?.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            Risk Factors ({risk.riskFactors.length})
          </h2>
          <div className="space-y-3">
            {risk.riskFactors.map((f: any) => (
              <div key={f.code} className={`p-3 rounded-lg border ${
                f.severity === 'critical' ? 'bg-red-50 border-red-200' :
                f.severity === 'high' ? 'bg-orange-50 border-orange-200' :
                'bg-yellow-50 border-yellow-200'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <RiskBadge category={f.severity.toUpperCase()} size="sm" />
                  <span className="text-sm font-medium text-gray-800">{f.description}</span>
                </div>
                {f.details && (
                  <p className="text-xs text-gray-600">{f.details}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendation */}
      {risk?.recommendation && (
        <div className="card bg-blue-50 border-blue-200">
          <div className="flex gap-3">
            <Shield className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-blue-900 mb-1">Recommendation</h3>
              <p className="text-sm text-blue-800">{risk.recommendation}</p>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Timeline */}
      {land?.transactions?.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-brand-600" />
            Transaction History ({land.transactions.length} records)
          </h2>
          <TransactionTimeline transactions={land.transactions} />
        </div>
      )}

      {/* Disclaimer */}
      <div className="text-xs text-gray-400 text-center pb-4">
        ⚠ This report aggregates publicly available data. Verify legally before property purchase.
        TN Land Verify does not provide legal advice.
      </div>
    </div>
  );
}

function EcUploadFallback({ onUpload }: { onUpload: (file: File) => void }) {
  return (
    <label className="btn-outline cursor-pointer text-sm">
      <Upload className="w-4 h-4" />
      Upload EC PDF manually
      <input
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
        }}
      />
    </label>
  );
}
