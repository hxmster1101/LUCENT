const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
  ChannelType
} = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// ============================================================
// LUCENT Discord Bot - All-in-one index.js
// Node.js 24+ / discord.js 14 / SQLite
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;
if (!TOKEN) {
  console.error('ERROR: Missing DISCORD_TOKEN (or TOKEN) in Railway Variables.');
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'lucent.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  guild_id TEXT PRIMARY KEY,
  payment_title TEXT DEFAULT 'LUCENT PAYMENT',
  payment_details TEXT DEFAULT 'เลือกช่องทางชำระเงินด้านล่าง',
  payment_channel_id TEXT,
  slip_channel_id TEXT,
  payment_review_channel_id TEXT,
  payment_banner TEXT,
  truewallet_name TEXT,
  truewallet_number TEXT,
  bank_name TEXT,
  bank_account_name TEXT,
  bank_number TEXT,
  qr_url TEXT,
  store_name TEXT DEFAULT 'LUCENT STORE',
  store_details TEXT DEFAULT 'สินค้าที่สามารถซื้อได้',
  store_channel_id TEXT,
  store_buy_label TEXT DEFAULT '🛒 ซื้อสินค้า',
  store_gift_label TEXT DEFAULT '🎁 แลกรางวัล',
  store_banner TEXT,
  gacha_name TEXT DEFAULT 'LUCENT GACHA',
  gacha_details TEXT DEFAULT 'ตู้สำหรับสุ่มกาชา',
  gacha_channel_id TEXT,
  gacha_banner TEXT,
  gacha_ticket_emoji TEXT DEFAULT '🎟️',
  gacha_ticket_name TEXT DEFAULT 'Gacha Ticket',
  gacha_button_label TEXT DEFAULT '🎲 สุ่มกาชา',
  gacha_loading_banner TEXT
);

CREATE TABLE IF NOT EXISTS users (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  coins REAL NOT NULL DEFAULT 0,
  salt INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  type TEXT NOT NULL CHECK(type IN ('ROLE','ITEM','TICKET')),
  price REAL NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  role_id TEXT,
  item_key TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS inventory (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id, item_key)
);

CREATE TABLE IF NOT EXISTS gifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  cost_salt INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('ROLE','ITEM')),
  stock INTEGER NOT NULL DEFAULT 0,
  role_id TEXT,
  item_key TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS gacha_rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  chance REAL NOT NULL DEFAULT 0,
  type TEXT NOT NULL CHECK(type IN ('ROLE','ITEM','COINS','SALT')),
  role_id TEXT,
  item_key TEXT,
  unlimited INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tickets (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS pending_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  coins REAL NOT NULL,
  amount REAL NOT NULL,
  slip_channel_id TEXT,
  slip_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at INTEGER NOT NULL
);
`);

function ensureGuild(guildId) {
  db.prepare(`INSERT OR IGNORE INTO settings (guild_id) VALUES (?)`).run(guildId);
}
function ensureUser(guildId, userId) {
  ensureGuild(guildId);
  db.prepare(`INSERT OR IGNORE INTO users (guild_id,user_id) VALUES (?,?)`).run(guildId,userId);
}
function getSettings(guildId) {
  ensureGuild(guildId);
  return db.prepare(`SELECT * FROM settings WHERE guild_id=?`).get(guildId);
}
function getUser(guildId, userId) {
  ensureUser(guildId,userId);
  return db.prepare(`SELECT * FROM users WHERE guild_id=? AND user_id=?`).get(guildId,userId);
}
function addCoins(guildId,userId,amount) {
  ensureUser(guildId,userId);
  db.prepare(`UPDATE users SET coins=coins+? WHERE guild_id=? AND user_id=?`).run(amount,guildId,userId);
}
function addSalt(guildId,userId,amount) {
  ensureUser(guildId,userId);
  db.prepare(`UPDATE users SET salt=salt+? WHERE guild_id=? AND user_id=?`).run(amount,guildId,userId);
}
function addInventory(guildId,userId,itemKey,itemName,qty) {
  ensureUser(guildId,userId);
  const old = db.prepare(`SELECT quantity FROM inventory WHERE guild_id=? AND user_id=? AND item_key=?`).get(guildId,userId,itemKey);
  if (old) {
    db.prepare(`UPDATE inventory SET quantity=quantity+?, item_name=? WHERE guild_id=? AND user_id=? AND item_key=?`)
      .run(qty,itemName,guildId,userId,itemKey);
  } else {
    db.prepare(`INSERT INTO inventory(guild_id,user_id,item_key,item_name,quantity) VALUES (?,?,?,?,?)`)
      .run(guildId,userId,itemKey,itemName,qty);
  }
}
function money(n) {
  return Number(n).toFixed(2);
}
function validUrl(v) {
  try { return !!v && /^https?:\/\//i.test(v) && new URL(v); } catch { return false; }
}
function isAdmin(member) {
  return member?.permissions?.has(PermissionFlagsBits.Administrator) ||
    member?.permissions?.has(PermissionFlagsBits.ManageGuild);
}
function safeName(s, fallback='item') {
  const x = String(s || fallback).trim().toLowerCase().replace(/[^a-z0-9ก-๙_-]+/gi,'_').slice(0,80);
  return x || fallback;
}
function clampText(s, n=1024) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0,n-1)+'…' : s;
}
function parsePositiveNumber(s) {
  const n = Number(String(s).replace(/,/g,'').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}
function parseNonNegativeInt(s) {
  const n = Number(String(s).replace(/,/g,'').trim());
  return Number.isInteger(n) && n >= 0 ? n : null;
}
function stockText(stock) {
  return stock < 0 ? 'ไม่จำกัด' : String(stock);
}
function findRoleByNameOrId(guild, rawName, fallbackId=null) {
  const byId = fallbackId ? guild.roles.cache.get(fallbackId) : null;
  if (byId) return byId;
  const wanted = String(rawName || '').trim();
  if (!wanted) return null;
  const exact = guild.roles.cache.find(r => r.name === wanted);
  if (exact) return exact;
  const mentionId = wanted.match(/<@&(\\d{15,25})>/)?.[1];
  if (mentionId) return guild.roles.cache.get(mentionId) || null;
  return null;
}
function makeBannerEmbed(title, description, banner, color=0x5865F2) {
  const e = new EmbedBuilder().setTitle(title).setDescription(description || '').setColor(color);
  if (validUrl(banner)) e.setImage(banner);
  return e;
}

// --------------------- Commands ---------------------
const commands = [
  new SlashCommandBuilder().setName('pymentsetting').setDescription('ตั้งค่าระบบเติมเงิน/บัญชีชำระเงิน'),
  new SlashCommandBuilder().setName('paymentsetting').setDescription('ตั้งค่าระบบเติมเงิน (ชื่อคำสั่งสำรอง)'),
  new SlashCommandBuilder().setName('startstore').setDescription('สร้าง/อัปเดตแผงเติมเงินในห้องที่ตั้งค่า'),
  new SlashCommandBuilder().setName('storesetup').setDescription('ตั้งค่าหน้าร้านค้า'),
  new SlashCommandBuilder().setName('storeadd').setDescription('เพิ่มสินค้าเข้าร้านและอัปเดตหน้าร้านทันที'),
  new SlashCommandBuilder().setName('gift').setDescription('ตั้งค่าปุ่มแลกรางวัลในหน้าร้าน'),
  new SlashCommandBuilder().setName('gachasetup').setDescription('ตั้งค่าตู้กาชา'),
  new SlashCommandBuilder().setName('gachastart').setDescription('สร้าง/อัปเดตหน้าตู้กาชา'),
  new SlashCommandBuilder().setName('gachareward').setDescription('เพิ่มรางวัลกาชา'),
  new SlashCommandBuilder().setName('gacharemove').setDescription('ลบรางวัลกาชา'),
  new SlashCommandBuilder().setName('addgift').setDescription('เพิ่มรางวัลที่ใช้เกลือแลก'),
  new SlashCommandBuilder().setName('bagpack').setDescription('ดูกระเป๋าและยอด Coins/เกลือ'),
  new SlashCommandBuilder().setName('setup').setDescription('ดูคำสั่งทั้งหมดของบอท')
].map(c => c.toJSON());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// --------------------- UI builders ---------------------
function paymentPanel(guild) {
  const s = getSettings(guild.id);
  const methods = [];
  if (s.truewallet_name && s.truewallet_number) methods.push({label:'TrueMoney Wallet', value:'truewallet'});
  if (s.bank_name && s.bank_account_name && s.bank_number) methods.push({label:'ธนาคาร', value:'bank'});
  if (s.qr_url) methods.push({label:'QR Code', value:'qr'});
  const embed = makeBannerEmbed(
    s.payment_title || 'LUCENT PAYMENT',
    `${s.payment_details || ''}\n\n**เรทราคา Coins**\n10 Coins = 8.60 บาท\n50 Coins = 43.00 บาท\n115 Coins = 98.90 บาท\n510 Coins = 438.60 บาท\n1,150 Coins = 989.00 บาท\n\nเลือกช่องทางชำระเงินด้านล่าง แล้วเลือกจำนวน Coins ที่ต้องการเติม`,
    s.payment_banner, 0x2B2D31
  );
  const rows = [];
  if (methods.length) {
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('pay_method').setPlaceholder('💳 เลือกช่องทางชำระเงิน').addOptions(methods)
    ));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pay_custom').setLabel('กำหนดเอง').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('pay_rates').setLabel('ดูเรทเติมเงิน').setStyle(ButtonStyle.Secondary)
  ));
  return {embeds:[embed], components:rows};
}

function storePanel(guild) {
  const s = getSettings(guild.id);
  const products = db.prepare(`SELECT * FROM products WHERE guild_id=? AND active=1 ORDER BY id ASC`).all(guild.id);
  const gifts = db.prepare(`SELECT * FROM gifts WHERE guild_id=? AND active=1 ORDER BY id ASC`).all(guild.id);
  const lines = products.length ? products.map(p =>
    `**${p.name}** — ${money(p.price)} Coins\n${p.description ? p.description+'\n':''}คงเหลือ: **${stockText(p.stock)}**${p.type==='TICKET'?' 🎟️':''}`
  ).join('\n\n') : 'ยังไม่มีสินค้าที่ขาย';
  const giftLines = gifts.length ? gifts.map(g =>
    `**${g.name}** — ${g.cost_salt} 🧂\nคงเหลือ: **${stockText(g.stock)}**`
  ).join('\n') : 'ยังไม่มีรางวัลแลก';
  const embed = makeBannerEmbed(
    s.store_name || 'LUCENT STORE',
    `${s.store_details || ''}\n\n### 🛒 สินค้าที่สามารถซื้อได้\n${clampText(lines, 3900)}\n\n### 🎁 สินค้าที่สามารถแลกได้\n${clampText(giftLines, 1800)}`,
    s.store_banner, 0x5865F2
  );
  const rows = [];
  const buyable = products.filter(p => p.stock !== 0);
  if (buyable.length) {
    const options = buyable.slice(0,25).map(p => ({
      label: clampText(p.name,100),
      description: clampText(`${money(p.price)} Coins • เหลือ ${stockText(p.stock)}`,100),
      value: String(p.id)
    }));
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('store_buy').setPlaceholder(s.store_buy_label || '🛒 ซื้อสินค้า').addOptions(options)
    ));
  }
  const giftable = gifts.filter(g => g.stock !== 0);
  if (giftable.length) {
    const options = giftable.slice(0,25).map(g => ({
      label: clampText(g.name,100),
      description: clampText(`${g.cost_salt} เกลือ • เหลือ ${stockText(g.stock)}`,100),
      value: String(g.id)
    }));
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('store_gift').setPlaceholder(s.store_gift_label || '🎁 แลกรางวัล').addOptions(options)
    ));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('store_refresh').setLabel('🔄 รีเฟรชร้าน').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('open_bag').setLabel('🎒 กระเป๋า').setStyle(ButtonStyle.Secondary)
  ));
  return {embeds:[embed], components:rows};
}

