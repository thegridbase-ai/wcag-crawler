/**
 * HTML template fixtures for dedup integration tests.
 * Each template represents a page structure with specific regions.
 */

// Shared header used across all pages
export const SHARED_HEADER = `
<header role="banner">
  <div class="logo"><a>Site Logo</a></div>
  <nav role="navigation">
    <ul>
      <li><a>Home</a></li>
      <li><a>About</a></li>
      <li><a>Contact</a></li>
    </ul>
  </nav>
</header>
`;

// Shared footer used across all pages
export const SHARED_FOOTER = `
<footer role="contentinfo">
  <div class="footer-links">
    <a>Privacy Policy</a>
    <a>Terms</a>
  </div>
  <p>Copyright 2026</p>
</footer>
`;

// Unique main content for /faq page
export const FAQ_MAIN_CONTENT = `
<main role="main">
  <h1>Frequently Asked Questions</h1>
  <div class="faq-list">
    <div class="faq-item">
      <h2>Question 1</h2>
      <p>Answer to question 1.</p>
    </div>
    <div class="faq-item">
      <h2>Question 2</h2>
      <p>Answer to question 2.</p>
    </div>
  </div>
</main>
`;

// Unique main content for /about page
export const ABOUT_MAIN_CONTENT = `
<main role="main">
  <h1>About Us</h1>
  <div class="team">
    <p>We are a great team.</p>
  </div>
</main>
`;

// Page with NO <main> element (body-only fallback)
export const PAGE_WITHOUT_MAIN = `
<body>
  ${SHARED_HEADER}
  <div class="content">
    <h1>Simple Page</h1>
    <p>This page has no main element, only a body.</p>
    <div class="widget">
      <button class="action-btn">Click me</button>
    </div>
  </div>
  ${SHARED_FOOTER}
</body>
`;

// Identical page content (for content-identical test) - variant A
export const IDENTICAL_PAGE_A = `
<body>
  ${SHARED_HEADER}
  <main role="main">
    <h1>Product Details</h1>
    <div class="product-card">
      <img alt="" />
      <span class="price">$29.99</span>
    </div>
  </main>
  ${SHARED_FOOTER}
</body>
`;

// Identical page content (for content-identical test) - variant B
// Same structure, only URL-referencing attributes differ (action, href, src - stripped by fingerprint)
export const IDENTICAL_PAGE_B = `
<body>
  ${SHARED_HEADER}
  <main role="main">
    <h1>Product Details</h1>
    <div class="product-card">
      <img alt="" />
      <span class="price">$29.99</span>
    </div>
  </main>
  ${SHARED_FOOTER}
</body>
`;
