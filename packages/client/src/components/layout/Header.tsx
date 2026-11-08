import { Link } from 'react-router-dom';
import { Accessibility, History } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { GoogleSignInButton } from '../auth/GoogleSignInButton';

export function Header() {
  const { state, role, signOut } = useAuth();

  return (
    <header className="fixed top-6 left-1/2 -translate-x-1/2 z-50">
      <div className="floating-header px-3 sm:px-4 py-2 flex items-center gap-3 sm:gap-6 max-w-[calc(100vw-2rem)]">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Accessibility className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-foreground whitespace-nowrap">WCAG Crawler</span>
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

        {state.authenticated ? (
          <div className="flex items-center gap-2">
            <span className="hidden xl:inline text-xs text-foreground-muted whitespace-nowrap">
              {state.email} · {role === 'admin' ? 'Admin' : 'User'}
            </span>
            <button type="button" onClick={signOut} className="btn btn-secondary text-xs whitespace-nowrap">
              Sign out
            </button>
          </div>
        ) : (
          <GoogleSignInButton />
        )}
      </div>
    </header>
  );
}