function gachaPanel(guild) {
  const s = getSettings(guild.id);
  const rewards = db.prepare(`SELECT * FROM gacha_rewards WHERE guild_id=? AND active=1 ORDER BY type,id`).all(guild.id);
  const roles = rewards.filter(r=>r.type==='ROLE').map(r=>`• ${r.name} — เหลือ ${r.unlimited?'ไม่จำกัด':r.quantity} — ${Number(r.chance).toFixed(2)}%`).join('\n') || 'ไม่มี';
  const items = rewards.filter(r=>r.type!=='ROLE').map(r=>`• ${r.name} — เหลือ ${r.unlimited?'ไม่จำกัด':r.quantity} — ${Number(r.chance).toFixed(2)}%`).join('\n') || 'ไม่มี';
  const desc = `${s.gacha_details || ''}\n\n**🎟️ ${s.gacha_ticket_name || 'Gacha Ticket'}:** 5 Coins / 1 ใบ\n\n**ROLE**\n${clampText(roles,1300)}\n\n**ITEM / COINS / SALT**\n${clampText(items,1300)}`;
  const embed = makeBannerEmbed(s.gacha_name || 'LUCENT GACHA', desc, s.gacha_banner, 0x9B59B6);
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('gacha_roll').setLabel(s.gacha_button_label || '🎲 สุ่มกาชา').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('gacha_info').setLabel('🎟️ เช็กตั๋ว').setStyle(ButtonStyle.Secondary)
    )
  ];
  if (isAdminFake(guild)) {}
  return {embeds:[embed], components:rows};
}
function isAdminFake(){ return false; }

async function sendOrUpdatePanel(channel, payload, keyName) {
  // Keep one bot panel per channel. The marker is invisible to normal users.
  const embed = payload.embeds?.[0];
  if (embed) {
    const oldFooter = embed.data?.footer?.text || '';
    embed.setFooter({text:`LUCENT_PANEL:${keyName}`});
  }
  const msgs = await channel.messages.fetch({limit:100}).catch(()=>null);
  const old = msgs?.filter(m =>
    m.author.id === client.user.id &&
    m.embeds?.[0]?.footer?.text === `LUCENT_PANEL:${keyName}`
  ) || [];
  for (const m of old.values()) await m.delete().catch(()=>{});
  return channel.send(payload);
}

function paymentMethodText(guild, method) {
  const s = getSettings(guild.id);
  if (method==='truewallet') return `**TrueMoney Wallet**\nชื่อบัญชี: **${s.truewallet_name}**\nเลขบัญชี: **${s.truewallet_number}**`;
  if (method==='bank') return `**บัญชีธนาคาร**\nธนาคาร: **${s.bank_name}**\nชื่อบัญชี: **${s.bank_account_name}**\nเลขบัญชี: **${s.bank_number}**`;
  if (method==='qr') return `**QR Code ชำระเงิน**\n${s.qr_url ? 'แนบ QR Code ด้านล่าง' : 'ยังไม่ได้ตั้งค่า QR'}`;
  return 'ไม่พบช่องทางชำระเงิน';
}

