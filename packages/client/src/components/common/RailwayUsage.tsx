import { useState, useEffect } from 'react';
import { Train, AlertCircle, Clock } from 'lucide-react';

interface UsageData {
  creditsRemaining: number;
  creditsUsed: number;
  daysRemaining: number;
  plan: string;
  isTrialing: boolean;
  projectName: string;
}

export function RailwayUsage() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsage();
    // Refresh every 5 minutes
    const interval = setInterval(fetchUsage, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchUsage = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'https://wcag-crawler-server.onrender.com';
      const response = await fetch(`${apiUrl}/api/system/railway-usage`);
      const data = await response.json();

      if (data.usage) {
        setUsage(data.usage);
        setError(null);
      } else if (data.error) {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to fetch usage');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return null;
  }

  if (error || !usage) {
    return null;
  }

  // Calculate percentage of credits remaining
  const totalCredits = 5; // Plan included credits
  const remainingPercent = Math.min(100, (usage.creditsRemaining / totalCredits) * 100);

  // Determine status color based on remaining credits
  const getStatusColor = () => {
    if (remainingPercent <= 10) return 'text-critical bg-critical/10';
    if (remainingPercent <= 30) return 'text-serious bg-serious/10';
    return 'text-success bg-success/10';
  };

  const getBarColor = () => {
    if (remainingPercent <= 10) return 'bg-critical';
    if (remainingPercent <= 30) return 'bg-serious';
    return 'bg-success';
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-surface border border-border rounded-xl shadow-elevated p-3 min-w-[220px]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Train className="w-4 h-4 text-foreground-muted" />
            <span className="text-xs font-medium text-foreground-muted uppercase tracking-wide">
              Railway
            </span>
          </div>
          <span className="text-[10px] text-foreground-muted/60 uppercase">
            {usage.isTrialing ? 'TRIAL' : usage.plan}
          </span>
        </div>

        {/* Progress bar - shows remaining credits */}
        <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
          <div
            className={`h-full rounded-full transition-all duration-500 ${getBarColor()}`}
            style={{ width: `${remainingPercent}%` }}
          />
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between text-xs">
          <span className={`px-2 py-0.5 rounded-full font-medium ${getStatusColor()}`}>
            ${usage.creditsRemaining.toFixed(2)} left
          </span>
          <div className="flex items-center gap-1 text-foreground-muted">
            <Clock className="w-3 h-3" />
            <span>{usage.daysRemaining}d</span>
          </div>
        </div>

        {/* Warning if low */}
        {remainingPercent <= 20 && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-serious">
            <AlertCircle className="w-3 h-3" />
            <span>Credits running low!</span>
          </div>
        )}
      </div>
    </div>
  );
}
