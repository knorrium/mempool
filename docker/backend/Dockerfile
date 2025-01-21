# Stage 1: Builder
FROM node:22-alpine AS builder

ARG commitHash
ENV MEMPOOL_COMMIT_HASH=${commitHash}

WORKDIR /build
COPY . .

# Install dependencies for building
RUN apk update && apk add --no-cache \
    build-base \
    python3 \
    pkgconfig \
    curl \
    ca-certificates \
    bash \
    rust \
    && update-ca-certificates

# Install Rust via rustup (same as before)
RUN CPU_ARCH=$(uname -m); if [ "$CPU_ARCH" = "armv7l" ]; then c_rehash; fi
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sed 's#/proc/self/exe#\/bin\/sh#g' | sh -s -- -y --default-toolchain stable
ENV PATH="/root/.cargo/bin:$PATH"

# Copy other necessary artifacts
COPY --from=backend . .
COPY --from=rustgbt . ../rust/
ENV FD=/build/rust-gbt

# Install node modules without dev and optional dependencies
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
