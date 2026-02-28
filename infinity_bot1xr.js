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

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require("@whiskeysockets/baileys");

/* ============ CONFIG ============ */
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
const PAIRS_FILE    = `${DATA_DIR}/pairs.json`;

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

/* ============ PAIRED NUMBERS PERSISTENCE ============ */
// pairs.json: { "1": "919876543210", "2": "911234567890", ... }
let PAIRED_NUMBERS = loadJSON(PAIRS_FILE, {});
function savePairs() { saveJSON(PAIRS_FILE, PAIRED_NUMBERS); }
function recordPair(slot, phone) { PAIRED_NUMBERS[String(slot)] = phone; savePairs(); }
function removePair(slot)        { delete PAIRED_NUMBERS[String(slot)]; savePairs(); }
function getPairedNumbers()      { return Object.entries(PAIRED_NUMBERS).map(([s, p]) => `Slot ${s}: ${p}`); }

/* ============ 🩸 BAKA ECONOMY SYSTEM ============ */
const ECONOMY_FILE   = `${DATA_DIR}/economy.json`;
const ECO_DAILY_FILE = `${DATA_DIR}/eco_daily.json`;
const ECO_PROT_FILE  = `${DATA_DIR}/eco_protect.json`;

let economy    = loadJSON(ECONOMY_FILE,   {});
let dailyLog   = loadJSON(ECO_DAILY_FILE, {});
let protection = loadJSON(ECO_PROT_FILE,  {});

function saveEco()   { saveJSON(ECONOMY_FILE,   economy); }
function saveDaily() { saveJSON(ECO_DAILY_FILE, dailyLog); }
function saveProt()  { saveJSON(ECO_PROT_FILE,  protection); }

function getEco(jid) {
  const b = bare(jid);
  if (!economy[b]) economy[b] = { bal: 0, kills: 0, dead: false };
  return economy[b];
}
function isProtected(jid) {
  const b = bare(jid);
  return protection[b] && protection[b] > Date.now();
}
function fmt$(n) { return `$${Number(n).toLocaleString()}`; }

const ECO_DAILY_AMT = 1000;
const ECO_ROB_MAX   = 10000;
const ECO_ROB_TAX   = 0.10;
const ECO_GIVE_TAX  = 0.10;
const ECO_KILL_MIN  = 100;
const ECO_KILL_MAX  = 200;
const ECO_PROT_COST = 500;
const ECO_PROT_MS   = 86400000;

/* ─── MINI GAME STATE ─── */
const ecoGames = new Map(); // key → game session

/* ============ SESSION STATE ============ */
const group_tasks       = new Map();
const infinity_tasks    = new Map();
const spam_tasks        = new Map();
const react_tasks       = new Map(); // chatId -> emoji string (legacy emojispam)
const domain_tasks      = new Map();
const slide_targets     = new Set();
const slidespam_targets = new Set();
const YTS_CACHE         = new Map();
const VIDEO_REQUESTS    = new Map();
const TTS_LANG          = new Map();
const START_TIME        = Date.now();
const allSocks          = [];

// ── NEW REACT / WELCOME STATE ──
const autoreact_chats  = new Set(); // chatId → random react on every msg
const heartreact_chats = new Set(); // chatId → ❤️ react on every msg
const reactlock_map    = new Map(); // chatId → Map<bareJid, emoji>
const welcome_chats    = new Set(); // chatId → send welcome on join

const RANDOM_REACTS = [
  "❤️","🔥","😂","😮","😢","👍","🎉","🥰","😍","💯",
  "✨","🙌","👏","💀","😭","🤣","😱","🤩","😎","💪",
  "🫶","🥳","😝","🤯","💫","⚡","🌟","🎀","💘","🦋"
];

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

