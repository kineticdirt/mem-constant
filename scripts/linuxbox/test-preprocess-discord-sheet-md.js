#!/usr/bin/env node
/**
 * Self-check: Discord sheet fence preprocess (mirrors index.html preprocessDiscordSheetMd).
 * Run: node scripts/linuxbox/test-preprocess-discord-sheet-md.js
 */
const SHEET_CODE_LANG = /^(js|ts|javascript|typescript|python|py|bash|sh|json|html|css|yaml|yml|sql|rust|go|c|cpp|xml|diff|markdown|md)$/i;
const base = "";

function preprocessDiscordSheetMd(text, row) {
  const s = String(text || "");
  let out = "";
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf("```", i);
    if (open < 0) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, open);
    const afterOpen = open + 3;
    const after = s.slice(afterOpen);
    const infoLine = after.match(/^([^\n`]*)\r?\n/);
    if (infoLine) {
      const info = infoLine[1].trim();
      const lang = info.split(/\s+/)[0] || "";
      const bodyStart = afterOpen + infoLine[0].length;
      const close = s.indexOf("```", bodyStart);
      if (lang && SHEET_CODE_LANG.test(lang)) {
        if (close < 0) {
          out += s.slice(open).replace(/```/g, "``\u200b`");
          break;
        }
        out += s.slice(open, close + 3);
        i = close + 3;
        continue;
      }
      if (close < 0) {
        const body = s.slice(bodyStart);
        out += body.split("\n").map((l) => (l.length ? `> ${l}` : ">")).join("\n");
        break;
      }
      const body = s.slice(bodyStart, close);
      out += `\n${body.replace(/\r\n/g, "\n").split("\n").map((l) => `> ${l}`).join("\n")}\n\n`;
      i = close + 3;
      continue;
    }
    const close = s.indexOf("```", afterOpen);
    if (close < 0) {
      const body = s.slice(afterOpen);
      out += body.split("\n").map((l) => (l.length ? `> ${l}` : ">")).join("\n");
      break;
    }
    const body = s.slice(afterOpen, close);
    out += `\n> ${body.replace(/\n/g, "\n> ")}\n\n`;
    i = close + 3;
  }
  const byBase = new Map();
  const images = row?.images || [];
  const urls = row?.gallery_urls || [];
  images.forEach((p, idx) => {
    const b = String(p).replace(/\\/g, "/").split("/").pop().toLowerCase();
    if (b && urls[idx]) byBase.set(b, urls[idx]);
  });
  return out.replace(/^- [Aa]ttachment:\s*`([^`]+)`\s*$/gm, (_, ref) => {
    const baseName = String(ref).replace(/\\/g, "/").split("/").pop();
    const url = byBase.get(baseName.toLowerCase());
    if (url) return `\n![${baseName}](${base}${url})\n`;
    return `- **Attachment:** \`${ref}\``;
  });
}

function assert(cond, msg, got) {
  if (!cond) {
    console.error("FAIL:", msg);
    if (got !== undefined) console.error("--- got ---\n", got);
    process.exit(1);
  }
}

/* Real ellaine.md broken line has 4 fence markers (two pairs). */
const sample = [
  "#### 2025-03-09 02:53 UTC — GM",
  "",
  "```frolic through the waves``` ~~of cock~~```and forced to work to have a roof over her head```",
  "",
  "#### 2025-03-09 03:00 UTC — Player",
  "",
  "Hello after the break",
  "",
  "- Attachment: `attachments/image.png`",
].join("\n");

const fixed = preprocessDiscordSheetMd(sample, {
  images: ["characters/portraits/x/image.png"],
  gallery_urls: ["/api/characters-registry/image?path=characters/portraits/x/image.png"],
});

assert(!fixed.includes("```"), "no leftover fences", fixed);
assert(fixed.includes("#### 2025-03-09 03:00 UTC — Player"), "later heading preserved as markdown", fixed);
assert(fixed.includes("> frolic through the waves"), "narration became blockquote", fixed);
assert(fixed.includes("![image.png]("), "resolved attachment became image", fixed);
assert(fixed.includes("> and forced to work"), "mid-fence remnant quoted", fixed);

const code = "```js\nconst x = 1;\n```\n\n#### after";
const codeOut = preprocessDiscordSheetMd(code, null);
assert(codeOut.includes("```js"), "real code fence kept", codeOut);
assert(codeOut.includes("#### after"), "content after code kept", codeOut);

const multi = "```\nline one\nline two\n```\n\n#### next";
const multiOut = preprocessDiscordSheetMd(multi, null);
assert(multiOut.includes("> line one"), "multiline narration quoted", multiOut);
assert(multiOut.includes("#### next"), "heading after multiline ok", multiOut);
assert(!multiOut.includes("```"), "no fences left in multiline case", multiOut);

console.log("OK preprocessDiscordSheetMd");
