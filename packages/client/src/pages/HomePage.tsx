import { ScanForm } from '../components/scan/ScanForm';
import { FeaturesSection } from '../components/features';

export function HomePage() {
  return (
    <div>
      {/* Hero */}
      <div className="text-center py-12">
        <span className="inline-block px-3 py-1 text-xs font-medium text-accent bg-accent/10 rounded-full mb-6">
          WCAG 2.1 AA SCANNER
        </span>
        <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-4 tracking-tight">
          Scan your website for
          <br />
          accessibility issues.
        </h1>
        <p className="text-lg text-foreground-muted max-w-xl mx-auto mb-10">
          Find and fix WCAG 2.1 AA issues with smart component deduplication
          and actionable insights.
        </p>

        {/* Scan Form */}
        <div className="max-w-2xl mx-auto">
          <ScanForm />
        </div>

        {/* Trust badges */}
        <div className="flex items-center justify-center gap-6 mt-8 text-sm text-foreground-muted">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success" />
            Free Forever
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success" />
            No Setup
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success" />
            100+ WCAG Checks
          </div>
        </div>
      </div>

      {/* Features Section */}
      <FeaturesSection />
    </div>
  );
}