// DOMAIN EXPANSION — ☢️ NUCLEAR EDITION — ZERO MERCY
// Each bot runs 3 INDEPENDENT workers simultaneously
// Each worker fires waves of 50 requests, awaits, then fires again instantly
// Waves are small enough to never block the event loop — connection stays alive
// Watcher sleeps 10ms between checks (just enough to not choke the socket)
function startDomainExpansion(socks, chatId, base, mode) {
  stopTasks(domain_tasks, chatId);
  const pool = mode === "ncemo" ? NCEMO_EMOJIS
             : mode === "infinity" ? INFINITY_TEXTS
             : RAID_TEXTS;

  const WORKERS_PER_BOT = 3;  // 3 independent loops per bot
  const BURST_SIZE      = 50; // 50 per burst — fast but event loop stays alive

  const allWorkers = [];

  for (const sock of socks) {
    for (let w = 0; w < WORKERS_PER_BOT; w++) {
      let i = (w * 31) % pool.length;
      const worker = makeWorker(async () => {
        const burst = [];
        for (let j = 0; j < BURST_SIZE; j++) {
          burst.push(
            sock.groupUpdateSubject(chatId, `${base} ${pool[(i + j) % pool.length]}`).catch(() => {})
          );
        }
        i = (i + BURST_SIZE) % pool.length;
        await Promise.all(burst); // await each burst so event loop gets a tick
      });
      allWorkers.push(worker);
    }
  }

  // Watcher: 10ms sleep — fast enough to catch any revert, safe enough to not crash
  let watching = true;
  (async () => {
    while (watching) {
      try {
        await sleep(10);
        if (!watching) break;
        const meta = await socks[0]?.groupMetadata(chatId).catch(() => null);
        if (meta?.subject && !meta.subject.toLowerCase().includes(base.toLowerCase())) {
          const revertBurst = [];
          for (const s of socks) {
            for (let r = 0; r < 50; r++) {
              revertBurst.push(s.groupUpdateSubject(chatId, `${base} 😈♾️`).catch(() => {}));
            }
          }
          await Promise.all(revertBurst);
        }
      } catch {}
    }
  })();

  domain_tasks.set(chatId, [
    ...allWorkers,
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
  ⌁ ${PREFIX}autoreact         » Random react on every msg
  ⌁ ${PREFIX}heartreact on/off » ❤️ react on every msg
  ⌁ ${PREFIX}reactlock <emoji> » React on specific user(s)
  ⌁ ${PREFIX}stopreactlock     » Remove locked reacts
  ⌁ ${PREFIX}stopautoreact     » Stop auto reacts

◤━━━━━━━━━━━━━━━━━━━━━━━━◥
  🎉  G C  F E A T U R E S
◣━━━━━━━━━━━━━━━━━━━━━━━━◢
  ⌁ ${PREFIX}welcome on/off    » Welcome new members

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
  🩸  B A K A  E C O N O M Y
◣━━━━━━━━━━━━━━━━━━━━━━━━◢
  ⌁ ${PREFIX}claim / ${PREFIX}daily / ${PREFIX}bal
  ⌁ ${PREFIX}rob / ${PREFIX}kill / ${PREFIX}revive
  ⌁ ${PREFIX}protect / ${PREFIX}give
  ⌁ ${PREFIX}toprich / ${PREFIX}topkill
  ⌁ ${PREFIX}ecohelp        » Full economy guide

◤━━━━━━━━━━━━━━━━━━━━━━━━◥
  🎮  M I N I  G A M E S
◣━━━━━━━━━━━━━━━━━━━━━━━━◢
  ⌁ ${PREFIX}coinflip <bet> <h/t>
  ⌁ ${PREFIX}dice <bet> <1-6>
  ⌁ ${PREFIX}slots <bet>
  ⌁ ${PREFIX}rps <bet> <r/p/s>

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
  ⌁ ${PREFIX}pair <number>   » Add unlimited bot slots
  ⌁ ${PREFIX}listpairs       » Show saved paired numbers
  ⌁ ${PREFIX}removepair <n>  » Remove saved number by slot

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

  // ── WELCOME on new member join ──
  sock.ev.on("group-participants.update", async ({ id: chatId, participants, action }) => {
    if (action !== "add") return;
    if (!welcome_chats.has(chatId)) return;
    try {
      const meta = await sock.groupMetadata(chatId);
      for (const jid of participants) {
        const num = jid.split("@")[0];
        const welcomeText =
          `✦ *Welcome to ${meta.subject}* ✦\n\n` +
          `👤 @${num}\n\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `🌟 Glad to have you here!\n` +
          `📌 Read the group rules.\n` +
          `🤝 Respect everyone.\n` +
          `━━━━━━━━━━━━━━━━━━\n\n` +
          `🎉 *You're member #${meta.participants.length}*`;
        await sock.sendMessage(chatId, {
          text: welcomeText,
          mentions: [jid]
        });
      }
    } catch {}
  });

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

        // ── AUTO REACT ENGINE (runs on ALL bots) ──
        if (!msg.key.fromMe && msg.key.id && isGroup) {
          const senderBare = bare(sender);

          // 1. heartreact — ❤️ on everyone
          if (heartreact_chats.has(chatId)) {
            try { await sock.sendMessage(chatId, { react: { text: "❤️", key: msg.key } }); } catch {}
          }
          // 2. autoreact — random emoji on everyone (skip if heartreact already fired)
          else if (autoreact_chats.has(chatId)) {
            const r = RANDOM_REACTS[Math.floor(Math.random() * RANDOM_REACTS.length)];
            try { await sock.sendMessage(chatId, { react: { text: r, key: msg.key } }); } catch {}
          }

          // 3. reactlock — emoji locked to specific users (runs independently)
          if (reactlock_map.has(chatId)) {
            const lockMap = reactlock_map.get(chatId);
            if (lockMap.has(senderBare)) {
              const emoji = lockMap.get(senderBare);
              try { await sock.sendMessage(chatId, { react: { text: emoji, key: msg.key } }); } catch {}
            }
          }

          // 4. legacy emojispam react
          if (react_tasks.has(chatId)) {
            try { await sock.sendMessage(chatId, { react: { text: react_tasks.get(chatId), key: msg.key } }); } catch {}
          }
        }

        // SLIDE auto-reply (runs on ALL bots)
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

        // ── Only Bot #1 sends command replies ──
        if (botId !== 1) continue;

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
            await sock.sendMessage(chatId, { text: "Hat Garib 🤡🤬" }, { quoted: msg });
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
            `✨ Auto React: ${autoreact_chats.size} chats\n` +
            `❤️ Heart React: ${heartreact_chats.size} chats\n` +
            `🔒 React Lock: ${reactlock_map.size} chats\n` +
            `🎉 Welcome: ${welcome_chats.size} chats\n` +
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

        // ── EMOJI SPAM (legacy) ──
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

        // ── AUTOREACT (random emoji on everyone's messages) ──
        if (isCmd(text,"autoreact")) {
          if (autoreact_chats.has(chatId)) {
            autoreact_chats.delete(chatId);
            await sock.sendMessage(chatId,{text:"🛑 *Auto React OFF*"},{quoted:msg});
          } else {
            autoreact_chats.add(chatId);
            heartreact_chats.delete(chatId); // disable heart if active
            await sock.sendMessage(chatId,{text:`✨ *Auto React ON*\nReacting every message with random emojis!\nStop: ${PREFIX}stopautoreact`},{quoted:msg});
          }
          continue;
        }
        if (isCmd(text,"stopautoreact")) {
          autoreact_chats.delete(chatId);
          heartreact_chats.delete(chatId);
          await sock.sendMessage(chatId,{text:"🛑 *Auto React OFF*"},{quoted:msg}); continue;
        }

        // ── HEARTREACT (❤️ on everyone's messages) ──
        if (isCmd(text,"heartreact")) {
          const arg = getArg(text).trim().toLowerCase();
          if (arg === "on") {
            heartreact_chats.add(chatId);
            autoreact_chats.delete(chatId); // disable random if active
            await sock.sendMessage(chatId,{text:`❤️ *Heart React ON*\nReacting every message with ❤️\nTurn off: ${PREFIX}heartreact off`},{quoted:msg});
          } else {
            heartreact_chats.delete(chatId);
            await sock.sendMessage(chatId,{text:"🛑 *Heart React OFF*"},{quoted:msg});
          }
          continue;
        }

        // ── REACTLOCK (lock emoji reaction on specific user/s) ──
        // Usage: /reactlock 😍 @user1 @user2  OR reply to a user
        if (isCmd(text,"reactlock")) {
          const args = getArg(text).trim().split(/\s+/);
          const emoji = args[0];
          if (!emoji) {
            await sock.sendMessage(chatId,{text:`⚠️ Usage: ${PREFIX}reactlock <emoji> @mention...\nOr reply to a user with ${PREFIX}reactlock <emoji>`},{quoted:msg}); continue;
          }

          // Collect targets: mentions + replied-to user
          const targets = [];
          const msgMentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
          targets.push(...msgMentions.map(j => bare(j)));
          const replied = msg.message?.extendedTextMessage?.contextInfo?.participant;
          if (replied) targets.push(bare(replied));

          if (!targets.length) {
            await sock.sendMessage(chatId,{text:`⚠️ Mention at least one user or reply to someone.\nUsage: ${PREFIX}reactlock <emoji> @user`},{quoted:msg}); continue;
          }

          if (!reactlock_map.has(chatId)) reactlock_map.set(chatId, new Map());
          const lockMap = reactlock_map.get(chatId);
          for (const t of targets) lockMap.set(t, emoji);

          const names = targets.map(t => `@${t.split("@")[0]}`).join(", ");
          await sock.sendMessage(chatId,{
            text:`🔒 *React Lock ON*\n${emoji} → ${names}`,
            mentions: targets.map(t => t.includes("@") ? t : t + "@s.whatsapp.net")
          },{quoted:msg});
          continue;
        }

        // ── STOPREACTLOCK ──
        if (isCmd(text,"stopreactlock")) {
          reactlock_map.delete(chatId);
          await sock.sendMessage(chatId,{text:"🔓 *React Lock OFF*"},{quoted:msg}); continue;
        }

        // ── WELCOME on/off ──
        if (isCmd(text,"welcome")) {
          if (!isGroup) { await sock.sendMessage(chatId,{text:"❌ Groups only."},{quoted:msg}); continue; }
          const arg = getArg(text).trim().toLowerCase();
          if (arg === "on") {
            welcome_chats.add(chatId);
            await sock.sendMessage(chatId,{text:"🎉 *Welcome Messages ON*\nNew members will be greeted automatically!"},{quoted:msg});
          } else {
            welcome_chats.delete(chatId);
            await sock.sendMessage(chatId,{text:"🛑 *Welcome Messages OFF*"},{quoted:msg});
          }
          continue;
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

        // ══════════════════════════════════════════════
        // ── 🩸 BAKA ECONOMY SYSTEM ──
        // ══════════════════════════════════════════════

        // ── /claim — register in economy ──
        if (isCmd(text,"claim")) {
          const b = bare(sender);
          if (economy[b]) {
            await sock.sendMessage(chatId,{text:`✅ *Already Registered!*\n💰 Your balance: ${fmt$(economy[b].bal)}`},{quoted:msg}); continue;
          }
          economy[b] = { bal: 0, kills: 0, dead: false };
          saveEco();
          await sock.sendMessage(chatId,{
            text:
              `╔══════════════════════════╗\n`+
              `║  🩸  B A K A  E C O N O M Y ║\n`+
              `╚══════════════════════════╝\n\n`+
              `✅ *@${b.split("@")[0]} joined the economy!*\n`+
              `💰 Starting Balance: ${fmt$(0)}\n\n`+
              `👉 Use /daily to claim $${ECO_DAILY_AMT} every 24h`,
            mentions:[sender]
          },{quoted:msg}); continue;
        }

        // ── /daily ──
        if (isCmd(text,"daily")) {
          const b = bare(sender);
          if (!economy[b]) { await sock.sendMessage(chatId,{text:`⚠️ Register first with /claim`},{quoted:msg}); continue; }
          const now = Date.now();
          const last = dailyLog[b] || 0;
          const diff = now - last;
          const CD = 86400000;
          if (diff < CD) {
            const rem = CD - diff;
            const h = Math.floor(rem/3600000);
            const m = Math.floor((rem%3600000)/60000);
            await sock.sendMessage(chatId,{text:`⏳ *Daily already claimed!*\nCome back in *${h}h ${m}m* 🕐`},{quoted:msg}); continue;
          }
          economy[b].bal += ECO_DAILY_AMT;
          dailyLog[b] = now;
          saveEco(); saveDaily();
          await sock.sendMessage(chatId,{
            text:
              `🎁 *Daily Reward Claimed!*\n\n`+
              `💸 +${fmt$(ECO_DAILY_AMT)} added!\n`+
              `💰 New Balance: ${fmt$(economy[b].bal)}\n\n`+
              `⏰ Next claim: 24h from now`,
            mentions:[sender]
          },{quoted:msg}); continue;
        }

        // ── /bal ──
        if (isCmd(text,"bal")) {
          const ctx = msg.message?.extendedTextMessage?.contextInfo;
          const targetJid = ctx?.participant || sender;
          const b = bare(targetJid);
          if (!economy[b]) { await sock.sendMessage(chatId,{text:`⚠️ @${b.split("@")[0]} is not registered. Use /claim`,mentions:[targetJid]},{quoted:msg}); continue; }
          const eco = economy[b];
          const protLeft = protection[b] && protection[b] > Date.now()
            ? `🛡️ Protected for ${Math.ceil((protection[b]-Date.now())/3600000)}h` : "❌ No protection";
          await sock.sendMessage(chatId,{
            text:
              `╔══════════════════╗\n`+
              `║  💰  B A L A N C E  ║\n`+
              `╚══════════════════╝\n\n`+
              `👤 @${b.split("@")[0]}\n`+
              `💵 Balance : ${fmt$(eco.bal)}\n`+
              `💀 Kills   : ${eco.kills}\n`+
              `☠️ Status  : ${eco.dead ? "💀 DEAD" : "✅ Alive"}\n`+
              `${protLeft}`,
            mentions:[targetJid]
          },{quoted:msg}); continue;
        }

        // ── /rob (reply) <code> ──
        if (isCmd(text,"rob")) {
          const ctx = msg.message?.extendedTextMessage?.contextInfo;
          if (!ctx?.participant) { await sock.sendMessage(chatId,{text:`⚠️ Reply to a user to rob them.\nUsage: /rob <code>`},{quoted:msg}); continue; }
          const robber = bare(sender);
          const victim = bare(ctx.participant);
          if (robber === victim) { await sock.sendMessage(chatId,{text:"🤡 You can't rob yourself!"},{quoted:msg}); continue; }
          if (!economy[robber]) { await sock.sendMessage(chatId,{text:"⚠️ Register first with /claim"},{quoted:msg}); continue; }
          if (!economy[victim]) { await sock.sendMessage(chatId,{text:"❌ That user isn't registered."},{quoted:msg}); continue; }
          if (isProtected(victim)) {
            await sock.sendMessage(chatId,{text:`🛡️ *@${victim.split("@")[0]} is PROTECTED!*\nYour rob failed 😤`,mentions:[ctx.participant]},{quoted:msg}); continue;
          }
          // code check (for anti-bot): any 4+ char arg works
          const code = getArg(text).trim();
          if (!code || code.length < 4) {
            await sock.sendMessage(chatId,{text:`⚠️ Usage: /rob <code> (reply to target)\nExample: /rob baka123`},{quoted:msg}); continue;
          }
          const victimBal = economy[victim].bal;
          if (victimBal < 100) { await sock.sendMessage(chatId,{text:`💸 @${victim.split("@")[0]} is broke! Nothing to rob.`,mentions:[ctx.participant]},{quoted:msg}); continue; }
          const rawAmt = Math.min(victimBal, ECO_ROB_MAX);
          const tax = Math.floor(rawAmt * ECO_ROB_TAX);
          const gained = rawAmt - tax;
          economy[victim].bal -= rawAmt;
          economy[robber].bal += gained;
          saveEco();
          await sock.sendMessage(chatId,{
            text:
              `🦹 *ROB SUCCESSFUL!*\n\n`+
              `🎯 Robbed : @${victim.split("@")[0]}\n`+
              `💸 Stolen : ${fmt$(rawAmt)}\n`+
              `💰 Tax    : -${fmt$(tax)} (10%)\n`+
              `✅ You Got: ${fmt$(gained)}\n\n`+
              `💼 Your Balance: ${fmt$(economy[robber].bal)}`,
            mentions:[ctx.participant]
          },{quoted:msg}); continue;
        }

        // ── /kill (reply) ──
        if (isCmd(text,"kill")) {
          if (!isGroup) { await sock.sendMessage(chatId,{text:"❌ Groups only."},{quoted:msg}); continue; }
          const ctx = msg.message?.extendedTextMessage?.contextInfo;
          if (!ctx?.participant) { await sock.sendMessage(chatId,{text:"⚠️ Reply to a user to kill them."},{quoted:msg}); continue; }
          const killer = bare(sender);
          const victim = bare(ctx.participant);
          if (killer === victim) { await sock.sendMessage(chatId,{text:"😐 You can't kill yourself... or can you? Use /revive"},{quoted:msg}); continue; }
          if (!economy[killer]) { await sock.sendMessage(chatId,{text:"⚠️ Register first with /claim"},{quoted:msg}); continue; }
          if (!economy[victim]) { await sock.sendMessage(chatId,{text:"❌ That user isn't in the economy."},{quoted:msg}); continue; }
          if (isProtected(victim)) {
            await sock.sendMessage(chatId,{text:`🛡️ *@${victim.split("@")[0]} is PROTECTED!*\nYour attack bounced back! 😤`,mentions:[ctx.participant]},{quoted:msg}); continue;
          }
          if (economy[victim].dead) { await sock.sendMessage(chatId,{text:`💀 @${victim.split("@")[0]} is already dead!`,mentions:[ctx.participant]},{quoted:msg}); continue; }
          const reward = ECO_KILL_MIN + Math.floor(Math.random()*(ECO_KILL_MAX - ECO_KILL_MIN + 1));
          economy[victim].dead = true;
          economy[killer].bal += reward;
          economy[killer].kills += 1;
          saveEco();
          await sock.sendMessage(chatId,{
            text:
              `☠️ *KILL REGISTERED!*\n\n`+
              `🗡️ Killer : @${killer.split("@")[0]}\n`+
              `💀 Victim : @${victim.split("@")[0]}\n`+
              `💰 Reward : +${fmt$(reward)}\n`+
              `🩸 Total Kills: ${economy[killer].kills}\n\n`+
              `*@${victim.split("@")[0]} is now DEAD — use /revive to bring them back!*`,
            mentions:[sender, ctx.participant]
          },{quoted:msg}); continue;
        }

        // ── /revive ──
        if (isCmd(text,"revive")) {
          const ctx = msg.message?.extendedTextMessage?.contextInfo;
          const targetJid = ctx?.participant || sender;
          const b = bare(targetJid);
          if (!economy[b]) { await sock.sendMessage(chatId,{text:"⚠️ That user isn't registered.",mentions:[targetJid]},{quoted:msg}); continue; }
          if (!economy[b].dead) { await sock.sendMessage(chatId,{text:`✅ @${b.split("@")[0]} is already alive!`,mentions:[targetJid]},{quoted:msg}); continue; }
          economy[b].dead = false;
          saveEco();
          await sock.sendMessage(chatId,{
            text:`💚 *REVIVED!*\n\n@${b.split("@")[0]} has been brought back to life! ✨`,
            mentions:[targetJid]
          },{quoted:msg}); continue;
        }

        // ── /protect <days> ──
        if (isCmd(text,"protect")) {
          const b = bare(sender);
          if (!economy[b]) { await sock.sendMessage(chatId,{text:"⚠️ Register first with /claim"},{quoted:msg}); continue; }
          const days = parseInt(getArg(text)) || 1;
          const cost = ECO_PROT_COST * days;
          if (economy[b].bal < cost) {
            await sock.sendMessage(chatId,{text:`❌ Not enough money!\nProtection costs ${fmt$(ECO_PROT_COST)}/day\n${days}d = ${fmt$(cost)}\nYour balance: ${fmt$(economy[b].bal)}`},{quoted:msg}); continue;
          }
          economy[b].bal -= cost;
          const expiry = Date.now() + (ECO_PROT_MS * days);
          protection[b] = expiry;
          saveEco(); saveProt();
          await sock.sendMessage(chatId,{
            text:
              `🛡️ *PROTECTION ACTIVE!*\n\n`+
              `⏳ Duration : ${days} day(s)\n`+
              `💸 Cost : -${fmt$(cost)}\n`+
              `💰 Balance : ${fmt$(economy[b].bal)}\n`+
              `📅 Expires: ${new Date(expiry).toLocaleString()}`,
          },{quoted:msg}); continue;
        }

        // ── /give (reply) <amount> ──
        if (isCmd(text,"give")) {
          const ctx = msg.message?.extendedTextMessage?.contextInfo;
          if (!ctx?.participant) { await sock.sendMessage(chatId,{text:"⚠️ Reply to a user to give them money."},{quoted:msg}); continue; }
          const giver  = bare(sender);
          const recvr  = bare(ctx.participant);
          if (giver === recvr) { await sock.sendMessage(chatId,{text:"🤡 Can't give money to yourself!"},{quoted:msg}); continue; }
          if (!economy[giver]) { await sock.sendMessage(chatId,{text:"⚠️ Register first with /claim"},{quoted:msg}); continue; }
          if (!economy[recvr]) { await sock.sendMessage(chatId,{text:"❌ Receiver isn't registered."},{quoted:msg}); continue; }
          const amount = parseInt(getArg(text));
          if (!amount || amount < 1) { await sock.sendMessage(chatId,{text:"⚠️ Usage: /give <amount> (reply to user)"},{quoted:msg}); continue; }
          if (economy[giver].bal < amount) { await sock.sendMessage(chatId,{text:`❌ Insufficient funds!\nYour balance: ${fmt$(economy[giver].bal)}`},{quoted:msg}); continue; }
          const tax = Math.floor(amount * ECO_GIVE_TAX);
          const received = amount - tax;
          economy[giver].bal -= amount;
          economy[recvr].bal += received;
          saveEco();
          await sock.sendMessage(chatId,{
            text:
              `💝 *GIFT SENT!*\n\n`+
              `👤 From  : @${giver.split("@")[0]}\n`+
              `🎁 To    : @${recvr.split("@")[0]}\n`+
              `💸 Sent  : ${fmt$(amount)}\n`+
              `🏦 Tax   : -${fmt$(tax)} (10%)\n`+
              `✅ Recv  : ${fmt$(received)}\n\n`+
              `💰 Your Balance: ${fmt$(economy[giver].bal)}`,
            mentions:[sender, ctx.participant]
          },{quoted:msg}); continue;
        }

        // ── /toprich ──
        if (isCmd(text,"toprich")) {
          const top = Object.entries(economy)
            .filter(([,v]) => v.bal > 0)
            .sort((a,b) => b[1].bal - a[1].bal)
            .slice(0, 10);
          if (!top.length) { await sock.sendMessage(chatId,{text:"📊 No rich users yet!"},{quoted:msg}); continue; }
          const medals = ["🥇","🥈","🥉","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"];
          const list = top.map(([jid,v],i)=>`${medals[i]} @${jid.split("@")[0]} — ${fmt$(v.bal)}`).join("\n");
          const mentions = top.map(([jid])=>jid.includes("@") ? jid : jid+"@s.whatsapp.net");
          await sock.sendMessage(chatId,{
            text:`╔══════════════════════╗\n║  💰  T O P  R I C H  ║\n╚══════════════════════╝\n\n${list}`,
            mentions
          },{quoted:msg}); continue;
        }

        // ── /topkill ──
        if (isCmd(text,"topkill")) {
          const top = Object.entries(economy)
            .filter(([,v]) => v.kills > 0)
            .sort((a,b) => b[1].kills - a[1].kills)
            .slice(0, 10);
          if (!top.length) { await sock.sendMessage(chatId,{text:"☠️ No kills recorded yet!"},{quoted:msg}); continue; }
          const medals = ["🥇","🥈","🥉","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"];
          const list = top.map(([jid,v],i)=>`${medals[i]} @${jid.split("@")[0]} — ${v.kills} kills`).join("\n");
          const mentions = top.map(([jid])=>jid.includes("@") ? jid : jid+"@s.whatsapp.net");
          await sock.sendMessage(chatId,{
            text:`╔══════════════════════╗\n║  ☠️  T O P  K I L L S ║\n╚══════════════════════╝\n\n${list}`,
            mentions
          },{quoted:msg}); continue;
        }

        // ══════════════════════════════════════════════
        // ── 🎮 MINI GAMES ──
        // ══════════════════════════════════════════════

        // ── /coinflip <bet> <heads|tails> ──
        if (isCmd(text,"coinflip") || isCmd(text,"cf")) {
          const b = bare(sender);
          if (!economy[b]) { await sock.sendMessage(chatId,{text:"⚠️ Register first with /claim"},{quoted:msg}); continue; }
          const args = getArg(text).trim().toLowerCase().split(/\s+/);
          const bet  = parseInt(args[0]);
          const side = args[1];
          if (!bet || bet < 10 || !["heads","tails","h","t"].includes(side)) {
            await sock.sendMessage(chatId,{text:`🪙 *COIN FLIP*\nUsage: /coinflip <bet> <heads/tails>\nExample: /coinflip 500 heads\n\nMin bet: $10`},{quoted:msg}); continue;
          }
          if (economy[b].bal < bet) { await sock.sendMessage(chatId,{text:`❌ Not enough money! Balance: ${fmt$(economy[b].bal)}`},{quoted:msg}); continue; }
          const chosen   = (side === "h") ? "heads" : (side === "t") ? "tails" : side;
          const result   = Math.random() < 0.5 ? "heads" : "tails";
          const win      = chosen === result;
          economy[b].bal += win ? bet : -bet;
          saveEco();
          await sock.sendMessage(chatId,{
            text:
              `🪙 *COIN FLIP*\n\n`+
              `${result === "heads" ? "👑 HEADS" : "🐉 TAILS"}\n\n`+
              `You picked : *${chosen.toUpperCase()}*\n`+
              `Result     : *${result.toUpperCase()}*\n\n`+
              `${win ? `✅ *YOU WIN!* +${fmt$(bet)}` : `❌ *YOU LOSE!* -${fmt$(bet)}`}\n`+
              `💰 Balance: ${fmt$(economy[b].bal)}`,
          },{quoted:msg}); continue;
        }

        // ── /dice <bet> <1-6> ──
        if (isCmd(text,"dice")) {
          const b = bare(sender);
          if (!economy[b]) { await sock.sendMessage(chatId,{text:"⚠️ Register first with /claim"},{quoted:msg}); continue; }
          const args  = getArg(text).trim().split(/\s+/);
          const bet   = parseInt(args[0]);
          const guess = parseInt(args[1]);
          if (!bet || bet < 10 || !guess || guess < 1 || guess > 6) {
            await sock.sendMessage(chatId,{text:`🎲 *DICE ROLL*\nUsage: /dice <bet> <1-6>\nExample: /dice 200 4\n\nGuess the right number → win 5x!\nMin bet: $10`},{quoted:msg}); continue;
          }
          if (economy[b].bal < bet) { await sock.sendMessage(chatId,{text:`❌ Not enough money! Balance: ${fmt$(economy[b].bal)}`},{quoted:msg}); continue; }
          const roll   = Math.floor(Math.random()*6)+1;
          const diceEmoji = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣"];
          const win    = roll === guess;
          const payout = win ? bet * 5 : -bet;
          economy[b].bal += payout;
          saveEco();
          await sock.sendMessage(chatId,{
            text:
              `🎲 *DICE ROLL*\n\n`+
              `${diceEmoji[roll-1]} Rolled: *${roll}*\n`+
              `You guessed: *${guess}*\n\n`+
              `${win ? `🎉 *JACKPOT! +${fmt$(bet*5)}* (5x)` : `❌ *Wrong!* -${fmt$(bet)}`}\n`+
              `💰 Balance: ${fmt$(economy[b].bal)}`,
          },{quoted:msg}); continue;
        }

        // ── /slots <bet> ──
        if (isCmd(text,"slots")) {
          const b = bare(sender);
          if (!economy[b]) { await sock.sendMessage(chatId,{text:"⚠️ Register first with /claim"},{quoted:msg}); continue; }
          const bet = parseInt(getArg(text).trim());
          if (!bet || bet < 50) {
            await sock.sendMessage(chatId,{text:`🎰 *SLOT MACHINE*\nUsage: /slots <bet>\nExample: /slots 100\n\nMin bet: $50\n\n3 same → 10x | 2 same → 1x | else → lose`},{quoted:msg}); continue;
          }
          if (economy[b].bal < bet) { await sock.sendMessage(chatId,{text:`❌ Not enough money! Balance: ${fmt$(economy[b].bal)}`},{quoted:msg}); continue; }
          const symbols = ["🍒","🍋","🍊","🍇","⭐","💎","🔔","🃏"];
          const s1 = symbols[Math.floor(Math.random()*symbols.length)];
          const s2 = symbols[Math.floor(Math.random()*symbols.length)];
          const s3 = symbols[Math.floor(Math.random()*symbols.length)];
          let payout, result;
          if (s1 === s2 && s2 === s3) { payout = bet * 10; result = `🎉 *JACKPOT! 3x match! +${fmt$(payout)}*`; }
          else if (s1 === s2 || s2 === s3 || s1 === s3) { payout = bet; result = `✨ *2x match! +${fmt$(payout)}*`; }
          else { payout = -bet; result = `❌ *No match! -${fmt$(bet)}*`; }
          economy[b].bal += payout;
          saveEco();
          await sock.sendMessage(chatId,{
            text:
              `🎰 *SLOT MACHINE*\n\n`+
              `┌───────────────┐\n`+
              `│  ${s1}  ${s2}  ${s3}  │\n`+
              `└───────────────┘\n\n`+
              `${result}\n`+
              `💰 Balance: ${fmt$(economy[b].bal)}`,
          },{quoted:msg}); continue;
        }

        // ── /rps <bet> <rock|paper|scissors> ──
        if (isCmd(text,"rps")) {
          const b = bare(sender);
          if (!economy[b]) { await sock.sendMessage(chatId,{text:"⚠️ Register first with /claim"},{quoted:msg}); continue; }
          const args   = getArg(text).trim().toLowerCase().split(/\s+/);
          const bet    = parseInt(args[0]);
          const choice = args[1];
          const valid  = ["rock","paper","scissors","r","p","s"];
          if (!bet || bet < 10 || !valid.includes(choice)) {
            await sock.sendMessage(chatId,{text:`✊ *ROCK PAPER SCISSORS*\nUsage: /rps <bet> <rock/paper/scissors>\nExample: /rps 300 rock\n\nMin bet: $10`},{quoted:msg}); continue;
          }
          if (economy[b].bal < bet) { await sock.sendMessage(chatId,{text:`❌ Not enough money! Balance: ${fmt$(economy[b].bal)}`},{quoted:msg}); continue; }
          const map    = { r:"rock", p:"paper", s:"scissors" };
          const player = map[choice] || choice;
          const opts   = ["rock","paper","scissors"];
          const bot    = opts[Math.floor(Math.random()*3)];
          const emoji  = { rock:"✊", paper:"✋", scissors:"✌️" };
          let outcome, payout;
          if (player === bot) { outcome = "🤝 *DRAW!*"; payout = 0; }
          else if ((player==="rock"&&bot==="scissors")||(player==="paper"&&bot==="rock")||(player==="scissors"&&bot==="paper")) {
            outcome = `🏆 *YOU WIN! +${fmt$(bet)}*`; payout = bet;
          } else {
            outcome = `😔 *YOU LOSE! -${fmt$(bet)}*`; payout = -bet;
          }
          economy[b].bal += payout;
          saveEco();
          await sock.sendMessage(chatId,{
            text:
              `✊ *ROCK PAPER SCISSORS*\n\n`+
              `You  : ${emoji[player]} ${player}\n`+
              `Bot  : ${emoji[bot]} ${bot}\n\n`+
              `${outcome}\n`+
              `💰 Balance: ${fmt$(economy[b].bal)}`,
          },{quoted:msg}); continue;
        }

        // ── /ecohelp ──
        if (isCmd(text,"ecohelp")) {
          await sock.sendMessage(chatId,{
            text:
              `╔══════════════════════════════╗\n`+
              `║  🩸  B A K A  E C O N O M Y  ║\n`+
              `╚══════════════════════════════╝\n\n`+
              `◤━━━━━━━━━━━━━━━━━━━━━━━━◥\n`+
              `  💼  E C O N O M Y  C M D S\n`+
              `◣━━━━━━━━━━━━━━━━━━━━━━━━◢\n`+
              `  ⌁ /claim              » Join economy\n`+
              `  ⌁ /daily              » Claim $${ECO_DAILY_AMT}/day\n`+
              `  ⌁ /bal                » Check your balance\n`+
              `  ⌁ /bal (reply)        » Check friend's balance\n`+
              `  ⌁ /rob (reply) <code> » Rob max $${ECO_ROB_MAX} (10% tax)\n`+
              `  ⌁ /kill (reply)       » Kill: earn $${ECO_KILL_MIN}-$${ECO_KILL_MAX}\n`+
              `  ⌁ /revive (reply)     » Revive yourself or a friend\n`+
              `  ⌁ /protect <days>     » $${ECO_PROT_COST}/day shield\n`+
              `  ⌁ /give (reply) <amt> » Gift money (10% fee)\n`+
              `  ⌁ /toprich            » Top 10 richest\n`+
              `  ⌁ /topkill            » Top 10 killers\n\n`+
              `◤━━━━━━━━━━━━━━━━━━━━━━━━◥\n`+
              `  🎮  M I N I  G A M E S\n`+
              `◣━━━━━━━━━━━━━━━━━━━━━━━━◢\n`+
              `  ⌁ /coinflip <bet> <h/t>  » 2x payout\n`+
              `  ⌁ /dice <bet> <1-6>      » 5x jackpot\n`+
              `  ⌁ /slots <bet>           » 10x jackpot\n`+
              `  ⌁ /rps <bet> <r/p/s>     » 2x payout\n\n`+
              `╔══════════════════════════════╗\n`+
              `║  💸  All games need /claim   ║\n`+
              `╚══════════════════════════════╝`
          },{quoted:msg}); continue;
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
            const header = getArg(text) || "📢 *ATTENTION EVERYONE!*";
            const tags = meta.participants.map((p,idx) =>
              `${idx % 2 === 0 ? "⌁" : "⌁"} @${p.id.split("@")[0]}`
            ).join("\n");
            const msg_text =
              `╔═══════════════════════╗\n` +
              `║  📢  T A G  A L L  ║\n` +
              `╚═══════════════════════╝\n\n` +
              `${header}\n\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `${tags}\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
              `👥 *Total: ${meta.participants.length} members*`;
            await sock.sendMessage(chatId,{text:msg_text,mentions},{quoted:msg});
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
          await sock.sendMessage(chatId,{
            text:`🤖 *Pairing Bot ${nextId}*\n📱 ${phone}\n⏳ Generating code...`
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

            // ── Save paired number persistently ──
            recordPair(nextId, phone);
            log(`💾 Paired number saved — Slot ${nextId}: ${phone}`);

            await sock.sendMessage(chatId,{
              text:
                `🔑 *Pair Code — Bot ${nextId}*\n` +
                `\`${fmt}\`\n\n` +
                `📲 *${phone}* → WhatsApp → Linked Devices → Link with Phone Number\n` +
                `💾 Saved to slot *${nextId}*`
            },{quoted:msg});

            // Wire up reconnect + message handler for the new socket
            newSock.ev.on("connection.update", async ({ connection, lastDisconnect: ld }) => {
              if (connection === "open") log(`✅ BOT ${nextId} (paired via command) — ONLINE`);
              if (connection === "close") {
                if (ld?.error?.output?.statusCode === DisconnectReason.loggedOut) {
                  log(`🚪 BOT ${nextId} logged out — removing saved pair`);
                  removePair(nextId);
                } else {
                  log(`🔄 BOT ${nextId} reconnecting...`);
                  startBot(nextId);
                }
              }
            });

          } catch (err) {
            await sock.sendMessage(chatId,{text:`❌ Pair failed: ${err?.message || err}`},{quoted:msg});
          }
          continue;
        }

        // ── LISTPAIRS (show all saved paired numbers) ──
        if (isCmd(text,"listpairs")) {
          if (!isOwner(sender)) { await sock.sendMessage(chatId,{text:"❌ Only Owner."},{quoted:msg}); continue; }
          const list = getPairedNumbers();
          await sock.sendMessage(chatId,{
            text: list.length
              ? `💾 *Paired Numbers*\n\n` + list.map(l => `• ${l}`).join("\n")
              : "⚠️ No paired numbers saved yet."
          },{quoted:msg});
          continue;
        }

        // ── REMOVEPAIR <slot> (delete a saved number) ──
        if (isCmd(text,"removepair")) {
          if (!isOwner(sender)) { await sock.sendMessage(chatId,{text:"❌ Only Owner."},{quoted:msg}); continue; }
          const slot = getArg(text).trim();
          if (!slot || !PAIRED_NUMBERS[slot]) {
            await sock.sendMessage(chatId,{text:`⚠️ Usage: ${PREFIX}removepair <slot>\nNo saved number for slot *${slot || "?"}*`},{quoted:msg}); continue;
          }
          const old = PAIRED_NUMBERS[slot];
          removePair(slot);
          await sock.sendMessage(chatId,{text:`🗑 Removed paired number *${old}* from slot *${slot}*`},{quoted:msg});
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
rl.question(`\n✦ INFINITY BOT V4 ✦\nHow many bots?: `, n => {
  const c = parseInt(n);
  if (!c || c < 1) { console.log("❌ Invalid. Exiting."); process.exit(1); }
  rl.close();
  for (let i = 1; i <= c; i++) startBot(i);
});