function paymentMethodPayload(guild, method) {
  const s = getSettings(guild.id);
  const e = new EmbedBuilder().setTitle('💳 ช่องทางชำระเงิน').setDescription(paymentMethodText(guild,method)).setColor(0x2ECC71);
  if (method==='qr' && validUrl(s.qr_url)) e.setImage(s.qr_url);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pay_amount_${method}`).setLabel('เลือกจำนวน Coins').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('pay_custom').setLabel('กำหนดเอง').setStyle(ButtonStyle.Primary)
  );
  return {embeds:[e],components:[row]};
}

function amountSelect(method) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`pay_amount_select_${method}`).setPlaceholder('เลือกจำนวน Coins').addOptions(
      {label:'10 Coins — 8.60 บาท',value:'10'},
      {label:'50 Coins — 43.00 บาท',value:'50'},
      {label:'115 Coins — 98.90 บาท',value:'115'},
      {label:'510 Coins — 438.60 บาท',value:'510'},
      {label:'1,150 Coins — 989.00 บาท',value:'1150'}
    )
  );
}

async function createTextChannelIfNeeded(guild, currentId, name) {
  if (currentId) {
    const c = await guild.channels.fetch(currentId).catch(()=>null);
    if (c && c.isTextBased()) return c;
  }
  return guild.channels.create({name, type:ChannelType.GuildText, reason:'LUCENT Bot automatic setup'});
}

function updateGachaChances(guildId) {
  const rewards = db.prepare(`SELECT * FROM gacha_rewards WHERE guild_id=? AND active=1`).all(guildId);
  if (!rewards.length) return;
  // User-entered chance is treated as a weight. The displayed probability is normalized automatically.
  const total = rewards.reduce((a,r)=>a+Math.max(0,Number(r.chance)),0);
  if (total <= 0) {
    const each = 100 / rewards.length;
    db.prepare(`UPDATE gacha_rewards SET chance=? WHERE id=?`).run(each,rewards[0].id);
    for (let i=1;i<rewards.length;i++) db.prepare(`UPDATE gacha_rewards SET chance=? WHERE id=?`).run(each,rewards[i].id);
    return;
  }
  const tx = db.transaction(() => {
    for (const r of rewards) {
      const pct = (Math.max(0,Number(r.chance))/total)*100;
      db.prepare(`UPDATE gacha_rewards SET chance=? WHERE id=?`).run(pct,r.id);
    }
  });
  tx();
}

function weightedReward(guildId) {
  const rewards = db.prepare(`SELECT * FROM gacha_rewards WHERE guild_id=? AND active=1`).all(guildId);
  const available = rewards.filter(r => r.unlimited || r.quantity > 0);
  if (!available.length) return null;
  const total = available.reduce((a,r)=>a+Number(r.chance),0);
  let x = Math.random()*total;
  for (const r of available) {
    x -= Number(r.chance);
    if (x <= 0) return r;
  }
  return available[available.length-1];
}

async function grantGachaReward(interaction, reward) {
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;
  if (reward.type==='ROLE') {
    const role = reward.role_id ? await interaction.guild.roles.fetch(reward.role_id).catch(()=>null) : null;
    if (!role) return `❌ ไม่พบยศ **${reward.name}** (ตรวจ role ID ของรางวัล)`;
    const member = await interaction.guild.members.fetch(userId);
    await member.roles.add(role).catch(()=>null);
  } else if (reward.type==='COINS') {
    addCoins(guildId,userId,reward.quantity);
  } else if (reward.type==='SALT') {
    addSalt(guildId,userId,reward.quantity);
  } else {
    addInventory(guildId,userId,reward.item_key || safeName(reward.name),reward.name,reward.quantity);
  }
  if (!reward.unlimited && reward.type !== 'COINS' && reward.type !== 'SALT') {
    db.prepare(`UPDATE gacha_rewards SET quantity=quantity-1 WHERE id=? AND quantity>0`).run(reward.id);
  }
  return `🎁 ${reward.name}${reward.quantity>1 && reward.type!=='ROLE' ? ` × ${reward.quantity}`:''}`;
}

// --------------------- Modal helpers ---------------------
function modalField(id,label,style=TextInputStyle.Short,required=true,placeholder='') {
  const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required);
  if (placeholder) t.setPlaceholder(placeholder);
  return new ActionRowBuilder().addComponents(t);
}

function paymentSetupModal() {
  return new ModalBuilder().setCustomId('modal_payment_setup').setTitle('ตั้งค่าระบบเติมเงิน')
    .addComponents(
      modalField('title','หัวข้อการชำระเงิน',TextInputStyle.Short,true,'LUCENT PAYMENT'),
      modalField('details','รายละเอียด',TextInputStyle.Paragraph,true,'ใส่อิโมจิได้'),
      modalField('payment_channel','ID ห้องเติมเงิน (เว้นว่าง = สร้างอัตโนมัติ)',TextInputStyle.Short,false),
      modalField('slip_channel','ID ห้องแนบสลิป (เว้นว่าง = สร้างอัตโนมัติ)',TextInputStyle.Short,false),
      modalField('banner','ลิงค์ Banner',TextInputStyle.Short,false,'https://...')
    );
}

function storeSetupModal() {
  return new ModalBuilder().setCustomId('modal_store_setup').setTitle('ตั้งค่าระบบร้านค้า')
    .addComponents(
      modalField('store_name','ชื่อร้านค้า',TextInputStyle.Short,true,'LUCENT STORE'),
      modalField('store_details','รายละเอียด',TextInputStyle.Paragraph,true,'รายละเอียดร้าน'),
      modalField('store_channel','ID ห้องร้านค้า (เว้นว่าง = สร้างอัตโนมัติ)',TextInputStyle.Short,false),
      modalField('buy_label','ชื่อปุ่ม/เมนูซื้อสินค้า',TextInputStyle.Short,true,'🛒 ซื้อสินค้า'),
      modalField('store_banner','ลิงค์ Banner',TextInputStyle.Short,false,'https://...')
    );
}

function storeAddModal() {
  return new ModalBuilder().setCustomId('modal_store_add').setTitle('เพิ่มสินค้าเข้าร้าน')
    .addComponents(
      modalField('name','ชื่อ ITEM หรือ ยศ',TextInputStyle.Short,true),
      modalField('description','รายละเอียดสินค้า',TextInputStyle.Paragraph,false),
      modalField('type','ประเภทสินค้า: ROLE หรือ ITEM',TextInputStyle.Short,true,'ROLE / ITEM'),
      modalField('price','ราคาสินค้า (Coins)',TextInputStyle.Short,true,'เช่น 129'),
      modalField('stock','จำนวนสินค้า',TextInputStyle.Short,true,'เช่น 5 หรือ -1 = ไม่จำกัด')
    );
}

function giftSetupModal() {
  return new ModalBuilder().setCustomId('modal_gift_setup').setTitle('ตั้งค่าปุ่มแลกรางวัล')
    .addComponents(modalField('gift_label','ชื่อปุ่มแลกรางวัล',TextInputStyle.Short,true,'🎁 แลกรางวัล'));
}

function addGiftModal() {
  return new ModalBuilder().setCustomId('modal_add_gift').setTitle('เพิ่มรางวัลแลกด้วยเกลือ')
    .addComponents(
      modalField('name','ชื่อของรางวัล',TextInputStyle.Short,true),
      modalField('cost','จำนวนเกลือที่ใช้แลก',TextInputStyle.Short,true),
      modalField('type','ประเภท: ROLE หรือ ITEM',TextInputStyle.Short,true,'ROLE / ITEM'),
      modalField('stock','จำนวนคงเหลือ (-1 = ไม่จำกัด)',TextInputStyle.Short,true,'เช่น 3 หรือ -1'),
      modalField('role_id','Role ID (เฉพาะ ROLE) / เว้นว่างถ้า ITEM',TextInputStyle.Short,false)
    );
}

function gachaSetupModal() {
  return new ModalBuilder().setCustomId('modal_gacha_setup').setTitle('ตั้งค่าตู้กาชา')
    .addComponents(
      modalField('name','ชื่อตู้กาชา',TextInputStyle.Short,true,'LUCENT GACHA'),
      modalField('details','รายละเอียด',TextInputStyle.Paragraph,true,'ใส่อิโมจิได้'),
      modalField('channel','ID ช่องกาชา (เว้นว่าง = สร้างอัตโนมัติ)',TextInputStyle.Short,false),
      modalField('banner','ลิงค์ Banner',TextInputStyle.Short,false,'https://...'),
      modalField('ticket_emoji','อิโมจิตั๋วกาชา / ชื่อตั๋ว / ปุ่มสุ่ม / Banner Loading',TextInputStyle.Paragraph,true,'บรรทัดละค่า: emoji | ชื่อตั๋ว | ชื่อปุ่ม | banner loading')
    );
}

function gachaRewardModal() {
  return new ModalBuilder().setCustomId('modal_gacha_reward').setTitle('เพิ่มรางวัลกาชา')
    .addComponents(
      modalField('name','ชื่อรางวัล',TextInputStyle.Short,true),
      modalField('quantity','จำนวน',TextInputStyle.Short,true,'ใส่ -1 = ไม่จำกัด'),
      modalField('chance','โอกาส/น้ำหนัก',TextInputStyle.Short,true,'เช่น 2.98'),
      modalField('type','ประเภท ROLE / ITEM / COINS / SALT',TextInputStyle.Short,true),
      modalField('role_id','Role ID (เฉพาะ ROLE) / เว้นว่างได้',TextInputStyle.Short,false)
    );
}

function customAmountModal() {
  return new ModalBuilder().setCustomId('modal_custom_amount').setTitle('เติม Coins แบบกำหนดเอง')
    .addComponents(modalField('coins','จำนวน Coins ที่ต้องการ',TextInputStyle.Short,true,'ขั้นต่ำเทียบเท่า 1 บาท'));
}

function purchaseModal(productId) {
  return new ModalBuilder().setCustomId(`modal_purchase_${productId}`).setTitle('จำนวนสินค้าที่ต้องการซื้อ')
    .addComponents(modalField('qty','จำนวน',TextInputStyle.Short,true,'เช่น 1'));
}

// --------------------- Interaction handling ---------------------
client.on('interactionCreate', async (i) => {
  try {
    if (i.isChatInputCommand()) {
      if (!i.guild) return i.reply({content:'คำสั่งนี้ใช้ในเซิร์ฟเวอร์เท่านั้น',ephemeral:true});
      ensureGuild(i.guild.id);

      if (['pymentsetting','paymentsetting'].includes(i.commandName)) {
        if (!isAdmin(i.member)) return i.reply({content:'❌ เฉพาะแอดมิน/Manage Server เท่านั้น',ephemeral:true});
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('open_payment_setup').setLabel('⚙️ ตั้งค่าหน้าระบบเติมเงิน').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('open_truewallet').setLabel('TrueMoney').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('open_bank').setLabel('ธนาคาร').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('open_qr').setLabel('QR Code').setStyle(ButtonStyle.Secondary)
        );
        return i.reply({content:'ตั้งค่าระบบเติมเงิน — เลือกตั้งค่าหน้าระบบและบัญชีรับเงิน',components:[row],ephemeral:true});
      }

      if (i.commandName==='startstore') {
        if (!isAdmin(i.member)) return i.reply({content:'❌ เฉพาะแอดมิน/Manage Server เท่านั้น',ephemeral:true});
        const s = getSettings(i.guild.id);
        let ch = await createTextChannelIfNeeded(i.guild,s.payment_channel_id,'เติมเงิน');
        db.prepare(`UPDATE settings SET payment_channel_id=? WHERE guild_id=?`).run(ch.id,i.guild.id);
        await sendOrUpdatePanel(ch,paymentPanel(i.guild),'payment').catch(console.error);
        return i.reply({content:`✅ ระบบเติมเงินพร้อมใช้งานที่ ${ch}`,ephemeral:true});
      }

      if (i.commandName==='storesetup') {
        if (!isAdmin(i.member)) return i.reply({content:'❌ เฉพาะแอดมิน/Manage Server เท่านั้น',ephemeral:true});
        return i.showModal(storeSetupModal());
      }

      if (i.commandName==='storeadd') {
        if (!isAdmin(i.member)) return i.reply({content:'❌ เฉพาะแอดมิน/Manage Server เท่านั้น',ephemeral:true});
        return i.showModal(storeAddModal());
      }

      if (i.commandName==='gift') {
        if (!isAdmin(i.member)) return i.reply({content:'❌ เฉพาะแอดมิน/Manage Server เท่านั้น',ephemeral:true});
        return i.showModal(giftSetupModal());
      }

      if (i.commandName==='gachasetup') {
        if (!isAdmin(i.member)) return i.reply({content:'❌ เฉพาะแอดมิน/Manage Server เท่านั้น',ephemeral:true});
        return i.showModal(gachaSetupModal());
      }

      if (i.commandName==='gachastart') {
        if (!isAdmin(i.member)) return i.reply({content:'❌ เฉพาะแอดมิน/Manage Server เท่านั้น',ephemeral:true});
        const s=getSettings(i.guild.id);
        let ch=await createTextChannelIfNeeded(i.guild,s.gacha_channel_id,'กาชา');
        db.prepare(`UPDATE settings SET gacha_channel_id=? WHERE guild_id=?`).run(ch.id,i.guild.id);
        await sendOrUpdatePanel(ch,gachaPanel(i.guild),'gacha').catch(console.error);
        return i.reply({content:`✅ ตู้กาชาพร้อมใช้งานที่ ${ch}`,ephemeral:true});
      }

      if (i.commandName==='gachareward') {
        if (!isAdmin(i.member)) return i.reply({content:'❌ เฉพาะแอดมิน/Manage Server เท่านั้น',ephemeral:true});
        return i.showModal(gachaRewardModal());
      }

      if (i.commandName==='gacharemove') {
        if (!isAdmin(i.member)) return i.reply({content:'❌ ใช้ได้เฉพาะแอดมิน',ephemeral:true});
        const rewards=db.prepare(`SELECT id,name,type FROM gacha_rewards WHERE guild_id=? AND active=1 ORDER BY id DESC LIMIT 25`).all(i.guild.id);
        if (!rewards.length) return i.reply({content:'ยังไม่มีรางวัลกาชา',ephemeral:true});
        const menu=new StringSelectMenuBuilder().setCustomId('gacha_remove_select').setPlaceholder('เลือกรางวัลที่ต้องการลบ')
          .addOptions(rewards.map(r=>({label:clampText(r.name,100),description:`${r.type} • ID ${r.id}`,value:String(r.id)})));
        return i.reply({content:'เลือกรางวัลที่ต้องการลบ:',components:[new ActionRowBuilder().addComponents(menu)],ephemeral:true});
      }

      if (i.commandName==='addgift') {
        if (!isAdmin(i.member)) return i.reply({content:'❌ ใช้ได้เฉพาะแอดมิน',ephemeral:true});
        return i.showModal(addGiftModal());
      }

      if (i.commandName==='bagpack') {
        const u=getUser(i.guild.id,i.user.id);
        const inv=db.prepare(`SELECT * FROM inventory WHERE guild_id=? AND user_id=? AND quantity>0 ORDER BY item_name`).all(i.guild.id,i.user.id);
        const ticket=db.prepare(`SELECT quantity FROM tickets WHERE guild_id=? AND user_id=?`).get(i.guild.id,i.user.id)?.quantity || 0;
        const list=inv.length ? inv.map(x=>`• **${x.item_name}** × ${x.quantity}`).join('\n') : 'ไม่มีไอเท็ม';
        const e=new EmbedBuilder().setTitle(`🎒 กระเป๋าของ ${i.user.username}`).setColor(0x5865F2)
          .setDescription(`🪙 Coins: **${money(u.coins)}**\n🧂 เกลือ: **${u.salt}**\n🎟️ ตั๋วกาชา: **${ticket}**\n\n**ไอเท็ม**\n${clampText(list,3500)}`);
        return i.reply({embeds:[e],ephemeral:true});
      }

      if (i.commandName==='setup') {
        const text=[
          '**LUCENT BOT — คำสั่งทั้งหมด**',
          '`/pymentsetting` ตั้งค่าระบบเติมเงินและบัญชี',
          '`/startstore` สร้าง/อัปเดตแผงเติมเงิน',
          '`/storesetup` ตั้งค่าร้านค้า',
          '`/storeadd` เพิ่มสินค้าและอัปเดตหน้าร้านทันที',
          '`/gift` ตั้งค่าปุ่มแลกรางวัล',
          '`/addgift` เพิ่มรางวัลแลกด้วยเกลือ',
          '`/gachasetup` ตั้งค่าตู้กาชา',
          '`/gachastart` สร้าง/อัปเดตหน้าตู้กาชา',
          '`/gachareward` เพิ่มรางวัลกาชา',
          '`/gacharemove` ลบรางวัลกาชา',
          '`/bagpack` ดู Coins / เกลือ / ไอเท็ม / ตั๋ว',
          '`!bagpack` ใช้ได้เช่นกัน',
          '`!setup` ดูเมนูคำสั่งนี้',
          '',
          '**หมายเหตุ:** /storeadd อัปเดตข้อความหน้าร้านทันที ไม่ต้องสั่งคำสั่งซ้ำ'
        ].join('\n');
        return i.reply({content:text,ephemeral:true});
      }
    }

    if (i.isButton()) {
      if (!i.guild) return i.reply({content:'ใช้ในเซิร์ฟเวอร์เท่านั้น',ephemeral:true});

      if (i.customId==='open_payment_setup') return i.showModal(paymentSetupModal());

      if (i.customId==='open_truewallet') {
        if (!isAdmin(i.member)) return i.reply({content:'❌ แอดมินเท่านั้น',ephemeral:true});
        return i.showModal(new ModalBuilder().setCustomId('modal_truewallet').setTitle('ตั้งค่า TrueMoney Wallet')
          .addComponents(modalField('name','ชื่อบัญชี',TextInputStyle.Short,true),modalField('number','เลขบัญชี',TextInputStyle.Short,true)));
      }
      if (i.customId==='open_bank') {
        if (!isAdmin(i.member)) return i.reply({content:'❌ แอดมินเท่านั้น',ephemeral:true});
        return i.showModal(new ModalBuilder().setCustomId('modal_bank').setTitle('ตั้งค่าบัญชีธนาคาร')
          .addComponents(modalField('bank','ชื่อธนาคาร',TextInputStyle.Short,true),modalField('name','ชื่อบัญชีธนาคาร',TextInputStyle.Short,true),modalField('number','เลขบัญชีธนาคาร',TextInputStyle.Short,true)));
      }
      if (i.customId==='open_qr') {
        if (!isAdmin(i.member)) return i.reply({content:'❌ แอดมินเท่านั้น',ephemeral:true});
        return i.showModal(new ModalBuilder().setCustomId('modal_qr').setTitle('ตั้งค่า QR Code')
          .addComponents(modalField('url','ลิงค์รูป QR Code',TextInputStyle.Short,true,'https://...')));
      }

      if (i.customId==='store_refresh') {
        return i.update(storePanel(i.guild));
      }
      if (i.customId==='open_bag') {
        const u=getUser(i.guild.id,i.user.id);
        const inv=db.prepare(`SELECT * FROM inventory WHERE guild_id=? AND user_id=? AND quantity>0 ORDER BY item_name`).all(i.guild.id,i.user.id);
        const ticket=db.prepare(`SELECT quantity FROM tickets WHERE guild_id=? AND user_id=?`).get(i.guild.id,i.user.id)?.quantity || 0;
        const list=inv.length ? inv.map(x=>`• ${x.item_name} × ${x.quantity}`).join('\n') : 'ไม่มีไอเท็ม';
        return i.reply({content:`🎒 **กระเป๋า**\n🪙 Coins: **${money(u.coins)}**\n🧂 เกลือ: **${u.salt}**\n🎟️ ตั๋ว: **${ticket}**\n\n${list}`,ephemeral:true});
      }

      if (i.customId==='pay_rates') {
        return i.reply({content:'💳 **เรทเติม Coins**\n10 = 8.60 บาท\n50 = 43.00 บาท\n115 = 98.90 บาท\n510 = 438.60 บาท\n1,150 = 989.00 บาท\n\nกำหนดเอง: 0.86 บาท / 1 Coin (ขั้นต่ำ 1 บาท)',ephemeral:true});
      }
      if (i.customId==='pay_custom') return i.showModal(customAmountModal());

      if (i.customId.startsWith('pay_amount_') && !i.customId.startsWith('pay_amount_select_')) {
        const method=i.customId.replace('pay_amount_','');
        return i.reply({content:`เลือกจำนวน Coins ที่ต้องการเติมผ่าน **${method==='truewallet'?'TrueMoney Wallet':method==='bank'?'ธนาคาร':'QR Code'}**`,components:[amountSelect(method)],ephemeral:true});
      }

      if (i.customId==='gacha_roll') {
        const ticket=db.prepare(`SELECT quantity FROM tickets WHERE guild_id=? AND user_id=?`).get(i.guild.id,i.user.id)?.quantity || 0;
        if (ticket < 1) return i.reply({content:'❌ คุณไม่มีตั๋วกาชา\nตั๋วราคา 5 Coins / 1 ใบ และสามารถซื้อจากร้านค้าได้',ephemeral:true});
        const menu=new StringSelectMenuBuilder().setCustomId('gacha_count').setPlaceholder('เลือกจำนวนครั้งที่จะสุ่ม').addOptions(
          {label:'1 ครั้ง — 1 ตั๋ว',value:'1'},
          {label:'5 ครั้ง — 5 ตั๋ว',value:'5'},
          {label:'10 ครั้ง — 10 ตั๋ว',value:'10'}
        );
        return i.reply({content:`🎲 คุณมีตั๋ว **${ticket}** ใบ\nเลือกจำนวนครั้งที่จะสุ่ม`,components:[new ActionRowBuilder().addComponents(menu)],ephemeral:true});
      }
      if (i.customId==='gacha_info') {
        const ticket=db.prepare(`SELECT quantity FROM tickets WHERE guild_id=? AND user_id=?`).get(i.guild.id,i.user.id)?.quantity || 0;
        return i.reply({content:`🎟️ ตั๋วกาชาของคุณ: **${ticket}** ใบ\nราคา: **5 Coins / 1 ใบ**`,ephemeral:true});
      }

      if (i.customId==='gacha_admin_add') {
        if (!isAdmin(i.member)) return i.reply({content:'❌ แอดมินเท่านั้น',ephemeral:true});
        return i.showModal(gachaRewardModal());
      }
    }

    if (i.isStringSelectMenu()) {
      if (!i.guild) return;
      const val=i.values[0];

      if (i.customId==='pay_method') return i.reply(paymentMethodPayload(i.guild,val));
      if (i.customId.startsWith('pay_amount_select_')) {
        const coins=Number(val);
        const amount=coins*0.86;
        const method=i.customId.replace('pay_amount_select_','');
        db.prepare(`INSERT INTO pending_payments(guild_id,user_id,coins,amount,status,created_at) VALUES (?,?,?,?,?,?)`)
          .run(i.guild.id,i.user.id,coins,amount,'WAIT_SLIP',Date.now());
        const s=getSettings(i.guild.id);
        const slip=s.slip_channel_id ? await i.guild.channels.fetch(s.slip_channel_id).catch(()=>null) : null;
        return i.reply({content:`✅ รายการเติมเงินถูกสร้างแล้ว\nจำนวน: **${coins} Coins**\nยอดชำระ: **${money(amount)} บาท**\nช่องทาง: **${method==='truewallet'?'TrueMoney Wallet':method==='bank'?'ธนาคาร':'QR Code'}**\n\nเมื่อชำระเงินแล้ว ให้ไปแนบ **รูปสลิป** ที่ห้อง ${slip ? slip : 'ตรวจสอบสลิป'}\nบอทจะส่งรายการให้แอดมินตรวจสอบอัตโนมัติ`,ephemeral:true});
      }

      if (i.customId==='store_buy') {
        const p=db.prepare(`SELECT * FROM products WHERE id=? AND guild_id=? AND active=1`).get(Number(val),i.guild.id);
        if (!p || p.stock===0) return i.reply({content:'❌ สินค้านี้หมดแล้ว',ephemeral:true});
        if (p.type==='ROLE' || p.type==='TICKET') {
          return showPurchaseConfirm(i,p,1);
        }
        return i.showModal(purchaseModal(p.id));
      }

      if (i.customId==='store_gift') {
        const g=db.prepare(`SELECT * FROM gifts WHERE id=? AND guild_id=? AND active=1`).get(Number(val),i.guild.id);
        if (!g || g.stock===0) return i.reply({content:'❌ รางวัลนี้หมดแล้ว',ephemeral:true});
        return giftConfirm(i,g);
      }

      if (i.customId==='gacha_count') {
        const count=Number(val);
        const ticket=db.prepare(`SELECT quantity FROM tickets WHERE guild_id=? AND user_id=?`).get(i.guild.id,i.user.id)?.quantity || 0;
        if (ticket<count) return i.reply({content:`❌ ตั๋วไม่พอ คุณมี ${ticket} ใบ`,ephemeral:true});
        const s=getSettings(i.guild.id);
        const loading=new EmbedBuilder().setTitle('🎲 LOADING...').setDescription(`กำลังสุ่ม ${count} ครั้ง\nกรุณารอประมาณ 5 วินาที...`).setColor(0x9B59B6);
        if (validUrl(s.gacha_loading_banner)) loading.setImage(s.gacha_loading_banner);
        await i.update({embeds:[loading],components:[]});
        await new Promise(r=>setTimeout(r,5000));
        db.prepare(`UPDATE tickets SET quantity=quantity-? WHERE guild_id=? AND user_id=?`).run(count,i.guild.id,i.user.id);
        const results=[];
        for(let n=0;n<count;n++){
          const reward=weightedReward(i.guild.id);
          if(!reward) break;
          results.push(await grantGachaReward(i,reward));
        }
        updateGachaChances(i.guild.id);
        const resultEmbed=new EmbedBuilder().setTitle('🎉 ผลการสุ่มกาชา').setDescription(results.length?results.join('\n'):'ไม่มีรางวัลที่พร้อมสุ่ม').setColor(0x2ECC71);
        return i.editReply({embeds:[resultEmbed],components:[]});
      }

      if (i.customId==='gacha_remove_select') {
        if (!isAdmin(i.member)) return i.reply({content:'❌ แอดมินเท่านั้น',ephemeral:true});
        const id=Number(val);
        const r=db.prepare(`SELECT * FROM gacha_rewards WHERE id=? AND guild_id=?`).get(id,i.guild.id);
        if (!r) return i.update({content:'ไม่พบรางวัล',components:[]});
        db.prepare(`UPDATE gacha_rewards SET active=0 WHERE id=?`).run(id);
        updateGachaChances(i.guild.id);
        const s=getSettings(i.guild.id);
        if(s.gacha_channel_id){
          const ch=await i.guild.channels.fetch(s.gacha_channel_id).catch(()=>null);
          if(ch) await sendOrUpdatePanel(ch,gachaPanel(i.guild),'gacha').catch(()=>{});
        }
        return i.update({content:`✅ ลบรางวัล **${r.name}** แล้ว และหน้าตู้ถูกอัปเดต`,components:[]});
      }
    }

    if (i.isModalSubmit()) {
      if (!i.guild) return;
      const gid=i.guild.id;
      ensureGuild(gid);

      if (i.customId==='modal_payment_setup') {
        const title=i.fields.getTextInputValue('title');
        const details=i.fields.getTextInputValue('details');
        const paymentChannel=i.fields.getTextInputValue('payment_channel').trim();
        const slipChannel=i.fields.getTextInputValue('slip_channel').trim();
        const banner=i.fields.getTextInputValue('banner').trim();
        let pc=await createTextChannelIfNeeded(i.guild,paymentChannel,'เติมเงิน');
        let sc=await createTextChannelIfNeeded(i.guild,slipChannel,'แนบสลิป');
        db.prepare(`UPDATE settings SET payment_title=?,payment_details=?,payment_channel_id=?,slip_channel_id=?,payment_banner=? WHERE guild_id=?`)
          .run(title,details,pc.id,sc.id,banner,gid);
        await sendOrUpdatePanel(pc,paymentPanel(i.guild),'payment');
        return i.reply({content:`✅ ตั้งค่าระบบเติมเงินเสร็จแล้ว\nห้องเติมเงิน: ${pc}\nห้องแนบสลิป: ${sc}\n\nต่อไปให้ใช้ปุ่มบัญชีจาก /pymentsetting เพื่อตั้ง TrueMoney / ธนาคาร / QR`,ephemeral:true});
      }

      if (i.customId==='modal_truewallet') {
        db.prepare(`UPDATE settings SET truewallet_name=?,truewallet_number=? WHERE guild_id=?`)
          .run(i.fields.getTextInputValue('name'),i.fields.getTextInputValue('number'),gid);
        return i.reply({content:'✅ บันทึก TrueMoney Wallet แล้ว',ephemeral:true});
      }
      if (i.customId==='modal_bank') {
        db.prepare(`UPDATE settings SET bank_name=?,bank_account_name=?,bank_number=? WHERE guild_id=?`)
          .run(i.fields.getTextInputValue('bank'),i.fields.getTextInputValue('name'),i.fields.getTextInputValue('number'),gid);
        return i.reply({content:'✅ บันทึกบัญชีธนาคารแล้ว',ephemeral:true});
      }
      if (i.customId==='modal_qr') {
        const url=i.fields.getTextInputValue('url').trim();
        if(!validUrl(url)) return i.reply({content:'❌ ลิงค์ QR ไม่ถูกต้อง ต้องขึ้นต้นด้วย http:// หรือ https://',ephemeral:true});
        db.prepare(`UPDATE settings SET qr_url=? WHERE guild_id=?`).run(url,gid);
        return i.reply({content:'✅ บันทึก QR Code แล้ว',ephemeral:true});
      }

      if (i.customId==='modal_store_setup') {
        const name=i.fields.getTextInputValue('store_name');
        const details=i.fields.getTextInputValue('store_details');
        const channelId=i.fields.getTextInputValue('store_channel').trim();
        const buyLabel=i.fields.getTextInputValue('buy_label');
        const banner=i.fields.getTextInputValue('store_banner').trim();
        const ch=await createTextChannelIfNeeded(i.guild,channelId,'shop');
        db.prepare(`UPDATE settings SET store_name=?,store_details=?,store_channel_id=?,store_buy_label=?,store_banner=? WHERE guild_id=?`)
          .run(name,details,ch.id,buyLabel,banner,gid);
        await sendOrUpdatePanel(ch,storePanel(i.guild),'store');
        return i.reply({content:`✅ ตั้งค่าร้านค้าและสร้าง/อัปเดตหน้าร้านแล้วที่ ${ch}`,ephemeral:true});
      }

      if (i.customId==='modal_store_add') {
        const name=i.fields.getTextInputValue('name');
        const description=i.fields.getTextInputValue('description');
        const type=i.fields.getTextInputValue('type').trim().toUpperCase();
        const price=parsePositiveNumber(i.fields.getTextInputValue('price'));
        let stock=Number(i.fields.getTextInputValue('stock').replace(/,/g,'').trim());
        if(!['ROLE','ITEM'].includes(type)) return i.reply({content:'❌ ประเภทต้องเป็น ROLE หรือ ITEM',ephemeral:true});
        if(!price) return i.reply({content:'❌ ราคาไม่ถูกต้อง',ephemeral:true});
        if(!Number.isInteger(stock) || stock < -1) return i.reply({content:'❌ จำนวนต้องเป็นจำนวนเต็ม และ -1 = ไม่จำกัด',ephemeral:true});
        let roleId=null;
        if(type==='ROLE'){
          const mentionedId=i.fields.getTextInputValue('description').match(/(?:role[_\s-]?id|ยศ[_\s-]?id)[:=]\s*(\d{15,25})/i)?.[1] || null;
          const role=findRoleByNameOrId(i.guild,name,mentionedId);
          if(!role) return i.reply({content:`❌ ไม่พบยศชื่อ **${name}** ในเซิร์ฟเวอร์\nถ้าชื่อยศไม่ตรง ให้ใส่ Role ID: 123456789012345678 ในรายละเอียดสินค้า`,ephemeral:true});
          roleId=role.id;
        }
        const itemKey=safeName(name);
        const info=db.prepare(`INSERT INTO products(guild_id,name,description,type,price,stock,role_id,item_key) VALUES (?,?,?,?,?,?,?,?)`)
          .run(gid,name,description,type,price,stock,roleId,itemKey);
        const s=getSettings(gid);
        if(s.store_channel_id){
          const ch=await i.guild.channels.fetch(s.store_channel_id).catch(()=>null);
          if(ch) await sendOrUpdatePanel(ch,storePanel(i.guild),'store');
        }
        return i.reply({content:`✅ เพิ่มสินค้า **${name}** สำเร็จ (ID ${info.lastInsertRowid}) และหน้าร้านถูกอัปเดตทันที ไม่ต้องใช้คำสั่งซ้ำ`,ephemeral:true});
      }

      if (i.customId==='modal_gift_setup') {
        db.prepare(`UPDATE settings SET store_gift_label=? WHERE guild_id=?`).run(i.fields.getTextInputValue('gift_label'),gid);
        const s=getSettings(gid);
        if(s.store_channel_id){
          const ch=await i.guild.channels.fetch(s.store_channel_id).catch(()=>null);
          if(ch) await sendOrUpdatePanel(ch,storePanel(i.guild),'store');
        }
        return i.reply({content:'✅ ตั้งค่าปุ่มแลกรางวัลและอัปเดตร้านค้าแล้ว',ephemeral:true});
      }

      if (i.customId==='modal_add_gift') {
        const name=i.fields.getTextInputValue('name');
        const cost=parseNonNegativeInt(i.fields.getTextInputValue('cost'));
        const type=i.fields.getTextInputValue('type').trim().toUpperCase();
        const stock=Number(i.fields.getTextInputValue('stock').replace(/,/g,'').trim());
        const roleId=i.fields.getTextInputValue('role_id').trim() || null;
        if(cost===null || cost<1) return i.reply({content:'❌ จำนวนเกลือต้องมากกว่า 0',ephemeral:true});
        if(!['ROLE','ITEM'].includes(type)) return i.reply({content:'❌ ประเภทต้อง ROLE หรือ ITEM',ephemeral:true});
        if(!Number.isInteger(stock)||stock<-1) return i.reply({content:'❌ จำนวนต้องเป็นจำนวนเต็ม และ -1 = ไม่จำกัด',ephemeral:true});
        if(type==='ROLE'){
          const role=findRoleByNameOrId(i.guild,name,roleId);
          if(!role) return i.reply({content:`❌ ไม่พบยศชื่อ **${name}** ในเซิร์ฟเวอร์ หรือ Role ID ไม่ถูกต้อง`,ephemeral:true});
          roleId=role.id;
        }
        db.prepare(`INSERT INTO gifts(guild_id,name,cost_salt,type,stock,role_id,item_key) VALUES (?,?,?,?,?,?,?)`)
          .run(gid,name,cost,type,stock,roleId,safeName(name));
        const s=getSettings(gid);
        if(s.store_channel_id){
          const ch=await i.guild.channels.fetch(s.store_channel_id).catch(()=>null);
          if(ch) await sendOrUpdatePanel(ch,storePanel(i.guild),'store');
        }
        return i.reply({content:`✅ เพิ่มรางวัลแลก **${name}** และอัปเดตร้านค้าแล้ว`,ephemeral:true});
      }

      if (i.customId==='modal_gacha_setup') {
        const name=i.fields.getTextInputValue('name');
        const details=i.fields.getTextInputValue('details');
        const channel=i.fields.getTextInputValue('channel').trim();
        const banner=i.fields.getTextInputValue('banner').trim();
        const lines=i.fields.getTextInputValue('ticket_emoji').split('|').map(x=>x.trim());
        const emoji=lines[0]||'🎟️', ticketName=lines[1]||'Gacha Ticket', button=lines[2]||'🎲 สุ่มกาชา', loading=lines[3]||'';
        const ch=await createTextChannelIfNeeded(i.guild,channel,'กาชา');
        db.prepare(`UPDATE settings SET gacha_name=?,gacha_details=?,gacha_channel_id=?,gacha_banner=?,gacha_ticket_emoji=?,gacha_ticket_name=?,gacha_button_label=?,gacha_loading_banner=? WHERE guild_id=?`)
          .run(name,details,ch.id,banner,emoji,ticketName,button,loading,gid);
        // Create/update ticket product automatically.
        const exists=db.prepare(`SELECT id FROM products WHERE guild_id=? AND type='TICKET'`).get(gid);
        if(exists){
          db.prepare(`UPDATE products SET name=?,description=?,price=?,stock=-1,active=1 WHERE id=?`).run(`${emoji} ${ticketName}`,`ตั๋วสำหรับ ${name}`,5,exists.id);
        } else {
          db.prepare(`INSERT INTO products(guild_id,name,description,type,price,stock,item_key) VALUES (?,?,?,?,?,?,?)`)
            .run(gid,`${emoji} ${ticketName}`,`ตั๋วสำหรับ ${name}`,'TICKET',5,-1,'gacha_ticket');
        }
        // Ensure shop exists and update it.
        const s=getSettings(gid);
        let shop= s.store_channel_id ? await i.guild.channels.fetch(s.store_channel_id).catch(()=>null) : null;
        if(shop) await sendOrUpdatePanel(shop,storePanel(i.guild),'store');
        await sendOrUpdatePanel(ch,gachaPanel(i.guild),'gacha');
        return i.reply({content:`✅ ตั้งค่าตู้กาชาแล้ว\nตั๋ว **${ticketName}** ถูกเพิ่ม/อัปเดตเป็นสินค้าในร้านอัตโนมัติ ราคา 5 Coins`,ephemeral:true});
      }

      if (i.customId==='modal_gacha_reward') {
        const name=i.fields.getTextInputValue('name');
        let quantity=Number(i.fields.getTextInputValue('quantity').replace(/,/g,'').trim());
        const weight=parsePositiveNumber(i.fields.getTextInputValue('chance'));
        const type=i.fields.getTextInputValue('type').trim().toUpperCase();
        const roleId=i.fields.getTextInputValue('role_id').trim()||null;
        if(!Number.isInteger(quantity)||quantity===0||quantity<-1) return i.reply({content:'❌ จำนวนต้องเป็นจำนวนเต็มที่ไม่ใช่ 0; ใช้ -1 = ไม่จำกัด',ephemeral:true});
        if(!weight) return i.reply({content:'❌ โอกาส/น้ำหนักต้องมากกว่า 0',ephemeral:true});
        if(!['ROLE','ITEM','COINS','SALT'].includes(type)) return i.reply({content:'❌ ประเภทต้อง ROLE / ITEM / COINS / SALT',ephemeral:true});
        if(type==='ROLE'){
          const role=findRoleByNameOrId(i.guild,name,roleId);
          if(!role) return i.reply({content:`❌ ไม่พบยศชื่อ **${name}** ในเซิร์ฟเวอร์ หรือ Role ID ไม่ถูกต้อง`,ephemeral:true});
          roleId=role.id;
        }
        const unlimited=quantity===-1 ? 1 : 0;
        const realQty=unlimited ? 1 : quantity;
        db.prepare(`INSERT INTO gacha_rewards(guild_id,name,quantity,chance,type,role_id,item_key,unlimited) VALUES (?,?,?,?,?,?,?,?)`)
          .run(gid,name,realQty,weight,type,roleId,safeName(name),unlimited);
        updateGachaChances(gid);
        const s=getSettings(gid);
        if(s.gacha_channel_id){
          const ch=await i.guild.channels.fetch(s.gacha_channel_id).catch(()=>null);
          if(ch) await sendOrUpdatePanel(ch,gachaPanel(i.guild),'gacha');
        }
        return i.reply({content:`✅ เพิ่มรางวัล **${name}** แล้ว\nระบบคำนวณโอกาสออกใหม่ให้อัตโนมัติ และหน้าตู้ถูกอัปเดตทันที`,ephemeral:true});
      }

      if (i.customId==='modal_custom_amount') {
        const coins=parsePositiveNumber(i.fields.getTextInputValue('coins'));
        if(!coins || !Number.isInteger(coins)) return i.reply({content:'❌ จำนวน Coins ต้องเป็นจำนวนเต็มมากกว่า 0',ephemeral:true});
        const amount=coins*0.86;
        if(amount<1) return i.reply({content:'❌ เติมขั้นต่ำ 1 บาท (อย่างน้อย 2 Coins)',ephemeral:true});
        db.prepare(`INSERT INTO pending_payments(guild_id,user_id,coins,amount,status,created_at) VALUES (?,?,?,?,?,?)`)
          .run(gid,i.user.id,coins,amount,'WAIT_SLIP',Date.now());
        const s=getSettings(gid);
        const slip=s.slip_channel_id ? await i.guild.channels.fetch(s.slip_channel_id).catch(()=>null) : null;
        return i.reply({content:`✅ สร้างรายการเติมเงินแล้ว\nCoins: **${coins}**\nยอดชำระ: **${money(amount)} บาท**\n\nหลังชำระเงินแล้ว ให้แนบรูปสลิปที่ ${slip || 'ห้องแนบสลิป'}\nระบบจะส่งให้แอดมินตรวจสอบ`,ephemeral:true});
      }

      if (i.customId.startsWith('modal_purchase_')) {
        const productId=Number(i.customId.replace('modal_purchase_',''));
        const p=db.prepare(`SELECT * FROM products WHERE id=? AND guild_id=? AND active=1`).get(productId,gid);
        if(!p || p.stock===0) return i.reply({content:'❌ สินค้าหมดแล้ว',ephemeral:true});
        const qty=parseNonNegativeInt(i.fields.getTextInputValue('qty'));
        if(!qty || qty<1) return i.reply({content:'❌ จำนวนไม่ถูกต้อง',ephemeral:true});
        if(p.stock>0 && qty>p.stock) return i.reply({content:`❌ สินค้าเหลือ ${p.stock} ชิ้น`,ephemeral:true});
        return showPurchaseConfirm(i,p,qty);
      }
    }
  } catch (err) {
    console.error('interaction error:',err);
    if (!i.replied && !i.deferred) await i.reply({content:'❌ ระบบเกิดข้อผิดพลาด กรุณาลองใหม่',ephemeral:true}).catch(()=>{});
    else await i.followUp({content:'❌ ระบบเกิดข้อผิดพลาด กรุณาลองใหม่',ephemeral:true}).catch(()=>{});
  }
});

// --------------------- Purchase / Gift confirmations ---------------------
async function showPurchaseConfirm(i,p,qty) {
  const total=p.price*qty;
  const u=getUser(i.guild.id,i.user.id);
  if (u.coins < total) return i.reply({content:`❌ Coins ไม่พอ\nต้องใช้ ${money(total)} Coins\nคุณมี ${money(u.coins)} Coins`,ephemeral:true});
  const embed=new EmbedBuilder().setTitle('🧾 รายละเอียดคำสั่งซื้อ').setColor(0xF1C40F)
    .setDescription(`**ชื่อสินค้า:** ${p.name}\n**ราคา:** ${money(p.price)} Coins / ชิ้น\n**จำนวน:** ${qty}\n**รวม:** ${money(total)} Coins\n**ประเภท:** ${p.type}`);
  const row=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`buy_confirm_${p.id}_${qty}`).setLabel('ยืนยันคำสั่งซื้อ').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('buy_cancel').setLabel('ยกเลิกคำสั่งซื้อ').setStyle(ButtonStyle.Danger)
  );
  if(i.replied||i.deferred) return i.editReply({embeds:[embed],components:[row]});
  return i.reply({embeds:[embed],components:[row],ephemeral:true});
}

async function giftConfirm(i,g) {
  const u=getUser(i.guild.id,i.user.id);
  if(u.salt<g.cost_salt) return i.reply({content:`❌ เกลือไม่พอ ต้องใช้ ${g.cost_salt} 🧂 แต่คุณมี ${u.salt}`,ephemeral:true});
  const embed=new EmbedBuilder().setTitle('🎁 ยืนยันการแลกรางวัล').setDescription(`รางวัล: **${g.name}**\nใช้: **${g.cost_salt} 🧂**\nคงเหลือหลังแลก: **${u.salt-g.cost_salt} 🧂**`).setColor(0xE67E22);
  const row=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gift_confirm_${g.id}`).setLabel('ยืนยันการแลก').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('gift_cancel').setLabel('ยกเลิก').setStyle(ButtonStyle.Danger)
  );
  return i.reply({embeds:[embed],components:[row],ephemeral:true});
}

