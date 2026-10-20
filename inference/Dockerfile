# GPU image for the PineQuest patient model. Build from the repository root:
#   docker build -f inference/Dockerfile -t pinequest-inference .
FROM pytorch/pytorch:2.4.1-cuda12.1-cudnn9-runtime
WORKDIR /srv
COPY ml /srv/ml
COPY inference/requirements.txt /srv/inference/requirements.txt
RUN pip install --no-cache-dir -r /srv/inference/requirements.txt
COPY inference/server.py /srv/inference/server.py
WORKDIR /srv/inference
# Mount or copy the adapter into /models/adapter at runtime.
ENV ADAPTER_PATH=/models/adapter
EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
