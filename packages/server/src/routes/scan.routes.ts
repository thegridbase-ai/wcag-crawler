import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Server as SocketServer } from 'socket.io';
import { ScanModel, ScanConfig } from '../models/scan.model.js';
import { PageModel } from '../models/page.model.js';
import { crawlerService } from '../services/crawler.service.js';
import { scannerService } from '../services/scanner.service.js';
import { deduplicationService } from '../services/deduplication.service.js';
import { reportService } from '../services/report.service.js';
import { logger } from '../utils/logger.js';
import { isValidScanUrl } from '../utils/url.utils.js';

// Custom URL validator that accepts localhost and local network URLs
const urlSchema = z.string().refine(
  (url) => isValidScanUrl(url),
  { message: 'Invalid URL. Must be a valid HTTP or HTTPS URL.' }
);

const scanConfigSchema = z.object({
  url: urlSchema,
  config: z.object({
    maxPages: z.number().min(1).max(100).default(50),
    maxDepth: z.number().min(1).max(5).default(3),
    concurrency: z.number().min(1).max(5).default(3),
    delay: z.number().min(0).max(5000).default(500),
    excludePatterns: z.array(z.string()).default([]),
    waitForSelector: z.string().nullable().default(null),
    respectRobotsTxt: z.boolean().default(true),
    viewport: z.object({
      width: z.number().default(1280),
      height: z.number().default(720),
    }).default({ width: 1280, height: 720 }),
    authentication: z.object({
      authType: z.enum(['form', 'basic']).default('form'),
      loginUrl: z.string().url(),
      username: z.string(),
      password: z.string(),
    }).nullable().default(null),
    wcagVersion: z.enum(['2.1', '2.2']).default('2.1'),
  }).default({}),
});

export function createScanRoutes(io: SocketServer): Router {
  const router = Router();

  // POST /api/scans - Start a new scan
  router.post('/', async (req: Request, res: Response) => {
    try {
      const parsed = scanConfigSchema.parse(req.body);
      const config = parsed.config as ScanConfig;

      // Create scan record
      const scan = ScanModel.create(parsed.url, config);
      logger.info('Scan created', { scanId: scan.id, url: parsed.url });

      // Start scan in background
      runScan(scan.id, parsed.url, config, io).catch(error => {
        logger.error('Scan failed', { scanId: scan.id, error: error.message });
        ScanModel.updateStatus(scan.id, 'failed');
        io.to(scan.id).emit('scan:error', { scanId: scan.id, error: error.message });
      });

      res.status(201).json({
        id: scan.id,
        status: scan.status,
        rootUrl: scan.root_url,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', details: error.errors });
      } else {
        logger.error('Failed to create scan', { error: (error as Error).message });
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  });

  // GET /api/scans - List all scans
  router.get('/', (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      const scans = ScanModel.findAll(limit, offset);
      res.json(scans);
    } catch (error) {
      logger.error('Failed to list scans', { error: (error as Error).message });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/scans/:id - Get scan details
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const scan = ScanModel.findById(req.params.id);
      if (!scan) {
        res.status(404).json({ error: 'Scan not found' });
        return;
      }

      const pages = PageModel.findByScanId(scan.id);
      res.json({
        ...scan,
        pages: pages.map(p => ({
          id: p.id,
          url: p.url,
          title: p.title,
          status: p.status,
          issueCount: p.issue_count,
        })),
      });
    } catch (error) {
      logger.error('Failed to get scan', { error: (error as Error).message });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/scans/:id - Delete a scan
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const scan = ScanModel.findById(req.params.id);
      if (!scan) {
        res.status(404).json({ error: 'Scan not found' });
        return;
      }

      ScanModel.delete(scan.id);
      logger.info('Scan deleted', { scanId: scan.id });
      res.status(204).send();
    } catch (error) {
      logger.error('Failed to delete scan', { error: (error as Error).message });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/scans/:id/cancel - Cancel a running scan
  router.post('/:id/cancel', (req: Request, res: Response) => {
    try {
      const scan = ScanModel.findById(req.params.id);
      if (!scan) {
        res.status(404).json({ error: 'Scan not found' });
        return;
      }

      crawlerService.cancel();
      scannerService.cancel();
      ScanModel.updateStatus(scan.id, 'failed');
      logger.info('Scan cancelled', { scanId: scan.id });
      res.json({ message: 'Scan cancelled' });
    } catch (error) {
      logger.error('Failed to cancel scan', { error: (error as Error).message });
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

async function runScan(scanId: string, rootUrl: string, config: ScanConfig, io: SocketServer): Promise<void> {
  // Phase 1: Crawling
  ScanModel.updateStatus(scanId, 'crawling');
  io.to(scanId).emit('scan:status', { scanId, status: 'crawling' });

  await crawlerService.initialize(io);
  const discoveredUrls = await crawlerService.crawl(scanId, rootUrl, config);

  ScanModel.updateCounts(scanId, { total_pages: discoveredUrls.length });

  // Grab authenticated cookies before closing crawler
  const authCookies = crawlerService.getAuthCookies();

  // Close crawler browser before starting scanner to free memory
  await crawlerService.close();

  // Phase 2: Scanning
  ScanModel.updateStatus(scanId, 'scanning');
  io.to(scanId).emit('scan:status', { scanId, status: 'scanning' });

  await scannerService.initialize(io);
  await scannerService.scanPages(scanId, config, authCookies.length > 0 ? authCookies : undefined);

  // Update scanned pages count
  const scannedCount = PageModel.countScannedByScanId(scanId);
  ScanModel.updateCounts(scanId, { scanned_pages: scannedCount });

  // Phase 3: Analyzing (Deduplication)
  ScanModel.updateStatus(scanId, 'analyzing');
  io.to(scanId).emit('scan:status', { scanId, status: 'analyzing' });
  io.to(scanId).emit('scan:analyzing', { scanId, message: 'Running smart deduplication...' });

  await deduplicationService.analyze(scanId);

  // Calculate final score
  reportService.calculateAndUpdateScore(scanId);

  // Complete
  ScanModel.updateStatus(scanId, 'complete');
  const finalScan = ScanModel.findById(scanId);

  io.to(scanId).emit('scan:complete', {
    scanId,
    summary: {
      totalPages: finalScan?.total_pages,
      totalIssues: finalScan?.total_issues,
      score: finalScan?.score,
    },
  });

  // Cleanup
  await scannerService.close();

  logger.info('Scan complete', { scanId, score: finalScan?.score });
}
