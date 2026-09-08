'use client';

import { use, useEffect, useState } from 'react';
import SentimentPriceChart, { ChartDatapoint, ChartSignal } from '../../components/SentimentPriceChart';
import { apiUrl, formatFigure } from '@/lib/api';

interface CompanyData {
  symbol: string;
  quote: {
    price: number;
    exchange: string;
    timestamp: string;
    is_fallback?: boolean;
  };
  profile: {
    name?: string;
    exchange?: string;
    finnhubIndustry?: string;
    marketCapitalization?: number;
    logo?: string;
  };
  metrics: Record<string, number>;
  sources: Record<string, string>;
}

export default function CompanyPage({ params }: { params: Promise<{ symbol: string }> }) {
  // Next.js 15: params is a Promise — unwrap with React.use()
  const { symbol: rawSymbol } = use(params);
  const symbol = rawSymbol.toUpperCase();

  const [company, setCompany] = useState<CompanyData | null>(null);
  const [history, setHistory] = useState<ChartDatapoint[]>([]);
  const [signals, setSignals] = useState<ChartSignal[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(apiUrl(`/api/companies/${symbol}`)).then((response) => {
        if (!response.ok) throw new Error('Company provider unavailable');
        return response.json();
      }),
      fetch(apiUrl(`/api/news-momentum/${symbol}`)).then((response) =>
        response.ok ? response.json() : { datapoints: [], signals: [] },
      ),
    ])
      .then(([companyData, historyData]) => {
        setCompany(companyData);
        setHistory(historyData.datapoints || []);
        setSignals(historyData.signals || []);
      })
      .catch((requestError: Error) => setError(requestError.message));
  }, [symbol]);

  if (error) {
    return (
      <div className="card">
        <h1>{symbol}</h1>
        <p style={{ color: 'var(--accent-amber)' }}>{error}</p>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="card">
        <p style={{ color: 'var(--text-muted)' }}>Loading provider-backed company data...</p>
      </div>
    );
  }

  const metricItems = [
    [
      'Market cap',
      company.profile.marketCapitalization
        ? `${company.profile.marketCapitalization.toLocaleString()}M`
        : null,
    ],
    ['P/E', company.metrics.peBasicExclExtraTTM],
    ['EPS growth', company.metrics.epsGrowthTTMYoy],
    ['ROE', company.metrics.roeTTM],
    ['52w high', company.metrics['52WeekHigh']],
    ['52w low', company.metrics['52WeekLow']],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <header>
        <p className="card-title">Company Intelligence / {company.sources.profile}</p>
        <h1 style={{ fontSize: '30px', color: 'var(--text-primary)', marginTop: '6px' }}>
          {company.profile.name || symbol}
        </h1>
        <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
          {symbol} · {company.profile.finnhubIndustry || 'Industry unavailable'} ·{' '}
          {company.profile.exchange || 'Exchange unavailable'}
        </p>
      </header>

      <div className="grid-4">
        <div className="card">
          <span className="card-title">Live price</span>
          <strong className="card-value">
            ${formatFigure(company.quote.price)}
          </strong>
          <span className="card-subtitle">{company.quote.exchange}</span>
        </div>
        {metricItems.slice(0, 3).map(([label, value]) => (
          <div className="card" key={label as string}>
            <span className="card-title">{label}</span>
            <strong className="card-value">
              {value === null || value === undefined ? 'Unavailable' : String(value)}
            </strong>
            <span className="card-subtitle">Finnhub metric</span>
          </div>
        ))}
      </div>

      <SentimentPriceChart data={history} signals={signals} assetName={symbol} />

      <section className="card">
        <div className="table-header">
          <span>Provider-backed snapshot</span>
          <span className="badge badge-cyan">NO FABRICATED VALUES</span>
        </div>
        <div className="grid-4" style={{ marginTop: '16px' }}>
          {metricItems.slice(3).map(([label, value]) => (
            <div key={label as string}>
              <span className="card-title">{label}</span>
              <div className="card-value" style={{ fontSize: '18px' }}>
                {value === null || value === undefined ? 'Unavailable' : String(value)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
