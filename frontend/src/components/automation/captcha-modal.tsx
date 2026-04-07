'use client';

import { useState } from 'react';
import { Lock, X, Loader2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { automationApi } from '@/lib/api';
import { CaptchaRequiredEvent } from '@/lib/websocket';

interface Props {
  event: CaptchaRequiredEvent;
  searchId: string;
  onResolved: () => void;
  onClose: () => void;
}

export function CaptchaModal({ event, searchId, onResolved, onClose }: Props) {
  const [solution, setSolution] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!solution.trim()) {
      toast.error('Please enter the CAPTCHA solution');
      return;
    }
    setLoading(true);
    try {
      await automationApi.submitCaptcha(searchId, event.sessionToken, solution.trim());
      onResolved();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to submit CAPTCHA');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-orange-50 border-b border-orange-100 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
              <Lock className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 text-sm">CAPTCHA Required</h2>
              <p className="text-xs text-gray-500">Automation paused — your input needed</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-orange-100 rounded-lg text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              The government portal has displayed a CAPTCHA. Please solve it below to continue
              the automated search. We do not bypass security mechanisms.
            </p>
          </div>

          {/* Screenshot */}
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
            <p className="text-xs text-gray-400 px-3 py-2 border-b">
              Portal screenshot at time of CAPTCHA:
            </p>
            <img
              src={`data:image/jpeg;base64,${event.screenshot}`}
              alt="CAPTCHA screenshot from portal"
              className="w-full object-contain max-h-64"
            />
          </div>

          <div>
            <label className="label">Enter the CAPTCHA text you see:</label>
            <input
              type="text"
              value={solution}
              onChange={(e) => setSolution(e.target.value)}
              className="input-field text-center font-mono tracking-widest text-lg"
              placeholder="Type CAPTCHA here"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              autoFocus
              autoComplete="off"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="btn-outline flex-1 justify-center"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !solution.trim()}
              className="btn-primary flex-1 justify-center"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Submitting...' : 'Submit & Resume'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
