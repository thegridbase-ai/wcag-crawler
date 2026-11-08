import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, ChevronDown, ChevronUp, Loader2, ArrowRight, Lock } from 'lucide-react';
import { scanApi } from '../../lib/api';
import { scanStorage } from '../../lib/storage';
import { DEFAULT_SCAN_CONFIG, VIEWPORT_PRESETS, WCAG_VERSIONS } from '../../lib/constants';
import type { ScanConfig } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { clientPolicyForRole } from '../../lib/tier-policy';
import { useServerWarmup } from '../../hooks/useServerWarmup';

interface ScanFormProps {
  /** Render the advanced options open on first paint (used by SSR tests). */
  defaultShowAdvanced?: boolean;
}

export function ScanForm({ defaultShowAdvanced = false }: ScanFormProps = {}) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const policy = clientPolicyForRole(role);
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(defaultShowAdvanced);
  const [error, setError] = useState<string | null>(null);
  const warmup = useServerWarmup();

  const [config, setConfig] = useState<Partial<ScanConfig>>({
    maxPages: DEFAULT_SCAN_CONFIG.maxPages,
    maxDepth: DEFAULT_SCAN_CONFIG.maxDepth,
    concurrency: DEFAULT_SCAN_CONFIG.concurrency,
    delay: DEFAULT_SCAN_CONFIG.delay,
    viewport: DEFAULT_SCAN_CONFIG.viewport,
    excludePatterns: [],
    wcagVersion: DEFAULT_SCAN_CONFIG.wcagVersion,
  });
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authType, setAuthType] = useState<'form' | 'basic'>('form');
  const [authFields, setAuthFields] = useState({ loginUrl: '', username: '', password: '' });

  useEffect(() => {
    setConfig(current => ({
      ...current,
      maxPages: policy.maxPages,
      maxDepth: policy.maxDepth,
      concurrency: policy.concurrency,
    }));
    if (!policy.allowAuthentication) {
      setAuthEnabled(false);
      setAuthFields({ loginUrl: '', username: '', password: '' });
    }
  }, [policy.allowAuthentication, policy.concurrency, policy.maxDepth, policy.maxPages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    try {
      new URL(url);
    } catch {
      setError('Please enter a valid URL');
      return;
    }

    setIsLoading(true);
    try {
      const finalConfig = {
        ...config,
        authentication: policy.allowAuthentication && authEnabled && authFields.username
          ? {
              authType,
              loginUrl: authType === 'basic' ? url : authFields.loginUrl,
              username: authFields.username,
              password: authFields.password,
            }
          : null,
      };
      const result = await scanApi.create(url, finalConfig);
      scanStorage.add({
        id: result.id,
        url: url,
        createdAt: new Date().toISOString(),
        accessToken: result.accessToken,
      });
      navigate(`/scans/${result.id}/progress`);
    } catch (err) {
      setError('Failed to start scan. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* URL Input with integrated button */}
      <div className="relative">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-surface border border-border rounded-2xl p-2 shadow-soft focus-within:ring-2 focus-within:ring-primary/10 focus-within:border-primary/30 transition-all">
          <div className="flex items-center flex-1 min-w-0">
            <Globe className="ml-3 w-5 h-5 text-foreground-muted flex-shrink-0" />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com or http://localhost:3000"
              className="flex-1 min-w-0 bg-transparent border-none outline-none text-foreground placeholder-foreground-muted/50 text-base py-2 px-3"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary gap-2 disabled:opacity-50 justify-center w-full sm:w-auto"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {warmup.status === 'ready' ? 'Starting scan...' : 'Waking scanner...'}
              </>
            ) : (
              <>
                Get Started
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
        {error && (
          <p className="absolute -bottom-6 left-0 text-sm text-critical">{error}</p>
        )}
        {!error && warmup.status === 'waking' && (
          <p className="text-xs text-foreground-muted mt-2 text-center" role="status" aria-live="polite">
            <Loader2 className="inline w-3 h-3 mr-1 animate-spin align-[-1px]" />
            The scanner engine is waking up ({Math.round(warmup.waitedMs / 1000)}s). You can type your URL now;
            the first scan starts as soon as it is ready.
          </p>
        )}
        {!error && warmup.status === 'down' && (
          <p className="text-xs text-critical mt-2 text-center" role="status">
            The scanner engine is not responding right now. Try again in a minute.
          </p>
        )}
        {!error && (warmup.status === 'ready' || warmup.status === 'checking') && (
          <p className="text-xs text-foreground-muted/60 mt-2 text-center">
            {policy.maxPages === null
              ? `Admin scan covers unlimited pages and ${policy.maxDepth} levels deep.`
              : `${role === 'anonymous' ? 'Anonymous' : 'Signed-in'} scan covers up to ${policy.maxPages} pages and ${policy.maxDepth} levels deep.`}
          </p>
        )}
      </div>

      {/* Advanced Options Toggle */}
      <div className="pt-4">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-foreground-muted hover:text-foreground transition-colors mx-auto py-2.5 sm:py-1 px-3"
        >
          {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          <span>Advanced Options</span>
        </button>
      </div>

      {/* Advanced Options Panel */}
      {showAdvanced && (
        <div className="card space-y-6 mt-4 text-left">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Max Pages
              </label>
              <p className="text-xs text-foreground-muted mb-2">
                Maximum number of pages to scan
              </p>
              {policy.maxPages === null ? (
                // Admin: truly unlimited page count — no numeric range to render.
                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="text-foreground-muted">Page limit</span>
                  <span className="font-medium text-foreground">Unlimited</span>
                </div>
              ) : (
                <>
                  <input
                    type="range"
                    min="10"
                    max={policy.maxPages}
                    step="10"
                    value={config.maxPages ?? 10}
                    onChange={(e) => setConfig({ ...config, maxPages: parseInt(e.target.value) })}
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-xs text-foreground-muted mt-1">
                    <span>10</span>
                    <span className="font-medium text-foreground">{config.maxPages}</span>
                    <span>{policy.maxPages}</span>
                  </div>
                </>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Max Depth
              </label>
              <p className="text-xs text-foreground-muted mb-2">
                How deep to crawl from homepage
              </p>
              <input
                type="range"
                min="1"
                max={policy.maxDepth}
                value={config.maxDepth}
                onChange={(e) => setConfig({ ...config, maxDepth: parseInt(e.target.value) })}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-foreground-muted mt-1">
                <span>1</span>
                <span className="font-medium text-foreground">{config.maxDepth}</span>
                <span>{policy.maxDepth}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Viewport
            </label>
            <p className="text-xs text-foreground-muted mb-2">
              Screen size for scanning
            </p>
            <div className="flex gap-2">
              {VIEWPORT_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setConfig({ ...config, viewport: { width: preset.width, height: preset.height } })}
                  className={`px-4 py-2 rounded-lg border text-sm transition-all ${
                    config.viewport?.width === preset.width
                      ? 'bg-primary text-white border-primary'
                      : 'border-border text-foreground-muted hover:border-foreground-muted'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              WCAG Version
            </label>
            <p className="text-xs text-foreground-muted mb-2">
              Accessibility standard to test against. WCAG 2.2 includes all 2.1 rules plus newer success criteria.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {WCAG_VERSIONS.map((version) => {
                const selected = config.wcagVersion === version.value;
                return (
                  <button
                    key={version.value}
                    type="button"
                    onClick={() => setConfig({ ...config, wcagVersion: version.value })}
                    className={`text-left px-4 py-3 rounded-lg border text-sm transition-all ${
                      selected
                        ? 'bg-primary/5 text-foreground border-primary'
                        : 'border-border text-foreground-muted hover:border-foreground-muted'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-medium ${selected ? 'text-primary' : 'text-foreground'}`}>
                        {version.label}
                      </span>
                      {version.value === '2.1' && (
                        <span className="text-[10px] uppercase tracking-wide text-foreground-muted/60">Default</span>
                      )}
                      {version.value === '2.2' && (
                        <span className="text-[10px] uppercase tracking-wide text-primary/80">Latest</span>
                      )}
                    </div>
                    <p className="text-xs text-foreground-muted leading-snug">
                      {version.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {policy.allowAuthentication && (
          <div className="border border-border rounded-xl p-4 space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={authEnabled}
                onChange={(e) => setAuthEnabled(e.target.checked)}
                className="accent-primary w-4 h-4"
              />
              <Lock className="w-4 h-4 text-foreground-muted" />
              <div>
                <span className="text-sm font-medium text-foreground">Scan Behind Login</span>
                <p className="text-xs text-foreground-muted">
                  Authenticate before scanning to access protected pages
                </p>
              </div>
            </label>

            {authEnabled && (
              <div className="space-y-3 pl-7">
                <div>
                  <label className="block text-xs font-medium text-foreground-muted mb-2">Authentication Type</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAuthType('basic')}
                      className={`px-4 py-2 rounded-lg border text-sm transition-all ${
                        authType === 'basic'
                          ? 'bg-primary text-white border-primary'
                          : 'border-border text-foreground-muted hover:border-foreground-muted'
                      }`}
                    >
                      HTTP Basic Auth
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthType('form')}
                      className={`px-4 py-2 rounded-lg border text-sm transition-all ${
                        authType === 'form'
                          ? 'bg-primary text-white border-primary'
                          : 'border-border text-foreground-muted hover:border-foreground-muted'
                      }`}
                    >
                      Form Login
                    </button>
                  </div>
                  <p className="text-xs text-foreground-muted/60 mt-1">
                    {authType === 'basic'
                      ? 'For sites that show a browser popup asking for username and password'
                      : 'For sites with a login form (HTML page with username/password fields)'}
                  </p>
                </div>
                {authType === 'form' && (
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted mb-1">Login Page URL</label>
                    <input
                      type="url"
                      value={authFields.loginUrl}
                      onChange={(e) => setAuthFields({ ...authFields, loginUrl: e.target.value })}
                      placeholder="https://example.com/login"
                      className="input text-sm"
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted mb-1">Username</label>
                    <input
                      type="text"
                      value={authFields.username}
                      onChange={(e) => setAuthFields({ ...authFields, username: e.target.value })}
                      placeholder="username"
                      className="input text-sm"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted mb-1">Password</label>
                    <input
                      type="password"
                      value={authFields.password}
                      onChange={(e) => setAuthFields({ ...authFields, password: e.target.value })}
                      placeholder="••••••••"
                      className="input text-sm"
                      autoComplete="off"
                    />
                  </div>
                </div>
                <p className="text-xs text-foreground-muted/60">
                  Credentials are sent to the server for login only and are not stored.
                </p>
              </div>
            )}
          </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Exclude Patterns
            </label>
            <p className="text-xs text-foreground-muted mb-2">
              URL patterns to skip (one per line)
            </p>
            <textarea
              value={config.excludePatterns?.join('\n') || ''}
              onChange={(e) => setConfig({
                ...config,
                excludePatterns: e.target.value.split('\n').filter(Boolean)
              })}
              placeholder="/logout&#10;/api/*&#10;*.pdf"
              className="input h-24 resize-none text-sm"
            />
          </div>
        </div>
      )}
    </form>
  );
}
