# The 5 Levels of AI Agents (DeepWing)

Infographic summary for project reference. **Source:** DeepWing — “The 5 Levels of AI Agents.”

**Saved asset (local copy):** `assets/c__Users_abhinav_AppData_Roaming_Cursor_User_workspaceStorage_a04b0cfc902246cfe3439a19522f4141_images_image-04b0a857-805f-414a-8625-fec17c970365.png`

---

## Level 01 — Agent with tools

- **Tagline:** Code · Run · Repeat  
- **Flow:** User → **Input** → **AI Agent** (planning and reasoning) → **Tools** → **Output** → **Agent response** to user.  
- **Idea:** Single agent loop with explicit tool use; minimal persistence beyond the turn.

---

## Level 02 — Agent with storage and knowledge

- **Tagline:** Session history · Domain knowledge  
- **Flow:** Same as Level 01, plus connections to **memory** and a **knowledge / LLM** stack (session state + domain corpora).  
- **Idea:** Retrieval-informed answers, not only in-context reasoning.

---

## Level 03 — Agent with memory and learning

- **Tagline:** Learns · Adapts over time  
- **Flow:** Agent still uses **memory** and **tools**, but behavior or performance **updates** from interaction (not just static logs).  
- **Idea:** Feedback loops, preference or policy drift, evals — “gets better” across sessions when designed safely.

---

## Level 04 — Multi-agent team

- **Tagline:** Collaborative agents  
- **Flow:** Central **orchestrator** agent (memory + tools) delegates to specialists, e.g. **search**, **coding**, **data analysis**, **marketing**; combined **agent response**.  
- **Idea:** Division of labor, parallel workstreams, clearer ownership per sub-task.

---

## Level 05 — Production system

- **Tagline:** Scalable · Reliable API  
- **Flow:** Many **users** → **input** → **control AI orchestrator** inside **agent layers**, wired to **knowledge base / long-term memory**, **tools**, **APIs**, **data sources** → **processing nodes** (specialized agents) backed by **model hubs** (task executors, LLMs, vision) → **curated answers** to users.  
- **Idea:** Enterprise shape: routing, SLAs, observability, multi-tenant boundaries, and governed tool/API access.

---

## Quick mapping (informal)

| Level | Emphasis |
|------|-----------|
| 01 | Tools only |
| 02 | + RAG / session KB |
| 03 | + Learning / adaptation |
| 04 | + Multi-agent orchestration |
| 05 | + Product-grade scale and APIs |

---

*If you meant a different action (merge into `RESEARCH.md`, tie levels to MemPalace/claude-mem, or align with `claude-code-plan-kill-1.md`), say which file or section to update.*
