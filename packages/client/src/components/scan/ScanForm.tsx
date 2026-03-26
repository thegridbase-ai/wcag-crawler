import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, ChevronDown, ChevronUp, Loader2, ArrowRight, Lock } from 'lucide-react';
import { scanApi } from '../../lib/api';
import { scanStorage } from '../../lib/storage';
import { DEFAULT_SCAN_CONFIG, VIEWPORT_PRESETS } from '../../lib/constants';
import type { ScanConfig } from '../../types';

export function ScanForm() {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [config, setConfig] = useState<Partial<ScanConfig>>({
    maxPages: DEFAULT_SCAN_CONFIG.maxPages,
    maxDepth: DEFAULT_SCAN_CONFIG.maxDepth,
    concurrency: DEFAULT_SCAN_CONFIG.concurrency,
    delay: DEFAULT_SCAN_CONFIG.delay,
    viewport: DEFAULT_SCAN_CONFIG.viewport,
    excludePatterns: [],
  });
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authFields, setAuthFields] = useState({ loginUrl: '', username: '', password: '' });

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
        authentication: authEnabled && authFields.loginUrl && authFields.username
          ? authFields
          : null,
      };
      const result = await scanApi.create(url, finalConfig);
      scanStorage.add({
        id: result.id,
        url: url,
        createdAt: new Date().toISOString(),
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
        <div className="flex items-center gap-2 bg-surface border border-border rounded-2xl p-2 shadow-soft focus-within:ring-2 focus-within:ring-primary/10 focus-within:border-primary/30 transition-all">
          <Globe className="ml-3 w-5 h-5 text-foreground-muted flex-shrink-0" />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com or http://localhost:3000"
            className="flex-1 bg-transparent border-none outline-none text-foreground placeholder-foreground-muted/50 text-base py-2"
            autoFocus
          />
          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Scanning...
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
        {!error && (
          <p className="text-xs text-foreground-muted/60 mt-2 text-center">
            Supports localhost and local network URLs for testing development projects
          </p>
        )}
      </div>

      {/* Advanced Options Toggle */}
      <div className="pt-4">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-foreground-muted hover:text-foreground transition-colors mx-auto"
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
              <input
                type="range"
                min="10"
                max="100"
                step="10"
                value={config.maxPages}
                onChange={(e) => setConfig({ ...config, maxPages: parseInt(e.target.value) })}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-foreground-muted mt-1">
                <span>10</span>
                <span className="font-medium text-foreground">{config.maxPages}</span>
                <span>100</span>
              </div>
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
                max="5"
                value={config.maxDepth}
                onChange={(e) => setConfig({ ...config, maxDepth: parseInt(e.target.value) })}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-foreground-muted mt-1">
                <span>1</span>
                <span className="font-medium text-foreground">{config.maxDepth}</span>
                <span>5</span>
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
                  <label className="block text-xs font-medium text-foreground-muted mb-1">Login Page URL</label>
                  <input
                    type="url"
                    value={authFields.loginUrl}
                    onChange={(e) => setAuthFields({ ...authFields, loginUrl: e.target.value })}
                    placeholder="https://example.com/login"
                    className="input text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-foreground-muted mb-1">Username / Email</label>
                    <input
                      type="text"
                      value={authFields.username}
                      onChange={(e) => setAuthFields({ ...authFields, username: e.target.value })}
                      placeholder="user@example.com"
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
