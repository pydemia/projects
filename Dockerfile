FROM node:24.21.0-bookworm-slim AS tools
RUN npm install --global @openai/codex@0.163.0

FROM tools AS frontend
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.12.14-slim-bookworm AS app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_NO_CACHE=1 \
    PROJECTS_WEB_DIR=/app/web/dist \
    PROJECTS_DATA_DIR=/app/.projects
RUN python -m pip install --no-cache-dir uv==0.12.16 \
    && groupadd --gid 1000 projects \
    && useradd --uid 1000 --gid 1000 --create-home projects
COPY --from=tools /usr/local/bin/node /usr/local/bin/node
COPY --from=tools /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/@openai/codex/bin/codex.js /usr/local/bin/codex
WORKDIR /app
COPY pyproject.toml uv.lock alembic.ini ./
COPY src/ src/
COPY migrations/ migrations/
COPY docs/planning/references/artifact-templates.json docs/planning/references/artifact-templates.json
RUN chmod -R a+rX /app/src /app/migrations /app/docs
RUN uv sync --locked --no-dev \
    && mkdir -p /app/.projects \
    && chown -R projects:projects /app/.projects
COPY --from=frontend /web/dist/ web/dist/
USER projects
EXPOSE 8000
HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=5 \
    CMD ["/app/.venv/bin/python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]
CMD ["uv", "run", "--no-sync", "projects", "serve", "--host", "0.0.0.0", "--port", "8000", "--forwarded-allow-ips", "*"]
