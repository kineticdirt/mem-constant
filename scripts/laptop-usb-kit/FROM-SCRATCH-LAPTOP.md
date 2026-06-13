# Laptop: tailnet + remote in (from scratch)

**Desktop prepared this USB.** Plug into the **laptop** and follow every step.

Replace `E:` below with your USB drive letter from File Explorer.

| | |
|--|--|
| Tailscale account | abhinavall0123@gmail.com |
| linuxbox | 100.122.108.94 (`ssh potato`) |
| desktop | 100.118.226.87 (Moonlight) |

> **DO THIS ONCE, FROM ANY BROWSER (before you leave):** disable Tailscale **key expiry** so the
> desktop never silently drops off the tailnet mid-trip. Go to
> <https://login.tailscale.com/admin/machines> → `desktop-igqesd4` → ⋯ → **Disable key expiry**.
> Repeat for `raspbian-bullseye-aml-s905x-cc` (linuxbox). Without this you can get locked out.

---

## Step 1 — Install Tailscale

```powershell
winget install -e --id Tailscale.Tailscale --accept-source-agreements --accept-package-agreements
```

Open Tailscale → Log in → **Connected**.

```powershell
& "$env:ProgramFiles\Tailscale\tailscale.exe" status
```

linuxbox must be **online**. If offline, the Pi at home is down.

- [ ] Tailscale Connected  
- [ ] linuxbox online  

---

## Step 2 — SSH key

```powershell
mkdir $env:USERPROFILE\.ssh -Force
copy E:\secrets\id_rsa_potato $env:USERPROFILE\.ssh\
```

Git Bash (`winget install Git.Git` if needed):

```bash
chmod 600 ~/.ssh/id_rsa_potato
```

- [ ] Key at `%USERPROFILE%\.ssh\id_rsa_potato`

---

## Step 3 — SSH config

1. Open `C:\Users\abhinav\.ssh\config` in Notepad (create if missing).
2. Paste all of `E:\scripts\ssh-config-snippet.txt`.
3. Save.

- [ ] SSH config saved

---

## Step 4 — Test connection

```bash
ssh potato "hostname"
```

Expected: `raspbian-bullseye-aml-s905x-cc`

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File E:\scripts\Verify-Tailnet.ps1
```

- [ ] SSH works  
- [ ] Verify script OK  

---

## Step 5 — Remote in

### A) Terminal on linuxbox

```bash
ssh potato
```

### B) Full desktop screen (Moonlight)

Install once:

```powershell
winget install -e --id MoonlightGameStreamingProject.Moonlight --accept-source-agreements --accept-package-agreements
```

**Pair once (REQUIRED — do at home, desktop must be awake & on tailnet):**

1. On the laptop, open **Moonlight** → **Add PC manually** → enter `100.118.226.87`.
2. Moonlight shows a 4-digit **PIN**.
3. On the **desktop**, open Apollo web UI `https://127.0.0.1:47990` (user `apollo`) → **PIN** tab → type the PIN → Send.
4. Moonlight now lists the desktop. Click it → **Desktop** to stream the full screen.

> Pairing is a one-time trust handshake; afterward it works from **any** network over Tailscale.
> If Moonlight still shows the **old** IP `100.96.132.49`, delete that host first, then add the new one.
>
> Apollo login is `apollo` / your password. The password is **not stored in plaintext** — if you
> don't know it, reset it on the desktop. Full details (incl. remote web-UI URL
> `https://desktop-igqesd4:47990`): see **`APOLLO-LOGIN.txt`** on this USB.

**From anywhere (wakes desktop from sleep):**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File E:\scripts\Run-From-Laptop.ps1
```

### C) Cursor + code

```powershell
winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements
mkdir C:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES -Force
cd C:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES
git clone https://github.com/kineticdirt/mem-constant.git agent-dump
```

Cursor → Open Folder → `agent-dump`. Each session: `git pull`.

### D) Browser only

| URL | Needs tailnet? |
|-----|----------------|
| https://abhinavall.net/Linuxbox/ | No |
| http://100.122.108.94:8765/ | Yes |

---

## Step 6 — Hotspot test (before travel)

1. Disconnect from home Wi‑Fi.  
2. Connect laptop to **phone hotspot** only.  
3. Tailscale → Connected.  
4. Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File E:\scripts\Test-RemoteTailnet.ps1 -SkipMoonlight
```

All **[PASS]**. Optional: desktop at home in **Sleep** → run `Run-From-Laptop.ps1` → confirm wake.

- [ ] Hotspot test passed  

---

## Every day when traveling

1. Tailscale → Connected  
2. `ssh potato` **or** `Run-From-Laptop.ps1` **or** Cursor  

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| linuxbox offline | Pi unplugged / home internet down |
| SSH timeout | Tailscale not Connected |
| SSH permission denied | Redo Step 2 |
| Moonlight fails | Run `Run-From-Laptop.ps1` first |
| Wake fails | Desktop must be **Sleep**, not Shutdown |
| **Scripts disabled** / UnauthorizedAccess | Use `.cmd` launchers in `scripts\` or add `-ExecutionPolicy Bypass` — see **`POWERSHELL-SCRIPTS.txt`** |

---

## PowerShell scripts blocked?

Windows default policy blocks `.ps1` files. **Do not** change system policy.

- **Easiest:** double-click `scripts\Verify-Tailnet.cmd` (and other `.cmd` files)
- **Or:** `powershell.exe -NoProfile -ExecutionPolicy Bypass -File E:\scripts\....ps1`

Full detail: **`POWERSHELL-SCRIPTS.txt`** on this USB.

---

## On this USB

| Path | Purpose |
|------|---------|
| `README FIRST.txt` | Start here |
| `POWERSHELL-SCRIPTS.txt` | Fix "scripts disabled" errors |
| `scripts\*.cmd` | Double-click script launchers |
| `scripts\` | PowerShell helpers |
| `secrets\` | SSH key for laptop |
