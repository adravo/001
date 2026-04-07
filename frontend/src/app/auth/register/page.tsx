'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Shield, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import Cookies from 'js-cookie';
import { useRouter } from 'next/navigation';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Enter a valid email'),
  phone: z.string().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    try {
      const { accessToken } = await authApi.register({
        email: data.email,
        password: data.password,
        name: data.name,
        phone: data.phone,
      });
      Cookies.set('token', accessToken, { expires: 7, sameSite: 'strict' });
      localStorage.setItem('token', accessToken);
      toast.success('Account created! Welcome.');
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 to-blue-700 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-white font-bold text-2xl">
            <Shield className="w-7 h-7" />
            TN Land Verify
          </div>
          <p className="text-white/70 mt-2 text-sm">Create your free account</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {[
              { id: 'name', label: 'Full Name', type: 'text', placeholder: 'Your full name' },
              { id: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com' },
              { id: 'phone', label: 'Phone (optional)', type: 'tel', placeholder: '+91 98765 43210' },
              { id: 'password', label: 'Password', type: 'password', placeholder: 'Min 8 characters' },
              { id: 'confirmPassword', label: 'Confirm Password', type: 'password', placeholder: 'Repeat password' },
            ].map((f) => (
              <div key={f.id}>
                <label className="label">{f.label}</label>
                <input
                  {...register(f.id as keyof FormValues)}
                  type={f.type}
                  className="input-field"
                  placeholder={f.placeholder}
                />
                {errors[f.id as keyof FormValues] && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors[f.id as keyof FormValues]?.message}
                  </p>
                )}
              </div>
            ))}

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Creating account...' : 'Create Free Account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-5">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-brand-600 font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
