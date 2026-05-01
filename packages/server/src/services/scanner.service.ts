import { chromium, Browser, BrowserContext, Cookie, Page as PlaywrightPage } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { Server as SocketServer } from 'socket.io';
import { ScanConfig } from '../models/scan.model.js';
import { PageModel, Page } from '../models/page.model.js';
import { IssueModel, IssueCreate } from '../models/issue.model.js';
import { detectRegionFromSelector, generateFingerprint, DomRegion } from '../utils/fingerprint.js';
import { logger } from '../utils/logger.js';

interface AxeViolation {
  id: string;
  description: string;
  help: string;
  helpUrl: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  tags: string[];
  nodes: Array<{
    target: string[];
    html: string;
    failureSummary?: string;
  }>;
}

interface ScanPageResult {
  url: string;
  issueCount: number;
  issues: IssueCreate[];
  regionsFingerprint: Record<string, string>;
}

export class ScannerService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private io: SocketServer | null = null;
  private scanId: string = '';
  private config: ScanConfig | null = null;
  private isCancelled: boolean = false;

  async initialize(io: SocketServer): Promise<void> {
    this.io = io;
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    logger.info('Scanner browser launched');
  }

  async scanPages(scanId: string, config: ScanConfig, cookies?: Cookie[]): Promise<void> {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    this.scanId = scanId;
    this.config = config;
    this.isCancelled = false;

    const contextOptions: {
      viewport: { width: number; height: number };
      userAgent: string;
      httpCredentials?: { username: string; password: string };
    } = {
      viewport: config.viewport,
      userAgent: 'A11yCrawler/1.0 (WCAG Accessibility Scanner)',
    };

    // Set HTTP Basic Auth credentials if configured
    if (config.authentication?.authType === 'basic') {
      contextOptions.httpCredentials = {
        username: config.authentication.username,
        password: config.authentication.password,
      };
      logger.info('HTTP Basic Auth credentials configured for scanner');
    }

    this.context = await this.browser.newContext(contextOptions);

    // Inject authentication cookies from crawler session (for form-based auth)
    if (cookies && cookies.length > 0) {
      await this.context.addCookies(cookies);
      logger.info('Injected authentication cookies into scanner context', { count: cookies.length });
    }

    const pages = PageModel.findByScanId(scanId).filter(p => p.status === 'pending');
    const totalPages = pages.length;
    let scannedCount = 0;

    // Process pages in batches
    for (let i = 0; i < pages.length && !this.isCancelled; i += config.concurrency) {
      const batch = pages.slice(i, i + config.concurrency);
      await Promise.all(batch.map(page => this.scanPage(page)));

      scannedCount += batch.length;
      const percentage = Math.round((scannedCount / totalPages) * 100);

      this.io?.to(scanId).emit('scan:progress', {
        scanId,
        scannedPages: scannedCount,
        totalPages,
        percentage,
      });

      // Rate limiting between batches
      if (i + config.concurrency < pages.length && config.delay > 0) {
        await this.delay(config.delay);
      }
    }

    await this.context.close();
    this.context = null;

    logger.info(`Scan complete: ${scannedCount} pages scanned`, { scanId });
  }

  private async scanPage(page: Page): Promise<ScanPageResult | null> {
    const playwrightPage = await this.context!.newPage();
    // Per-page timeout: skip page if it takes too long
    playwrightPage.setDefaultTimeout(30000);
    playwrightPage.setDefaultNavigationTimeout(30000);

    this.io?.to(this.scanId).emit('scan:page:start', {
      scanId: this.scanId,
      url: page.url,
    });

    try {
      PageModel.updateStatus(page.id, 'scanning');

      const response = await playwrightPage.goto(page.url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      // Skip non-HTML responses (PDFs, images served via dynamic URLs)
      const contentType = response?.headers()?.['content-type'] || '';
      if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        logger.info(`Skipping non-HTML page: ${page.url} (content-type: ${contentType})`);
        PageModel.updateStatus(page.id, 'complete');
        await playwrightPage.close();
        return null;
      }

      // Give page a moment to finish loading dynamic content
      await playwrightPage.waitForTimeout(1000);

      // Wait for custom selector if specified
      if (this.config?.waitForSelector) {
        await playwrightPage.waitForSelector(this.config.waitForSelector, { timeout: 5000 }).catch(() => {});
      }

      // Run axe-core analysis with timeout - WCAG version selectable (default 2.1 AA)
      // WCAG 2.2 is a superset of 2.1; the wcag22aa tag covers all new 2.2 success criteria
      // (incl. Level A additions like 3.2.6 Consistent Help and 3.3.7 Redundant Entry).
      const wcagTags = this.config?.wcagVersion === '2.2'
        ? ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
        : ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

      const results = await Promise.race([
        new AxeBuilder({ page: playwrightPage })
          .withTags(wcagTags)
          .analyze(),
        this.delay(60000).then(() => { throw new Error('axe-core analysis timed out after 60s'); }),
      ]);

      // Extract region fingerprints with timeout
      const regionsFingerprint = await Promise.race([
        this.extractRegionFingerprints(playwrightPage),
        this.delay(10000).then(() => ({} as Record<DomRegion, string>)),
      ]);

      // Process violations
      const issues: IssueCreate[] = [];
      for (const violation of results.violations as AxeViolation[]) {
        for (const node of violation.nodes) {
          const targetSelector = node.target.join(' ');
          const domRegion = detectRegionFromSelector(targetSelector);
          const regionFingerprint = regionsFingerprint[domRegion] || undefined;

          issues.push({
            scan_id: this.scanId,
            page_id: page.id,
            axe_rule_id: violation.id,
            description: violation.description,
            help: violation.help,
            help_url: violation.helpUrl,
            impact: violation.impact,
            wcag_tags: violation.tags.filter(t => t.startsWith('wcag')),
            target_selector: targetSelector,
            html_snippet: node.html.substring(0, 500),
            dom_region: domRegion,
            region_fingerprint: regionFingerprint,
            failure_summary: node.failureSummary,
          });
        }
      }

      // Save issues to database
      if (issues.length > 0) {
        IssueModel.createMany(issues);
      }

      // Update page status
      PageModel.updateStatus(page.id, 'complete');
      PageModel.updateIssueCounts(page.id, issues.length, issues.filter(i => i.dom_region === 'main' || i.dom_region === 'unknown').length);
      PageModel.updateRegionsFingerprint(page.id, regionsFingerprint);

      this.io?.to(this.scanId).emit('scan:page:complete', {
        scanId: this.scanId,
        url: page.url,
        issueCount: issues.length,
      });

      logger.info(`Scanned: ${page.url}`, { issueCount: issues.length });

      return {
        url: page.url,
        issueCount: issues.length,
        issues,
        regionsFingerprint,
      };
    } catch (error) {
      logger.error(`Failed to scan: ${page.url}`, { error: (error as Error).message });

      PageModel.updateStatus(page.id, 'error');

      this.io?.to(this.scanId).emit('scan:page:error', {
        scanId: this.scanId,
        url: page.url,
        error: (error as Error).message,
      });

      return null;
    } finally {
      await playwrightPage.close();
    }
  }

  private async extractRegionFingerprints(page: PlaywrightPage): Promise<Record<DomRegion, string>> {
    const fingerprints = await page.evaluate(() => {
      const regions: Record<string, string> = {};

      const regionSelectors: Record<string, string[]> = {
        header: ['header', '[role="banner"]'],
        nav: ['nav', '[role="navigation"]'],
        footer: ['footer', '[role="contentinfo"]'],
        aside: ['aside', '[role="complementary"]'],
        main: ['main', '[role="main"]'],
        body: ['body'],
      };

      for (const [regionName, selectors] of Object.entries(regionSelectors)) {
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element) {
            // Get simplified structure (remove text content)
            const clone = element.cloneNode(true) as Element;
            const textNodes = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
            const nodesToRemove: Node[] = [];
            while (textNodes.nextNode()) {
              nodesToRemove.push(textNodes.currentNode);
            }
            nodesToRemove.forEach(node => node.parentNode?.removeChild(node));

            // Remove volatile attributes (including URL-referencing attrs that differ between duplicate pages)
            clone.querySelectorAll('*').forEach(el => {
              el.removeAttribute('id');
              el.removeAttribute('style');
              el.removeAttribute('value');
              el.removeAttribute('action');
              el.removeAttribute('href');
              el.removeAttribute('src');
              Array.from(el.attributes).forEach(attr => {
                if (attr.name.startsWith('data-')) {
                  el.removeAttribute(attr.name);
                }
              });
            });

            regions[regionName] = clone.outerHTML;
            break;
          }
        }
      }

      return regions;
    });

    // Generate SHA-256 hashes
    const result: Record<string, string> = {};
    for (const [region, html] of Object.entries(fingerprints)) {
      result[region] = generateFingerprint(html);
    }

    return result as Record<DomRegion, string>;
  }

  cancel(): void {
    this.isCancelled = true;
    logger.info('Scan cancelled', { scanId: this.scanId });
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    logger.info('Scanner browser closed');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const scannerService = new ScannerService();
