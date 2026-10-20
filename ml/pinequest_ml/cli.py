"""Command-line entry point: `python -m pinequest_ml <command>` (run from ml/)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .paths import CASES_DIR, INTERIM_DIR, ML_ROOT, PROCESSED_DIR


def cmd_validate(args: argparse.Namespace) -> int:
    from .schema import validate_case

    paths = [Path(p) for p in args.paths] or sorted(CASES_DIR.glob("*.json"))
    failed = 0
    for path in paths:
        problems = validate_case(json.loads(path.read_text(encoding="utf-8")))
        if problems:
            failed += 1
            print(f"✗ {path}")
            for p in problems[:30]:
                print(f"    {p}")
        else:
            print(f"✓ {path}")
    return 1 if failed else 0


def cmd_build(args: argparse.Namespace) -> int:
    from .build import build

    report = build(Path(args.config), Path(args.sessions) if args.sessions else None, Path(args.out))
    c = report["counts"]
    print(f"cases: {c['cases_accepted']}  examples: {c['examples']}  duplicates removed: {c['duplicates_removed']}")
    print(f"invalid cases: {len(report['invalid_cases'])}  excluded: {len(report['excluded_cases'])}  leakage: {report['case_leakage_across_splits'] or 'none'}")
    for w in report["warnings"]:
        print(f"! {w}")
    print(f"→ {args.out}/{{train,validation,test}}.jsonl, quality_report.md")
    return 0


def cmd_adapt_agentclinic(args: argparse.Namespace) -> int:
    from .adapters.agentclinic import convert_file

    written = convert_file(Path(args.input), Path(args.out), args.limit)
    print(f"wrote {len(written)} English drafts to {args.out} (translate + review before use)")
    return 0


def cmd_adapt_meditod(args: argparse.Namespace) -> int:
    from .adapters.meditod import extract_pairs

    pairs = extract_pairs(Path(args.input))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as fh:
        for pair in pairs:
            fh.write(json.dumps(pair, ensure_ascii=False) + "\n")
    print(f"wrote {len(pairs)} question/answer pairs to {out}")
    return 0


def cmd_inventory_patientsim(args: argparse.Namespace) -> int:
    from .adapters.patientsim import DataUseAgreementRequired, inventory

    try:
        result = inventory(Path(args.input), args.i_have_a_physionet_dua)
    except DataUseAgreementRequired as error:
        print(error, file=sys.stderr)
        return 2
    print(json.dumps(result, indent=2))
    return 0


def cmd_translate(args: argparse.Namespace) -> int:
    from . import translate

    if args.action == "export":
        print(f"{translate.export_worksheet(Path(args.drafts), Path(args.csv))} fields to translate → {args.csv}")
    elif args.action == "machine":
        print(f"machine-translated {translate.machine_translate(Path(args.csv), args.model, limit=args.limit)} fields")
    else:
        written = translate.import_worksheet(Path(args.csv), Path(args.drafts), Path(args.out))
        print(f"wrote {len(written)} cases to {args.out}; validate with: python -m pinequest_ml validate {args.out}/*.json")
    return 0


def cmd_train(args: argparse.Namespace) -> int:
    from .train import train

    train(Path(args.config), dry_run=args.dry_run)
    return 0


def cmd_evaluate(args: argparse.Namespace) -> int:
    from .evaluate import evaluate

    evaluate(args)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pinequest_ml", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("validate", help="validate canonical case JSON files")
    p.add_argument("paths", nargs="*")
    p.set_defaults(func=cmd_validate)

    p = sub.add_parser("build", help="build train/validation/test JSONL + quality report")
    p.add_argument("--config", default=str(ML_ROOT / "configs" / "data.yaml"))
    p.add_argument("--sessions", help="approved transcripts JSONL exported from the admin page")
    p.add_argument("--out", default=str(PROCESSED_DIR))
    p.set_defaults(func=cmd_build)

    p = sub.add_parser("adapt-agentclinic", help="AgentClinic JSONL → English case drafts")
    p.add_argument("input")
    p.add_argument("--out", default=str(INTERIM_DIR / "agentclinic"))
    p.add_argument("--limit", type=int)
    p.set_defaults(func=cmd_adapt_agentclinic)

    p = sub.add_parser("adapt-meditod", help="MediTOD dialogs.json → question/answer pairs")
    p.add_argument("input")
    p.add_argument("--out", default=str(INTERIM_DIR / "meditod_pairs.jsonl"))
    p.set_defaults(func=cmd_adapt_meditod)

    p = sub.add_parser("inventory-patientsim", help="list fields of a local PatientSim profile file (DUA required)")
    p.add_argument("input")
    p.add_argument("--i-have-a-physionet-dua", action="store_true")
    p.set_defaults(func=cmd_inventory_patientsim)

    p = sub.add_parser("translate", help="translation worksheet workflow")
    p.add_argument("action", choices=["export", "machine", "import"])
    p.add_argument("--drafts", default=str(INTERIM_DIR / "agentclinic"))
    p.add_argument("--csv", default=str(INTERIM_DIR / "translation_worksheet.csv"))
    p.add_argument("--out", default=str(INTERIM_DIR / "translated"))
    p.add_argument("--model", default="gemini-2.5-flash")
    p.add_argument("--limit", type=int)
    p.set_defaults(func=cmd_translate)

    p = sub.add_parser("train", help="LoRA / QLoRA supervised fine-tuning")
    p.add_argument("--config", required=True)
    p.add_argument("--dry-run", action="store_true", help="validate config and data, print plan, do not train")
    p.set_defaults(func=cmd_train)

    p = sub.add_parser("evaluate", help="evaluate a model on the held-out split")
    p.add_argument("--split", default=str(PROCESSED_DIR / "test.jsonl"))
    p.add_argument("--endpoint", help="OpenAI-compatible base URL (e.g. http://localhost:8000/v1)")
    p.add_argument("--model", default="pinequest-patient")
    p.add_argument("--api-key")
    p.add_argument("--base-model", help="local HF model id/path (instead of --endpoint)")
    p.add_argument("--adapter", help="local LoRA adapter directory (with --base-model)")
    p.add_argument("--reference", action="store_true", help="score the reference answers themselves (sanity check)")
    p.add_argument("--limit", type=int)
    p.add_argument("--out", default=str(ML_ROOT / "outputs" / "eval"))
    p.set_defaults(func=cmd_evaluate)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
