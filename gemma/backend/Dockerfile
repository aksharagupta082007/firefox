FROM python:3.11-slim

WORKDIR /app

# Install system deps for psycopg2 and geo libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc libgeos-dev libproj-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
COPY . ./backend
RUN pip install --no-cache-dir -r requirements.txt
EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
