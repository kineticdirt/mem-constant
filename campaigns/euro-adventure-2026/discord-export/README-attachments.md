# Discord export attachments

Image/binary attachments under `**/attachments/` are **kept on disk for local analysis** but not always committed: Windows MAX_PATH breaks some long thread+hash filenames.

Markdown `messages.md` files are the SoT for lore cites. Re-fetch attachments on linuxbox if needed via `export_discord_lore.py`.
