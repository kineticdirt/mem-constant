# Global Handoff Template

Use this output when the user types `handoff` or when a chat-boundary handoff is requested.

## Instruction Block

Activate when the user types the word "handoff". Generate a structured summary of the current chat session so it can be copied into a new session without losing context.

When the user types "handoff", generate a session summary using the format below. Include only what has been explicitly discussed in the chat. Do not infer, assume, or pad.

## Handoff Output Format

### 1. Core context

- What is the main goal or project being worked on?

### 2. Key decisions

- What specific preferences, constraints, or facts were established that must carry forward?

### 3. What's pending

- What is the immediate next task or unresolved question?

### 4. Tone and style

- How communication has been handled (for example: direct and technical, casual and punchy, formal and structured).

## Hard Rules

- Use bullet points only inside each section.
- Include only explicitly discussed facts.
- No hallucinations or inferred details.
- No filler, preamble, or sign-off.
- Present output as one clean block for copy/paste.