client.on('interactionCreate', async (i) => {
  if (!i.isButton() || !i.guild) return;
  try {
    if(i.customId==='buy_cancel') return i.update({content:`คุณ ${i.user} ได้ยกเลิกคำสั่งซื้อแล้ว`,embeds:[],components:[]});
    if(i.customId==='gift_cancel') return i.update({content:`คุณ ${i.user} ได้ยกเลิกการแลกรางวัลแล้ว`,embeds:[],components:[]});

    if(i.customId.startsWith('buy_confirm_')){
      const [,id,qtyS]=i.customId.split('_');
      const idn=Number(id), qty=Number(qtyS);
      const p=db.prepare(`SELECT * FROM products WHERE id=? AND guild_id=? AND active=1`).get(idn,i.guild.id);
      if(!p || p.stock===0) return i.update({content:'❌ สินค้าหมดแล้ว',embeds:[],components:[]});
      if(p.stock>0 && qty>p.stock) return i.update({content:'❌ สินค้าเหลือไม่พอ',embeds:[],components:[]});
      const total=p.price*qty;
      const u=getUser(i.guild.id,i.user.id);
      if(u.coins<total) return i.update({content:'❌ Coins ไม่พอ',embeds:[],components:[]});

      const tx=db.transaction(()=>{
        db.prepare(`UPDATE users SET coins=coins-? WHERE guild_id=? AND user_id=?`).run(total,i.guild.id,i.user.id);
        if(p.stock>0) db.prepare(`UPDATE products SET stock=stock-? WHERE id=?`).run(qty,p.id);
        if(p.type==='TICKET'){
          db.prepare(`INSERT OR IGNORE INTO tickets(guild_id,user_id,quantity) VALUES (?,?,0)`).run(i.guild.id,i.user.id);
          db.prepare(`UPDATE tickets SET quantity=quantity+? WHERE guild_id=? AND user_id=?`).run(qty,i.guild.id,i.user.id);
        } else if(p.type==='ITEM'){
          addInventory(i.guild.id,i.user.id,p.item_key,p.name,qty);
        }
      });
      tx();

      if(p.type==='ROLE'){
        const role=p.role_id ? await i.guild.roles.fetch(p.role_id).catch(()=>null):null;
        const member=await i.guild.members.fetch(i.user.id);
        if(!role) {
          addCoins(i.guild.id,i.user.id,total);
          if(p.stock>0) db.prepare(`UPDATE products SET stock=stock+? WHERE id=?`).run(qty,p.id);
          return i.update({content:'❌ ไม่พบ Role ID ของสินค้า ระบบคืน Coins ให้แล้ว',embeds:[],components:[]});
        }
        await member.roles.add(role).catch(()=>null);
      }

      const s=getSettings(i.guild.id);
      if(s.store_channel_id){
        const ch=await i.guild.channels.fetch(s.store_channel_id).catch(()=>null);
        if(ch) await sendOrUpdatePanel(ch,storePanel(i.guild),'store').catch(()=>{});
      }
      return i.update({content:`✅ **สั่งซื้อสินค้าแล้ว**\nชื่อสินค้า: ${p.name}\nจำนวน: ${qty}\nราคา: ${money(total)} Coins\nประเภทสินค้า: ${p.type==='ROLE'?'ยศ':p.type==='TICKET'?'ตั๋วกาชา':'ไอเท็ม'}\n${p.type==='ROLE'?'🎖️ สวมยศให้อัตโนมัติแล้ว':p.type==='TICKET'?'🎟️ ตั๋วเข้ากระเป๋าแล้ว':'🎒 ไอเท็มเข้ากระเป๋าแล้ว'}`,embeds:[],components:[]});
    }

    if(i.customId.startsWith('gift_confirm_')){
      const id=Number(i.customId.replace('gift_confirm_',''));
      const g=db.prepare(`SELECT * FROM gifts WHERE id=? AND guild_id=? AND active=1`).get(id,i.guild.id);
      if(!g || g.stock===0) return i.update({content:'❌ รางวัลหมดแล้ว',embeds:[],components:[]});
      const u=getUser(i.guild.id,i.user.id);
      if(u.salt<g.cost_salt) return i.update({content:'❌ เกลือไม่พอ',embeds:[],components:[]});
      db.prepare(`UPDATE users SET salt=salt-? WHERE guild_id=? AND user_id=?`).run(g.cost_salt,i.guild.id,i.user.id);
      if(g.stock>0) db.prepare(`UPDATE gifts SET stock=stock-1 WHERE id=?`).run(g.id);
      if(g.type==='ROLE'){
        const role=g.role_id?await i.guild.roles.fetch(g.role_id).catch(()=>null):null;
        if(!role){
          addSalt(i.guild.id,i.user.id,g.cost_salt);
          if(g.stock>0) db.prepare(`UPDATE gifts SET stock=stock+1 WHERE id=?`).run(g.id);
          return i.update({content:'❌ ไม่พบ Role ID ระบบคืนเกลือให้แล้ว',embeds:[],components:[]});
        }
        const member=await i.guild.members.fetch(i.user.id);
        await member.roles.add(role);
      } else {
        addInventory(i.guild.id,i.user.id,g.item_key,g.name,1);
      }
      const s=getSettings(i.guild.id);
      if(s.store_channel_id){
        const ch=await i.guild.channels.fetch(s.store_channel_id).catch(()=>null);
        if(ch) await sendOrUpdatePanel(ch,storePanel(i.guild),'store').catch(()=>{});
      }
      return i.update({content:`✅ แลกรางวัลสำเร็จ\nรางวัล: ${g.name}\nใช้เกลือ: ${g.cost_salt}\n${g.type==='ROLE'?'🎖️ ได้รับยศแล้ว':'🎒 รางวัลเข้ากระเป๋าแล้ว'}`,embeds:[],components:[]});
    }
  } catch(e) {
    console.error('purchase error',e);
    if(!i.replied&&!i.deferred) await i.reply({content:'❌ เกิดข้อผิดพลาด',ephemeral:true}).catch(()=>{});
  }
});

