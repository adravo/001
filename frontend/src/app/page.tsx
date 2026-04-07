import Link from 'next/link';
import { Shield, Search, FileText, AlertTriangle, CheckCircle, ArrowRight } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-700 to-blue-600">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-2 text-white font-bold text-xl">
          <Shield className="w-6 h-6" />
          TN Land Verify
        </div>
        <div className="flex items-center gap-3">
          <Link href="/auth/login" className="text-white/80 hover:text-white text-sm font-medium">
            Sign In
          </Link>
          <Link href="/auth/register" className="btn-primary bg-white text-brand-700 hover:bg-gray-100">
            Get Started Free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-16 pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-white/10 text-white rounded-full px-4 py-1.5 text-sm mb-6">
          <Shield className="w-4 h-4" />
          Trusted Land Verification for Tamil Nadu
        </div>
        <h1 className="text-4xl md:text-6xl font-extrabold text-white leading-tight mb-6">
          Verify Land Records<br />
          <span className="text-yellow-300">Before You Buy</span>
        </h1>
        <p className="text-lg text-white/80 max-w-2xl mx-auto mb-10">
          Automatically retrieves encumbrance certificates, Patta/Chitta data from official
          Tamil Nadu portals and gives you an instant risk analysis report.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/auth/register" className="btn-primary text-base px-8 py-3 bg-yellow-400 text-gray-900 hover:bg-yellow-300 rounded-xl font-bold">
            Start Free Verification
            <ArrowRight className="w-5 h-5" />
          </Link>
          <Link href="#how-it-works" className="btn-outline text-base px-8 py-3 border-white/50 text-white hover:bg-white/10 rounded-xl">
            How it works
          </Link>
        </div>
        <p className="text-white/50 text-xs mt-4">
          ⚠ This app aggregates publicly available data. Verify legally before purchase.
        </p>
      </section>

      {/* Stats */}
      <section className="max-w-4xl mx-auto px-6 pb-16 grid grid-cols-3 gap-4 text-center">
        {[
          { value: 'TNREGINET', label: 'EC Certificate' },
          { value: 'Patta/Chitta', label: 'Land Records' },
          { value: '5-min', label: 'Average Report Time' },
        ].map((s) => (
          <div key={s.label} className="bg-white/10 rounded-2xl p-5 text-white">
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-sm text-white/70">{s.label}</div>
          </div>
        ))}
      </section>

      {/* Features */}
      <section id="how-it-works" className="bg-white py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">How It Works</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: Search,
                title: 'Enter Land Details',
                desc: 'Provide survey number, district, SRO, and other details.',
                step: '01',
              },
              {
                icon: Shield,
                title: 'Automated Retrieval',
                desc: 'Our engine queries TNREGINET and Patta portals on your behalf.',
                step: '02',
              },
              {
                icon: FileText,
                title: 'Data Extraction',
                desc: 'EC records, ownership history, and Patta details are parsed.',
                step: '03',
              },
              {
                icon: AlertTriangle,
                title: 'Risk Report',
                desc: 'Get a risk score with clear explanation and PDF download.',
                step: '04',
              },
            ].map((f) => (
              <div key={f.step} className="card hover:shadow-md transition-shadow">
                <div className="text-xs font-bold text-brand-500 mb-3">STEP {f.step}</div>
                <f.icon className="w-8 h-8 text-brand-700 mb-3" />
                <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Risk categories */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">
            What We Check
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: '🔄', label: 'Frequent Ownership Changes', risk: 'HIGH' },
              { icon: '📋', label: 'Missing EC Years', risk: 'MEDIUM' },
              { icon: '⚠️', label: 'Owner Name Mismatch', risk: 'CRITICAL' },
              { icon: '🏦', label: 'Active Mortgage/Hypothecation', risk: 'HIGH' },
              { icon: '⚖️', label: 'Legal Disputes & Court Orders', risk: 'CRITICAL' },
              { icon: '📊', label: 'Partition Deed Conflicts', risk: 'MEDIUM' },
            ].map((c) => (
              <div key={c.label} className="flex items-center gap-3 bg-white rounded-lg p-4 border border-gray-200">
                <span className="text-2xl">{c.icon}</span>
                <div>
                  <div className="text-sm font-medium text-gray-800">{c.label}</div>
                  <div className={`badge-risk-${c.risk.toLowerCase()} mt-1`}>{c.risk}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand-900 py-16 text-center">
        <div className="max-w-2xl mx-auto px-6">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-3">Ready to Verify Your Property?</h2>
          <p className="text-white/70 mb-6">
            Start free. Get your first land verification report in minutes.
          </p>
          <Link href="/auth/register" className="btn-primary bg-yellow-400 text-gray-900 hover:bg-yellow-300 px-8 py-3 text-base rounded-xl font-bold">
            Create Free Account
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white/50 text-xs text-center py-6">
        <p>© 2024 TN Land Verify. Data sourced from TNREGINET & TN e-Services.</p>
        <p className="mt-1">
          This app aggregates publicly available data. Always verify with a legal professional before property purchase.
        </p>
      </footer>
    </div>
  );
}
