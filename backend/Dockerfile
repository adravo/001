FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json nest-cli.json ./
COPY src ./src

RUN npm run build

# Install Playwright browsers
RUN npx playwright install chromium --with-deps

# ---- Production image ----
FROM node:20-alpine AS runner

RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S appgroup && adduser -S appuser -G appgroup
RUN mkdir -p screenshots && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3001

ENV PLAYWRIGHT_BROWSERS_PATH=/usr/bin
ENV PLAYWRIGHT_HEADLESS=true

CMD ["node", "dist/main"]
