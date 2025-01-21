FROM node:22-alpine AS node

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

COPY --from=node /usr/lib /usr/lib
COPY --from=node /usr/local/share /usr/local/share
COPY --from=node /usr/local/lib /usr/local/lib
COPY --from=node /usr/local/include /usr/local/include
COPY --from=node /usr/local/bin /usr/local/bin

WORKDIR /build
RUN npm install --omit=dev --omit=optional

WORKDIR /build
RUN npm run package

FROM node:22-alpine AS runtime

WORKDIR /backend

RUN chown 1000:1000 ./
COPY --from=builder --chown=1000:1000 /build/package ./package/
COPY --from=builder --chown=1000:1000 /build/GeoIP ./GeoIP/
COPY --from=builder --chown=1000:1000 /build/mempool-config.json /build/start.sh /build/wait-for-it.sh ./

USER 1000

EXPOSE 8999

CMD ["/backend/start.sh"]
