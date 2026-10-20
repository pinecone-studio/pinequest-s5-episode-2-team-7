"""LoRA / QLoRA supervised fine-tuning of the Mongolian patient model.

    python -m pinequest_ml train --config configs/train_qwen3_4b_qlora.yaml [--dry-run]

* Input: ml/data/processed/{train,validation}.jsonl from `build`.
* Loss on the patient answer only (prompt tokens masked with -100).
* QLoRA (4-bit NF4 via bitsandbytes) requires an NVIDIA GPU (Linux). On Apple
  Silicon / CPU only plain LoRA on small models is possible (smoke tests).
* Output: LoRA adapter + tokenizer + `pinequest_adapter.json` metadata
  (adapter id, base model, prompt format, data report hash, metrics, versions).
"""

from __future__ import annotations

import hashlib
import inspect
import json
import math
import platform
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from .paths import ML_ROOT, PROCESSED_DIR
from .prompt import PROMPT_FORMAT_VERSION


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _git_commit() -> str | None:
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ML_ROOT, text=True).strip()
    except Exception:  # noqa: BLE001
        return None


def _resolve(path: str) -> Path:
    p = Path(path)
    return p if p.is_absolute() else (ML_ROOT / p)


def load_config(path: Path) -> dict[str, Any]:
    cfg = yaml.safe_load(path.read_text(encoding="utf-8"))
    for key in ("base_model", "adapter_id", "output_dir", "lora", "training"):
        if key not in cfg:
            raise SystemExit(f"config {path}: missing '{key}'")
    cfg.setdefault("data", {})
    cfg["data"].setdefault("train", str(PROCESSED_DIR / "train.jsonl"))
    cfg["data"].setdefault("validation", str(PROCESSED_DIR / "validation.jsonl"))
    cfg.setdefault("quantization", "none")
    cfg.setdefault("max_seq_length", 2048)
    cfg.setdefault("chat_template_kwargs", {})
    return cfg


