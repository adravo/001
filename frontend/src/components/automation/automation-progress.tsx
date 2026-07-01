'use client';

import { Loader2, Lock } from 'lucide-react';

interface Props {
  step: string;
  percentage: number;
  status: string;
  isCaptcha: boolean;
}

export function AutomationProgress({ step, percentage, status, isCaptcha }: Props) {
  return (
    <div className={`card ${isCaptcha ? 'border-orange-300 bg-orange-50' : 'border-blue-200 bg-blue-50'}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
          isCaptcha ? 'bg-orange-100' : 'bg-blue-100'
        }`}>
          {isCaptcha ? (
            <Lock className="w-4 h-4 text-orange-600" />
          ) : (
            <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
          )}
        </div>
        <div>
          <p className="font-medium text-sm text-gray-900">
            {isCaptcha ? '🔒 CAPTCHA Detected — Action Required' : '⚙ Automation Running'}
          </p>
          <p className="text-xs text-gray-500">{status || step}</p>
        </div>
      </div>

      {/* Steps */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{step}</span>
          <span>{percentage}%</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isCaptcha ? 'bg-orange-400' : 'bg-blue-500'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Step indicators */}
      <div className="flex gap-1.5 flex-wrap">
        {[
          'Launching browser',
          'Navigating portal',
          'Filling form',
          'Extracting data',
          'Running risk analysis',
          'Generating report',
        ].map((s, i) => {
          const stepPct = (i / 5) * 100;
          const done = percentage > stepPct + 5;
          const active = percentage >= stepPct && percentage <= stepPct + 20;
          return (
            <div
              key={s}
              className={`text-xs px-2 py-0.5 rounded-full ${
                done ? 'bg-green-100 text-green-700' :
                active ? 'bg-blue-100 text-blue-700 font-medium' :
                'bg-gray-100 text-gray-400'
              }`}
            >
              {done ? '✓ ' : ''}{s}
            </div>
          );
        })}
      </div>

      {isCaptcha && (
        <div className="mt-3 text-xs text-orange-700 bg-orange-100 rounded-lg px-3 py-2">
          Automation has paused. A CAPTCHA dialog will appear shortly. Please solve it to continue.
        </div>
      )}
    </div>
  );
}
