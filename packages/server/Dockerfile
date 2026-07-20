# Build stage
FROM node:20-bookworm-slim AS builder

# Install build dependencies for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-bookworm-slim

# Install build tools, curl for healthcheck, and Chromium dependencies for Playwright
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    curl \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    libatspi2.0-0 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built files and package.json
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Install Playwright Chromium with all required system dependencies
# (--with-deps keeps the apt package list in sync with the browser build)
RUN npx playwright install --with-deps chromium

# Copy database schema to dist/db/ (where database.ts looks for it)
COPY --from=builder /app/src/db/schema.sql ./dist/db/

# Create data directory
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/wcag-crawler.db

# Note: Railway provides PORT dynamically, don't hardcode it

# Start the server
CMD ["node", "dist/index.js"]
