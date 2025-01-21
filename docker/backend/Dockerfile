# Stage 1: Builder
FROM rust:1.83.0-alpine AS builder

ARG commitHash
ENV MEMPOOL_COMMIT_HASH=${commitHash}

WORKDIR /build
COPY . .

# Install dependencies for building, including Node.js installation via NVM
RUN apk update && apk add --no-cache \
    build-base \
    python3 \
    pkgconfig \
    bash \
    ca-certificates \
    curl \
    && update-ca-certificates

# Install NVM and Node.js 22
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash \
    && export NVM_DIR="/root/.nvm" \
    && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" \
    && nvm install 22 \
    && nvm use 22 \
    && nvm alias default 22

# Set the correct PATH for Node.js
ENV PATH="/root/.nvm/versions/node/v22.*/bin:$PATH"

# Install Node.js dependencies without dev and optional dependencies
RUN npm install --omit=dev --omit=optional

WORKDIR /build
RUN npm run package

# Stage 2: Final image
FROM node:22-alpine

WORKDIR /backend

RUN chown 1000:1000 ./
COPY --from=builder --chown=1000:1000 /build/package ./package/
COPY --from=builder --chown=1000:1000 /build/GeoIP ./GeoIP/
COPY --from=builder --chown=1000:1000 /build/mempool-config.json /build/start.sh /build/wait-for-it.sh ./

USER 1000

EXPOSE 8999

CMD ["/backend/start.sh"]
