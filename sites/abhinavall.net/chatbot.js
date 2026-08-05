/* Portfolio assistant — client-side Q&A + article deep-links (no API key required) */
(function () {
  'use strict';

  const FAQ = [
    {
      keys: ['contact', 'email', 'hire', 'reach', 'linkedin'],
      reply: 'Inbox abhinav.allam@abhinavall.net (Mail page) · LinkedIn linkedin.com/in/abhinav-allam · GitHub @kineticdirt. Resume QR in the dock.',
      action: { label: 'Open contact', href: '#contact' }
    },
    {
      keys: ['resume', 'cv', 'pdf', 'qr'],
      reply: 'Resume downloads live at kineticdirt.github.io/LinuxBoxPortfolio — use the Resume QR button in Connect or the floating QR dock.',
      action: { label: 'Show QR', trigger: 'qr' }
    },
    {
      keys: ['hackathon', 'award', 'microsoft', 'equality', 'cequence chat'],
      reply: 'Three hackathon awards: Fraud Detection (Microsoft 2025, 72% accuracy), EQUALITY EYE (1st Social Impact, 94%), Cequence UAP Chatbot (2nd place). Ask about any project by name.',
      article: 'project-cequence'
    },
    {
      keys: ['mem-constant', 'mem constant', 'memory', 'pypi', 'mcp'],
      reply: 'mem-constant is a pip-installable CLI for agent memory — init, doctor, specs, optional 34 workflow skills. v0.3.0 on PyPI.',
      article: 'project-memconstant'
    },
    {
      keys: ['celona', '5g', 'mobile', 'kotlin', 'firebase', 'qr code'],
      reply: 'At Celona I shipped enterprise 5G mobile apps (−24% setup, +23% productivity) including ZXing QR automation for AP provisioning.',
      article: 'project-mobile'
    },
    {
      keys: ['hl7', 'health', 'clinical', '450'],
      reply: 'Healthy Vibes HL7 pipeline: 15 min → 2 sec reports (450×), Claude PDF generation, agentic code-gen prototype.',
      article: 'project-hl7'
    },
    {
      keys: ['bot', 'cequence', 'pytorch', 'cuda', 'uap'],
      reply: 'Cequence: AI Research Intern (2026, MCP agents) and Data Science Intern (2023) — Time-Delta bot detection 18%→32% (+77%) with PyTorch + CUDA on UAP.',
      article: 'project-bot'
    },
    {
      keys: ['rag', 'langchain', 'llama', 'agentic'],
      reply: 'Support Vectors research: RAG + Staff Agentic Reasoning with Langchain, LlamaIndex, and Claude tool use.',
      article: 'project-rag'
    },
    {
      keys: ['fraud', 'gemini', 'pathway'],
      reply: 'Microsoft Hackathon fraud system: Gemini + Pathway MCP, 72% fraud trend accuracy.',
      article: 'project-fraud'
    },
    {
      keys: ['fidelity', 'cloud architecture', 'cloud associate'],
      reply: 'Currently Cloud Architecture Associate (Engineer) at Fidelity — enterprise cloud platform and AWS-focused architecture work.',
      action: { label: 'View timeline', href: '#experience' }
    },
    {
      keys: ['cequence ai', 'cequence intern', 'mcp dashboard', 'agentic'],
      reply: 'AI Research Intern at Cequence Security (2026): MCP agentic workflows, MCP UI dashboard for tool-calling, security-focused autonomous agents. Also Data Science Intern in 2023 (bot detection +77%).',
      article: 'project-bot'
    },
    {
      keys: ['experience', 'job', 'work', 'omnia', 'founding'],
      reply: 'Current: Fidelity (Cloud Architecture Associate). Recent: Cequence AI Research Intern, OmniaDevWorkspace Founding Engineer (Oct–Dec 2025). Scroll the unified timeline for all roles.',
      action: { label: 'View jobs', href: '#experience' }
    },
    {
      keys: ['chatbot', 'chat bot', 'assistant', 'cequence uap'],
      reply: 'The Cequence UAP chatbot was 2nd place at their hackathon — NLP + LLM assistant for API security navigation. Open the full article for architecture and results.',
      article: 'project-cequence'
    }
  ];

  const panel = document.getElementById('chat-panel');
  const toggle = document.getElementById('chat-toggle');
  const closeBtn = document.getElementById('chat-close');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const log = document.getElementById('chat-log');

  if (!panel || !toggle) return;

  function appendMessage(text, role, action) {
    const el = document.createElement('div');
    el.className = 'chat-msg chat-msg--' + role;
    el.textContent = text;
    log.appendChild(el);
    if (action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chat-action-btn';
      btn.textContent = action.label + ' →';
      if (action.href) {
        btn.addEventListener('click', () => {
          if (action.href.startsWith('#')) {
            document.querySelector(action.href)?.scrollIntoView({ behavior: 'smooth' });
          } else {
            window.open(action.href, '_blank', 'noopener');
          }
        });
      } else if (action.trigger === 'qr') {
        btn.addEventListener('click', () => document.getElementById('dock-qr')?.click());
      } else if (action.article && window.openArticle) {
        btn.addEventListener('click', () => window.openArticle(action.article));
      }
      log.appendChild(btn);
    }
    log.scrollTop = log.scrollHeight;
  }

  function findReply(text) {
    const q = text.toLowerCase();
    for (const item of FAQ) {
      if (item.keys.some((k) => q.includes(k))) return item;
    }
    for (const [id, art] of Object.entries(window.PORTFOLIO_ARTICLES || {})) {
      if (q.includes(art.title.toLowerCase().slice(0, 12))) {
        return { reply: art.meta + ' — open the full article for details.', article: id };
      }
    }
    return {
      reply: 'Try: "hackathons", "mem-constant", "HL7 pipeline", "contact", or click Read article on any project card.',
      action: { label: 'Browse projects', href: '#projects' }
    };
  }

  function openChat() {
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    input.focus();
  }

  function closeChat() {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', () => {
    if (panel.hidden) openChat();
    else closeChat();
  });

  closeBtn?.addEventListener('click', closeChat);

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    appendMessage(text, 'user');
    input.value = '';
    const match = findReply(text);
    setTimeout(() => {
      appendMessage(match.reply, 'bot', match.action || (match.article ? { label: 'Read article', article: match.article } : null));
      if (match.article && window.openArticle && /^(tell|about|read|show|open)/i.test(text)) {
        setTimeout(() => window.openArticle(match.article), 400);
      }
    }, 280);
  });

  document.querySelectorAll('[data-chat-prompt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openChat();
      input.value = btn.dataset.chatPrompt;
      form.requestSubmit();
    });
  });

  if (log && log.childElementCount === 0) {
    appendMessage('Hi — ask about projects, jobs, mem-constant, or contact info.', 'bot');
  }
})();
