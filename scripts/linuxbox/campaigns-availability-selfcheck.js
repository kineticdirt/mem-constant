/** Minimal self-check for campaigns-availability-server (no network). */
"use strict";

const {
  escapeHtml,
  href,
  renderPortal,
  renderCampaign,
  renderPlayers,
  listTrackers,
  TRACKED_IDS,
  resolveCampaignId,
  snowflakeToIso,
  relativeAgeLabel,
  buildChatSummary,
} = require("./campaigns-availability-server.js");

const bareReq = { headers: {} };
const campReq = { headers: { "x-forwarded-prefix": "/camp" } };

if (escapeHtml("<x>") !== "&lt;x&gt;") throw new Error("escapeHtml");
if (resolveCampaignId("euro") !== "eurosluts") throw new Error("alias euro");
if (resolveCampaignId("nyc") !== "nyc-mafia-dnd") throw new Error("alias nyc");
if (href(bareReq, "/players") !== "/players") throw new Error("href bare");
if (href(campReq, "/players") !== "/camp/players") throw new Error("href camp");
if (href(campReq, "/c/euro") !== "/camp/c/euro") throw new Error("href camp euro");

const iso = snowflakeToIso("1477758504264663133");
if (!iso || !iso.startsWith("2026-")) throw new Error("snowflakeToIso");
if (!relativeAgeLabel(new Date().toISOString())) throw new Error("relativeAgeLabel");

const html = renderPortal(
  {
    updated_at: "t",
    campaigns: [{ id: "a", name: "A", status: "up", note: "n", links: [{ label: "T", href: "/c/euro" }] }],
    trackers: [
      {
        id: "eurosluts",
        title: "Euro Campaign",
        status: "active",
        live_status: "up",
        href: "/c/eurosluts",
        pcs: 1,
        schedule: 1,
        player_facing: true,
        discord_url: "https://discord.com/channels/1/2",
        chat: {
          probe_status: "ok",
          channel_name: "campaign-rp",
          last_activity_label: "2d ago",
          last_message_at: "2026-07-26T12:00:00.000Z",
        },
        glance: {
          availability: "Table: Post in Discord",
          schedule: "See Discord · Next session",
          chat: "#campaign-rp · 2d ago",
        },
      },
    ],
  },
  campReq
);
if (!html.includes("Player tables")) throw new Error("portal cta");
if (!html.includes('href="/camp/players"')) throw new Error("portal players prefix");
if (!html.includes('href="/camp/c/euro"')) throw new Error("portal link prefix");
if (!html.includes('href="/camp/c/eurosluts"')) throw new Error("portal tracker prefix");
if (!html.includes("Availability")) throw new Error("portal glance");
if (!html.includes("#campaign-rp")) throw new Error("portal chat channel");

const camp = renderCampaign(
  {
    id: "eurosluts",
    title: "Euro Campaign",
    subtitle: "name pending",
    name_pending: true,
    discord: {
      guild_id: "1265793253798576148",
      category_id: "1477755184607396063",
      channel_id: "1477735120252178453",
    },
    pcs: [],
    schedule: [{ when: "See Discord", title: "Next session" }],
    availability: [{ person: "Table", windows: "Discord" }],
    inventory: [],
  },
  campReq
);
if (!camp.includes("Open campaign channel")) throw new Error("discord block");
if (!camp.includes("At a glance")) throw new Error("campaign glance");
if (!camp.includes("Discord chat track")) throw new Error("chat track heading");
if (!camp.includes('href="/camp/players"')) throw new Error("campaign nav players");
if (!camp.includes('href="/camp/"')) throw new Error("campaign nav portal");
if (!camp.includes("/camp/api/campaigns/eurosluts")) throw new Error("campaign api prefix");
if (!camp.includes('fetch("/camp/api/campaigns/eurosluts"')) throw new Error("campaign fetch prefix");
if (!camp.includes("Player ↔ character links")) throw new Error("pclinks section");
if (!camp.includes("/camp/api/campaigns/eurosluts/links")) throw new Error("links api prefix");
if (!camp.includes('id="link-save"')) throw new Error("link form");

const {
  isDiscordSnowflake,
  isCharacterId,
  emptyLinksDoc,
  readLinks,
  upsertPlayerCharacterLink,
} = require("./campaigns-availability-server.js");
if (!isDiscordSnowflake("123456789012345678")) throw new Error("snowflake ok");
if (isDiscordSnowflake("abc")) throw new Error("snowflake bad");
if (!isCharacterId("nelly-stein")) throw new Error("char id ok");
if (isCharacterId("../x")) throw new Error("char id bad");
const empty = emptyLinksDoc("eurosluts");
if (!empty || empty.campaign_id !== "eurosluts") throw new Error("empty links doc");
readLinks("eurosluts");
const bad = upsertPlayerCharacterLink("eurosluts", { discord_user_id: "1", character_id: "nelly-stein" });
if (bad.ok || bad.error !== "invalid_discord_user_id") throw new Error("reject short snowflake");
// euro has no characters-registry → soft allow (found=null)
const okEuro = upsertPlayerCharacterLink("eurosluts", {
  discord_user_id: "123456789012345678",
  character_id: "pilot-pc",
  note: "selfcheck",
});
if (!okEuro.ok) throw new Error("euro link upsert: " + (okEuro.error || "?"));
if (!okEuro.links || !okEuro.links.some((L) => L.character_id === "pilot-pc")) throw new Error("euro link missing");
// cleanup selfcheck write (do not leave pilot row in workspace)
try {
  const fs = require("fs");
  const path = require("path");
  const dump =
    process.env.AGENT_DUMP ||
    process.env.LINUXBOX_AGENT_DUMP ||
    path.join(process.env.HOME || "", "agent-dump");
  // AGENT_DUMP inside this module is fixed at require-time; remove sidecar if we wrote under cwd tree
  const candidates = [
    path.join(__dirname, "..", "..", "campaigns", "eurosluts", "player-character-links.json"),
    path.join(dump, "campaigns", "eurosluts", "player-character-links.json"),
  ];
  for (const fp of candidates) {
    if (fs.existsSync(fp)) {
      const doc = JSON.parse(fs.readFileSync(fp, "utf8"));
      if (Array.isArray(doc.links) && doc.links.length === 1 && doc.links[0].character_id === "pilot-pc") {
        fs.unlinkSync(fp);
      }
    }
  }
} catch (_) {}

const players = renderPlayers(
  {
    trackers: [
      {
        id: "eurosluts",
        title: "Euro",
        status: "active",
        live_status: "up",
        href: "/c/euro",
        player_facing: true,
        discord_url: "https://discord.com/channels/1/2",
        chat: { probe_status: "ok", last_activity_label: "1h ago" },
        glance: { availability: "Table", schedule: "Soon", chat: "#rp · 1h ago" },
      },
    ],
  },
  campReq
);
if (!players.includes("Player tables")) throw new Error("players page");
if (!players.includes('href="/camp/"')) throw new Error("players portal prefix");
if (!players.includes('href="/camp/c/euro"')) throw new Error("players tracker prefix");
if (!players.includes("Availability")) throw new Error("players glance");

if (!TRACKED_IDS.includes("eurosluts")) throw new Error("tracked ids");
if (!TRACKED_IDS.includes("tropic-gooner")) throw new Error("tropic tracked");
listTrackers();
buildChatSummary("nyc-mafia-dnd", { guild_id: null, channel_id: null });
console.log("campaigns-availability selfcheck OK");
