FROM python:3.12.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml README.md ./
# Cài thư viện ở tầng riêng, trước khi chép mã nguồn: sửa code không phải tải lại thư viện,
# build lại chỉ mất vài giây kể cả khi mạng yếu.
RUN python -c "import tomllib; deps = tomllib.load(open('pyproject.toml', 'rb'))['project']['dependencies']; open('/tmp/requirements.txt', 'w').write(chr(10).join(deps))" \
    && pip install --no-cache-dir -r /tmp/requirements.txt

COPY app ./app
COPY alembic.ini ./
COPY alembic ./alembic

RUN pip install --no-cache-dir --no-deps .

EXPOSE 8000

# Cloud hosts (e.g. Render) inject $PORT and sit behind a proxy: apply pending migrations,
# then trust X-Forwarded-For so request.client is the real visitor IP for rate limits.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips=\"${FORWARDED_ALLOW_IPS:-*}\" --no-server-header --no-date-header"]
