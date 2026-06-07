# Local / API “writing bot” notes (optional)

There is **no** built-in writing API in this vault. To run **batch** expansion (e.g. rephrase dossiers, generate CHARML, summarize threads) you can:

## 1. Cursor / IDE

Use **Composer** or **Chat** with `characters/` and `discord-export/` folders in context—zero extra setup.

## 2. OpenAI / Anthropic CLI

Set env vars (never commit keys):

```bash
export OPENAI_API_KEY=...
# or
export ANTHROPIC_API_KEY=...
```

Pipe a file:

```bash
# example: summarize one thread (use your CLI of choice)
```

## 3. Ollama (local)

```bash
ollama run llama3.2 < prompt.txt
```

Good for **offline** drafts; quality varies.

## 3b. Gemma 4 DECKARD Heretic (GGUF + `llama-cpp-python`)

Script: **`../../scripts/gemma_heretic_chat.py`** · optional deps: **`../../requirements-llm.txt`**

**Correct API shape** (your one-liner had a bug: `messages` must be a **list** of `{role, content}` dicts, not a string):

```python
from llama_cpp import Llama

llm = Llama.from_pretrained(
    repo_id="DavidAU/gemma-4-E4B-it-The-DECKARD-Expresso-Universe-HERETIC-UNCENSORED-Thinking-GGUF",
    filename="E4B-Gemma4-it-vl-HERE-DECKARD4-Q8_0.gguf",
)
out = llm.create_chat_completion(
    messages=[
        {"role": "user", "content": "Your analysis task here."},
    ],
    max_tokens=2048,
    temperature=0.7,
)
print(out["choices"][0]["message"]["content"])
```

**Local file (recommended):** set `GEMMA_GGUF` to the full path of the `.gguf` so nothing hits the network:

```bash
export GEMMA_GGUF="/path/to/E4B-Gemma4-it-vl-HERE-DECKARD4-Q8_0.gguf"
python scripts/gemma_heretic_chat.py -f my_prompt.txt
```

**Windows install pain:** `pip install llama-cpp-python` often **builds from source** and needs **Visual Studio Build Tools** (C++ workload) + CMake, or use **conda-forge** (`conda install -c conda-forge llama-cpp-python`). If install fails, the script is still the reference; run it from an environment where `llama_cpp` already works.

**Workflow:** use Cursor/Composer for **structure, evidence, links**; use Gemma for **prose pass** or alternate phrasing — then **you** keep table canon. Uncensored weights can drift into invention; treat model output as **draft**, not lore.

## 4. Hivemind / MCP (research)

Your research cited **hiveforge-sh/hivemind** as an MCP “truth anchor” over Obsidian—if you install it, point it at this vault so external LLMs **cite** these dossiers instead of inventing canon.

## 5. CHARML-style batch

Export blocks from each `*.md` dossier (`<character>...</character>`) into a single XML file and run schema validation or XSLT if you go hardcore—optional.

---

**Recommendation:** treat `discord-export/` as source of truth, `characters/` as interpreted layer; re-run `export_discord_lore.py` after long Discord sessions, then refresh analysis.