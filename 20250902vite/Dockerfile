# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /build
COPY package*.json ./
RUN npm ci --silent
COPY . .
RUN npm run build

# Stage 2: Python runtime
FROM python:3.11-slim
WORKDIR /app

# System dependencies for WeasyPrint (PDF rendering) and Chinese fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf2.0-0 \
    libffi-dev shared-mime-info fonts-wqy-zenhei \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY agentv2/requirements.txt agentv2/requirements.txt
RUN pip install --no-cache-dir -r agentv2/requirements.txt

# Copy backend source
COPY agentv2/ agentv2/

# Copy built frontend from stage 1
COPY --from=frontend-build /build/dist dist/

EXPOSE 8001
WORKDIR /app/agentv2
CMD ["python", "agent.py"]
