FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY index.js ./
COPY public ./public
COPY scripts ./scripts

RUN npm run validate:barremes

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/healthz').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["npm", "start"]
