# Information architecture map

## Admin rail (11 tabs)

| Rail | `data-tab` | Title | Group (proposed) |
|------|------------|-------|------------------|
| Hub | hub | Hub | Primary |
| Systems | systems | Systems | Ops |
| Inbox | inbox | Inbox | Ops |
| Docs | reports | Reports | Intel |
| News | news | News | Intel |
| Camp | campaigns | Campaigns | Campaign |
| Stories | stories | Stories | Campaign |
| Chat | chat | Chat | Campaign |
| Tasks | tasks | Tasks | Campaign |
| Build | garage | Mazda3 build | Personal |
| Meta | backlog | Meta | Ops |

## Viewer / Intel (2 tabs)

Docs + News only (`body.role-viewer .admin-only { display: none }`).

## News sub-modes

Briefs (split list+reader) · Markets (TV + quotes) · Social (RSS) · Trackers (all links — redundant).

## Mobile (≤720px)

Bottom horizontal rail; lane chips hidden; 11 admin tabs scroll horizontally.

See `docs/dashboard-ui-architecture.md` for server routes and auth.
