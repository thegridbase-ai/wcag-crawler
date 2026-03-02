import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import type { ReportSummary } from '../../types';
import { SEVERITY_COLORS } from '../../lib/constants';

interface ScoreSummaryProps {
  summary: ReportSummary;
}

export function ScoreSummary({ summary }: ScoreSummaryProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return '#16a34a';
    if (score >= 50) return '#ca8a04';
    return '#dc2626';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 90) return { text: 'Healthy', color: '#16a34a', bg: '#dcfce7' };
    if (score >= 80) return { text: 'Good', color: '#16a34a', bg: '#dcfce7' };
    if (score >= 50) return { text: 'Needs Improvement', color: '#ca8a04', bg: '#fef9c3' };
    return { text: 'Poor', color: '#dc2626', bg: '#fee2e2' };
  };

  const scoreLabel = getScoreLabel(summary.score);

  const scoreData = [
    { name: 'Score', value: summary.score },
    { name: 'Remaining', value: 100 - summary.score },
  ];

  const severityData = [
    { name: 'Critical', value: summary.ruleCountBySeverity?.critical || 0, color: SEVERITY_COLORS.critical.hex },
    { name: 'Serious', value: summary.ruleCountBySeverity?.serious || 0, color: SEVERITY_COLORS.serious.hex },
    { name: 'Moderate', value: summary.ruleCountBySeverity?.moderate || 0, color: SEVERITY_COLORS.moderate.hex },
    { name: 'Minor', value: summary.ruleCountBySeverity?.minor || 0, color: SEVERITY_COLORS.minor.hex },
  ];

  const totalIssues = (summary.ruleCountBySeverity?.critical || 0) +
    (summary.ruleCountBySeverity?.serious || 0) +
    (summary.ruleCountBySeverity?.moderate || 0) +
    (summary.ruleCountBySeverity?.minor || 0);

  return (
    <div className="grid grid-cols-4 gap-4">
      {/* Score donut */}
      <div className="card flex flex-col items-center justify-center py-6">
        <div className="relative w-28 h-28">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={scoreData}
                cx="50%"
                cy="50%"
                innerRadius={38}
                outerRadius={50}
                startAngle={90}
                endAngle={-270}
                paddingAngle={0}
                dataKey="value"
              >
                <Cell fill={getScoreColor(summary.score)} />
                <Cell fill="#e8e4dc" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="text-3xl font-heading font-bold"
              style={{ color: getScoreColor(summary.score) }}
            >
              {summary.score}
            </span>
          </div>
        </div>
        <div
          className="mt-2 px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase"
          style={{ color: scoreLabel.color, backgroundColor: scoreLabel.bg }}
        >
          {scoreLabel.text}
        </div>
      </div>

      {/* Metrics */}
      <div className="card">
        <p className="text-3xl font-heading font-bold text-foreground">{summary.totalPages}</p>
        <p className="text-sm text-foreground-muted">Pages Scanned</p>
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xl font-heading font-bold text-foreground">{summary.totalIssuesDeduplicated}</p>
          <p className="text-xs text-foreground-muted">Unique Issues</p>
        </div>
      </div>

      {/* Severity breakdown */}
      <div className="card col-span-2">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-foreground-muted">Issues by Severity</p>
          <p className="text-sm text-foreground">{totalIssues} unique {totalIssues === 1 ? 'issue' : 'issues'}</p>
        </div>

        {/* Severity bar */}
        <div className="flex h-3 rounded-full overflow-hidden mb-4 bg-muted">
          {severityData.map((item) => (
            item.value > 0 && (
              <div
                key={item.name}
                style={{
                  width: `${(item.value / totalIssues) * 100}%`,
                  backgroundColor: item.color,
                }}
                className="transition-all duration-500"
              />
            )
          ))}
        </div>

        {/* Legend */}
        <div className="grid grid-cols-4 gap-2">
          {severityData.map((item) => {
            const rawCount = summary.bySeverity[item.name.toLowerCase() as keyof typeof summary.bySeverity] || 0;
            return (
              <div key={item.name} className="text-center">
                <p
                  className="text-xl font-heading font-bold"
                  style={{ color: item.color }}
                >
                  {item.value}
                </p>
                <p className="text-xs text-foreground-muted">{item.value === 1 ? 'Issue' : 'Issues'}</p>
                {rawCount > item.value && (
                  <p className="text-xs text-foreground-muted/60">{rawCount} occurrences</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
