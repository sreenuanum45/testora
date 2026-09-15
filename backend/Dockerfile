# Chromium-only base — Playwright's full image ships Chromium+Firefox+WebKit and all
# three engines' OS deps (~2.4GB), which doesn't fit on a small/free host. We only ever
# run the "chromium" project (see playwright.exec.config.ts), so `playwright install-deps
# chromium` pulls just Chromium's OS-level dependencies onto a plain slim Node image, and
# `playwright install chromium` fetches only that browser binary — a few hundred MB total
# instead of 2.4GB.
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

RUN npx playwright install-deps chromium && npx playwright install chromium

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

EXPOSE 4000

CMD sh -c "npx prisma migrate deploy && node dist/src/main.js"
