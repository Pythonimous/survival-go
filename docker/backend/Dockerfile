# Backend + KataGo analysis engine for local Docker Compose packaging.
FROM python:3.12-slim-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl unzip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend
COPY third_party/katago/analysis.cfg third_party/katago/analysis.docker.cfg \
    third_party/katago/README.txt ./third_party/katago/
COPY scripts/setup_katago.sh ./scripts/setup_katago.sh

ENV KATAGO_INSTALL_DIR=/opt/katago
RUN chmod +x scripts/setup_katago.sh \
    && ./scripts/setup_katago.sh

ENV PYTHONPATH=/app
ENV KATAGO_BINARY_PATH=/opt/katago/katago
ENV KATAGO_CONFIG_PATH=/app/third_party/katago/analysis.docker.cfg
ENV KATAGO_MODEL_PATH=/opt/katago/kata1-b20c256x2-s4384473088-d968438914.bin.gz
ENV KATAGO_ANALYSIS_TIMEOUT_SECONDS=45

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')"]

CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
