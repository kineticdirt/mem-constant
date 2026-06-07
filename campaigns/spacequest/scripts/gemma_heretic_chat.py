#!/usr/bin/env python3
"""
Local Gemma 4 (DECKARD Heretic) via llama-cpp-python.

Your snippet was invalid: `messages` must be a list of {role, content} dicts, not a string.

Usage:
  set GEMMA_GGUF=C:\\path\\to\\E4B-Gemma4-it-vl-HERE-DECKARD4-Q8_0.gguf
  python gemma_heretic_chat.py --prompt "Rewrite this beat list as prose..."

  python gemma_heretic_chat.py --prompt-file analysis_prompt.txt

  type prompt.txt | python gemma_heretic_chat.py

If GEMMA_GGUF is unset, tries Hugging Face download via from_pretrained (needs HF token for gated repos).
"""

from __future__ import annotations

import argparse
import os
import sys

# --- defaults (override with env) ---
DEFAULT_REPO = "DavidAU/gemma-4-E4B-it-The-DECKARD-Expresso-Universe-HERETIC-UNCENSORED-Thinking-GGUF"
DEFAULT_FILENAME = "E4B-Gemma4-it-vl-HERE-DECKARD4-Q8_0.gguf"


def load_llm(
    gguf_path: str | None,
    n_ctx: int,
    n_gpu_layers: int,
    verbose: bool,
):
    from llama_cpp import Llama

    if gguf_path and os.path.isfile(gguf_path):
        return Llama(
            model_path=gguf_path,
            n_ctx=n_ctx,
            n_gpu_layers=n_gpu_layers,
            verbose=verbose,
        )
    repo = os.environ.get("HF_REPO_ID", DEFAULT_REPO)
    filename = os.environ.get("HF_GGUF_FILENAME", DEFAULT_FILENAME)
    return Llama.from_pretrained(
        repo_id=repo,
        filename=filename,
        n_ctx=n_ctx,
        n_gpu_layers=n_gpu_layers,
        verbose=verbose,
    )


def main() -> None:
    p = argparse.ArgumentParser(description="Chat completion with local Gemma GGUF")
    p.add_argument("--prompt", default=None, help="User message (else stdin or --prompt-file)")
    p.add_argument("--prompt-file", "-f", default=None, help="Read user message from file")
    p.add_argument("--system", default=None, help="Optional system message")
    p.add_argument("--max-tokens", type=int, default=2048)
    p.add_argument("--temperature", type=float, default=0.7)
    p.add_argument("--n-ctx", type=int, default=8192)
    p.add_argument("--n-gpu-layers", type=int, default=-1, help="-1 = all layers on GPU if compiled with CUDA")
    p.add_argument("--verbose", action="store_true")
    args = p.parse_args()

    if args.prompt_file:
        with open(args.prompt_file, encoding="utf-8") as fh:
            user_content = fh.read()
    elif args.prompt:
        user_content = args.prompt
    else:
        user_content = sys.stdin.read()

    if not user_content.strip():
        print("No prompt: use --prompt, --prompt-file, or pipe stdin.", file=sys.stderr)
        sys.exit(1)

    gguf = os.environ.get("GEMMA_GGUF") or os.environ.get("LOCAL_GGUF_PATH")

    try:
        llm = load_llm(
            gguf_path=gguf,
            n_ctx=args.n_ctx,
            n_gpu_layers=args.n_gpu_layers,
            verbose=args.verbose,
        )
    except ImportError as e:
        print(
            "llama_cpp not installed. On Windows you often need either:\n"
            "  - Visual Studio Build Tools (C++ workload) then: pip install llama-cpp-python\n"
            "  - or conda: conda install -c conda-forge llama-cpp-python\n"
            f"Import error: {e}",
            file=sys.stderr,
        )
        sys.exit(1)

    messages = []
    if args.system:
        messages.append({"role": "system", "content": args.system})
    messages.append({"role": "user", "content": user_content})

    out = llm.create_chat_completion(
        messages=messages,
        max_tokens=args.max_tokens,
        temperature=args.temperature,
    )
    text = out["choices"][0]["message"]["content"]
    print(text)


if __name__ == "__main__":
    main()
