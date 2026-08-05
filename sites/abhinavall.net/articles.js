/* Portfolio articles — full overviews ported from abhinavall.net project pages */
window.PORTFOLIO_ARTICLES = {
  'project-fraud': {
    title: 'Fraud Detection System — Google Gemini Pathway AI MCP',
    meta: 'Microsoft Hackathon · Oct 2025 · 72% fraud trend accuracy',
    tags: ['Python', 'BERT', 'Gemini', 'MCP', 'Pathway', 'NLP'],
    stats: [
      { label: 'Accuracy', value: '72%' },
      { label: 'Event', value: 'Microsoft Hackathon' },
      { label: 'Stack', value: 'Gemini + MCP' }
    ],
    sections: [
      {
        heading: 'Overview',
        paragraphs: [
          'AI-powered fraud detection analyzing insurance and accident data for legal compliance and trend identification. The system leverages Google Gemini, Inkeep Agents, and Pathway AI MCP to process financial streams and surface anomalies.',
          'Achieved 72% accuracy in predicting future fraud trends using BERT-based NLP models integrated with Pathway\'s streaming analytics pipeline.'
        ]
      },
      {
        heading: 'Problem Statement',
        paragraphs: [
          'Insurance fraud patterns are sparse, high-stakes, and legally sensitive. Manual review is slow and inconsistent — models must balance recall with explainability for compliance reviewers.'
        ]
      },
      {
        heading: 'Solution',
        paragraphs: [
          'Built an MCP-connected agent workflow: Gemini for reasoning, Pathway for live data joins, and BERT embeddings for text-heavy claim fields. Microsearch-MCP tooling enabled rapid retrieval over policy corpora.'
        ],
        list: [
          'Streaming ingestion of accident + insurance records',
          'Trend forecasting with 72% hold-out accuracy on future fraud labels',
          'Human-readable compliance summaries for legal review'
        ]
      },
      {
        heading: 'Technical Implementation',
        subsections: [
          {
            subheading: 'Agent & data pipeline',
            list: [
              'Google Gemini for multi-step reasoning over claim narratives',
              'Pathway AI for streaming joins and live anomaly scoring',
              'MCP tools for retrieval over policy and accident corpora',
              'BERT embeddings for text-heavy insurance fields'
            ]
          },
          {
            subheading: 'Compliance outputs',
            list: [
              'Trend reports formatted for legal review',
              'Explainable flags tied to source records',
              'Demo-ready Microsoft Hackathon submission stack'
            ]
          }
        ]
      },
      {
        heading: 'Results',
        list: [
          'Microsoft Hackathon submission — production-grade demo',
          '72% fraud trend prediction accuracy',
          'Integrated Gemini + Pathway + MCP in one cohesive stack'
        ]
      }
    ],
    links: [
      { label: 'Google Gemini', href: 'https://ai.google.dev/' },
      { label: 'Pathway', href: 'https://github.com/pathwaycom/pathway' },
      { label: 'MCP spec', href: 'https://modelcontextprotocol.io/' },
      { label: 'microsearch-mcp', href: 'https://github.com/kineticdirt/microsearch-mcp' }
    ],
    subProjects: [
      { when: 'Oct 2025', title: 'Streaming fraud pipeline', detail: 'Pathway joins + live anomaly scoring on insurance streams.' },
      { when: 'Oct 2025', title: 'MCP retrieval layer', detail: 'microsearch-mcp over policy corpora for agent tooling.', articleId: 'project-microsearch' },
      { when: 'Oct 2025', title: 'Compliance report generator', detail: 'Human-readable trend summaries for legal review.' }
    ]
  },
  'project-equality': {
    title: 'EQUALITY EYE — Hate Speech Detector',
    meta: '1st Place — Social Impact · RoseHack @ UCR 2024 · 94% accuracy',
    livePage: 'https://abhinavall.net/project-equality-eye.html',
    tags: ['Python', 'DistilBERT', 'PyTorch', 'FastAPI', 'JavaScript', 'Chrome Extension', 'NLP'],
    stats: [
      { label: 'Accuracy', value: '94%' },
      { label: 'Award', value: '1st Place' },
      { label: 'Category', value: 'Social Impact' },
      { label: 'Latency', value: '< 200ms' }
    ],
    sections: [
      {
        heading: 'Overview',
        paragraphs: [
          'EQUALITY EYE is a Chrome extension that uses machine learning to detect and classify misogynistic content on Twitter (X) in real time. Built during RoseHack 2024, the project won first place in the Social Impact category by addressing online harassment and creating a safer digital environment.',
          'The system achieves 94% classification accuracy using a fine-tuned DistilBERT model — a lightweight transformer optimized for faster inference than full BERT.'
        ]
      },
      {
        heading: 'Problem Statement',
        paragraphs: [
          'Social media platforms struggle with real-time hate speech moderation. Manual review is slow, expensive, and inconsistent. Users need an automated, low-latency solution that can flag harmful content without disrupting the browsing experience.'
        ]
      },
      {
        heading: 'Solution',
        paragraphs: [
          'Fine-tuned DistilBERT on curated hate-speech corpora and deployed as a Chrome extension with a FastAPI backend for model inference. The three-tier architecture extracts tweet text in the browser, sends it to the API, and surfaces visual indicators on flagged content.'
        ]
      },
      {
        heading: 'Key Features',
        list: [
          '94% accuracy through careful model selection and fine-tuning',
          'Real-time detection via browser extension with instant feedback',
          'Privacy-focused design with local preference storage where possible',
          'User-friendly interface accessible to non-technical users'
        ]
      },
      {
        heading: 'Technical Implementation',
        subsections: [
          {
            subheading: 'Model architecture',
            list: [
              'Base model: DistilBERT (distilbert-base-uncased) from Hugging Face',
              'Fine-tuning on 10,000+ labeled social media examples',
              'Framework: PyTorch with Hugging Face Transformers',
              'Optimization: quantization for faster inference'
            ]
          },
          {
            subheading: 'Browser extension & backend',
            list: [
              'Frontend: JavaScript/HTML/CSS Chrome extension with DOM tweet extraction',
              'Backend: Python FastAPI API for model inference and caching',
              'Integration: real-time API communication from the extension',
              'Storage: local storage for user preferences'
            ]
          }
        ]
      },
      {
        heading: 'Results',
        list: [
          '94% accuracy on held-out test set',
          'Under 200ms latency per tweet classification',
          '1st Place — Social Impact at RoseHack 2024',
          'Demonstrated potential for real-world deployment at scale'
        ]
      },
      {
        heading: 'Challenges & Solutions',
        subsections: [
          {
            subheading: 'Challenge 1: Model size',
            paragraphs: ['Full BERT was too large for practical extension deployment.'],
            list: ['Used DistilBERT — ~60% smaller while maintaining similar accuracy']
          },
          {
            subheading: 'Challenge 2: Real-time processing',
            paragraphs: ['Initial inference was too slow for live Twitter browsing.'],
            list: ['Model quantization and optimized preprocessing pipeline']
          },
          {
            subheading: 'Challenge 3: Deployment',
            paragraphs: ['Backend hosting, CORS, and large model artifacts required extended debugging.'],
            list: ['Restructured model serialization, CORS configuration, and caching strategies']
          }
        ]
      }
    ],
    links: [
      { label: 'RoseHack 2024 repo', href: 'https://github.com/DMahamedi/RoseHack-2024' },
      { label: 'DistilBERT docs', href: 'https://huggingface.co/docs/transformers/model_doc/distilbert' },
      { label: 'FastAPI', href: 'https://fastapi.tiangolo.com/' }
    ]
  },
  'project-cequence': {
    title: 'AI Chatbot — Cequence UAP Platform',
    meta: '2nd Place — Cequence Hackathon · 2023',
    livePage: 'https://abhinavall.net/project-ai-chatbot.html',
    tags: ['Java', 'C/C++', 'LLM', 'NLP', 'API Integration'],
    stats: [
      { label: 'Award', value: '2nd Place' },
      { label: 'Year', value: '2023' },
      { label: 'Category', value: 'Hackathon' }
    ],
    sections: [
      {
        heading: 'Overview',
        paragraphs: [
          'Intelligent conversational interface integrated into Cequence Security\'s Unified API Protection (UAP) Platform. Secured second place in the Cequence Hackathon by showing how conversational AI improves enterprise security UX.'
        ]
      },
      {
        heading: 'Problem Statement',
        paragraphs: [
          'Enterprise security platforms are complex — users need extensive training to navigate UAP. The goal was intuitive access to threats, bot patterns, and policies without deep architectural knowledge.'
        ]
      },
      {
        heading: 'Solution',
        paragraphs: [
          'Designed an NLP + LLM assistant with intent classification, entity extraction, and multi-turn context. Connected directly to UAP APIs for live answers and task automation.'
        ]
      },
      {
        heading: 'Technical Implementation',
        subsections: [
          {
            subheading: 'Core technologies',
            list: [
              'Java & C/C++ backend services for high-performance processing',
              'LLM integration for natural language understanding',
              'NLP: intent classification, entity extraction, context management',
              'API integration with Cequence UAP Platform endpoints'
            ]
          },
          {
            subheading: 'Key features',
            list: [
              'Natural language query processing for platform navigation',
              'Contextual multi-turn conversations',
              'Intelligent task automation based on user requests',
              'Real-time response generation with low latency',
              'Integration with existing security workflows'
            ]
          }
        ]
      },
      {
        heading: 'Results',
        list: [
          '2nd Place — Cequence Hackathon',
          'Streamlined navigation reducing user onboarding time',
          'Boosted operational efficiency through task automation',
          'Validated AI-assisted security operations in enterprise settings'
        ]
      }
    ],
    links: [
      { label: 'Cequence Security', href: 'https://www.cequence.ai/' },
      { label: 'FastAPI (later stack)', href: 'https://fastapi.tiangolo.com/' }
    ]
  },
  'project-bot': {
    title: 'Time-Delta Bot Detection Model',
    meta: 'Cequence Security · Data Science Intern 2023 · AI Research Intern 2026',
    livePage: 'https://abhinavall.net/project-bot-detection.html',
    tags: ['PyTorch', 'CUDA', 'Python', 'Pandas', 'NumPy', 'Google Cloud'],
    stats: [
      { label: 'Accuracy gain', value: '+77%' },
      { label: 'Status', value: 'Production' },
      { label: 'Company', value: 'Cequence' }
    ],
    sections: [
      {
        heading: 'Overview',
        paragraphs: [
          'Novel Time-Delta model detecting subtle bot patterns in API traffic using PyTorch with CUDA acceleration — deployed on Cequence\'s UAP Platform at production scale, processing millions of requests daily.'
        ]
      },
      {
        heading: 'Problem Statement',
        paragraphs: [
          'Initial bot detection accuracy was only 18%. Sophisticated bots mimic human timing patterns, and the system required real-time inference on millions of daily API requests without adding latency.'
        ]
      },
      {
        heading: 'Solution',
        paragraphs: [
          'Engineered temporal features from inter-request time deltas, optimized with cross-validation and GPU inference. Built automated daily XML reporting integrated with Google Cloud, cutting manual QA effort 50%.'
        ]
      },
      {
        heading: 'Technical Implementation',
        subsections: [
          {
            subheading: 'Core technologies',
            list: [
              'PyTorch with CUDA for GPU-accelerated real-time inference',
              'Pandas & NumPy for preprocessing and feature engineering',
              'Advanced cross-validation and hyperparameter tuning',
              'Time-series analysis on API request sequences'
            ]
          },
          {
            subheading: 'Key innovations',
            list: [
              'Time-delta feature engineering capturing temporal bot patterns',
              '77% relative accuracy lift (18% → 32%)',
              'Automated reporting with Google Cloud integration',
              'Production integration with Cequence UAP Platform'
            ]
          }
        ]
      },
      {
        heading: 'Results',
        list: [
          '77% accuracy improvement from baseline',
          'Real-time GPU-accelerated inference at production scale',
          '50% reduction in manual reporting effort',
          'Deployed protecting Fortune 500 enterprise clients'
        ]
      },
      {
        heading: 'Challenges & Solutions',
        list: [
          'Highly imbalanced datasets — addressed with targeted feature engineering',
          'Accuracy vs. inference speed — CUDA optimization for sub-millisecond scoring',
          'False positives — iterative tuning balancing precision and recall'
        ]
      }
    ],
    links: [
      { label: 'Cequence', href: 'https://www.cequence.ai/' },
      { label: 'PyTorch', href: 'https://pytorch.org/' }
    ]
  },
  'project-rag': {
    title: 'RAG Models & Agentic AI',
    meta: 'Support Vectors · Research · 2024–2025',
    livePage: 'https://abhinavall.net/project-rag-models.html',
    tags: ['Python', 'Langchain', 'LlamaIndex', 'RAG', 'Claude API', 'Vector DB'],
    stats: [
      { label: 'Status', value: 'Research' },
      { label: 'Company', value: 'Support Vectors' },
      { label: 'Focus', value: 'Agentic RAG' }
    ],
    sections: [
      {
        heading: 'Overview',
        paragraphs: [
          'Constructed and refined multiple Retrieval-Augmented Generation (RAG) models using Python, Langchain, and LlamaIndex — improving information retrieval accuracy and contextual understanding for complex enterprise queries.'
        ]
      },
      {
        heading: 'Problem Statement',
        paragraphs: [
          'Enterprise knowledge bases are fragmented across documents, APIs, and databases. Generic LLM responses lack domain grounding; retrieval must be fast, accurate, and tool-augmented for analytical workflows.'
        ]
      },
      {
        heading: 'Solution',
        paragraphs: [
          'Multi-model RAG architecture combining vector embeddings, semantic search, and Staff Agentic Reasoning models. Tool-augmented Claude agents connect to external APIs, databases, and compute for autonomous decision support.'
        ]
      },
      {
        heading: 'Technical Implementation',
        subsections: [
          {
            subheading: 'RAG architecture',
            list: [
              'Langchain for LLM application chaining and orchestration',
              'LlamaIndex for indexing, retrieval, and query engines',
              'Vector databases for semantic search and similarity matching',
              'Optimized embedding models and similarity metrics'
            ]
          },
          {
            subheading: 'Agentic AI',
            list: [
              'Staff Agentic Reasoning models with Anthropic Claude API',
              'Tool-augmented agents for API, database, and compute access',
              'Low-latency embedding pipelines for production queries',
              'Research across CNNs, RNNs, Transformers, and generative models'
            ]
          }
        ]
      },
      {
        heading: 'Results',
        list: [
          'Significant improvements in retrieval accuracy and contextual understanding',
          'Autonomous agents with external tool integration',
          'Production-ready RAG patterns for enterprise knowledge systems'
        ]
      }
    ],
    links: [
      { label: 'LangChain', href: 'https://www.langchain.com/' },
      { label: 'LlamaIndex', href: 'https://www.llamaindex.ai/' }
    ]
  },
  'project-mobile': {
    title: 'Enterprise Mobile Apps — Private 5G',
    meta: 'Celona · Production · −24% setup · +23% productivity',
    livePage: 'https://abhinavall.net/project-mobile-dev.html',
    tags: ['Kotlin', 'Swift', 'Firebase', '5G', 'Geofencing', 'Android', 'iOS'],
    stats: [
      { label: 'Setup time', value: '−24%' },
      { label: 'Productivity', value: '+23%' },
      { label: 'Status', value: 'Production' }
    ],
    sections: [
      {
        heading: 'Overview',
        paragraphs: [
          'Cross-platform Kotlin and Swift applications for Celona\'s private 5G network — geofencing, SIM management, real-time monitoring, and AP configuration for Fortune 500 industrial deployments.'
        ]
      },
      {
        heading: 'Problem Statement',
        paragraphs: [
          'Field technicians needed faster AP provisioning and reliable offline-capable tools for private 5G rollouts in manufacturing environments. Manual setup was error-prone and slowed enterprise adoption.'
        ]
      },
      {
        heading: 'Solution',
        paragraphs: [
          'Native Android and iOS apps with Firebase Realtime Database sync, precision geofencing, custom SIM provisioning UI, and QR/barcode automation for access point installation.'
        ]
      },
      {
        heading: 'Key Features',
        list: [
          'Firebase Realtime Database + Cloud Functions for device sync',
          'Precision geofencing in industrial environments',
          'Custom SIM provisioning interfaces',
          'ZXing QR/barcode scanning for AP provisioning (installation app)',
          'OAuth2 REST integration for enterprise auth'
        ]
      },
      {
        heading: 'Results',
        list: [
          '24% faster access point setup time',
          '23% field productivity improvement',
          'Production deployment across Fortune 500 industrial clients',
          'Open-source geofence reference implementation on GitHub'
        ]
      }
    ],
    links: [
      { label: 'Celona', href: 'https://www.celona.io/' },
      { label: 'Geofence repo', href: 'https://github.com/kineticdirt/Firebase_Celona_Geoguard_Geofence' },
      { label: 'Firebase', href: 'https://firebase.google.com/' }
    ]
  },
  'project-hl7': {
    title: 'HL7 Clinical Data Pipeline',
    meta: 'Healthy Vibes · 15 min → 2 sec · Production',
    livePage: 'https://abhinavall.net/project-hl7-pipeline.html',
    tags: ['HL7', 'Python', 'Claude', 'PDF', 'FastAPI', 'Healthcare'],
    stats: [
      { label: 'Speedup', value: '450×' },
      { label: 'Report time', value: '2 sec' },
      { label: 'Parse accuracy', value: '100%' }
    ],
    sections: [
      {
        heading: 'Overview',
        paragraphs: [
          'Enterprise HL7 scraper transforming legacy clinical messages into structured JSON, plus AIJsonToPDF — Claude-powered clinical reports generated in under 2 seconds (down from 15 minutes per report).'
        ]
      },
      {
        heading: 'Problem Statement',
        paragraphs: [
          'Clinical workflows relied on manual HL7 parsing and PDF generation — slow, error-prone, and blocking care coordination. Legacy message formats varied widely across providers.'
        ]
      },
      {
        heading: 'Solution',
        paragraphs: [
          'High-performance HL7 parser with validated segment handling, JSON intermediate representation, and Claude-driven PDF generation. Agentic prototype for auto-generating and testing pipeline code.'
        ]
      },
      {
        heading: 'Technical Implementation',
        list: [
          'HL7 v2 message parsing with 100% accuracy on validated sets',
          'AIJsonToPDF: structured JSON → clinical PDF via Claude',
          'FastAPI services for report generation endpoints',
          'Headless Android sync app for Zoll medical devices',
          'Agentic code-gen prototype with Claude 3.5 Haiku'
        ]
      },
      {
        heading: 'Results',
        list: [
          '15 minutes → 2 seconds per clinical report (450× faster)',
          '100% HL7 parse accuracy on validated message sets',
          'Production deployment at Healthy Vibes',
          'Reduced manual clinical documentation burden'
        ]
      }
    ],
    links: [
      { label: 'HL7_AutoParse', href: 'https://github.com/kineticdirt/HL7_AutoParse' },
      { label: 'HL7 standard', href: 'https://www.hl7.org/' }
    ]
  },
  'project-memconstant': {
    title: 'mem-constant — Autonomous Memory CLI',
    meta: 'PyPI v0.3.0 · OSS · 34 workflow skills',
    tags: ['Python', 'CLI', 'MCP', 'Cursor', 'MemPalace', 'PyPI'],
    stats: [
      { label: 'Version', value: 'v0.3.0' },
      { label: 'Skills', value: '34' },
      { label: 'Install', value: 'pip' }
    ],
    sections: [
      {
        heading: 'Overview',
        paragraphs: [
          'Distributable memory scaffold for AI coding agents. Install with pip, run init/doctor/specs, optionally pull 34 AI-coding workflow skills aligned with mem-constant and Cursor rule templates.'
        ]
      },
      {
        heading: 'Problem Statement',
        paragraphs: [
          'Agent memory setups are ad hoc — rules scattered across repos, no standard init path, and no doctor checks for MCP integrations. Teams need a pip-installable scaffold, not git-clone-only docs.'
        ]
      },
      {
        heading: 'Solution',
        paragraphs: [
          'mem-constant packages bundled specs, CLI commands, optional Cursor hooks/rules, and workflow skills under ~/.mem-constant/. Dogfooded across PC, laptop, and linuxbox agent lanes.'
        ],
        list: [
          'pip install mem-constant → init / doctor / specs / carryover',
          'Bundled docs/memory specs vendored into the package',
          'Graphify L1/L5 integration probes in doctor',
          '--with-workflow-skills ships 34 AI-coding templates'
        ]
      },
      {
        heading: 'Results',
        list: [
          'Published on PyPI and GitHub (kineticdirt/mem-constant)',
          'Used as the workflow-skills source for this workspace',
          'Multi-machine memory authority: MemPalace + session cache'
        ]
      }
    ],
    links: [
      { label: 'GitHub', href: 'https://github.com/kineticdirt/mem-constant' },
      { label: 'PyPI', href: 'https://pypi.org/project/mem-constant/' }
    ],
    subProjects: [
      { when: 'Apr 2026', title: 'Workflow skills bundle', detail: '34 AI-coding skills via --with-workflow-skills for Cursor agents.' },
      { when: 'Mar 2026', title: 'microsearch-mcp', detail: 'MCP retrieval server wired into doctor probes.', articleId: 'project-microsearch', href: 'https://github.com/kineticdirt/microsearch-mcp' },
      { when: 'Feb 2026', title: 'Session carryover', detail: 'last-session.md + carryover CLI for cross-chat continuity.' },
      { when: 'Jan 2026', title: 'Graphify integration', detail: 'L1 structural graph + L5 curatorial layer probes in doctor.' }
    ]
  },
  'project-foundry': {
    title: 'Foundry VTT QoL Extension',
    meta: 'Personal · In Progress',
    tags: ['JavaScript', 'WebRTC', 'Foundry VTT', 'Browser Ext'],
    stats: [
      { label: 'Status', value: 'In progress' },
      { label: 'Platform', value: 'Foundry VTT' },
      { label: 'Focus', value: 'Session QoL' }
    ],
    sections: [
      {
        heading: 'Overview',
        paragraphs: [
          'Foundry Virtual Tabletop module adding proximity-based voice chat, combat HUD automation, and streamlined player management for tabletop RPG sessions.'
        ]
      },
      {
        heading: 'Problem Statement',
        paragraphs: [
          'Online TTRPG groups juggle multiple tools for voice, combat tracking, and map interaction. Foundry modules exist but lack integrated proximity voice and combat automation in one package.'
        ]
      },
      {
        heading: 'Solution',
        paragraphs: [
          'JavaScript module with WebRTC proximity voice, combat tracker overlays, and GM session automation hooks — spatial audio tied to token position on the map.'
        ]
      },
      {
        heading: 'Features in flight',
        list: [
          'Spatial / proximity voice via WebRTC',
          'Combat tracker HUD overlays',
          'Session automation hooks for GMs',
          'foundry-extras repo for shared utilities'
        ]
      }
    ],
    links: [
      { label: 'Foundry VTT', href: 'https://foundryvtt.com/' },
      { label: 'foundry-extras', href: 'https://github.com/kineticdirt/foundry-extras' }
    ]
  },
  'project-omnia': {
    title: 'OmniaDev — AI Email Intelligence Platform',
    meta: 'Founding Engineer · Oct — Dec 2025 · OmniaDevWorkspace',
    tags: ['Python', 'RAG', 'MCP', 'Fastify', 'LLMs', 'CI/CD', 'Claude'],
    stats: [
      { label: 'Role', value: 'Founding Engineer' },
      { label: 'Tenure', value: 'Oct–Dec 2025' },
      { label: 'Stack', value: 'RAG + MCP' }
    ],
    sections: [
      {
        heading: 'Overview',
        paragraphs: [
          'Go-to-market email intelligence product at OmniaDevWorkspace — LLM-powered categorization with custom RAG for visibility into inbound text, MCP hooks so agents can operate the platform, and a Fastify backend built for throughput.'
        ]
      },
      {
        heading: 'Problem Statement',
        paragraphs: [
          'High-volume inbound email lacks categorical structure for ops teams. Manual triage is slow; agents need API-first access with retrieval over historical threads and policies.'
        ]
      },
      {
        heading: 'Solution',
        list: [
          'Custom RAG pipeline for categorical email analysis',
          'MCP integration for external AI agent tooling',
          'Fastify backend migration for scalable request handling',
          'Ground-up CI/CD for build, test, and deploy velocity'
        ]
      },
      {
        heading: 'Results',
        list: [
          'Agent-ready APIs with MCP protocol surface',
          'Production CI/CD from zero to go-to-market cadence',
          'Windows API hooks where platform-specific behavior is required'
        ]
      }
    ],
    links: [
      { label: 'MCP spec', href: 'https://modelcontextprotocol.io/' },
      { label: 'Fastify', href: 'https://fastify.dev/' }
    ],
    subProjects: [
      { when: 'Oct 2025', title: 'Email RAG categorizer', detail: 'LLM + retrieval for inbound text classification.' },
      { when: 'Nov 2025', title: 'MCP agent surface', detail: 'Protocol hooks for external agent integrations.' },
      { when: 'Dec 2025', title: 'Fastify backend', detail: 'Migration from prior stack for higher throughput.' },
      { when: 'Jan 2026', title: 'CI/CD pipeline', detail: 'Automated build, test, deploy for GTM releases.' }
    ]
  },
  'project-hermes': {
    title: 'Linuxbox Agent Stack — Hermes + Situation Monitor',
    meta: 'Homelab · 2025–2026 · Tailscale · ARM Pi',
    tags: ['Hermes', 'OpenRouter', 'Docker', 'Tailscale', 'Python', 'Cron'],
    stats: [
      { label: 'Host', value: 'ARM linuxbox' },
      { label: 'Gateway', value: 'Hermes v0.14' },
      { label: 'Reach', value: 'Tailscale' }
    ],
    sections: [
      {
        heading: 'Overview',
        paragraphs: [
          'Always-on agent infrastructure on a low-power ARM homelab — Hermes gateway with OpenRouter, Firecrawl-backed browsing, agent-cycle crons, situation RSS monitor, and portfolio review lanes over Tailscale.'
        ]
      },
      {
        heading: 'Problem Statement',
        paragraphs: [
          'Desktop agents sleep when the laptop closes. Background monitoring, site review, and lightweight agent cycles need a 24×7 node with private tailnet access — not a public reverse proxy.'
        ]
      },
      {
        heading: 'Solution',
        list: [
          'Hermes gateway as systemd user service with linger',
          'agent-cycle every 1m with lean toolsets on ~2 GB RAM',
          'situation-rss + situation-hermes daily monitor crons',
          'site-abhinavall-ping / review for portfolio health',
          'Pi-hole, Gitea, Uptime Kuma on host ports 13000/13001'
        ]
      },
      {
        heading: 'Results',
        list: [
          'Private homelab reachable only via Tailscale/LAN',
          'Exit-node egress on linuxbox when enabled per device',
          'PC WSL Hermes + continuity_run.sh for local parity'
        ]
      }
    ],
    links: [
      { label: 'Tailscale', href: 'https://tailscale.com/' },
      { label: 'GitHub @kineticdirt', href: 'https://github.com/kineticdirt' }
    ],
    subProjects: [
      { when: '2025', title: 'Hermes gateway', detail: 'user systemd + linger on ARM box.' },
      { when: '2025', title: 'agent-cycle cron', detail: '1-minute lean agent loop.' },
      { when: '2026', title: 'Situation monitor', detail: 'RSS + Hermes daily digest lane.' },
      { when: '2026', title: 'Portfolio preview', detail: 'USB bundle served on :8765 over tailnet.' }
    ]
  },
  'project-microsearch': {
    title: 'microsearch-mcp — Lightweight MCP Retrieval',
    meta: 'OSS · MCP · Python · 2025–2026',
    tags: ['Python', 'MCP', 'Search', 'Agents', 'FastAPI'],
    stats: [
      { label: 'Protocol', value: 'MCP' },
      { label: 'Use', value: 'Agent RAG' },
      { label: 'Repo', value: 'GitHub' }
    ],
    sections: [
      {
        heading: 'Overview',
        paragraphs: [
          'Compact MCP server for semantic search and retrieval — used in fraud-detection hackathon stacks, mem-constant doctor probes, and agent workflows that need fast corpus lookup without heavy infra.'
        ]
      },
      {
        heading: 'Problem Statement',
        paragraphs: [
          'Agents need retrieval tools that install quickly, speak MCP natively, and run on modest hardware — not every project warrants a full vector DB deployment.'
        ]
      },
      {
        heading: 'Solution',
        list: [
          'MCP-compliant search/retrieval surface',
          'Integrates with Gemini + Pathway fraud pipeline',
          'Referenced in mem-constant doctor and portfolio agent stacks'
        ]
      },
      {
        heading: 'Results',
        list: [
          'Shipped as kineticdirt/microsearch-mcp on GitHub',
          'Cross-project sub-component in fraud + memory tooling'
        ]
      }
    ],
    links: [
      { label: 'GitHub', href: 'https://github.com/kineticdirt/microsearch-mcp' },
      { label: 'MCP spec', href: 'https://modelcontextprotocol.io/' }
    ]
  }
};

