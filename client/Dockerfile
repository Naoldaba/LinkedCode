# Stage 1: Build the project
FROM node:18-alpine AS builder

WORKDIR /build

# Copy package files and install dependencies
COPY package*.json .

RUN npm ci

# Copy the rest of the source code and build
COPY . .

# Backend URL is baked into the client at build time. Defaults to the deployed
# backend (production); docker-compose overrides it to the local server for
# testing. A shell env var prefixed with VITE_ takes priority over .env files.
ARG VITE_BACKEND_URL=https://linkedcode-backend.onrender.com
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}

RUN npm run build
RUN npm prune --omit=dev

# Stage 2: Serve the `dist` folder
FROM node:18-alpine AS runner

WORKDIR /app

# Install the static file server into the image so it never has to be fetched at
# container start (runtime `npx serve` is flaky and was crashing on a corrupt
# npx cache).
RUN npm install -g serve@14

# Copy the built frontend from the builder stage
COPY --from=builder /build/dist dist/

# Expose the port
EXPOSE 5173

# Start the server
CMD ["serve", "-s", "dist", "-l", "5173"]