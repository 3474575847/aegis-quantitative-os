'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CommandIcon,
  SignalIcon,
  CompanyIcon,
  NewsIcon,
  MacroIcon,
  ResearchIcon,
  PortfolioIcon,
  ExperimentIcon,
  TimelineIcon,
  HealthIcon,
} from './icons';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Markets',
    items: [
      { href: '/', label: 'Command Center', icon: CommandIcon },
      { href: '/companies', label: 'Watchlist', icon: CompanyIcon },
      { href: '/signals', label: 'Signal Engine', icon: SignalIcon },
    ],
  },
  {
    title: 'Research',
    items: [
      { href: '/research', label: 'Research Lab', icon: ResearchIcon },
      { href: '/experiments', label: 'Experiments', icon: ExperimentIcon },
      { href: '/macro', label: 'Macro Observatory', icon: MacroIcon },
      { href: '/portfolio', label: 'Portfolio Lab', icon: PortfolioIcon },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { href: '/news', label: 'News & Analysis', icon: NewsIcon },
      { href: '/timeline', label: 'Event Stream', icon: TimelineIcon },
    ],
  },
  {
    title: 'System',
    items: [
      { href: '/health', label: 'Diagnostics', icon: HealthIcon },
    ],
  },
];

export default function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="terminal-sidebar">
      {/* Brand Header */}
      <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-[#19202e] bg-[#0d1017]">
        <div className="w-5 h-5 bg-[#d29922] text-[#080a0d] flex items-center justify-center font-mono font-bold text-xs rounded-[2px] select-none tracking-tighter">
          Æ
        </div>
        <div className="flex flex-col sidebar-brand-name leading-none">
          <span className="font-mono text-xs font-bold tracking-wider text-[#e6edf3]">
            AEGIS
          </span>
          <span className="text-[9px] font-medium tracking-widest text-[#7d8590] uppercase mt-0.5">
            QUANT TERMINAL
          </span>
        </div>
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_SECTIONS.map((sec) => (
          <div key={sec.title} className="mb-2">
            <div className="nav-section-label">{sec.title}</div>
            <div className="flex flex-col gap-0.5">
              {sec.items.map((item) => {
                const isActive =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname.startsWith(item.href);
                const IconComponent = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-link ${isActive ? 'active' : ''}`}
                    title={item.label}
                  >
                    <IconComponent
                      size={15}
                      className={isActive ? 'text-[#d29922]' : 'text-[#7d8590]'}
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom Telemetry Bar */}
      <div className="sidebar-bottom-telemetry border-t border-[#19202e] px-3.5 py-2.5 bg-[#0a0d13] flex items-center justify-between select-none">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950]" />
          <span className="font-mono text-[10px] text-[#8b949e]">Pipeline Active</span>
        </div>
        <Link href="/health" className="text-[10px] font-mono text-[#7d8590] hover:text-[#e6edf3] transition-colors">
          Health →
        </Link>
      </div>
    </aside>
  );
}
