"""Serve the fine-tuned patient model on Modal (https://modal.com) with a GPU.

Runs the same FastAPI app as `server.py` (same /health contract), sleeps when
idle and wakes on the next request (~1 min cold start). One-time setup:

    modal setup                                             # log in
    modal volume create pinequest-adapters
    modal volume put pinequest-adapters /path/to/adapter /pq-qwen3-4b-lora-v2
    modal secret create pinequest-inference API_KEY=$(openssl rand -hex 24)

Deploy (from the repository root):

    modal deploy inference/modal_app.py

Then set FINETUNED_BASE_URL=<printed url>/v1, FINETUNED_API_KEY (the same
API_KEY) and FINETUNED_EXPECTED_ADAPTER in the app. To serve another
adapter, upload it under its id and redeploy with ADAPTER_ID=<id>.
"""

import os
from pathlib import Path

import modal

ADAPTER_ID = os.environ.get("ADAPTER_ID", "pq-qwen3-4b-lora-v2")
HERE = Path(__file__).parent

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("fastapi>=0.115", "torch>=2.4", "transformers>=4.51", "peft>=0.15", "accelerate>=1.0")
    .env(
        {
            "BASE_MODEL": "Qwen/Qwen3-4B-Instruct-2507",
            "ADAPTER_PATH": f"/adapters/{ADAPTER_ID}",
            "HF_HOME": "/cache/huggingface",  # keep the 8 GB base model between cold starts
        }
    )
    .add_local_dir(HERE.parent / "ml" / "pinequest_ml", "/root/pinequest_ml")
    .add_local_file(HERE / "server.py", "/root/server.py")
)

app = modal.App("pinequest-patient", image=image)
adapters = modal.Volume.from_name("pinequest-adapters")
hf_cache = modal.Volume.from_name("pinequest-hf-cache", create_if_missing=True)


@app.function(
    gpu="L4",
    volumes={"/adapters": adapters, "/cache": hf_cache},
    secrets=[modal.Secret.from_name("pinequest-inference")],
    scaledown_window=900,  # sleep after 15 idle minutes so credits are only used while in use
    max_containers=1,  # one GPU at most; server.py answers one request at a time
    timeout=600,
)
@modal.concurrent(max_inputs=8)
@modal.asgi_app()
def serve():
    from server import app as fastapi_app

    return fastapi_app
