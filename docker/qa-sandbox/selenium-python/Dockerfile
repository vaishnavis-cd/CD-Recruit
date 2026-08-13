FROM python:3.11-slim

# Install Chromium & ChromeDriver
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV CHROME_BIN=/usr/bin/chromium
ENV CHROMEDRIVER_PATH=/usr/bin/chromedriver

WORKDIR /app

RUN pip install --no-cache-dir selenium pytest

ENTRYPOINT ["python"]
