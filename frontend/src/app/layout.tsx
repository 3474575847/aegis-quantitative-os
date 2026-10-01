import './globals.css';
import React from 'react';
import SidebarNav from './components/SidebarNav';
import TopMarketBar from './components/TopMarketBar';

export const metadata = {
  title: 'Aegis Quantitative Research Workstation',
  description: 'Institutional quantitative research and systematic alpha evaluation terminal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('error', function(event) {
                if (event.message && (event.message.indexOf('ChunkLoadError') !== -1 || event.message.indexOf('Loading chunk') !== -1)) {
                  console.warn('Chunk load error detected, reloading fresh version...', event.message);
                  window.location.reload();
                }
              });
            `,
          }}
        />
      </head>
      <body>
        <div className="app-shell">
          <SidebarNav />
          <div className="terminal-main">
            <TopMarketBar />
            <main className="terminal-viewport">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
