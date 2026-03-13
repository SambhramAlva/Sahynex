# ── Stage 1: builder ─────────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# Install Node.js (required for npx @modelcontextprotocol/server-github)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl gnupg ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Pre-install the GitHub MCP server so it doesn't download at runtime
RUN npx --yes @modelcontextprotocol/server-github --version || true

# ── Stage 2: runtime ──────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

WORKDIR /app

# Copy Node + npx from builder
COPY --from=builder /usr/bin/node /usr/bin/node
COPY --from=builder /usr/bin/npm  /usr/bin/npm
COPY --from=builder /usr/bin/npx  /usr/bin/npx
COPY --from=builder /usr/lib/node_modules /usr/lib/node_modules
COPY --from=builder /root/.npm /root/.npm

# Copy Python packages
COPY --from=builder /usr/local/lib/python3.12 /usr/local/lib/python3.12
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application
COPY . .

# Non-root user
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser && \
    chown -R appuser:appgroup /app
USER appuser

EXPOSE 8000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/healthz || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