def train(config_path: Path, dry_run: bool = False) -> Path | None:
    cfg = load_config(config_path)
    train_path, val_path = _resolve(cfg["data"]["train"]), _resolve(cfg["data"]["validation"])
    if not train_path.exists():
        raise SystemExit(f"{train_path} not found — run `python -m pinequest_ml build` first.")
    train_rows = _read_jsonl(train_path)
    val_rows = _read_jsonl(val_path) if val_path.exists() else []
    for row in train_rows[:50]:
        roles = [m["role"] for m in row["messages"]]
        if roles[0] != "system" or roles[-1] != "assistant":
            raise SystemExit(f"example {row.get('id')} has unexpected roles {roles}")

    print(f"base model     : {cfg['base_model']}")
    print(f"adapter id     : {cfg['adapter_id']}")
    print(f"quantization   : {cfg['quantization']}")
    print(f"train / val    : {len(train_rows)} / {len(val_rows)} examples")
    print(f"prompt format  : {PROMPT_FORMAT_VERSION}")

    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
    except ImportError:
        if dry_run:
            print("\n(dry run) transformers/torch not installed — install with `uv sync --extra train` on the training machine.")
            return None
        raise SystemExit("Training dependencies missing: `uv pip install -e '.[train]'` (on a GPU machine).")

    from .chat_format import build_training_tokens

    tokenizer = AutoTokenizer.from_pretrained(cfg["base_model"], trust_remote_code=cfg.get("trust_remote_code", False))
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    def encode(rows: list[dict[str, Any]]) -> list[dict[str, list[int]]]:
        out = []
        for row in rows:
            enc = build_training_tokens(tokenizer, row["messages"], cfg["max_seq_length"], cfg["chat_template_kwargs"])
            if enc:
                out.append(enc)
        return out

    max_train = cfg.get("max_train_examples")
    train_enc = encode(train_rows[:max_train] if max_train else train_rows)
    val_enc = encode(val_rows[: cfg.get("max_eval_examples", 200)])
    lengths = sorted(len(e["input_ids"]) for e in train_enc)
    print(f"tokenised      : {len(train_enc)} train (skipped {len(train_rows[:max_train] if max_train else train_rows) - len(train_enc)} too long), {len(val_enc)} val")
    if lengths:
        print(f"tokens/example : median {lengths[len(lengths) // 2]}, max {lengths[-1]}")
    print("\nsample formatted prompt (truncated):\n" + tokenizer.decode(train_enc[0]["input_ids"])[-600:])

    if dry_run:
        print("\n(dry run) configuration and data look OK; no training performed.")
        return None

    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from transformers import DataCollatorForSeq2Seq, Trainer, TrainingArguments

    cuda = torch.cuda.is_available()
    mps = getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available()
    if cfg.get("device") == "cpu":
        cuda = mps = False
    model_kwargs: dict[str, Any] = {"trust_remote_code": cfg.get("trust_remote_code", False)}
    if cfg["quantization"] == "4bit":
        if not cuda:
            raise SystemExit("4-bit QLoRA needs an NVIDIA GPU with bitsandbytes. Use quantization: none for CPU/Apple Silicon smoke tests.")
        from transformers import BitsAndBytesConfig

        compute_dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
        model_kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=compute_dtype
        )
        model_kwargs["device_map"] = "auto"
    else:
        model_kwargs["torch_dtype"] = torch.bfloat16 if cuda and torch.cuda.is_bf16_supported() else (torch.float16 if cuda else torch.float32)

    model = AutoModelForCausalLM.from_pretrained(cfg["base_model"], **model_kwargs)
    if cfg["quantization"] == "4bit":
        model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=cfg["training"].get("gradient_checkpointing", True))
    else:
        if mps and not cuda:
            model = model.to("mps")
        if cfg["training"].get("gradient_checkpointing", False):
            # Needed so checkpointed activations get gradients when only LoRA weights train.
            model.enable_input_require_grads()

    lora = cfg["lora"]
    model = get_peft_model(
        model,
        LoraConfig(
            r=lora.get("r", 16),
            lora_alpha=lora.get("alpha", 32),
            lora_dropout=lora.get("dropout", 0.05),
            target_modules=lora.get("target_modules", "all-linear"),
            bias="none",
            task_type="CAUSAL_LM",
        ),
    )
    model.print_trainable_parameters()

    t = cfg["training"]
    output_dir = _resolve(cfg["output_dir"])
    use_bf16 = cuda and torch.cuda.is_bf16_supported()
    # Warmup is given as a ratio in the config and converted to steps, because
    # `warmup_ratio` was removed in transformers 5.
    steps_per_epoch = math.ceil(len(train_enc) / (t.get("batch_size", 2) * t.get("grad_accum", 8)))
    total_steps = t["max_steps"] if t.get("max_steps", -1) > 0 else steps_per_epoch * t.get("epochs", 2)
    arg_values = dict(
        output_dir=str(output_dir / "checkpoints"),
        num_train_epochs=t.get("epochs", 2),
        max_steps=t.get("max_steps", -1),
        per_device_train_batch_size=t.get("batch_size", 2),
        per_device_eval_batch_size=t.get("batch_size", 2),
        gradient_accumulation_steps=t.get("grad_accum", 8),
        learning_rate=float(t.get("learning_rate", 2e-4)),
        lr_scheduler_type=t.get("scheduler", "cosine"),
        warmup_steps=int(total_steps * t.get("warmup_ratio", 0.05)),
        weight_decay=t.get("weight_decay", 0.0),
        logging_steps=t.get("logging_steps", 10),
        eval_strategy="steps" if val_enc else "no",
        eval_steps=t.get("eval_steps", 100),
        save_strategy="steps",
        save_steps=t.get("save_steps", 100),
        save_total_limit=t.get("save_total_limit", 2),
        bf16=use_bf16,
        fp16=cuda and not use_bf16,
        gradient_checkpointing=t.get("gradient_checkpointing", cuda),
        report_to=t.get("report_to", "none"),
        seed=t.get("seed", 42),
        dataloader_pin_memory=cuda,
        use_cpu=cfg.get("device") == "cpu",
    )
    accepted = inspect.signature(TrainingArguments.__init__).parameters
    dropped = sorted(k for k in arg_values if k not in accepted)
    if dropped:
        print(f"note: this transformers version ignores {dropped}")
    args = TrainingArguments(**{k: v for k, v in arg_values.items() if k in accepted})
    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=train_enc,
        eval_dataset=val_enc or None,
        data_collator=DataCollatorForSeq2Seq(tokenizer, padding=True, label_pad_token_id=-100),
    )
    result = trainer.train()
    metrics: dict[str, Any] = {"train_loss": result.training_loss, "global_step": result.global_step}
    if val_enc:
        metrics.update(trainer.evaluate())

    adapter_dir = output_dir / "adapter"
    model.save_pretrained(adapter_dir)
    tokenizer.save_pretrained(adapter_dir)
    report_path = PROCESSED_DIR / "quality_report.json"
    import peft
    import transformers

    metadata = {
        "adapter_id": cfg["adapter_id"],
        "base_model": cfg["base_model"],
        "prompt_format": PROMPT_FORMAT_VERSION,
        "quantization": cfg["quantization"],
        "lora": lora,
        "training": t,
        "max_seq_length": cfg["max_seq_length"],
        "chat_template_kwargs": cfg["chat_template_kwargs"],
        "data": {
            "train": str(train_path),
            "validation": str(val_path),
            "train_examples": len(train_enc),
            "validation_examples": len(val_enc),
            "quality_report_sha256": hashlib.sha256(report_path.read_bytes()).hexdigest() if report_path.exists() else None,
        },
        "metrics": metrics,
        "purpose": cfg.get("purpose", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "git_commit": _git_commit(),
        "environment": {
            "python": platform.python_version(),
            "torch": torch.__version__,
            "transformers": transformers.__version__,
            "peft": peft.__version__,
            "device": "cuda:" + torch.cuda.get_device_name(0) if cuda else ("mps" if mps else "cpu"),
        },
    }
    (adapter_dir / "pinequest_adapter.json").write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nadapter saved to {adapter_dir}\nmetrics: {metrics}")
    return adapter_dir
