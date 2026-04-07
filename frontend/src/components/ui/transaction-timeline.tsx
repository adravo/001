'use client';

interface Transaction {
  id: string;
  documentNumber?: string;
  documentType?: string;
  registrationDate?: string;
  sellerName?: string;
  buyerName?: string;
  considerationAmount?: number;
  sro?: string;
  extent?: string;
}

interface Props {
  transactions: Transaction[];
}

const DOC_TYPE_COLORS: Record<string, string> = {
  sale: 'bg-blue-500',
  gift: 'bg-purple-500',
  mortgage: 'bg-red-500',
  release: 'bg-green-500',
  partition: 'bg-orange-500',
  settlement: 'bg-teal-500',
};

export function TransactionTimeline({ transactions }: Props) {
  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-3.5 top-2 bottom-2 w-0.5 bg-gray-200" />

      <div className="space-y-4">
        {transactions.map((tx, i) => {
          const typeKey = (tx.documentType || '').toLowerCase();
          const dotColor = Object.entries(DOC_TYPE_COLORS).find(([k]) => typeKey.includes(k))?.[1] || 'bg-gray-400';
          const isLatest = i === transactions.length - 1;

          return (
            <div key={tx.id} className="flex gap-4 pl-2">
              {/* Dot */}
              <div className={`w-4 h-4 rounded-full flex-shrink-0 mt-1 ${dotColor} ${isLatest ? 'ring-2 ring-offset-2 ring-gray-200' : ''}`} />

              {/* Content */}
              <div className="flex-1 bg-gray-50 rounded-lg p-3 min-w-0">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <span className="font-medium text-sm text-gray-900">
                      {tx.documentType || 'Unknown Transaction'}
                    </span>
                    {tx.documentNumber && (
                      <span className="text-xs text-gray-400 ml-2">#{tx.documentNumber}</span>
                    )}
                  </div>
                  {tx.registrationDate && (
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {tx.registrationDate}
                    </span>
                  )}
                </div>

                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
                  {tx.sellerName && (
                    <div><span className="text-gray-400">From:</span> {tx.sellerName}</div>
                  )}
                  {tx.buyerName && (
                    <div><span className="text-gray-400">To:</span> {tx.buyerName}</div>
                  )}
                  {tx.considerationAmount && (
                    <div>
                      <span className="text-gray-400">Amount:</span>{' '}
                      ₹{Number(tx.considerationAmount).toLocaleString('en-IN')}
                    </div>
                  )}
                  {tx.sro && (
                    <div><span className="text-gray-400">SRO:</span> {tx.sro}</div>
                  )}
                  {tx.extent && (
                    <div><span className="text-gray-400">Extent:</span> {tx.extent}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
