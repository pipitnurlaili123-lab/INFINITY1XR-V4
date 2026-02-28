/* ============================================
   ✦ INFINITY BOT — WhatsApp Edition V4
   All features ported from mainx.py
   Pair code login (no QR)
   ============================================ */

import readline from "readline";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { getAudioUrl } from "google-tts-api";
import yts from "yt-search";

import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from "@whiskeysockets/baileys";

/* ============ CONFIG ============ */
const MAX_BOTS = 4;
let PREFIX = "/";
let GLOBAL_DELAY = 0.8;

const DOMAIN_EXPANSION_IMAGE = "https://i.imgur.com/6Gq9V1P.jpeg";

/* ============ TEXT POOLS ============ */
const RAID_TEXTS = [
  "Infinity PAPA KA LUN CHUS ⃟♥️","Infinity PAPA KA LUN CHUS ⃟💔",
  "Infinity PAPA KA LUN CHUS ⃟❣️","Infinity PAPA KA LUN CHUS ⃟💕",
  "Infinity PAPA KA LUN CHUS ⃟💞","Infinity PAPA KA LUN CHUS ⃟💓",
  "Infinity PAPA KA LUN CHUS ⃟💗","Infinity PAPA KA LUN CHUS ⃟💖",
  "Infinity PAPA KA LUN CHUS ⃟💘","Infinity PAPA KA LUN CHUS ⃟💌",
  "Infinity PAPA KA LUN CHUS ⃟🩶","Infinity PAPA KA LUN CHUS ⃟🩷",
  "Infinity PAPA KA LUN CHUS ⃟🩵","Infinity PAPA KA LUN CHUS ⃟❤️‍🔥",
  "Infinity PAPA KA LUN CHUS ⃟❤️‍🩹","Infinity BAAP H TERA RNDYKE❤️‍🔥"
];

const INFINITY_TEXTS = [
  "🎀","💝","🔱","💘","💞","💢","❤️‍🔥","🌈","🪐","☄️",
  "⚡","🦚","🦈","🕸️","🍬","🧃","🗽","🪅","🎏","🎸",
  "📿","🏳️‍🌈","🌸","🎶","🎵","☃️","❄️","🕊️","🍷","🥂"
];

const NCEMO_EMOJIS = [
  "💘","🪷","🎐","🫧","💥","💢","❤️‍🔥","☘️","🪐","☄️",
  "🪽","🦚","🦈","🕸️","🍬","🧃","🗽","🪅","🎏","🎸",
  "📿","🏳️‍🌈","🌸","🎶","🎵","☃️","❄️","🕊️","🍷","🥂"
];

/* ============ DATA ============ */
const DATA_DIR      = "./data";
const SUDO_FILE     = `${DATA_DIR}/sudo.json`;
const SETTINGS_FILE = `${DATA_DIR}/settings.json`;
const OWNER_FILE    = `${DATA_DIR}/owner.json`;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function loadJSON(file, def) {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,"utf-8")) : def; }
  catch { return def; }
}
function saveJSON(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch {}
}

let SUDO_USERS = new Set(loadJSON(SUDO_FILE, []));
let settings   = loadJSON(SETTINGS_FILE, { prefix: "/", delay: 0.8 });
PREFIX       = settings.prefix || "/";
GLOBAL_DELAY = settings.delay  || 0.8;

// OWNER: first person to DM /owner claims permanent ownership
let OWNER_JID = loadJSON(OWNER_FILE, null);
function saveOwner() { saveJSON(OWNER_FILE, OWNER_JID); }

function saveSudo()     { saveJSON(SUDO_FILE, [...SUDO_USERS]); }
function saveSettings() { saveJSON(SETTINGS_FILE, { prefix: PREFIX, delay: GLOBAL_DELAY }); }

/* ============ SESSION STATE ============ */
const group_tasks       = new Map();
const infinity_tasks    = new Map();
const spam_tasks        = new Map();
const react_tasks       = new Map(); // chatId -> emoji string
const domain_tasks      = new Map();
const slide_targets     = new Set();
const slidespam_targets = new Set();
const YTS_CACHE         = new Map();
const VIDEO_REQUESTS    = new Map();
const TTS_LANG          = new Map();
const START_TIME        = Date.now();
const allSocks          = [];

