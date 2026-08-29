import "./globals.css";
import Link from "next/link";
import React from "react";
import HeaderStatus from "./components/HeaderStatus";

export const metadata = {
  title: "Aegis-Alpha // Quantitative Research & Signal Engine",
  description: "Institutional quantitative research and market intelligence platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="app-container">
          <aside className="sidebar">
            <div className="sidebar-header">
              <span className="brand-badge">AA</span>
              <span className="brand-title font-mono">AEGIS // ALPHA</span>
            </div>
            
            <nav className="sidebar-nav">
              <Link href="/signals" className="nav-item">
                <span>📡</span>
                <span>Signal Engine</span>
              </Link>
              <Link href="/companies" className="nav-item">
                <span>🏢</span>
                <span>Companies</span>
              </Link>
              <Link href="/research" className="nav-item">
                <span>🔬</span>
                <span>Research Lab</span>
              </Link>
              <Link href="/portfolio" className="nav-item">
                <span>◈</span>
                <span>Portfolio Lab</span>
              </Link>
              <Link href="/experiments" className="nav-item">
                <span>🧪</span>
                <span>Experiments</span>
              </Link>
              <Link href="/timeline" className="nav-item">
                <span>⏱️</span>
                <span>Event Stream</span>
              </Link>
              <Link href="/health" className="nav-item">
                <span>🛡️</span>
                <span>System Health</span>
              </Link>
            </nav>

            <div className="sidebar-footer">
              <div>PLATFORM: <span className="font-mono" style={{ color: "var(--accent-cyan)" }}>v0.1.0-alpha</span></div>
              <div>ENVIRONMENT: <span className="font-mono">LOCAL_DEV</span></div>
              <div style={{ marginTop: "4px", fontSize: "10px", color: "var(--text-muted)" }}>TimescaleDB • Redis • FastAPI</div>
            </div>
          </aside>

          <div className="main-content">
            <header className="top-bar">
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div className="status-pill online">
                  <span className="status-dot"></span>
                  <span>SYSTEM OPERATIONAL</span>
                </div>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  POSTGRES HYPERTABLES ACTIVE
                </span>
              </div>

              <HeaderStatus />
            </header>

            <main className="page-body">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
