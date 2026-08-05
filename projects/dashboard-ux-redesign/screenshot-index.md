# Screenshot index — baseline capture

**Folder:** `projects/dashboard-ux-redesign/screenshots/`  
**Naming:** `{viewport}-{role}-{tab}[-{substate}].png`

## Status key

- ✅ captured this session
- ⏳ needs admin CF Access + Basic auth
- — optional

| File | URL | Viewport | Status | Notes |
|------|-----|----------|--------|-------|
| `desktop-public-intel-news-briefs.png` | `https://abhinavall.net/Intel/` | 1280×900 | ✅ | News default, brief open |
| `desktop-public-intel-news-markets.png` | same + Markets | 1280×900 | ✅ | |
| `desktop-admin-hub.png` | `https://abhinavall.net/Linuxbox/` | 1280×900 | ⏳ | CF Access login |
| `desktop-admin-inbox-answered.png` | `/Linuxbox/` Inbox | 1280×900 | ⏳ | Shows your 5 answers |
| `desktop-admin-news-briefs.png` | `/Linuxbox/` News | 1280×900 | ⏳ | |
| `desktop-admin-tasks.png` | `/Linuxbox/` Tasks | 1280×900 | ⏳ | |
| `desktop-admin-systems.png` | `/Linuxbox/` Systems | 1280×900 | ⏳ | |
| `mobile-public-intel-news.png` | `/Intel/` | 390×844 | ⏳ | resize browser |
| `mobile-admin-rail-scroll.png` | `/Linuxbox/` | 390×844 | ⏳ | 11-tab overflow |

## Capture (admin, when logged in)

```bash
# Tunnel loopback from PC
ssh -N -L 8790:127.0.0.1:8790 abhinav@100.122.108.94

DASHBOARD_URL=http://127.0.0.1:8790/ \
DASHBOARD_ADMIN_PASS=… \
  node .staging/portfolio-redesign/_screenshots/dashboard-ui-smoke.mjs --screenshots-only
```

Future: `projects/dashboard-ux-redesign/scripts/capture-baseline.mjs` (Phase 0 stretch).
