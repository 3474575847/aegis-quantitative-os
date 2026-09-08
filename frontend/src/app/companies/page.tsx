'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiUrl } from '@/lib/api';

// These are the symbols the worker actively ingests and the API has confirmed live
// quotes for. The list is driven by what providers (Coinbase, Finnhub) support —
// not fabricated. Users can enter any additional Finnhub-covered symbol.
const SUGGESTED_SYMBOLS: Array<{ symbol: string; label: string; sector: string }> = [
  { symbol: 'AAPL', label: 'Apple Inc', sector: 'Technology' },
  { symbol: 'NVDA', label: 'NVIDIA Corp', sector: 'Technology' },
  { symbol: 'MSFT', label: 'Microsoft Corp', sector: 'Technology' },
  { symbol: 'GOOGL', label: 'Alphabet Inc', sector: 'Technology' },
  { symbol: 'AMZN', label: 'Amazon.com Inc', sector: 'Consumer' },
  { symbol: 'META', label: 'Meta Platforms', sector: 'Technology' },
  { symbol: 'TSLA', label: 'Tesla Inc', sector: 'Automotive' },
  { symbol: 'NFLX', label: 'Netflix Inc', sector: 'Media' },
  { symbol: 'JPM', label: 'JPMorgan Chase', sector: 'Financials' },
  { symbol: 'GS', label: 'Goldman Sachs', sector: 'Financials' },
  { symbol: 'BAC', label: 'Bank of America', sector: 'Financials' },
  { symbol: 'XOM', label: 'ExxonMobil Corp', sector: 'Energy' },
  { symbol: 'JNJ', label: 'Johnson & Johnson', sector: 'Healthcare' },
  { symbol: 'UNH', label: 'UnitedHealth Group', sector: 'Healthcare' },
  { symbol: 'V', label: 'Visa Inc', sector: 'Financials' },
  { symbol: 'WMT', label: 'Walmart Inc', sector: 'Consumer' },
];

const SECTORS = ['All', ...Array.from(new Set(SUGGESTED_SYMBOLS.map((s) => s.sector))).sort()];

export default function CompaniesIndexPage() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [sectorFilter, setSectorFilter] = useState('All');

  const navigate = (symbol: string) => {
    router.push(`/companies/${symbol.toUpperCase().trim()}`);
  };

  // Validate symbol against the live quote endpoint before navigating.
  // This prevents navigation to a symbol the provider doesn't recognise.
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const sym = input.toUpperCase().trim();
    if (!sym) return;
    setChecking(true);
    setCheckError(null);
    try {
      const res = await fetch(apiUrl(`/api/market/ticker/${sym}`));
      if (!res.ok) {
        setCheckError(`Symbol "${sym}" not found or provider unavailable.`);
        return;
      }
      const data = await res.json();
      // A price of 0 from the fallback cache still means the symbol isn't known
      if (data.price === 0) {
        setCheckError(`No live quote available for "${sym}". Try a different symbol.`);
        return;
      }
      navigate(sym);
    } catch {
      setCheckError('Cannot reach API — check that the backend is running on port 8000.');
    } finally {
      setChecking(false);
    }
  };

  const filtered =
    sectorFilter === 'All'
      ? SUGGESTED_SYMBOLS
      : SUGGESTED_SYMBOLS.filter((s) => s.sector === sectorFilter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <header>
        <p className="card-title">Company Intelligence</p>
        <h1 style={{ fontSize: '26px', fontWeight: '700', marginTop: '6px' }}>Search a company</h1>
        <p
          style={{
            color: 'var(--text-muted)',
            marginTop: '6px',
            fontSize: '13px',
            maxWidth: '680px',
          }}
        >
          Enter any ticker symbol to view provider-backed profile, financials, valuation metrics,
          and the market chart. Data is sourced live from Finnhub and Coinbase — no fabricated
          values.
        </p>
      </header>

      {/* Search bar */}
      <section className="card">
        <form
          onSubmit={handleSearch}
          style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}
        >
          <div style={{ flex: 1 }}>
            <input
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value.toUpperCase());
                setCheckError(null);
              }}
              placeholder="Ticker symbol — e.g. AAPL, TSLA, MSFT, NVDA"
              style={{
                width: '100%',
                padding: '10px 14px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                fontSize: '14px',
                fontFamily: 'var(--font-mono)',
                fontWeight: '600',
              }}
            />
            {checkError && (
              <p style={{ color: 'var(--accent-amber)', fontSize: '12px', marginTop: '6px' }}>
                ⚠ {checkError}
              </p>
            )}
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={checking || !input.trim()}
            style={{ whiteSpace: 'nowrap' }}
          >
            {checking ? 'Checking...' : 'Open Company →'}
          </button>
        </form>
        <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '10px' }}>
          Validates against Finnhub before navigating. Any symbol supported by the free Finnhub plan
          works.
        </p>
      </section>

      {/* Suggested companies */}
      <section>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>
            Suggested — {filtered.length} symbols
          </span>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {SECTORS.map((sector) => (
              <button
                key={sector}
                className={`btn ${sectorFilter === sector ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSectorFilter(sector)}
                style={{ fontSize: '11px', padding: '4px 10px' }}
              >
                {sector}
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '12px',
          }}
        >
          {filtered.map(({ symbol, label, sector }) => (
            <button
              key={symbol}
              onClick={() => navigate(symbol)}
              className="card"
              style={{
                textAlign: 'left',
                cursor: 'pointer',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-card)',
                transition: 'border-color 0.15s',
                padding: '14px 16px',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent-cyan)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
            >
              <div
                className="font-mono"
                style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}
              >
                {symbol}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                {label}
              </div>
              <div style={{ marginTop: '6px' }}>
                <span className="badge badge-cyan" style={{ fontSize: '10px', padding: '2px 6px' }}>
                  {sector}
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Provider note */}
      <section className="card" style={{ borderColor: 'var(--border-color)' }}>
        <div className="table-header" style={{ marginBottom: '8px' }}>
          <span>Data providers</span>
          <span className="badge badge-cyan">NO FABRICATED VALUES</span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '12px',
            fontSize: '12px',
          }}
        >
          <div>
            <div style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>Live quotes</div>
            <div style={{ color: 'var(--text-muted)', marginTop: '3px' }}>
              Finnhub (equities) · Coinbase (crypto)
            </div>
          </div>
          <div>
            <div style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>Company profile</div>
            <div style={{ color: 'var(--text-muted)', marginTop: '3px' }}>
              Finnhub stock profile API
            </div>
          </div>
          <div>
            <div style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>
              Unavailable fields
            </div>
            <div style={{ color: 'var(--text-muted)', marginTop: '3px' }}>
              Shown as &quot;Unavailable&quot; — never fabricated
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
