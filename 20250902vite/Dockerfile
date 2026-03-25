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
