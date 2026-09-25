FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-reportlab python3-pil ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --chown=node:node package.json server.mjs build.py site_sections.py release4.py visual5.py museum.py release6.py release7.py release8.py release9.py assets9.py visual10.py release103.py ./
COPY --chown=node:node backend/ ./backend/
COPY --chown=node:node scripts/ ./scripts/
COPY --chown=node:node source/ ./source/
COPY --chown=node:node site/ ./site/
RUN mkdir -p /data && chown node:node /data
USER node
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data PYTHONDONTWRITEBYTECODE=1
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server.mjs"]
