# Fine-tuned patient model — inference service

A minimal OpenAI-compatible server (`server.py`) that loads a base model plus the
LoRA adapter produced by `ml/` and exposes:

- `GET /health` → `{status, adapter_id, base_model, prompt_format}` (used by the app to verify the model)
- `GET /v1/models`
- `POST /v1/chat/completions` (non-streaming)

A GPU model cannot run inside a Vercel serverless function, so this runs as a
separate service. The web app reaches it over HTTPS with a bearer token.

## Run

```bash
cd inference
pip install -r requirements.txt          # installs ../ml for the shared chat formatting
export BASE_MODEL=Qwen/Qwen3-4B-Instruct-2507
export ADAPTER_PATH=/path/to/outputs/qwen3-4b-lora-v1/adapter
export API_KEY=$(openssl rand -hex 24)
export LOAD_IN_4BIT=1                    # optional, CUDA only
uvicorn server:app --host 0.0.0.0 --port 8000
curl localhost:8000/health
```

Docker (GPU host): `docker build -f inference/Dockerfile -t pinequest-inference .`
then `docker run --gpus all -e BASE_MODEL=... -e API_KEY=... -v /adapters/v1:/models/adapter -p 8000:8000 pinequest-inference`.

## Hosting options

| Option | Cost | Notes |
|---|---|---|
| Your own machine + tunnel (e.g. `cloudflared tunnel --url http://localhost:8000`) | free | Fine for a competition demo; a 4B model is slow on CPU/Apple Silicon. |
| Kaggle / Colab notebook + tunnel | free | Session time limits; good for live demos. |
| Modal (`modal_app.py`, setup steps in its docstring) | free monthly credits, then per second | Sleeps when idle; first answer after a pause takes ~1 min, so the app falls back to templates for that turn. |
| Hugging Face Inference Endpoints, RunPod, etc. | paid per hour | Always-on; choose a 16-24 GB GPU. |
| vLLM with `--enable-lora` | depends on GPU | Faster; but vLLM's `/health` has no adapter metadata, so put this server's `/health` contract in front or use `PATIENT_PROVIDER=openai_compatible` (then the app labels it as a generic model, not "fine-tuned"). |
| Merge adapter → GGUF → Ollama | free (local) | Same caveat as vLLM: use `openai_compatible`. |

Then configure the app as described in `ml/README.md` → *Serve and connect to the app*.
