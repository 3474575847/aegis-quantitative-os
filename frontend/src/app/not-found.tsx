import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ padding: '60px 24px', textAlign: 'center' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent-cyan)' }}>
        404 - Page Not Found
      </h2>
      <p style={{ marginTop: '12px', color: 'var(--text-muted)' }}>
        The requested resource or quantitative interface could not be located.
      </p>
      <div style={{ marginTop: '24px' }}>
        <Link
          href="/"
          className="nav-item"
          style={{
            display: 'inline-flex',
            padding: '8px 16px',
            background: 'rgba(0, 229, 255, 0.1)',
            border: '1px solid rgba(0, 229, 255, 0.3)',
            borderRadius: '6px',
            color: 'var(--accent-cyan)',
            textDecoration: 'none',
          }}
        >
          Return to Command Center
        </Link>
      </div>
    </div>
  );
}
