# Image d'exécution Node.js du runner CodeQuest (T082).
# Digests figés ; code monté en lecture seule sur /work ; UID 10001 non privilégié.
FROM node:20-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0

RUN groupadd --gid 10001 runner \
  && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin runner

WORKDIR /work
ENV NODE_ENV=production \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning

USER 10001:10001
ENTRYPOINT []
CMD ["node", "/work/harness.js"]
