# Stage 1: Builder
FROM node:22-alpine AS builder

ARG commitHash
ENV MEMPOOL_COMMIT_HASH=${commitHash}

WORKDIR /build
COPY . .

# Install dependencies for building, including curl and Rust installation
RUN apk update && apk add --no-cache \
    build-base \
    python3 \
    pkgconfig \
    curl \
    ca-certificates \
    bash \
    rust \
    && update-ca-certificates

# Ensure that the Rust toolchain is installed correctly
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable

# Add cargo to PATH
ENV PATH="/root/.cargo/bin:$PATH"

# Verify installation of cargo (to ensure it's available in PATH)
RUN cargo --version

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
