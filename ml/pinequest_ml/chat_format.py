"""Chat-template formatting shared by training, evaluation and the inference service.

Using one function everywhere guarantees the fine-tuned model sees the same
token layout at inference time as during training.
"""

from __future__ import annotations

from typing import Any


def _merge_system(messages: list[dict[str, str]]) -> list[dict[str, str]]:
    """For templates without a system role: prepend the system text to the first user turn."""
    if not messages or messages[0]["role"] != "system":
        return messages
    system, rest = messages[0]["content"], messages[1:]
    if rest and rest[0]["role"] == "user":
        return [{"role": "user", "content": f"{system}\n\n{rest[0]['content']}"}, *rest[1:]]
    return [{"role": "user", "content": system}, *rest]


def format_prompt(tokenizer: Any, messages: list[dict[str, str]], template_kwargs: dict[str, Any] | None = None) -> str:
    """Render conversation (ending with a user turn) + generation prompt as text."""
    kwargs = dict(template_kwargs or {})
    try:
        return tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True, **kwargs)
    except Exception:  # noqa: BLE001 — templates that reject the system role
        return tokenizer.apply_chat_template(_merge_system(messages), tokenize=False, add_generation_prompt=True, **kwargs)


def build_training_tokens(tokenizer: Any, messages: list[dict[str, str]], max_len: int, template_kwargs: dict[str, Any] | None = None) -> dict[str, list[int]] | None:
    """Tokenise one example; loss only on the final assistant answer.

    Returns None when the prompt alone exceeds `max_len` (the example is skipped
    rather than truncated, so the model never learns from a cut-off context).
    """
    prompt_text = format_prompt(tokenizer, messages[:-1], template_kwargs)
    answer = messages[-1]["content"]
    eos = tokenizer.eos_token or ""
    prompt_ids = tokenizer(prompt_text, add_special_tokens=False)["input_ids"]
    answer_ids = tokenizer(answer + eos, add_special_tokens=False)["input_ids"]
    if len(prompt_ids) + 8 > max_len:
        return None
    answer_ids = answer_ids[: max_len - len(prompt_ids)]
    return {
        "input_ids": prompt_ids + answer_ids,
        "attention_mask": [1] * (len(prompt_ids) + len(answer_ids)),
        "labels": [-100] * len(prompt_ids) + answer_ids,
    }