// --------------------- Prefix commands ---------------------
client.on('messageCreate', async (m) => {
  if (m.author.bot || !m.guild) return;
  const content=m.content.trim();
  if(content==='!setup') {
    const text=[
      '**LUCENT BOT — คำสั่ง**',
      '`/pymentsetting` ตั้งค่าระบบเติมเงิน',
      '`/startstore` เปิดแผงเติมเงิน',
      '`/storesetup` ตั้งค่าร้านค้า',
      '`/storeadd` เพิ่มสินค้า + อัปเดตหน้าร้านทันที',
      '`/gift` ตั้งค่าปุ่มแลก',
      '`/addgift` เพิ่มรางวัลแลกด้วยเกลือ',
      '`/gachasetup` ตั้งค่าตู้กาชา',
      '`/gachastart` เปิดตู้กาชา',
      '`/gachareward` เพิ่มรางวัลกาชา',
      '`/gacharemove` ลบรางวัลกาชา',
      '`!bagpack` ดูกระเป๋า',
      '`!setup` ดูคำสั่ง',
      '',
      'ระบบใช้ SQLite และเก็บข้อมูลในโฟลเดอร์ data จึงไม่หายเมื่อ Railway volume/persistent storage ถูกตั้งค่าไว้'
    ].join('\n');
    return m.reply(text);
  }
  if(content==='!bagpack') {
    const u=getUser(m.guild.id,m.author.id);
    const inv=db.prepare(`SELECT * FROM inventory WHERE guild_id=? AND user_id=? AND quantity>0 ORDER BY item_name`).all(m.guild.id,m.author.id);
    const ticket=db.prepare(`SELECT quantity FROM tickets WHERE guild_id=? AND user_id=?`).get(m.guild.id,m.author.id)?.quantity || 0;
    const list=inv.length?inv.map(x=>`• ${x.item_name} × ${x.quantity}`).join('\n'):'ไม่มีไอเท็ม';
    return m.reply(`🎒 **กระเป๋า ${m.author}**\n🪙 Coins: ${money(u.coins)}\n🧂 เกลือ: ${u.salt}\n🎟️ ตั๋ว: ${ticket}\n\n${list}`);
  }
});