/* ============ HELPERS ============ */
const log  = (...a) => console.log(`[${new Date().toLocaleTimeString()}]`, ...a);
const bare = jid => jid?.split(":")[0];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const formatUptime = ms => {
  const s = Math.floor(ms/1000);
  return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m ${s%60}s`;
};

const isOwner = jid => {
  if (!OWNER_JID) return false;
  const b = bare(jid);
  return b === bare(OWNER_JID) || jid === OWNER_JID;
};

const isSudo = jid => {
  const b = bare(jid);
  return isOwner(jid) || SUDO_USERS.has(b) || SUDO_USERS.has(jid);
};

const isCmd = (text, cmd) =>
  text === `${PREFIX}${cmd}` || text.startsWith(`${PREFIX}${cmd} `);

const getArg = text =>
  text.slice(PREFIX.length).trim().split(" ").slice(1).join(" ");

/* ================================================================
   SPEED ENGINE — Telegram-style parallel burst execution
   
   Root cause of NC not working:
   1. setTimeout-based loops are SEQUENTIAL — each bot waits for
      the previous one. Telegram used asyncio.gather() which runs
      ALL bots SIMULTANEOUSLY.
   2. Fixed: each bot gets its own independent async loop that
      never waits for other bots — true parallel like Telegram.
   3. Burst mode: fires 30 requests at once per bot (like Telegram's
      batch of 30-50), then immediately fires the next burst.
   ================================================================ */

// Independent async worker — never stops until cancelled
// Each bot gets ONE of these, they ALL run at the same time
function makeWorker(fn) {
  let alive = true;
  (async () => {
    while (alive) {
      try { await fn(); } catch {}
    }
  })();
  return { cancel: () => { alive = false; } };
}

function stopTasks(map, chatId) {
  if (!map.has(chatId)) return false;
  const workers = map.get(chatId);
  if (Array.isArray(workers)) workers.forEach(w => w?.cancel?.());
  else workers?.cancel?.();
  map.delete(chatId);
  return true;
}

/* ── NC: each sock runs its own loop independently (parallel) ── */

// GCNC — RAID style
// Each bot fires continuously, all in parallel like asyncio.gather
function startGCNC(socks, chatId, base) {
  stopTasks(group_tasks, chatId);
  let i = 0;
  // Each sock = one independent worker running simultaneously
  const workers = socks.map(sock => makeWorker(async () => {
    const title = `${base} ${RAID_TEXTS[i++ % RAID_TEXTS.length]}`;
    await sock.groupUpdateSubject(chatId, title).catch(() => {});
    // tiny yield to prevent total CPU lock — mimics asyncio 0.0001s
    await sleep(1);
  }));
  group_tasks.set(chatId, workers);
}

// NCEMO — emoji style
function startNCEMO(socks, chatId, base) {
  stopTasks(group_tasks, chatId);
  let i = 0;
  const workers = socks.map(sock => makeWorker(async () => {
    const title = `${base} ${NCEMO_EMOJIS[i++ % NCEMO_EMOJIS.length]}`;
    await sock.groupUpdateSubject(chatId, title).catch(() => {});
    await sleep(1);
  }));
  group_tasks.set(chatId, workers);
}

// NCBAAP — GOD LEVEL: each bot fires a BURST of 30 simultaneously
// Like Telegram's: await asyncio.gather(*[bot.set_chat_title(...) for _ in range(40)])
function startNCBAAP(socks, chatId, base) {
  stopTasks(group_tasks, chatId);
  const workers = socks.map(sock => {
    let i = 0;
    return makeWorker(async () => {
      // Fire 30 name changes AT ONCE from this single bot
      const burst = [];
      for (let j = 0; j < 30; j++) {
        const title = `${base} ${RAID_TEXTS[(i + j) % RAID_TEXTS.length]}`;
        burst.push(sock.groupUpdateSubject(chatId, title).catch(() => {}));
      }
      i = (i + 30) % RAID_TEXTS.length;
      await Promise.all(burst); // all 30 fire simultaneously
    });
  });
  group_tasks.set(chatId, workers);
}

// INFINITY — cycling emojis, full parallel
function startInfinity(socks, chatId, base) {
  stopTasks(infinity_tasks, chatId);
  let i = 0;
  const workers = socks.map(sock => makeWorker(async () => {
    const title = `${base} ${INFINITY_TEXTS[i++ % INFINITY_TEXTS.length]}`;
    await sock.groupUpdateSubject(chatId, title).catch(() => {});
    await sleep(1);
  }));
  infinity_tasks.set(chatId, workers);
}

// INFINITYFAST — same but slightly paced
function startInfinityFast(socks, chatId, base) {
  stopTasks(infinity_tasks, chatId);
  let i = 0;
  const workers = socks.map(sock => makeWorker(async () => {
    const title = `${base} ${INFINITY_TEXTS[i++ % INFINITY_TEXTS.length]}`;
    await sock.groupUpdateSubject(chatId, title).catch(() => {});
    // no sleep = absolute max speed
  }));
  infinity_tasks.set(chatId, workers);
}

// INFINITYGODSPEED — DEMONIC EDITION 😈
// Every bot fires 200 requests simultaneously in nested parallel bursts.
// No sleep. No yield. No mercy. Runs recursive waves back-to-back.
// Each wave launches BEFORE the previous one finishes — pure chaos engine.
function startInfinityGodspeed(socks, chatId, base) {
  stopTasks(infinity_tasks, chatId);
  const workers = socks.map(sock => {
    let i = 0;
    return makeWorker(async () => {
      // Wave 1 — launch 200 requests fire-and-forget (don't wait)
      const wave1 = [];
      for (let j = 0; j < 200; j++) {
        const title = `${base} ${INFINITY_TEXTS[(i + j) % INFINITY_TEXTS.length]}`;
        wave1.push(sock.groupUpdateSubject(chatId, title).catch(() => {}));
      }
      i = (i + 200) % INFINITY_TEXTS.length;

      // Wave 2 — starts immediately while wave 1 is still in flight
      const wave2 = [];
      for (let j = 0; j < 200; j++) {
        const title = `${base} ${INFINITY_TEXTS[(i + j) % INFINITY_TEXTS.length]}`;
        wave2.push(sock.groupUpdateSubject(chatId, title).catch(() => {}));
      }
      i = (i + 200) % INFINITY_TEXTS.length;

      // Wave 3 — same, overlapping everything above
      const wave3 = [];
      for (let j = 0; j < 200; j++) {
        const title = `${base} ${INFINITY_TEXTS[(i + j) % INFINITY_TEXTS.length]}`;
        wave3.push(sock.groupUpdateSubject(chatId, title).catch(() => {}));
      }
      i = (i + 200) % INFINITY_TEXTS.length;

      // All 600 requests race simultaneously — then loop again instantly
      await Promise.all([...wave1, ...wave2, ...wave3]);
    });
  });
  infinity_tasks.set(chatId, workers);
}

// SPAM — all bots fire simultaneously, no wait
function startSpam(socks, chatId, spamText) {
  stopTasks(spam_tasks, chatId);
  const workers = socks.map(sock => makeWorker(async () => {
    await sock.sendMessage(chatId, { text: spamText }).catch(() => {});
  }));
  spam_tasks.set(chatId, workers);
}

// DOMAIN EXPANSION — UNSTOPPABLE DEMONIC ENGINE 😈♾️
// Zero pauses. Zero gaps. Zero mercy.
// Each bot fires 3 overlapping waves of 200 simultaneously — NONSTOP.
// Watcher is now ultra-fast (250ms) and slams all bots to revert instantly.
function startDomainExpansion(socks, chatId, base, mode) {
  stopTasks(domain_tasks, chatId);
  const pool = mode === "ncemo" ? NCEMO_EMOJIS
             : mode === "infinity" ? INFINITY_TEXTS
             : RAID_TEXTS;

  // Each bot: 3 overlapping waves of 200 = 600 name changes per cycle, NO sleep
  const ncWorkers = socks.map(sock => {
    let i = 0;
    return makeWorker(async () => {
      // Wave 1
      const wave1 = [];
      for (let j = 0; j < 200; j++) {
        wave1.push(sock.groupUpdateSubject(chatId, `${base} ${pool[(i + j) % pool.length]}`).catch(() => {}));
      }
      i = (i + 200) % pool.length;

      // Wave 2 — launched before wave 1 finishes
      const wave2 = [];
      for (let j = 0; j < 200; j++) {
        wave2.push(sock.groupUpdateSubject(chatId, `${base} ${pool[(i + j) % pool.length]}`).catch(() => {}));
      }
      i = (i + 200) % pool.length;

      // Wave 3 — all 3 overlap and race each other
      const wave3 = [];
      for (let j = 0; j < 200; j++) {
        wave3.push(sock.groupUpdateSubject(chatId, `${base} ${pool[(i + j) % pool.length]}`).catch(() => {}));
      }
      i = (i + 200) % pool.length;

      // 600 requests fly simultaneously — loop restarts INSTANTLY when done
      await Promise.all([...wave1, ...wave2, ...wave3]);
    });
  });

  // Ultra-fast watcher: checks every 250ms instead of 3s
  // If name is reverted by someone — ALL bots slam it back in ONE burst
  let watching = true;
  (async () => {
    while (watching) {
      try {
        await sleep(250); // was 3000ms — now 12x faster response
        if (!watching) break;
        const meta = await socks[0]?.groupMetadata(chatId).catch(() => null);
        if (meta?.subject && !meta.subject.toLowerCase().includes(base.toLowerCase())) {
          // ALL bots revert simultaneously in one instant burst
          const revertBurst = [];
          for (const s of socks) {
            for (let r = 0; r < 10; r++) { // 10 reverts per bot at once
              revertBurst.push(s.groupUpdateSubject(chatId, `${base} 😈♾️`).catch(() => {}));
            }
          }
          await Promise.all(revertBurst);
        }
      } catch {}
    }
  })();

  domain_tasks.set(chatId, [
    ...ncWorkers,
    { cancel: () => { watching = false; } }
  ]);
}

/* ============ HELP ============ */
function getHelp() {
  return (
`╔═══════════════════════════╗
║  ⌬  I N F I N I T Y  V 4  ║
║   W H A T S A P P  B O T   ║
╚═══════════════════════════╝

◤━━━━━━━━━━━━━━━━━━━━━━━━◥
  💀  N A M E  C H A N G E R
◣━━━━━━━━━━━━━━━━━━━━━━━━◢
  ⌁ ${PREFIX}gcnc <text>       » RAID style
  ⌁ ${PREFIX}ncemo <text>      » Emoji style
  ⌁ ${PREFIX}ncbaap <text>     » GOD LEVEL 👑
  ⌁ ${PREFIX}stopgcnc / ${PREFIX}stopncemo / ${PREFIX}stopncbaap
  ⌁ ${PREFIX}stopall           » Kill everything
  ⌁ ${PREFIX}delay <sec>       » Set speed

◤━━━━━━━━━━━━━━━━━━━━━━━━◥
  ♾️  I N F I N I T Y  N C
◣━━━━━━━━━━━━━━━━━━━━━━━━◢
  ⌁ ${PREFIX}infinity <text>
  ⌁ ${PREFIX}infinityfast <text>
  ⌁ ${PREFIX}infinitygodspeed <text>
  ⌁ ${PREFIX}stopinfinity

◤━━━━━━━━━━━━━━━━━━━━━━━━◥
  😈  D O M A I N  E X P A N S I O N
◣━━━━━━━━━━━━━━━━━━━━━━━━◢
  ⌁ ${PREFIX}domainexpansiongcnc <text>
  ⌁ ${PREFIX}domainexpansionncemo <text>
  ⌁ ${PREFIX}domainexpansionncbaap <text>
  ⌁ ${PREFIX}domainexpansioninfinity <text>
  ⌁ ${PREFIX}stopdomainexpansion

◤━━━━━━━━━━━━━━━━━━━━━━━━◥
  💥  S P A M  &  R E A C T
◣━━━━━━━━━━━━━━━━━━━━━━━━◢
  ⌁ ${PREFIX}spam <text>       » ${PREFIX}unspam
  ⌁ ${PREFIX}emojispam <emoji> » ${PREFIX}stopemojispam

◤━━━━━━━━━━━━━━━━━━━━━━━━◥
  🥷  S L I D E  A T T A C K
◣━━━━━━━━━━━━━━━━━━━━━━━━◢
  ⌁ ${PREFIX}targetslide  (reply to user)
  ⌁ ${PREFIX}stopslide    (reply to user)
  ⌁ ${PREFIX}slidespam    (reply to user)
  ⌁ ${PREFIX}stopslidespam (reply to user)

◤━━━━━━━━━━━━━━━━━━━━━━━━◥
  🎵  V O I C E  &  M U S I C
◣━━━━━━━━━━━━━━━━━━━━━━━━◢
  ⌁ ${PREFIX}tts <text>
  ⌁ ${PREFIX}setlang <code>
  ⌁ ${PREFIX}yts <song>
  ⌁ ${PREFIX}song
  ⌁ ${PREFIX}video

◤━━━━━━━━━━━━━━━━━━━━━━━━◥
  🏘️  G C  M A N A G E M E N T
◣━━━━━━━━━━━━━━━━━━━━━━━━◢
  ⌁ ${PREFIX}gcinfo            » Group info + members
  ⌁ ${PREFIX}gclink            » Get invite link
  ⌁ ${PREFIX}revokelink        » Revoke invite link
  ⌁ ${PREFIX}gcdesc <text>     » Change description
  ⌁ ${PREFIX}gclock            » Lock group (admins only)
  ⌁ ${PREFIX}gcunlock          » Unlock group (everyone)
  ⌁ ${PREFIX}gcmute            » Mute group messages
  ⌁ ${PREFIX}gcunmute          » Unmute group messages
  ⌁ ${PREFIX}add <number>      » Add member
  ⌁ ${PREFIX}kick    (reply)   » Remove member
  ⌁ ${PREFIX}promote (reply)   » Make admin
  ⌁ ${PREFIX}demote  (reply)   » Remove admin
  ⌁ ${PREFIX}kickall           » Kick all non-admins
  ⌁ ${PREFIX}tagall            » Tag all members
  ⌁ ${PREFIX}adminlist         » List all admins

◤━━━━━━━━━━━━━━━━━━━━━━━━◥
  🤖  B O T  M A N A G E M E N T
◣━━━━━━━━━━━━━━━━━━━━━━━━◢
  ⌁ ${PREFIX}addsudo  (reply)
  ⌁ ${PREFIX}delsudo  (reply)
  ⌁ ${PREFIX}listsudo
  ⌁ ${PREFIX}prefix <new>
  ⌁ ${PREFIX}delay <sec>
  ⌁ ${PREFIX}ping
  ⌁ ${PREFIX}status
  ⌁ ${PREFIX}pair <number>   » Add new bot slot

╔═══════════════════════════╗
║  ♾️  Infinity V4 Unstoppable ║
╚═══════════════════════════╝`
  );
}

/* ============ BOT START ============ */
async function startBot(botId) {
  const authDir = `./auth_bot_${botId}`;
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({ auth: state, version, printQRInTerminal: false });
  sock.ev.on("creds.update", saveCreds);
  allSocks[botId - 1] = sock;

  let pairCodeRequested = false;

  sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (!pairCodeRequested && !sock.authState.creds.registered) {
      pairCodeRequested = true;
      const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl2.question(`\n📱 [BOT ${botId}] Enter WhatsApp number (e.g. 919876543210): `, async phone => {
        rl2.close();
        phone = phone.replace(/[^0-9]/g, "");
        try {
          const code = await sock.requestPairingCode(phone);
          const fmt = code.match(/.{1,4}/g).join("-");
          console.log(`\n╔══════════════════════════════╗`);
          console.log(`║   🔑 INFINITY BOT PAIR CODE   ║`);
          console.log(`╠══════════════════════════════╣`);
          console.log(`║         ${fmt}         ║`);
          console.log(`╚══════════════════════════════╝`);
          console.log(`\n👉 WhatsApp → Linked Devices → Link with Phone Number\n`);
        } catch (err) {
          console.error(`❌ [BOT ${botId}] Pair code error:`, err.message || err);
        }
      });
    }

    if (connection === "open") log(`✅ BOT ${botId} — INFINITY ONLINE`);

    if (connection === "close" &&
      lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
      log(`🔄 BOT ${botId} reconnecting...`);
      startBot(botId);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
      try {
        if (!msg.message) continue;
        const chatId = msg.key.remoteJid;
        if (!chatId) continue;
        const isGroup = chatId.endsWith("@g.us");
        const sender  = isGroup ? (msg.key.participant || msg.participant) : msg.key.remoteJid;
        if (!sender) continue;

        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        const activeSocks = allSocks.filter(Boolean);

        // AUTO REACT
        if (react_tasks.has(chatId) && !msg.key.fromMe && msg.key.id) {
          try {
            await sock.sendMessage(chatId, { react: { text: react_tasks.get(chatId), key: msg.key } });
          } catch {}
        }

        // SLIDE auto-reply (triggers on any message from target)
        if (slide_targets.has(bare(sender))) {
          for (let k = 0; k < 3; k++) {
            try { await sock.sendMessage(chatId, { text: RAID_TEXTS[k] }, { quoted: msg }); } catch {}
            await sleep(100);
          }
        }
        if (slidespam_targets.has(bare(sender))) {
          for (const t of RAID_TEXTS) {
            try { await sock.sendMessage(chatId, { text: t }, { quoted: msg }); } catch {}
            await sleep(50);
          }
        }

        // ── /owner CLAIM (DM only, before any auth check) ──
        if (text.trim() === "/owner" && !isGroup) {
          if (OWNER_JID) {
            await sock.sendMessage(chatId, {
              text: "👑 *Owner already claimed.*\nThis bot already has an owner."
            }, { quoted: msg });
          } else {
            OWNER_JID = bare(sender);
            saveOwner();
            SUDO_USERS.add(bare(sender));
            saveSudo();
            await sock.sendMessage(chatId, {
              text:
                "╔══════════════════════╗\n" +
                "║  👑  O W N E R        ║\n" +
                "║     C L A I M E D  ✅  ║\n" +
                "╚══════════════════════╝\n\n" +
                "You are now the permanent owner of\n" +
                "*INFINITY BOT V4* ♾️\n\n" +
                "You have full access to all commands.\n" +
                `Send ${PREFIX}help to see all commands.`
            }, { quoted: msg });
            log(`👑 Owner claimed by: ${sender}`);
          }
          continue;
        }

        if (!text.startsWith(PREFIX)) continue;
        if (!isSudo(sender)) {
          // If no owner yet, tell them how to claim
          if (!OWNER_JID && !isGroup) {
            await sock.sendMessage(chatId, {
              text: "⚠️ No owner set yet.\nSend */owner* in DM to claim ownership."
            }, { quoted: msg });
          } else {
            await sock.sendMessage(chatId, { text: "❌ You are not SUDO." }, { quoted: msg });
          }
          continue;
        }

        // ── HELP ──
        if (isCmd(text,"help") || isCmd(text,"start") || isCmd(text,"menu")) {
          await sock.sendMessage(chatId, { text: getHelp() }, { quoted: msg }); continue;
        }

        // ── MY OWNER ──
        if (isCmd(text,"myowner")) {
          await sock.sendMessage(chatId, {
            text: OWNER_JID
              ? `👑 *Owner:* @${OWNER_JID.split("@")[0]}`
              : "⚠️ No owner claimed yet. DM the bot and send */owner*"
          }, { quoted: msg, mentions: OWNER_JID ? [OWNER_JID + "@s.whatsapp.net"] : [] });
          continue;
        }

        // ── PING ──
        if (isCmd(text,"ping")) {
          const t = Date.now();
          const s = await sock.sendMessage(chatId, { text: "🏓 Pinging..." }, { quoted: msg });
          await sock.sendMessage(chatId, { text: `🏓 Pong! *${Date.now()-t}ms*` }, { quoted: s });
          continue;
        }

        // ── STATUS ──
        if (isCmd(text,"status")) {
          const tot=os.totalmem(), fr=os.freemem();
          await sock.sendMessage(chatId, { text:
            `📊 *INFINITY V4 STATUS*\n\n` +
            `🎀 NC: ${group_tasks.size} active\n` +
            `♾️ Infinity: ${infinity_tasks.size} active\n` +
            `😹 Spam: ${spam_tasks.size} active\n` +
            `🪐 Auto React: ${react_tasks.size} chats\n` +
            `🥷 Slide Targets: ${slide_targets.size}\n` +
            `💥 Slide Spam: ${slidespam_targets.size}\n` +
            `😈 Domain Expansion: ${domain_tasks.size}\n\n` +
            `⏱ Delay: ${GLOBAL_DELAY}s\n` +
            `🤖 Bots: ${activeSocks.length}\n` +
            `👑 SUDO: ${SUDO_USERS.size}\n` +
            `💾 RAM: ${((tot-fr)/1024/1024).toFixed(0)}MB/${(tot/1024/1024).toFixed(0)}MB\n` +
            `⏳ Uptime: ${formatUptime(Date.now()-START_TIME)}`
          }, { quoted: msg });
          continue;
        }

        // ── DELAY ──
        if (isCmd(text,"delay")) {
          const v = parseFloat(getArg(text));
          if (isNaN(v)||v<0.1) { await sock.sendMessage(chatId,{text:`⏱ Delay: *${GLOBAL_DELAY}s*\nUsage: ${PREFIX}delay 0.5`},{quoted:msg}); continue; }
          GLOBAL_DELAY=v; saveSettings();
          await sock.sendMessage(chatId,{text:`✅ Delay: *${v}s*`},{quoted:msg}); continue;
        }

        // ── PREFIX ──
        if (isCmd(text,"prefix")) {
          const np=getArg(text);
          if (!np||np.length>3) { await sock.sendMessage(chatId,{text:`❌ Usage: ${PREFIX}prefix !`},{quoted:msg}); continue; }
          const old=PREFIX; PREFIX=np; saveSettings();
          await sock.sendMessage(chatId,{text:`✅ Prefix: ${old} → ${PREFIX}`},{quoted:msg}); continue;
        }

        // ── GCNC ──
        if (isCmd(text,"gcnc")) {
          const base=getArg(text);
          if (!base) { await sock.sendMessage(chatId,{text:`⚠️ Usage: ${PREFIX}gcnc <text>`},{quoted:msg}); continue; }
          startGCNC(activeSocks,chatId,base);
          await sock.sendMessage(chatId,{text:"🔄 *GC NAME CHANGER STARTED!*\nRAID style 💀"},{quoted:msg}); continue;
        }

        // ── NCEMO ──
        if (isCmd(text,"ncemo")) {
          const base=getArg(text);
          if (!base) { await sock.sendMessage(chatId,{text:`⚠️ Usage: ${PREFIX}ncemo <text>`},{quoted:msg}); continue; }
          startNCEMO(activeSocks,chatId,base);
          await sock.sendMessage(chatId,{text:"🎭 *EMOJI NAME CHANGER STARTED!*"},{quoted:msg}); continue;
        }

        // ── NCBAAP ──
        if (isCmd(text,"ncbaap")) {
          const base=getArg(text);
          if (!base) { await sock.sendMessage(chatId,{text:`⚠️ Usage: ${PREFIX}ncbaap <text>`},{quoted:msg}); continue; }
          startNCBAAP(activeSocks,chatId,base);
          await sock.sendMessage(chatId,{text:"👑 *GOD LEVEL NCBAAP ACTIVATED!*\n5 NC in 0.1s 🚀"},{quoted:msg}); continue;
        }

        if (isCmd(text,"stopgcnc")||isCmd(text,"stopncemo")||isCmd(text,"stopncbaap")) {
          const ok=stopTasks(group_tasks,chatId);
          await sock.sendMessage(chatId,{text:ok?"⏹ *Name Changer Stopped!*":"❌ No active NC"},{quoted:msg}); continue;
        }

        // ── INFINITY ──
        if (isCmd(text,"infinity")) {
          const base=getArg(text);
          if (!base) { await sock.sendMessage(chatId,{text:`⚠️ Usage: ${PREFIX}infinity <text>`},{quoted:msg}); continue; }
          startInfinity(activeSocks,chatId,base);
          await sock.sendMessage(chatId,{text:"💀 *Infinity Mode Activated!*"},{quoted:msg}); continue;
        }

        if (isCmd(text,"infinityfast")) {
          const base=getArg(text);
          if (!base) { await sock.sendMessage(chatId,{text:`⚠️ Usage: ${PREFIX}infinityfast <text>`},{quoted:msg}); continue; }
          startInfinityFast(activeSocks,chatId,base);
          await sock.sendMessage(chatId,{text:"⚡ *FAST Infinity Activated!*"},{quoted:msg}); continue;
        }

        if (isCmd(text,"infinitygodspeed")) {
          const base=getArg(text);
          if (!base) { await sock.sendMessage(chatId,{text:`⚠️ Usage: ${PREFIX}infinitygodspeed <text>`},{quoted:msg}); continue; }
          startInfinityGodspeed(activeSocks,chatId,base);
          await sock.sendMessage(chatId,{text:"😈🔥 *DEMONIC GODSPEED ACTIVATED!*\n600 NC per bot per cycle — faster than a blink 👁️⚡"},{quoted:msg}); continue;
        }

        if (isCmd(text,"stopinfinity")) {
          const ok=stopTasks(infinity_tasks,chatId);
          await sock.sendMessage(chatId,{text:ok?"🛑 *Infinity Stopped!*":"❌ No active Infinity"},{quoted:msg}); continue;
        }

        // ── DOMAIN EXPANSION ──
        const domainCmds = [
          ["domainexpansiongcnc","gcnc"],
          ["domainexpansionncemo","ncemo"],
          ["domainexpansionncbaap","ncbaap"],
          ["domainexpansioninfinity","infinity"],
          ["domainexpansion","gcnc"],
        ];
        let domainHandled = false;
        for (const [cmd,mode] of domainCmds) {
          if (isCmd(text,cmd)) {
            const base=getArg(text);
            if (!base) { await sock.sendMessage(chatId,{text:`⚠️ Usage: ${PREFIX}${cmd} <text>`},{quoted:msg}); domainHandled=true; break; }
            startDomainExpansion(activeSocks,chatId,base,mode);
            const modeLabels={gcnc:"💀 GCNC",ncemo:"🎭 NCEMO",ncbaap:"👑 NCBAAP",infinity:"♾️ INFINITY"};
            const cap =
              `╔══════════════════════════════╗\n` +
              `║   😈  D O M A I N           ║\n` +
              `║      E X P A N S I O N  ♾️  ║\n` +
              `╚══════════════════════════════╝\n\n` +
              `  📛  Base : ${base}\n` +
              `  ⚙️  Mode : ${modeLabels[mode]||mode}\n` +
              `  ⚡  Bots : ${activeSocks.length}\n\n` +
              `  ◈ Name cycling — ENGAGED\n` +
              `  ◈ Watcher — ONLINE\n\n` +
              `  ➡ ${PREFIX}stopdomainexpansion to lift`;
            try { await sock.sendMessage(chatId,{image:{url:DOMAIN_EXPANSION_IMAGE},caption:cap},{quoted:msg}); }
            catch { await sock.sendMessage(chatId,{text:cap},{quoted:msg}); }
            domainHandled=true; break;
          }
        }
        if (domainHandled) continue;

        if (isCmd(text,"stopdomainexpansion")) {
          const ok=stopTasks(domain_tasks,chatId);
          await sock.sendMessage(chatId,{text:ok?"✅ *Domain Expansion LIFTED.*\n♾️ The barrier is gone.":"❌ No active Domain Expansion"},{quoted:msg}); continue;
        }

        // ── SPAM ──
        if (isCmd(text,"spam")) {
          const st=getArg(text);
          if (!st) { await sock.sendMessage(chatId,{text:`⚠️ Usage: ${PREFIX}spam <text>`},{quoted:msg}); continue; }
          startSpam(activeSocks,chatId,st);
          await sock.sendMessage(chatId,{text:"💥 *SPAM STARTED!*"},{quoted:msg}); continue;
        }
        if (isCmd(text,"unspam")) {
          const ok=stopTasks(spam_tasks,chatId);
          await sock.sendMessage(chatId,{text:ok?"🛑 *Spam Stopped!*":"❌ No active spam"},{quoted:msg}); continue;
        }

        // ── EMOJI SPAM ──
        if (isCmd(text,"emojispam")) {
          const emoji=getArg(text)?.trim();
          if (!emoji) { await sock.sendMessage(chatId,{text:`⚠️ Usage: ${PREFIX}emojispam 😈`},{quoted:msg}); continue; }
          react_tasks.set(chatId,emoji);
          await sock.sendMessage(chatId,{text:`🎭 *Auto-react ON:* ${emoji}\nStop: ${PREFIX}stopemojispam`},{quoted:msg}); continue;
        }
        if (isCmd(text,"stopemojispam")) {
          react_tasks.delete(chatId);
          await sock.sendMessage(chatId,{text:"🛑 *Reactions Stopped!*"},{quoted:msg}); continue;
        }

        // ── SLIDE ──
        if (isCmd(text,"targetslide")) {
          const ctx=msg.message?.extendedTextMessage?.contextInfo;
          if (!ctx?.participant) { await sock.sendMessage(chatId,{text:"⚠️ Reply to a user's message"},{quoted:msg}); continue; }
          slide_targets.add(bare(ctx.participant));
          await sock.sendMessage(chatId,{text:`🎯 Slide target: @${ctx.participant.split("@")[0]}`},{quoted:msg,mentions:[ctx.participant]}); continue;
        }
        if (isCmd(text,"stopslide")) {
          const ctx=msg.message?.extendedTextMessage?.contextInfo;
          if (!ctx?.participant) { await sock.sendMessage(chatId,{text:"⚠️ Reply to a user's message"},{quoted:msg}); continue; }
          slide_targets.delete(bare(ctx.participant));
          await sock.sendMessage(chatId,{text:`🛑 Slide stopped for @${ctx.participant.split("@")[0]}`},{quoted:msg,mentions:[ctx.participant]}); continue;
        }
        if (isCmd(text,"slidespam")) {
          const ctx=msg.message?.extendedTextMessage?.contextInfo;
          if (!ctx?.participant) { await sock.sendMessage(chatId,{text:"⚠️ Reply to a user's message"},{quoted:msg}); continue; }
          slidespam_targets.add(bare(ctx.participant));
          await sock.sendMessage(chatId,{text:`💥 Slide SPAM: @${ctx.participant.split("@")[0]}`},{quoted:msg,mentions:[ctx.participant]}); continue;
        }
        if (isCmd(text,"stopslidespam")) {
          const ctx=msg.message?.extendedTextMessage?.contextInfo;
          if (!ctx?.participant) { await sock.sendMessage(chatId,{text:"⚠️ Reply to a user's message"},{quoted:msg}); continue; }
          slidespam_targets.delete(bare(ctx.participant));
          await sock.sendMessage(chatId,{text:`🛑 Slide spam stopped: @${ctx.participant.split("@")[0]}`},{quoted:msg,mentions:[ctx.participant]}); continue;
        }

        // ── STOP ALL ──
        if (isCmd(text,"stopall")) {
          for(const[,t]of group_tasks){if(Array.isArray(t))t.forEach(x=>x?.cancel?.());} group_tasks.clear();
          for(const[,t]of infinity_tasks){if(Array.isArray(t))t.forEach(x=>x?.cancel?.());} infinity_tasks.clear();
          for(const[,t]of spam_tasks){if(Array.isArray(t))t.forEach(x=>x?.cancel?.());} spam_tasks.clear();
          for(const[,t]of domain_tasks){if(Array.isArray(t))t.forEach(x=>x?.cancel?.());} domain_tasks.clear();
          react_tasks.clear();
          await sock.sendMessage(chatId,{text:"⏹ *ALL ACTIVITIES STOPPED!*"},{quoted:msg}); continue;
        }

        // ── TTS ──
        if (isCmd(text,"tts")) {
          const tt=getArg(text);
          if (!tt) { await sock.sendMessage(chatId,{text:`⚠️ Usage: ${PREFIX}tts <text>`},{quoted:msg}); continue; }
          try {
            const lang=TTS_LANG.get(chatId)||"en";
            const url=getAudioUrl(tt,{lang,slow:false,host:"https://translate.google.com"});
            await sock.sendMessage(chatId,{audio:{url},mimetype:"audio/mp4",ptt:true},{quoted:msg});
          } catch { await sock.sendMessage(chatId,{text:"❌ TTS failed."},{quoted:msg}); }
          continue;
        }
        if (isCmd(text,"setlang")) {
          const lang=getArg(text).toLowerCase();
          TTS_LANG.set(chatId,lang||"en");
          await sock.sendMessage(chatId,{text:`✅ TTS language: *${lang||"en"}*`},{quoted:msg}); continue;
        }

        // ── YTS ──
        if (isCmd(text,"yts")) {
          const q=getArg(text).trim();
          if (!q) { await sock.sendMessage(chatId,{text:`⚠️ Usage: ${PREFIX}yts <song>`},{quoted:msg}); continue; }
          try {
            const res=await yts(q);
            if (!res.videos?.length) { await sock.sendMessage(chatId,{text:"❌ No results."},{quoted:msg}); continue; }
            const v=res.videos[0]; YTS_CACHE.set(chatId,v);
            await sock.sendMessage(chatId,{
              image:{url:v.thumbnail},
              caption:`🎵 *${v.title}*\n\n👤 ${v.author.name}\n⏱ ${v.timestamp}\n👁 ${v.views?.toLocaleString()}\n📅 ${v.ago}\n🔗 ${v.url}\n\n👉 *${PREFIX}song* = MP3 | *${PREFIX}video* = Video`
            },{quoted:msg});
          } catch { await sock.sendMessage(chatId,{text:"❌ YouTube search failed."},{quoted:msg}); }
          continue;
        }

        // ── SONG ──
        if (isCmd(text,"song")) {
          const v=YTS_CACHE.get(chatId);
          if (!v) { await sock.sendMessage(chatId,{text:`❌ Use ${PREFIX}yts first.`},{quoted:msg}); continue; }
          const tmpDir="./temp_music"; if(!fs.existsSync(tmpDir))fs.mkdirSync(tmpDir);
          const safe=v.title.replace(/[\\/:*?"<>|]/g,"");
          const out=path.resolve(tmpDir,`${safe}.mp3`);
          await sock.sendMessage(chatId,{text:"⏬ Downloading MP3…"},{quoted:msg});
          const dl=spawn("yt-dlp",["-x","--audio-format","mp3","--audio-quality","128K","--no-playlist","-o",out,v.url]);
          dl.on("error",async()=>{await sock.sendMessage(chatId,{text:"❌ yt-dlp not found. Run: pip install yt-dlp"},{quoted:msg});});
          dl.on("close",async code=>{
            if(code!==0||!fs.existsSync(out)){await sock.sendMessage(chatId,{text:"❌ Download failed."},{quoted:msg});return;}
            await sock.sendMessage(chatId,{audio:fs.readFileSync(out),mimetype:"audio/mpeg",fileName:`${safe}.mp3`},{quoted:msg});
            fs.unlinkSync(out); YTS_CACHE.delete(chatId);
          });
          continue;
        }

        // ── VIDEO ──
        if (isCmd(text,"video")) {
          const v=YTS_CACHE.get(chatId);
          if (!v) { await sock.sendMessage(chatId,{text:`❌ Use ${PREFIX}yts first.`},{quoted:msg}); continue; }
          VIDEO_REQUESTS.set(chatId,v);
          await sock.sendMessage(chatId,{text:"🎬 *Select Quality*\n\n1️⃣ 420p\n2️⃣ 720p\n\nReply *1* or *2*"},{quoted:msg}); continue;
        }
        if (VIDEO_REQUESTS.has(chatId)&&(text==="1"||text==="2")) {
          const v=VIDEO_REQUESTS.get(chatId); VIDEO_REQUESTS.delete(chatId);
          const q=text==="1"?"bestvideo[height<=420]+bestaudio/best[height<=420]":"bestvideo[height<=720]+bestaudio/best[height<=720]";
          const lbl=text==="1"?"420p":"720p";
          const tmpDir="./temp_video"; if(!fs.existsSync(tmpDir))fs.mkdirSync(tmpDir);
          const safe=v.title.replace(/[\\/:*?"<>|]/g,"");
          const out=path.resolve(tmpDir,`${safe}_${lbl}.mp4`);
          await sock.sendMessage(chatId,{text:`⏬ Downloading ${lbl}…`},{quoted:msg});
          const dl=spawn("yt-dlp",["-f",q,"--merge-output-format","mp4","--no-playlist","-o",out,v.url]);
          dl.on("close",async code=>{
            if(code!==0||!fs.existsSync(out)){await sock.sendMessage(chatId,{text:"❌ Video failed."},{quoted:msg});return;}
            await sock.sendMessage(chatId,{video:fs.readFileSync(out),mimetype:"video/mp4",caption:`🎬 *${v.title}* (${lbl})`},{quoted:msg});
            fs.unlinkSync(out); YTS_CACHE.delete(chatId);
          });
          continue;
        }

        // ══════════════════════════════════════════════
        // ── GC MANAGEMENT ──
        // ══════════════════════════════════════════════

        // ── GCINFO ──
        if (isCmd(text,"gcinfo")) {
          if (!isGroup) { await sock.sendMessage(chatId,{text:"❌ Groups only."},{quoted:msg}); continue; }
          try {
            const meta = await sock.groupMetadata(chatId);
            const admins = meta.participants.filter(p=>p.admin).map(p=>`👑 @${p.id.split("@")[0]}`).join("\n");
            const total  = meta.participants.length;
            const created = new Date(meta.creation*1000).toLocaleDateString();
            const reply =
              `╔══════════════════════════════╗\n`+
              `║   🏘️  G R O U P  I N F O     ║\n`+
              `╚══════════════════════════════╝\n\n`+
              `📛 *Name:* ${meta.subject}\n`+
              `🆔 *ID:* ${chatId}\n`+
              `👥 *Members:* ${total}\n`+
              `📅 *Created:* ${created}\n`+
              `📝 *Desc:* ${meta.desc||"(none)"}\n\n`+
              `👑 *Admins:*\n${admins||"None"}`;
            const mentions = meta.participants.filter(p=>p.admin).map(p=>p.id);
            await sock.sendMessage(chatId,{text:reply,mentions},{quoted:msg});
          } catch(e) { await sock.sendMessage(chatId,{text:`❌ Failed: ${e.message}`},{quoted:msg}); }
          continue;
        }

        // ── GCLINK ──
        if (isCmd(text,"gclink")) {
          if (!isGroup) { await sock.sendMessage(chatId,{text:"❌ Groups only."},{quoted:msg}); continue; }
          try {
            const code = await sock.groupInviteCode(chatId);
            await sock.sendMessage(chatId,{text:`🔗 *Invite Link:*\nhttps://chat.whatsapp.com/${code}`},{quoted:msg});
          } catch { await sock.sendMessage(chatId,{text:"❌ Failed — bot must be admin."},{quoted:msg}); }
          continue;
        }

        // ── REVOKELINK ──
        if (isCmd(text,"revokelink")) {
          if (!isGroup) { await sock.sendMessage(chatId,{text:"❌ Groups only."},{quoted:msg}); continue; }
          try {
            const code = await sock.groupRevokeInvite(chatId);
            await sock.sendMessage(chatId,{text:`🔄 *Link Revoked!*\nNew link:\nhttps://chat.whatsapp.com/${code}`},{quoted:msg});
          } catch { await sock.sendMessage(chatId,{text:"❌ Failed — bot must be admin."},{quoted:msg}); }
          continue;
        }

        // ── GCDESC ──
        if (isCmd(text,"gcdesc")) {
          if (!isGroup) { await sock.sendMessage(chatId,{text:"❌ Groups only."},{quoted:msg}); continue; }
          const desc = getArg(text);
          if (!desc) { await sock.sendMessage(chatId,{text:`⚠️ Usage: ${PREFIX}gcdesc <text>`},{quoted:msg}); continue; }
          try {
            await sock.groupUpdateDescription(chatId, desc);
            await sock.sendMessage(chatId,{text:`✅ *Description Updated!*\n\n📝 ${desc}`},{quoted:msg});
          } catch { await sock.sendMessage(chatId,{text:"❌ Failed — bot must be admin."},{quoted:msg}); }
          continue;
        }

        // ── GCLOCK / GCUNLOCK ──
        if (isCmd(text,"gclock")) {
          if (!isGroup) { await sock.sendMessage(chatId,{text:"❌ Groups only."},{quoted:msg}); continue; }
          try {
            await sock.groupSettingUpdate(chatId,"announcement"); // only admins can send
            await sock.sendMessage(chatId,{text:"🔒 *Group Locked!*\nOnly admins can send messages."},{quoted:msg});
          } catch { await sock.sendMessage(chatId,{text:"❌ Failed — bot must be admin."},{quoted:msg}); }
          continue;
        }
        if (isCmd(text,"gcunlock")) {
          if (!isGroup) { await sock.sendMessage(chatId,{text:"❌ Groups only."},{quoted:msg}); continue; }
          try {
            await sock.groupSettingUpdate(chatId,"not_announcement"); // everyone can send
            await sock.sendMessage(chatId,{text:"🔓 *Group Unlocked!*\nEveryone can send messages."},{quoted:msg});
          } catch { await sock.sendMessage(chatId,{text:"❌ Failed — bot must be admin."},{quoted:msg}); }
          continue;
        }

        // ── GCMUTE / GCUNMUTE ──
        if (isCmd(text,"gcmute")) {
          if (!isGroup) { await sock.sendMessage(chatId,{text:"❌ Groups only."},{quoted:msg}); continue; }
          try {
            // Mute for 8 hours
            await sock.chatModify({ mute: 8*60*60*1000 }, chatId);
            await sock.sendMessage(chatId,{text:"🔇 *Group Muted!* (8 hours)\nUse /gcunmute to unmute."},{quoted:msg});
          } catch { await sock.sendMessage(chatId,{text:"❌ Failed to mute."},{quoted:msg}); }
          continue;
        }
        if (isCmd(text,"gcunmute")) {
          if (!isGroup) { await sock.sendMessage(chatId,{text:"❌ Groups only."},{quoted:msg}); continue; }
          try {
            await sock.chatModify({ mute: null }, chatId);
            await sock.sendMessage(chatId,{text:"🔔 *Group Unmuted!*"},{quoted:msg});
          } catch { await sock.sendMessage(chatId,{text:"❌ Failed to unmute."},{quoted:msg}); }
          continue;
        }

        // ── ADD ──
        if (isCmd(text,"add")) {
          if (!isGroup) { await sock.sendMessage(chatId,{text:"❌ Groups only."},{quoted:msg}); continue; }
          let num = getArg(text).replace(/[^0-9]/g,"");
          if (!num) { await sock.sendMessage(chatId,{text:`⚠️ Usage: ${PREFIX}add <number>\nExample: ${PREFIX}add 919876543210`},{quoted:msg}); continue; }
          const jidToAdd = `${num}@s.whatsapp.net`;
          try {
            const res = await sock.groupParticipantsUpdate(chatId,[jidToAdd],"add");
            const status = res?.[0]?.status;
            if (status === "200") {
              await sock.sendMessage(chatId,{text:`✅ *Added:* @${num}`,mentions:[jidToAdd]},{quoted:msg});
            } else if (status === "403") {
              await sock.sendMessage(chatId,{text:`❌ @${num} has private group settings — can't be added.\nUse invite link instead.`,mentions:[jidToAdd]},{quoted:msg});
            } else {
              await sock.sendMessage(chatId,{text:`⚠️ Status: ${status||"unknown"} for @${num}`,mentions:[jidToAdd]},{quoted:msg});
            }
          } catch(e) { await sock.sendMessage(chatId,{text:`❌ Failed: ${e.message}`},{quoted:msg}); }
          continue;
        }

        // ── KICK ──
        if (isCmd(text,"kick")) {
          if (!isGroup) { await sock.sendMessage(chatId,{text:"❌ Groups only."},{quoted:msg}); continue; }
          const ctx = msg.message?.extendedTextMessage?.contextInfo;
          if (!ctx?.participant) { await sock.sendMessage(chatId,{text:"⚠️ Reply to the user you want to kick."},{quoted:msg}); continue; }
          const target = ctx.participant;
          try {
            await sock.groupParticipantsUpdate(chatId,[target],"remove");
            await sock.sendMessage(chatId,{text:`👢 *Kicked:* @${target.split("@")[0]}`,mentions:[target]},{quoted:msg});
          } catch { await sock.sendMessage(chatId,{text:"❌ Failed — bot must be admin."},{quoted:msg}); }
          continue;
        }

        // ── PROMOTE ──
        if (isCmd(text,"promote")) {
          if (!isGroup) { await sock.sendMessage(chatId,{text:"❌ Groups only."},{quoted:msg}); continue; }
          const ctx = msg.message?.extendedTextMessage?.contextInfo;
          if (!ctx?.participant) { await sock.sendMessage(chatId,{text:"⚠️ Reply to the user you want to promote."},{quoted:msg}); continue; }
          const target = ctx.participant;
          try {
            await sock.groupParticipantsUpdate(chatId,[target],"promote");
            await sock.sendMessage(chatId,{text:`👑 *Promoted to Admin:* @${target.split("@")[0]}`,mentions:[target]},{quoted:msg});
          } catch { await sock.sendMessage(chatId,{text:"❌ Failed — bot must be admin."},{quoted:msg}); }
          continue;
        }

        // ── DEMOTE ──
        if (isCmd(text,"demote")) {
          if (!isGroup) { await sock.sendMessage(chatId,{text:"❌ Groups only."},{quoted:msg}); continue; }
          const ctx = msg.message?.extendedTextMessage?.contextInfo;
          if (!ctx?.participant) { await sock.sendMessage(chatId,{text:"⚠️ Reply to the user you want to demote."},{quoted:msg}); continue; }
          const target = ctx.participant;
          try {
            await sock.groupParticipantsUpdate(chatId,[target],"demote");
            await sock.sendMessage(chatId,{text:`📉 *Demoted from Admin:* @${target.split("@")[0]}`,mentions:[target]},{quoted:msg});
          } catch { await sock.sendMessage(chatId,{text:"❌ Failed — bot must be admin."},{quoted:msg}); }
          continue;
        }

        // ── KICKALL ──
        if (isCmd(text,"kickall")) {
          if (!isGroup) { await sock.sendMessage(chatId,{text:"❌ Groups only."},{quoted:msg}); continue; }
          if (!isOwner(sender)) { await sock.sendMessage(chatId,{text:"❌ Only Owner."},{quoted:msg}); continue; }
          try {
            const meta = await sock.groupMetadata(chatId);
            const botJid = sock.user?.id;
            const nonAdmins = meta.participants
              .filter(p => !p.admin && bare(p.id) !== bare(botJid))
              .map(p => p.id);
            if (!nonAdmins.length) { await sock.sendMessage(chatId,{text:"✅ No non-admins to kick!"},{quoted:msg}); continue; }
            await sock.sendMessage(chatId,{text:`⚠️ *Kicking ${nonAdmins.length} non-admins...*`},{quoted:msg});
            // Kick in batches of 5 to avoid rate limits
            for (let i = 0; i < nonAdmins.length; i += 5) {
              const batch = nonAdmins.slice(i, i+5);
              await sock.groupParticipantsUpdate(chatId, batch, "remove").catch(()=>{});
              await sleep(1000);
            }
            await sock.sendMessage(chatId,{text:`✅ *Kicked ${nonAdmins.length} non-admins!*`},{quoted:msg});
          } catch(e) { await sock.sendMessage(chatId,{text:`❌ Failed: ${e.message}`},{quoted:msg}); }
          continue;
        }

        // ── TAGALL ──
        if (isCmd(text,"tagall")) {
          if (!isGroup) { await sock.sendMessage(chatId,{text:"❌ Groups only."},{quoted:msg}); continue; }
          try {
            const meta = await sock.groupMetadata(chatId);
            const mentions = meta.participants.map(p=>p.id);
            const tags = meta.participants.map(p=>`@${p.id.split("@")[0]}`).join(" ");
            const header = getArg(text) || "📢 *ATTENTION EVERYONE!*";
            await sock.sendMessage(chatId,{text:`${header}\n\n${tags}`,mentions},{quoted:msg});
          } catch(e) { await sock.sendMessage(chatId,{text:`❌ Failed: ${e.message}`},{quoted:msg}); }
          continue;
        }

        // ── ADMINLIST ──
        if (isCmd(text,"adminlist")) {
          if (!isGroup) { await sock.sendMessage(chatId,{text:"❌ Groups only."},{quoted:msg}); continue; }
          try {
            const meta = await sock.groupMetadata(chatId);
            const admins = meta.participants.filter(p=>p.admin);
            const mentions = admins.map(p=>p.id);
            const list = admins.map(p=>`${p.admin==="superadmin"?"🌟":"👑"} @${p.id.split("@")[0]}`).join("\n");
            await sock.sendMessage(chatId,{
              text:`👑 *Admins in ${meta.subject}:*\n\n${list||"None"}\n\n🔢 Total: ${admins.length}`,
              mentions
            },{quoted:msg});
          } catch(e) { await sock.sendMessage(chatId,{text:`❌ Failed: ${e.message}`},{quoted:msg}); }
          continue;
        }

        // ── END GC MANAGEMENT ──

        // ── SUDO MANAGEMENT ──
        if (isCmd(text,"addsudo")) {
          if (!isOwner(sender)) { await sock.sendMessage(chatId,{text:"❌ Only Owner."},{quoted:msg}); continue; }
          const ctx=msg.message?.extendedTextMessage?.contextInfo;
          if (!ctx?.participant) { await sock.sendMessage(chatId,{text:"⚠️ Reply to a user"},{quoted:msg}); continue; }
          const uid=bare(ctx.participant); SUDO_USERS.add(uid); saveSudo();
          await sock.sendMessage(chatId,{text:`✅ SUDO added: @${uid.split("@")[0]}`},{quoted:msg,mentions:[ctx.participant]}); continue;
        }
        if (isCmd(text,"delsudo")) {
          if (!isOwner(sender)) { await sock.sendMessage(chatId,{text:"❌ Only Owner."},{quoted:msg}); continue; }
          const ctx=msg.message?.extendedTextMessage?.contextInfo;
          if (!ctx?.participant) { await sock.sendMessage(chatId,{text:"⚠️ Reply to a user"},{quoted:msg}); continue; }
          const uid=bare(ctx.participant); SUDO_USERS.delete(uid); saveSudo();
          await sock.sendMessage(chatId,{text:`🗑 SUDO removed: @${uid.split("@")[0]}`},{quoted:msg,mentions:[ctx.participant]}); continue;
        }
        if (isCmd(text,"listsudo")) {
          const list=[...SUDO_USERS].map(u=>`👑 ${u}`).join("\n");
          await sock.sendMessage(chatId,{text:`👑 *SUDO Users:*\n${list||"None"}`},{quoted:msg}); continue;
        }

        // ── PAIR (add new bot) ──
        if (isCmd(text,"pair")) {
          if (!isOwner(sender)) { await sock.sendMessage(chatId,{text:"❌ Only Owner can pair new bots."},{quoted:msg}); continue; }
          let phone = getArg(text).replace(/[^0-9]/g,"");
          if (!phone || phone.length < 7) {
            await sock.sendMessage(chatId,{text:`⚠️ Usage: ${PREFIX}pair <number>\nExample: ${PREFIX}pair 919876543210`},{quoted:msg}); continue;
          }
          const nextId = allSocks.filter(Boolean).length + 1;
          if (nextId > MAX_BOTS) {
            await sock.sendMessage(chatId,{text:`❌ Max bots reached (${MAX_BOTS}). Increase MAX_BOTS in config to add more.`},{quoted:msg}); continue;
          }
          await sock.sendMessage(chatId,{
            text:
              `╔══════════════════════════════╗\n` +
              `║  🤖  P A I R I N G  B O T    ║\n` +
              `╚══════════════════════════════╝\n\n` +
              `📱 *Number:* ${phone}\n` +
              `🔢 *Bot Slot:* ${nextId}\n\n` +
              `⏳ Generating pair code, please wait...`
          },{quoted:msg});
          try {
            // Start a new bot session for the given slot
            const authDir = `./auth_bot_${nextId}`;
            const { state, saveCreds } = await useMultiFileAuthState(authDir);
            const { version } = await fetchLatestBaileysVersion();
            const newSock = makeWASocket({ auth: state, version, printQRInTerminal: false });
            newSock.ev.on("creds.update", saveCreds);
            allSocks[nextId - 1] = newSock;

            // Request pair code for the given phone number
            await sleep(2000); // small wait for socket to initialise
            const code = await newSock.requestPairingCode(phone);
            const fmt = code.match(/.{1,4}/g).join("-");

            await sock.sendMessage(chatId,{
              text:
                `╔══════════════════════════════╗\n` +
                `║   🔑  P A I R   C O D E      ║\n` +
                `╠══════════════════════════════╣\n` +
                `║       *${fmt}*       ║\n` +
                `╚══════════════════════════════╝\n\n` +
                `📲 *Steps:*\n` +
                `1️⃣  Open WhatsApp on *${phone}*\n` +
                `2️⃣  Go to ⋮ → *Linked Devices*\n` +
                `3️⃣  Tap *Link with Phone Number*\n` +
                `4️⃣  Enter the code above ☝️\n\n` +
                `✅ Bot *${nextId}* will come online once linked!`
            },{quoted:msg});

            // Wire up reconnect + message handler for the new socket
            newSock.ev.on("connection.update", async ({ connection, lastDisconnect: ld }) => {
              if (connection === "open") log(`✅ BOT ${nextId} (paired via command) — ONLINE`);
              if (connection === "close" && ld?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                log(`🔄 BOT ${nextId} reconnecting...`);
                startBot(nextId);
              }
            });

          } catch (err) {
            await sock.sendMessage(chatId,{text:`❌ Pair failed: ${err?.message || err}`},{quoted:msg});
          }
          continue;
        }

      } catch (err) {
        log(`❌ Error:`, err?.message || err);
      }
    }
  });
}

/* ============ START ============ */
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question(`\n✦ INFINITY BOT V4 ✦\nHow many bots? (1–${MAX_BOTS}): `, n => {
  const c = parseInt(n);
  if (!c || c < 1 || c > MAX_BOTS) { console.log("❌ Invalid. Exiting."); process.exit(1); }
  rl.close();
  for (let i = 1; i <= c; i++) startBot(i);
});
