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

RUN touch ~/.bash_profile
# Install NVM (Node Version Manager)
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash

# Set environment variables for NVM and Node
ENV NVM_DIR="/root/.nvm"
ENV NODE_VERSION="v22.0.0"
ENV PATH="$NVM_DIR/versions/node/$NODE_VERSION/bin:$PATH"

# Install Node.js version 22 using NVM
RUN bash -c "source $NVM_DIR/nvm.sh && nvm install $NODE_VERSION && nvm alias default $NODE_VERSION && nvm use $NODE_VERSION"

# Verify Node.js installation
RUN node -v

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
