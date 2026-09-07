# Playwright's own image ships Chromium/Firefox/WebKit + all OS dependencies already
# installed — building on plain node:20 would require manually apt-installing dozens of
# browser dependencies, which is exactly the kind of thing that silently breaks in CI.
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

EXPOSE 4000

CMD sh -c "npx prisma migrate deploy && node dist/main.js"