/* Chronological index — newest first; powers unified #experience timeline */
window.PORTFOLIO_PROJECT_TIMELINE = [
  { sort: 202601, when: '2026', id: null, label: 'Fidelity — Cloud Architecture Associate', tag: 'Current' },
  { sort: 202601, when: 'Jan 2026', id: 'project-bot', label: 'Cequence AI Research Intern', tag: 'Security' },
  { sort: 202604, when: 'Apr 2026', id: 'project-memconstant', label: 'mem-constant 0.3.0', tag: 'OSS' },
  { sort: 202603, when: 'Mar 2026', id: 'project-microsearch', label: 'microsearch-mcp', tag: 'OSS' },
  { sort: 202602, when: 'Feb 2026', id: 'project-hermes', label: 'Situation monitor lane', tag: 'Homelab' },
  { sort: 202510, when: 'Oct 2025', id: 'project-fraud', label: 'Fraud Detection MCP', tag: 'Hackathon' },
  { sort: 202510, when: 'Oct 2025', id: 'project-omnia', label: 'OmniaDev email RAG', tag: 'Production' },
  { sort: 202502, when: 'Feb 2025', id: 'project-mobile', label: 'Celona 5G mobile', tag: 'Production' },
  { sort: 202411, when: 'Nov 2024', id: 'project-hl7', label: 'HL7 clinical pipeline', tag: 'Production' },
  { sort: 202407, when: 'Jul 2024', id: 'project-rag', label: 'RAG + agentic AI', tag: 'Research' },
  { sort: 202404, when: 'Apr 2024', id: 'project-equality', label: 'EQUALITY EYE', tag: '1st Place' },
  { sort: 202306, when: 'Jun 2023', id: 'project-bot', label: 'Time-Delta bot ML', tag: 'Production' },
  { sort: 202306, when: 'Jun 2023', id: 'project-cequence', label: 'Cequence UAP chatbot', tag: 'Hackathon' },
  { sort: 202202, when: '2022', id: 'project-mobile', label: 'Celona AP install app', tag: 'Internship' },
  { sort: 202000, when: 'In progress', id: 'project-foundry', label: 'Foundry VTT QoL', tag: 'Personal' }
];
