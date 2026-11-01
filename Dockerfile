FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer libreoffice-core fonts-dejavu fonts-liberation fonts-noto-core \
    ffmpeg qpdf python3 python3-venv python3-pip \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir pdf2docx

WORKDIR /app
COPY package*.json ./
RUN npm ci

RUN npx playwright install --with-deps chromium

COPY . .
RUN npm run build

ENV NODE_ENV=production \
    SOFFICE_PATH=soffice \
    PYTHON_PATH=/opt/venv/bin/python \
    FFMPEG_PATH=ffmpeg \
    QPDF_PATH=qpdf

EXPOSE 10000
CMD ["sh", "-c", "npm start -- -p ${PORT:-10000}"]