// --------------------- Slip listener ---------------------
client.on('messageCreate', async (m) => {
  if(m.author.bot || !m.guild || !m.attachments.size) return;
  const s=getSettings(m.guild.id);
  if(!s.slip_channel_id || m.channel.id!==s.slip_channel_id) return;
  const image=m.attachments.find(a=>/^image\//i.test(a.contentType||'') || /\.(png|jpe?g|webp)$/i.test(a.name||''));
  if(!image) return;
  const pending=db.prepare(`SELECT * FROM pending_payments WHERE guild_id=? AND user_id=? AND status='WAIT_SLIP' ORDER BY id DESC LIMIT 1`).get(m.guild.id,m.author.id);
  if(!pending) return m.reply({content:'❌ ไม่พบรายการเติมเงินที่รอแนบสลิป กรุณาสร้างรายการจากห้องเติมเงินก่อน',allowedMentions:{repliedUser:false}});
  db.prepare(`UPDATE pending_payments SET slip_channel_id=?,slip_message_id=?,status='PENDING' WHERE id=?`).run(m.channel.id,m.id,pending.id);
  const review=s.payment_review_channel_id ? await m.guild.channels.fetch(s.payment_review_channel_id).catch(()=>null) : null;
  let reviewChannel=review;
  if(!reviewChannel){
    reviewChannel=await m.guild.channels.create({name:'ตรวจสอบการเงิน',type:ChannelType.GuildText,reason:'LUCENT payment review channel'});
    db.prepare(`UPDATE settings SET payment_review_channel_id=? WHERE guild_id=?`).run(reviewChannel.id,m.guild.id);
  }
  const embed=new EmbedBuilder().setTitle('💰 รายการเติมเงินรอตรวจสอบ').setColor(0xF1C40F)
    .setDescription(`ผู้ใช้: ${m.author} (${m.author.id})\nCoins ที่ขอเติม: **${pending.coins}**\nยอดที่ต้องชำระ: **${money(pending.amount)} บาท**\nเวลา: <t:${Math.floor(pending.created_at/1000)}:F>`)
    .setImage(image.url);
  const row=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`payment_approve_${pending.id}`).setLabel('ชำระเงิน').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`payment_reject_${pending.id}`).setLabel('ยกเลิก').setStyle(ButtonStyle.Danger)
  );
  await reviewChannel.send({embeds:[embed],components:[row]});
  await m.reply({content:`✅ รับสลิปแล้ว ${m.author}\nรายการของคุณถูกส่งให้แอดมินตรวจสอบที่ ${reviewChannel}`,allowedMentions:{repliedUser:false}});
});

