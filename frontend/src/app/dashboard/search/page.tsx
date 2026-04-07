'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Search, Info, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { searchApi } from '@/lib/api';

const TN_DISTRICTS = [
  'Chennai', 'Coimbatore', 'Madurai', 'Trichy', 'Salem', 'Tirunelveli',
  'Vellore', 'Erode', 'Thoothukudi', 'Dindigul', 'Thanjavur', 'Kancheepuram',
  'Chengalpet', 'Ranipet', 'Tirupathur', 'Krishnagiri', 'Dharmapuri',
  'Namakkal', 'Tiruvannamalai', 'Villupuram', 'Cuddalore', 'Nagapattinam',
  'Mayiladuthurai', 'Ariyalur', 'Perambalur', 'Karur', 'Tiruchirappalli',
  'Pudukkottai', 'Sivagangai', 'Ramanathapuram', 'Virudhunagar', 'Tenkasi',
  'Nagercoil', 'The Nilgiris', 'Tiruppur', 'Ooty', 'Kallakurichi',
];

const schema = z
  .object({
    surveyNumber: z.string().optional(),
    documentNumber: z.string().optional(),
    district: z.string().min(1, 'District is required'),
    sro: z.string().optional(),
    village: z.string().optional(),
    taluk: z.string().optional(),
    source: z.enum(['tnreginet', 'patta', 'both']).default('both'),
  })
  .refine((d) => d.surveyNumber || d.documentNumber, {
    message: 'Provide at least a survey number or document number',
    path: ['surveyNumber'],
  });

type FormValues = z.infer<typeof schema>;

export default function SearchPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { source: 'both' },
  });

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    try {
      const result = await searchApi.create(data);
      toast.success('Search started! Monitoring automation...');
      router.push(`/dashboard/report/${result.id}`);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg || 'Failed to start search');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New Land Search</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Enter property details to retrieve EC and Patta records automatically.
        </p>
      </div>

      {/* Disclaimer */}
      <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
        <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">
          <strong>Disclaimer:</strong> This app aggregates publicly available data from TNREGINET
          and TN e-Services. Always verify with a legal professional before any property purchase.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-5">
        <h2 className="font-semibold text-gray-900">Property Details</h2>

        {/* District */}
        <div>
          <label className="label">
            District <span className="text-red-500">*</span>
          </label>
          <select {...register('district')} className="input-field">
            <option value="">Select district</option>
            {TN_DISTRICTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          {errors.district && (
            <p className="text-red-500 text-xs mt-1">{errors.district.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Survey Number</label>
            <input
              {...register('surveyNumber')}
              className="input-field"
              placeholder="e.g. 123/4A"
            />
          </div>
          <div>
            <label className="label">Document Number</label>
            <input
              {...register('documentNumber')}
              className="input-field"
              placeholder="e.g. 1234/2022"
            />
          </div>
        </div>
        {errors.surveyNumber && (
          <p className="text-red-500 text-xs -mt-3">{errors.surveyNumber.message}</p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Taluk</label>
            <input {...register('taluk')} className="input-field" placeholder="e.g. Tambaram" />
          </div>
          <div>
            <label className="label">Village</label>
            <input {...register('village')} className="input-field" placeholder="e.g. Perungudi" />
          </div>
        </div>

        <div>
          <label className="label">Sub-Registrar Office (SRO)</label>
          <input
            {...register('sro')}
            className="input-field"
            placeholder="e.g. Tambaram"
          />
        </div>

        {/* Source */}
        <div>
          <label className="label">Data Source</label>
          <div className="grid grid-cols-3 gap-3 mt-1">
            {[
              { value: 'both', label: 'Both (Recommended)', desc: 'TNREGINET + Patta' },
              { value: 'tnreginet', label: 'TNREGINET only', desc: 'EC & documents' },
              { value: 'patta', label: 'Patta only', desc: 'Land ownership' },
            ].map((opt) => (
              <label
                key={opt.value}
                className={`relative cursor-pointer border-2 rounded-lg p-3 transition-colors ${
                  watch('source') === opt.value
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  {...register('source')}
                  type="radio"
                  value={opt.value}
                  className="sr-only"
                />
                <div className="text-sm font-medium text-gray-900">{opt.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
              </label>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full justify-center py-3 text-base"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
          {loading ? 'Starting search...' : 'Start Verification'}
        </button>
      </form>
    </div>
  );
}
