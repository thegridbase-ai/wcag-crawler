import { Link } from 'react-router-dom';
import { Accessibility, History } from 'lucide-react';

declare const __BUILD_TIME__: string;

function formatBuildTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function Header() {
  return (
    <header className="fixed top-6 left-1/2 -translate-x-1/2 z-50">
      <div className="floating-header px-4 py-2 flex items-center gap-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Accessibility className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-foreground">WCAG Crawler</span>
        </Link>

        {/* Divider */}
        <div className="w-px h-6 bg-border" />

        {/* Nav Links */}
        <nav className="flex items-center gap-1">
          <Link
            to="/history"
            className="btn btn-ghost text-sm gap-2 px-3 py-1.5"
          >
            <History className="w-4 h-4" />
            History
          </Link>
        </nav>

        {/* Divider */}
        <div className="w-px h-6 bg-border" />

        {/* Last Deployed */}
        <span className="text-[11px] text-foreground-muted/50 whitespace-nowrap">
          Deployed: {formatBuildTime(__BUILD_TIME__)}
        </span>
      </div>
    </header>
  );
}
