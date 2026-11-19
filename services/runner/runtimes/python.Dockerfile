# Image d'exécution Python du runner CodeQuest (T082).
# Digests figés : la même image est reconstruite à l'identique (reproductibilité).
# Le code utilisateur est monté en lecture seule sur /work et exécuté sous UID 10001.
FROM python:3.12-slim@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b

RUN groupadd --gid 10001 runner \
  && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin runner

WORKDIR /work
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONHASHSEED=0

USER 10001:10001
ENTRYPOINT []
CMD ["python", "/work/harness.py"]
