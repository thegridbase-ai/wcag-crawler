export function getEffectiveBrowserConcurrency(
  requested: number,
  configuredLimit = process.env.MAX_BROWSER_CONCURRENCY
): number {
  const normalizedRequested = Math.max(1, Math.floor(requested));
  const parsedLimit = configuredLimit ? Number.parseInt(configuredLimit, 10) : NaN;

  if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
    return normalizedRequested;
  }

  return Math.min(normalizedRequested, parsedLimit);
}
