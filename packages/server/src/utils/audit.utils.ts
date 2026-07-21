// Auditable-page filter: a page is only worth running axe against when it is
// a real, 2xx, HTML response. Error pages (401/403/404/5xx bodies) would
// otherwise pollute reports with fake violations like html-has-lang.
//
// Deliberately conservative: only unambiguous error signatures are skipped so
// real content pages are never silently dropped from the audit.

export type SkipReason =
  | 'auth-gated'
  | `http-${number}`
  | 'non-html'
  | 'error-signature';

export function resolveSkipReason(params: {
  httpStatus: number;
  headers: Record<string, string>;
  contentType: string;
}): SkipReason | null {
  const { httpStatus, headers, contentType } = params;

  if (httpStatus === 401 || headers['www-authenticate']) {
    return 'auth-gated';
  }
  if (httpStatus < 200 || httpStatus >= 300) {
    return `http-${httpStatus}`;
  }
  if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    return 'non-html';
  }
  return null;
}

// Soft error pages: 200 responses whose content is clearly an error message.
// Only two unambiguous signatures — a bare status-code title (e.g. "403"),
// or a near-empty body that is just an error phrase.
export function isErrorPageSignature(title: string, bodyText: string): boolean {
  if (/^\s*\d{3}\s*$/.test(title)) {
    return true;
  }
  const text = bodyText.trim();
  if (
    text.length < 40 &&
    /^(\d{3}\s*[-–:]?\s*)?(forbidden|unauthorized|not\s+found|access\s+denied|error)[.!]?$/i.test(text)
  ) {
    return true;
  }
  return false;
}

export function describeSkipReason(reason: string): string {
  if (reason === 'auth-gated') return 'Behind authentication (HTTP 401 / WWW-Authenticate)';
  if (reason === 'non-html') return 'Non-HTML response';
  if (reason === 'error-signature') return 'Error page served with HTTP 200';
  if (reason.startsWith('http-')) return `HTTP ${reason.slice(5)} response`;
  return reason;
}