// Payment review buttons
client.on('interactionCreate', async (i) => {
  if(!i.isButton()||!i.guild) return;
  if(!i.customId.startsWith('payment_')) return;
  if(!isAdmin(i.member)) return i.reply({content:'❌ เฉพาะแอดมินเท่านั้น',ephemeral:true});
  const [_,action,idS]=i.customId.split('_');
  const id=Number(idS);
  const p=db.prepare(`SELECT * FROM pending_payments WHERE id=? AND guild_id=?`).get(id,i.guild.id);
  if(!p) return i.reply({content:'ไม่พบรายการ',ephemeral:true});
  if(p.status!=='PENDING') return i.reply({content:'รายการนี้ถูกดำเนินการไปแล้ว',ephemeral:true});
  if(action==='approve'){
    addCoins(i.guild.id,p.user_id,p.coins);
    db.prepare(`UPDATE pending_payments SET status='APPROVED' WHERE id=?`).run(id);
    const member=await i.guild.members.fetch(p.user_id).catch(()=>null);
    if(member){
      await member.send(`✅ **ท่านได้ชำระเงินแล้ว**\nจำนวน: **${money(p.amount)} บาท**\nCoins ที่ได้รับ: **${p.coins}**\nเมื่อเวลา: ${new Date().toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}\nตรวจสอบโดย: **${i.user.username}**`).catch(()=>{});
    }
    return i.update({content:`✅ อนุมัติรายการแล้ว\nผู้ใช้: <@${p.user_id}>\nเพิ่ม ${p.coins} Coins`,embeds:[],components:[]});
  }
  db.prepare(`UPDATE pending_payments SET status='REJECTED' WHERE id=?`).run(id);
  const member=await i.guild.members.fetch(p.user_id).catch(()=>null);
  if(member) await member.send(`❌ รายการเติมเงินของคุณถูกยกเลิก\nยอด: ${money(p.amount)} บาท\nตรวจสอบโดย: ${i.user.username}`).catch(()=>{});
  return i.update({content:`❌ ยกเลิกรายการของ <@${p.user_id}> แล้ว`,embeds:[],components:[]});
});

// --------------------- Ticket product handling ---------------------
// Ticket products are automatically created by /gachasetup. The purchase handler above
// credits tickets instead of normal inventory.

// --------------------- Ready / command registration ---------------------
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  const rest=new REST({version:'10'}).setToken(TOKEN);
  try {
    const configuredGuild=process.env.GUILD_ID;
    if(configuredGuild){
      await rest.put(Routes.applicationGuildCommands(client.user.id,configuredGuild),{body:commands});
      console.log(`Slash commands registered to GUILD_ID=${configuredGuild}`);
    } else if(client.guilds.cache.size===1){
      const guild=client.guilds.cache.first();
      await rest.put(Routes.applicationGuildCommands(client.user.id,guild.id),{body:commands});
      console.log(`Slash commands registered automatically to ${guild.name}`);
    } else {
      await rest.put(Routes.applicationCommands(client.user.id),{body:commands});
      console.log('Slash commands registered globally (multiple/no unique guild).');
    }
  } catch(e) {
    console.error('Command registration failed:',e);
  }
});

process.on('unhandledRejection', e=>console.error('Unhandled rejection:',e));
process.on('uncaughtException', e=>console.error('Uncaught exception:',e));

client.login(TOKEN);
