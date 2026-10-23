# syntax=docker/dockerfile:1
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libpq5 fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
# A worker image without FFmpeg must fail here, not at upload time.
RUN ffmpeg -version >/dev/null && ffprobe -version >/dev/null
WORKDIR /app
COPY requirements.txt .
# Optional offline wheelhouse (backend/.wheels) for restricted networks; falls back to PyPI.
COPY .wheels/ /tmp/wheels/
RUN if ls /tmp/wheels/*.whl >/dev/null 2>&1; then pip install --no-index --find-links /tmp/wheels -r requirements.txt; \
    else pip install --default-timeout=120 -r requirements.txt; fi

FROM base AS dev
COPY requirements-dev.txt .
RUN if ls /tmp/wheels/*.whl >/dev/null 2>&1; then pip install --no-index --find-links /tmp/wheels -r requirements-dev.txt; \
    else pip install --default-timeout=120 -r requirements-dev.txt; fi
COPY . .

FROM base AS prod
RUN useradd --create-home --uid 1000 netfly
COPY --chown=netfly:netfly . .
RUN DJANGO_SECRET_KEY=build CONFIG_ENCRYPTION_KEY=MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA= \
    REDIS_URL=redis://localhost DATABASE_URL=postgres://x@localhost/x \
    python manage.py collectstatic --noinput
USER netfly
EXPOSE 8000
CMD ["gunicorn", "netfly.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "4", "--threads", "4", "--worker-class", "gthread", "--timeout", "60", "--access-logfile", "-"]
