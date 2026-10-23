"""PineQuest fine-tuned patient model — minimal OpenAI-compatible inference service.

Environment:
  BASE_MODEL       Hugging Face id or path of the base model (required)
  ADAPTER_PATH     directory with the LoRA adapter + pinequest_adapter.json (required)
  API_KEY          bearer token required from clients (required; set
                   ALLOW_UNAUTHENTICATED=1 only for a local smoke test)
  LOAD_IN_4BIT     "1" to load the base model in 4-bit (CUDA only)
  MAX_NEW_TOKENS   default 120 (patient replies are one or two sentences)

Endpoints:
  GET  /health               → {status, adapter_id, base_model, prompt_format}
  GET  /v1/models
  POST /v1/chat/completions  (subset of the OpenAI API; `stream: true` sends SSE chunks)

The app's FineTunedPatientProvider calls /health and refuses to label answers
as "fine-tuned" unless adapter_id and prompt_format match its configuration.
Run:  uvicorn server:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import json
import os
import secrets
import threading
import time
import uuid
from pathlib import Path
from typing import Literal

import torch
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse
from peft import PeftModel
from pydantic import BaseModel, Field
from transformers import AutoModelForCausalLM, AutoTokenizer, TextIteratorStreamer

from pinequest_ml.chat_format import format_prompt

BASE_MODEL = os.environ["BASE_MODEL"]
ADAPTER_PATH = Path(os.environ["ADAPTER_PATH"])
API_KEY = os.environ.get("API_KEY", "")
if not API_KEY and os.environ.get("ALLOW_UNAUTHENTICATED") != "1":
    raise SystemExit("API_KEY is not set. Refusing to serve the model without authentication "
                     "(set ALLOW_UNAUTHENTICATED=1 for a local smoke test only).")
MAX_NEW_TOKENS = int(os.environ.get("MAX_NEW_TOKENS", "120"))

metadata = json.loads((ADAPTER_PATH / "pinequest_adapter.json").read_text(encoding="utf-8"))
if metadata["base_model"] != BASE_MODEL:
    raise SystemExit(f"Adapter was trained on {metadata['base_model']}, not {BASE_MODEL}")

device = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
load_kwargs: dict = {}
if os.environ.get("LOAD_IN_4BIT") == "1" and device == "cuda":
    from transformers import BitsAndBytesConfig

    load_kwargs["quantization_config"] = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=torch.float16)
    load_kwargs["device_map"] = "auto"
else:
    load_kwargs["torch_dtype"] = torch.float16 if device == "cuda" else torch.float32

tokenizer = AutoTokenizer.from_pretrained(ADAPTER_PATH)
base = AutoModelForCausalLM.from_pretrained(BASE_MODEL, **load_kwargs)
if "device_map" not in load_kwargs:
    base = base.to(device)
model = PeftModel.from_pretrained(base, ADAPTER_PATH)
if "quantization_config" not in load_kwargs:
    # Fold the LoRA weights into the base model once, so generation skips the
    # extra adapter matmuls on every token. Same outputs, noticeably faster.
    model = model.merge_and_unload()
model = model.eval()
lock = threading.Lock()  # one generation at a time on a single GPU

app = FastAPI(title="PineQuest patient model", version="1.0")


def check_auth(authorization: str | None = Header(default=None)) -> None:
    if API_KEY and not (authorization and secrets.compare_digest(authorization, f"Bearer {API_KEY}")):
        raise HTTPException(status_code=401, detail="invalid api key")


class Message(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(max_length=20_000)


class ChatRequest(BaseModel):
    model: str = "pinequest-patient"
    messages: list[Message] = Field(min_length=1, max_length=80)
    max_tokens: int | None = Field(default=None, ge=1, le=512)
    temperature: float | None = Field(default=0.5, ge=0, le=2)
    stream: bool = False



def stream_chat(generate_kwargs: dict, completion_id: str, model_name: str):
    """Yields OpenAI-style SSE chunks as tokens are generated, so the app can voice the first sentence early."""
    streamer = TextIteratorStreamer(tokenizer, skip_prompt=True, skip_special_tokens=True)

    def run() -> None:
        with lock, torch.no_grad():
            model.generate(**generate_kwargs, streamer=streamer)

    threading.Thread(target=run, daemon=True).start()

    def chunk(delta: dict, finish_reason: str | None = None) -> str:
        body = {"id": completion_id, "object": "chat.completion.chunk", "created": int(time.time()), "model": model_name,
                "choices": [{"index": 0, "delta": delta, "finish_reason": finish_reason}]}
        return f"data: {json.dumps(body, ensure_ascii=False)}\n\n"

    yield chunk({"role": "assistant"})
    for piece in streamer:
        if piece:
            yield chunk({"content": piece})
    yield chunk({}, "stop")
    yield "data: [DONE]\n\n"


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "adapter_id": metadata["adapter_id"],
        "base_model": metadata["base_model"],
        "prompt_format": metadata["prompt_format"],
        "device": device,
    }


@app.get("/v1/models", dependencies=[Depends(check_auth)])
def models() -> dict:
    return {"object": "list", "data": [{"id": "pinequest-patient", "object": "model", "owned_by": "pinequest", "adapter_id": metadata["adapter_id"]}]}


@app.post("/v1/chat/completions", dependencies=[Depends(check_auth)])
def chat(request: ChatRequest):
    messages = [m.model_dump() for m in request.messages]
    text = format_prompt(tokenizer, messages, metadata.get("chat_template_kwargs"))
    inputs = tokenizer(text, return_tensors="pt", add_special_tokens=False).to(model.device)
    temperature = request.temperature or 0.0
    generate_kwargs = dict(
        **inputs,
        max_new_tokens=min(request.max_tokens or MAX_NEW_TOKENS, MAX_NEW_TOKENS),
        do_sample=temperature > 0,
        temperature=temperature if temperature > 0 else None,
        top_p=0.9 if temperature > 0 else None,
        pad_token_id=tokenizer.pad_token_id or tokenizer.eos_token_id,
    )
    completion_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
    if request.stream:
        return StreamingResponse(stream_chat(generate_kwargs, completion_id, request.model), media_type="text/event-stream")
    with lock, torch.no_grad():
        output = model.generate(**generate_kwargs)
    new_tokens = output[0][inputs["input_ids"].shape[1] :]
    reply = tokenizer.decode(new_tokens, skip_special_tokens=True).strip()
    return {
        "id": completion_id,
        "object": "chat.completion",
        "created": int(time.time()),
        "model": request.model,
        "choices": [{"index": 0, "message": {"role": "assistant", "content": reply}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": int(inputs["input_ids"].shape[1]), "completion_tokens": int(len(new_tokens))},
    }
