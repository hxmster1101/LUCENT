const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  AttachmentBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// ============================================================
// LUCENT BOT - COMPLETE SINGLE-FOLDER VERSION
// Only required Railway variable: DISCORD_TOKEN
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;
const DATA_DIR = path.join(__dirname, 'data');
const COIN_RATE = 0.86;
const GACHA_TICKET_PRICE = 5;
const PREFIX = '!';

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULTS = {
  config: {
    payment: {
      title: '💳 ระบบเติมเงิน LUCENT',
      description: 'เลือกช่องทางชำระเงินด้านล่าง',
      topupChannelId: '',
      slipChannelId: '',
      reviewChannelId: '',
      banner: '',
      methods: {
        truemoney: { enabled: false, accountName: '', accountNumber: '' },
        bank: { enabled: false, bankName: '', accountName: '', accountNumber: '' },
        qr: { enabled: false, imageUrl: '' }
      }
    },
    store: {
      name: '🛒 LUCENT STORE',
      description: 'ร้านค้า Coins',
      channelId: '',
      buyButton: '🛒 ซื้อสินค้า',
      giftButton: '🎁 แลกรางวัล',
      banner: '',
      messageId: ''
    }
  },
  users: {},
  store: { products: {} },
  gifts: { items: {} },
  gacha: {
    name: 'LUCENT GACHA',
    description: 'ตู้สำหรับสุ่มกาชา',
    channelId: '',
    banner: '',
    ticketEmoji: '🎟️',
    ticketName: 'Gacha Ticket',
    spinButton: '🎰 สุ่มกาชา',
    loadingBanner: '',
    messageId: '',
    rewards: []
  },
  pending: {}
};

const FILES = {
  config: 'config.json',
  users: 'users.json',
  store: 'store.json',
  gifts: 'gifts.json',
  gacha: 'gacha.json',
  pending: 'pending.json'
};

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function load(key) {
  const file = path.join(DATA_DIR, FILES[key]);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(DEFAULTS[key], null, 2), 'utf8');
    return clone(DEFAULTS[key]);
  }
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) {
    console.error(`Could not read ${FILES[key]}, recreating it.`);
    fs.writeFileSync(file, JSON.stringify(DEFAULTS[key], null, 2), 'utf8');
    return clone(DEFAULTS[key]);
  }
}
function save(key, value) {
  const file = path.join(DATA_DIR, FILES[key]);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

let config = load('config');
let users = load('users');
let store = load('store');
let gifts = load('gifts');
let gacha = load('gacha');
let pending = load('pending');

function getUser(id) {
  if (!users[id]) users[id] = { coins: 0, salt: 0, tickets: 0, inventory: {}, purchases: 0 };
  return users[id];
}
function addInventory(id, name, qty = 1) {
  const u = getUser(id);
  u.inventory[name] = (u.inventory[name] || 0) + qty;
  if (u.inventory[name] <= 0) delete u.inventory[name];
}
function cleanId(v) { return String(v || '').replace(/[<#@&>]/g, '').trim(); }
function money(n) { return Number(n).toFixed(2); }
function validUrl(v) { return !v || /^https?:\/\/\S+$/i.test(String(v).trim()); }
function isAdmin(i) { return !!i.member?.permissions?.has(PermissionFlagsBits.Administrator); }
function isTextChannel(ch) { return ch && ch.isTextBased(); }
function escapeText(s) { return String(s ?? '').slice(0, 4000); }
function uid(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

function enabledPaymentMethods() {
  const m = config.payment.methods;
  const out = [];
  if (m.truemoney.enabled) out.push(['truemoney', 'TrueMoney Wallet', '💳']);
  if (m.bank.enabled) out.push(['bank', 'ธนาคาร', '🏦']);
  if (m.qr.enabled) out.push(['qr', 'QR Code', '📱']);
  return out;
}

function paymentPanel() {
  const e = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(config.payment.title || '💳 ระบบเติมเงิน')
    .setDescription(config.payment.description || 'เลือกช่องทางชำระเงินด้านล่าง')
    .addFields({
      name: '💰 เรท Coins',
      value: '10 Coins = 8.60 บาท\n50 Coins = 43.00 บาท\n115 Coins = 98.90 บาท\n510 Coins = 438.60 บาท\n1,150 Coins = 989.00 บาท\n\nกำหนดเอง: ขั้นต่ำ 1 บาท'
    });
  if (validUrl(config.payment.banner)) e.setImage(config.payment.banner);
  const methods = enabledPaymentMethods();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('topup_open').setLabel('💰 เติมเงิน').setStyle(ButtonStyle.Success)
  );
  if (!methods.length) row.components[0].setDisabled(true);
  return { embeds: [e], components: [row] };
}

function paymentMethodMenu() {
  const opts = enabledPaymentMethods().map(([id, name, emoji]) =>
    new StringSelectMenuOptionBuilder().setLabel(name).setValue(id).setEmoji(emoji)
  );
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('payment_method').setPlaceholder('เลือกช่องทางชำระเงิน').addOptions(opts)
  );
}

function paymentMethodEmbed(method) {
  const m = config.payment.methods[method];
  const e = new EmbedBuilder().setColor(0x57f287).setTitle('💳 ข้อมูลการชำระเงิน');
  if (method === 'truemoney') {
    e.addFields(
      { name: 'ช่องทาง', value: 'TrueMoney Wallet' },
      { name: 'ชื่อบัญชี', value: m.accountName || '-' },
      { name: 'เลขบัญชี', value: m.accountNumber || '-' }
    );
  } else if (method === 'bank') {
    e.addFields(
      { name: 'ช่องทาง', value: 'ธนาคาร' },
      { name: 'ธนาคาร', value: m.bankName || '-' },
      { name: 'ชื่อบัญชี', value: m.accountName || '-' },
      { name: 'เลขบัญชี', value: m.accountNumber || '-' }
    );
  } else {
    e.addFields({ name: 'ช่องทาง', value: 'QR Code' }, { name: 'QR Code', value: 'สแกน QR จากรูปด้านล่าง' });
    if (validUrl(m.imageUrl)) e.setImage(m.imageUrl);
  }
  return e;
}

function customCoinOptions() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('topup_custom').setLabel('✏️ กำหนดเอง').setStyle(ButtonStyle.Primary)
  );
}

function packageMenu(method) {
  const opts = [
    ['10', '10 Coins — 8.60 บาท'],
    ['50', '50 Coins — 43.00 บาท'],
    ['115', '115 Coins — 98.90 บาท'],
    ['510', '510 Coins — 438.60 บาท'],
    ['1150', '1,150 Coins — 989.00 บาท']
  ];
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`topup_package:${method}`)
      .setPlaceholder('เลือกจำนวน Coins ที่ต้องการเติม')
      .addOptions(opts.map(([v, label]) => new StringSelectMenuOptionBuilder().setLabel(label).setValue(v)))
  );
  return row;
}

function storeEmbed() {
  const e = new EmbedBuilder().setColor(0x9b59b6).setTitle(config.store.name || '🛒 LUCENT STORE').setDescription(config.store.description || 'ร้านค้า Coins');
  const products = Object.values(store.products);
  const normal = products.filter(p => !p.gachaTicket);
  const tickets = products.filter(p => p.gachaTicket);
  const available = normal.length ? normal.map(p => `${p.type === 'ROLE' ? '🏷️' : '📦'} **${p.name}** — ${p.price} Coins — เหลือ ${p.stock < 0 ? 'ไม่จำกัด' : p.stock}`).join('\n') : 'ยังไม่มีสินค้า';
  const ticketText = tickets.length ? tickets.map(p => `🎟️ **${p.name}** — ${p.price} Coins — เหลือ ${p.stock < 0 ? 'ไม่จำกัด' : p.stock}`).join('\n') : '';
  e.addFields({ name: '🛍️ สินค้าที่สามารถซื้อได้', value: available.slice(0, 1024) });
  if (ticketText) e.addFields({ name: '🎟️ ตั๋วกาชา', value: ticketText.slice(0, 1024) });
  const giftItems = Object.values(gifts.items);
  const giftText = giftItems.length ? giftItems.map(g => `${g.type === 'ROLE' ? '🏷️' : '🎁'} **${g.name}** — ${g.cost} เกลือ — เหลือ ${g.stock < 0 ? 'ไม่จำกัด' : g.stock}`).join('\n') : 'ยังไม่มีรางวัลแลก';
  e.addFields({ name: '🎁 สินค้าที่สามารถแลกได้', value: giftText.slice(0, 1024) });
  if (validUrl(config.store.banner)) e.setImage(config.store.banner);
  return e;
}

function productPage(page = 0) {
  const products = Object.values(store.products).filter(p => Number(p.stock) !== 0);
  const pages = Math.max(1, Math.ceil(products.length / 25));
  const safePage = Math.max(0, Math.min(page, pages - 1));
  const slice = products.slice(safePage * 25, safePage * 25 + 25);
  const options = slice.map(p => new StringSelectMenuOptionBuilder()
    .setLabel(`${p.name}`.slice(0, 100))
    .setDescription(`${p.price} Coins • ${p.type}`.slice(0, 100))
    .setValue(p.id)
  );
  const rows = [];
  if (options.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`buy_select:${safePage}`).setPlaceholder('เลือกสินค้าที่ต้องการซื้อ').addOptions(options)));
  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`store_page:${safePage - 1}`).setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(safePage === 0),
    new ButtonBuilder().setCustomId(`store_page:${safePage + 1}`).setLabel(`หน้า ${safePage + 1}/${pages}`).setStyle(ButtonStyle.Secondary).setDisabled(safePage >= pages - 1),
    new ButtonBuilder().setCustomId('gift_open').setLabel(config.store.giftButton || '🎁 แลกรางวัล').setStyle(ButtonStyle.Success)
  );
  rows.push(nav);
  return rows;
}

function storeComponents(page = 0) {
  const rows = productPage(page);
  return { components: rows };
}

async function refreshStore(guild) {
  if (!config.store.channelId) return false;
  const ch = await guild.channels.fetch(config.store.channelId).catch(() => null);
  if (!isTextChannel(ch)) return false;
  let msg = null;
  if (config.store.messageId) msg = await ch.messages.fetch(config.store.messageId).catch(() => null);
  if (msg) await msg.edit({ embeds: [storeEmbed()], ...storeComponents(0) });
  else {
    msg = await ch.send({ embeds: [storeEmbed()], ...storeComponents(0) });
    config.store.messageId = msg.id;
    save('config', config);
  }
  return true;
}

function gachaChance(r) {
  const active = gacha.rewards.filter(x => x.unlimited === true || Number(x.quantity) > 0);
  const total = active.reduce((s, x) => s + Math.max(0, Number(x.chance) || 0), 0);
  return total ? (Number(r.chance) || 0) / total * 100 : 0;
}
function gachaEmbed() {
  const e = new EmbedBuilder().setColor(0x9b59b6).setTitle(`🎰 ${gacha.name}`).setDescription(`${gacha.description || ''}\n\n**รางวัลในตู้**`);
  const roles = gacha.rewards.filter(r => r.type === 'ROLE');
  const items = gacha.rewards.filter(r => r.type === 'ITEM');
  const fmt = arr => arr.length ? arr.map(r => `${r.type === 'ROLE' ? '🏷️' : '🎁'} **${r.name}** — เหลือ ${r.unlimited ? 'ไม่จำกัด' : r.quantity} — โอกาส ${gachaChance(r).toFixed(2)}%`).join('\n') : 'ไม่มีรางวัล';
  e.addFields({ name: '🏷️ ROLE', value: fmt(roles).slice(0, 1024) }, { name: '🎁 ITEM', value: fmt(items).slice(0, 1024) }, { name: '🎟️ ตั๋ว', value: `1 ครั้ง = 1 ตั๋ว = ${GACHA_TICKET_PRICE} Coins\n5 ครั้ง = 5 ตั๋ว\n10 ครั้ง = 10 ตั๋ว` });
  if (validUrl(gacha.banner)) e.setImage(gacha.banner);
  return e;
}
function gachaComponents() {
  return { components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('gacha_spin').setLabel(gacha.spinButton || '🎰 สุ่มกาชา').setStyle(ButtonStyle.Primary))] };
}
async function updateGachaMessage(guild) {
  if (!gacha.channelId || !gacha.messageId) return false;
  const ch = await guild.channels.fetch(gacha.channelId).catch(() => null);
  if (!isTextChannel(ch)) return false;
  const msg = await ch.messages.fetch(gacha.messageId).catch(() => null);
  if (!msg) return false;
  await msg.edit({ embeds: [gachaEmbed()], ...gachaComponents() });
  return true;
}

function pickReward() {
  const active = gacha.rewards.filter(r => r.unlimited === true || Number(r.quantity) > 0);
  if (!active.length) return null;
  const total = active.reduce((s, r) => s + Math.max(0, Number(r.chance) || 0), 0);
  if (total <= 0) return active[Math.floor(Math.random() * active.length)];
  let n = Math.random() * total;
  for (const r of active) {
    n -= Math.max(0, Number(r.chance) || 0);
    if (n <= 0) return r;
  }
  return active[active.length - 1];
}

function findRoleByName(guild, name) {
  const target = String(name).trim().toLowerCase();
  return guild.roles.cache.find(r => r.name.toLowerCase() === target);
}

async function grantStoreProduct(interaction, p, qty) {
  const u = getUser(interaction.user.id);
  const cost = Number(p.price) * qty;
  if (u.coins < cost) return { ok: false, msg: `❌ Coins ไม่พอ ต้องใช้ **${cost} Coins** แต่คุณมี **${u.coins} Coins**` };
  if (p.stock >= 0 && p.stock < qty) return { ok: false, msg: `❌ สินค้าเหลือเพียง ${p.stock} ชิ้น` };

  if (p.type === 'ROLE') {
    const role = p.roleId ? interaction.guild.roles.cache.get(p.roleId) : findRoleByName(interaction.guild, p.name);
    if (!role) return { ok: false, msg: `❌ ไม่พบยศ **${p.name}** ในเซิร์ฟเวอร์` };
    if (role.position >= interaction.guild.members.me.roles.highest.position) return { ok: false, msg: '❌ บอทไม่สามารถสวมยศนี้ได้ เพราะยศของบอทอยู่ต่ำกว่า' };
    await interaction.member.roles.add(role);
  } else if (p.gachaTicket) {
    getUser(interaction.user.id).tickets += qty;
  } else {
    addInventory(interaction.user.id, p.name, qty);
  }
  u.coins -= cost;
  u.purchases += 1;
  if (p.stock >= 0) p.stock -= qty;
  save('users', users); save('store', store);
  return { ok: true, msg: `สั่งซื้อสินค้าแล้ว\nชื่อสินค้า : **${p.name}**\nจำนวน : **${qty}**\nราคา : **${cost} Coins**\nประเภทสินค้า : **${p.type}**` };
}

async function grantGift(interaction, g) {
  const u = getUser(interaction.user.id);
  if (u.salt < g.cost) return { ok: false, msg: `❌ เกลือไม่พอ ต้องใช้ ${g.cost} แต่คุณมี ${u.salt}` };
  if (g.stock === 0) return { ok: false, msg: '❌ รางวัลนี้หมดแล้ว' };
  if (g.type === 'ROLE') {
    const role = g.roleId ? interaction.guild.roles.cache.get(g.roleId) : findRoleByName(interaction.guild, g.name);
    if (!role) return { ok: false, msg: `❌ ไม่พบยศ **${g.name}**` };
    if (role.position >= interaction.guild.members.me.roles.highest.position) return { ok: false, msg: '❌ บอทไม่สามารถมอบยศนี้ได้' };
    await interaction.member.roles.add(role);
  } else addInventory(interaction.user.id, g.name, 1);
  u.salt -= g.cost;
  if (g.stock >= 0) g.stock -= 1;
  save('users', users); save('gifts', gifts);
  return { ok: true, msg: `🎁 แลกรางวัลสำเร็จ\nรางวัล : **${g.name}**\nใช้เกลือ : **${g.cost}**\nประเภท : **${g.type}**` };
}

function giftMenu() {
  const items = Object.values(gifts.items).filter(g => g.stock !== 0).slice(0, 25);
  if (!items.length) return null;
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('gift_select').setPlaceholder('เลือกรางวัลที่ต้องการแลก').addOptions(items.map(g => new StringSelectMenuOptionBuilder().setLabel(g.name.slice(0, 100)).setDescription(`${g.cost} เกลือ • ${g.type}`.slice(0, 100)).setValue(g.id))));
}

function commands() {
  return [
    new SlashCommandBuilder().setName('pymentsetting').setDescription('ตั้งค่าระบบเติมเงิน').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('startstore').setDescription('สร้าง/รีเฟรชหน้าระบบเติมเงิน'),
    new SlashCommandBuilder().setName('storesetup').setDescription('ตั้งค่าร้านค้า').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('storeadd').setDescription('เพิ่มสินค้า ROLE/ITEM และอัปเดตหน้าร้านทันที').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('gift').setDescription('ตั้งค่าปุ่มแลกรางวัล').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('gachasetup').setDescription('ตั้งค่าตู้กาชา').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('gachastart').setDescription('สร้าง/รีเฟรชตู้กาชา').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('gachareward').setDescription('จัดการรางวัลกาชา').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('balance').setDescription('เช็ก Coins และเกลือ')
  ].map(c => c.toJSON());
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel, Partials.Message]
});

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  const payload = commands();
  const guilds = [...client.guilds.cache.values()];
  if (!guilds.length) return;
  for (const guild of guilds) {
    try {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: payload });
      console.log(`Registered commands in ${guild.name}`);
    } catch (e) { console.error(`Command registration failed in ${guild.id}:`, e.message); }
  }
}

async function createOrUseTextChannel(guild, input, name) {
  const id = cleanId(input);
  if (id) {
    const existing = await guild.channels.fetch(id).catch(() => null);
    if (isTextChannel(existing)) return existing;
  }
  return guild.channels.create({ name, type: ChannelType.GuildText, reason: 'LUCENT Bot automatic setup' });
}

function paymentSetupModal() {
  const m = new ModalBuilder().setCustomId('payment_setup_main').setTitle('ตั้งค่าระบบเติมเงิน');
  const fields = [
    ['pay_title', 'หัวข้อการชำระเงิน', config.payment.title],
    ['pay_desc', 'รายละเอียด', config.payment.description],
    ['pay_topup', 'ID ห้องเติมเงิน', config.payment.topupChannelId],
    ['pay_slip', 'ID ห้องแนบสลิป', config.payment.slipChannelId],
    ['pay_banner', 'ลิงค์ Banner ตกแต่ง', config.payment.banner]
  ];
  m.addComponents(...fields.map(([id, label, value]) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(id === 'pay_desc' ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(false).setValue(String(value || '').slice(0, 4000)))));
  return m;
}
function paymentMethodButtons() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pay_method:truemoney').setLabel('💳 TrueMoney').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('pay_method:bank').setLabel('🏦 ธนาคาร').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('pay_method:qr').setLabel('📱 QR Code').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('payment_finish').setLabel('✅ เสร็จสิ้น').setStyle(ButtonStyle.Success)
  )];
}
function methodModal(method) {
  const m = new ModalBuilder().setCustomId(`pay_method_modal:${method}`).setTitle(method === 'truemoney' ? 'ตั้งค่า TrueMoney' : method === 'bank' ? 'ตั้งค่าธนาคาร' : 'ตั้งค่า QR Code');
  let fields;
  if (method === 'truemoney') fields = [['account_name', 'ชื่อบัญชี', config.payment.methods.truemoney.accountName], ['account_number', 'เลขบัญชี', config.payment.methods.truemoney.accountNumber]];
  else if (method === 'bank') fields = [['bank_name', 'ชื่อธนาคาร', config.payment.methods.bank.bankName], ['account_name', 'ชื่อบัญชีธนาคาร', config.payment.methods.bank.accountName], ['account_number', 'เลขบัญชีธนาคาร', config.payment.methods.bank.accountNumber]];
  else fields = [['image_url', 'ลิงค์รูป QR Code', config.payment.methods.qr.imageUrl]];
  m.addComponents(...fields.map(([id, label, value]) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setValue(String(value || '').slice(0, 4000)))));
  return m;
}
function storeSetupModal() {
  const m = new ModalBuilder().setCustomId('store_setup').setTitle('ตั้งค่าร้านค้า');
  const f = [
    ['store_name', 'ชื่อร้านค้า', config.store.name],
    ['store_desc', 'รายละเอียด', config.store.description],
    ['store_channel', 'ID ห้องร้านค้า', config.store.channelId],
    ['store_buy', 'ชื่อปุ่มสำหรับซื้อสินค้า', config.store.buyButton],
    ['store_banner', 'ลิงค์ Banner ตกแต่ง', config.store.banner]
  ];
  m.addComponents(...f.map(([id, label, value]) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(id === 'store_desc' ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(false).setValue(String(value || '').slice(0, 4000)))));
  return m;
}
function storeAddModal() {
  const m = new ModalBuilder().setCustomId('store_add').setTitle('เพิ่มสินค้า');
  const f = [
    ['item_name', 'ชื่อ ITEM หรือ ยศ', ''],
    ['item_desc', 'รายละเอียดสินค้า', ''],
    ['item_type', 'ประเภทสินค้า: ROLE หรือ ITEM', 'ITEM'],
    ['item_price', 'ราคาสินค้า Coins', '5'],
    ['item_stock', 'จำนวนสินค้า (-1 = ไม่จำกัด)', '1']
  ];
  m.addComponents(...f.map(([id, label, value]) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(id === 'item_desc' ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(true).setValue(value))));
  return m;
}
function giftButtonModal() {
  const m = new ModalBuilder().setCustomId('gift_button').setTitle('ตั้งค่าปุ่มแลกรางวัล');
  m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gift_button_name').setLabel('ชื่อปุ่มแลกรางวัล').setStyle(TextInputStyle.Short).setRequired(true).setValue(config.store.giftButton || '🎁 แลกรางวัล')));
  return m;
}
function addGiftModal() {
  const m = new ModalBuilder().setCustomId('gift_add').setTitle('เพิ่มรางวัลแลกด้วยเกลือ');
  const f = [['gift_name', 'ชื่อของรางวัลสำหรับแลก', ''], ['gift_cost', 'จำนวนเกลือที่ใช้แลก', '1'], ['gift_stock', 'จำนวนเหลือ (-1 = ไม่จำกัด)', '1'], ['gift_type', 'ประเภท ROLE หรือ ITEM', 'ITEM']];
  m.addComponents(...f.map(([id, label, value]) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setValue(value))));
  return m;
}
function gachaSetup1Modal() {
  const m = new ModalBuilder().setCustomId('gacha_setup_1').setTitle('ตั้งค่าตู้กาชา 1/2');
  const f = [['g_name', 'ชื่อตู้กาชา', gacha.name], ['g_desc', 'รายละเอียด', gacha.description], ['g_channel', 'ID ช่องกาชา', gacha.channelId], ['g_banner', 'ลิงค์ Banner', gacha.banner], ['g_ticket_emoji', 'อิโมจิตั๋วกาชา', gacha.ticketEmoji]];
  m.addComponents(...f.map(([id, label, value]) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(id === 'g_desc' ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(false).setValue(String(value || '').slice(0, 4000)))));
  return m;
}
function gachaSetup2Modal() {
  const m = new ModalBuilder().setCustomId('gacha_setup_2').setTitle('ตั้งค่าตู้กาชา 2/2');
  const f = [['g_ticket_name', 'ชื่อตั๋วกาชา', gacha.ticketName], ['g_spin_button', 'ชื่อปุ่มสุ่มกาชา', gacha.spinButton], ['g_loading', 'ลิงค์ Banner ตอนกำลังสุ่ม', gacha.loadingBanner]];
  m.addComponents(...f.map(([id, label, value]) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(false).setValue(String(value || '').slice(0, 4000)))));
  return m;
}
function gachaAdminPanel() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('gacha_reward_add').setLabel('➕ เพิ่มของรางวัล').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('gacha_reward_remove').setLabel('➖ ลบของรางวัล').setStyle(ButtonStyle.Danger)
  )];
}
function gachaRewardAddModal() {
  const m = new ModalBuilder().setCustomId('gacha_reward_add_modal').setTitle('เพิ่มรางวัลกาชา');
  const f = [['reward_name', 'ชื่อรางวัล', ''], ['reward_qty', 'จำนวน (-1 = ไม่จำกัด)', '1'], ['reward_chance', 'โอกาสพื้นฐาน', '1'], ['reward_type', 'ประเภท ROLE หรือ ITEM', 'ITEM']];
  m.addComponents(...f.map(([id, label, value]) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setValue(value))));
  return m;
}
function gachaRewardRemoveModal() {
  const m = new ModalBuilder().setCustomId('gacha_reward_remove_modal').setTitle('ลบรางวัลกาชา');
  m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reward_name').setLabel('ชื่อรางวัลที่ต้องการลบ').setStyle(TextInputStyle.Short).setRequired(true)));
  return m;
}

async function showTopupAmount(interaction, method, coins, amount) {
  const p = { id: uid('topup'), userId: interaction.user.id, guildId: interaction.guild.id, method, coins, amount, status: 'waiting_slip', createdAt: Date.now() };
  pending[p.id] = p;
  save('pending', pending);
  const e = new EmbedBuilder().setColor(0xf1c40f).setTitle('🧾 แจ้งยอดเติมเงิน').setDescription(`จำนวน Coins: **${coins.toLocaleString()} Coins**\nยอดชำระ: **${money(amount)} บาท**\n\nเมื่อชำระเงินแล้ว ให้แนบรูปสลิปในห้อง <#${config.payment.slipChannelId}>\nระบบจะส่งสลิปไปให้แอดมินตรวจสอบอัตโนมัติ`);
  return interaction.reply({ embeds: [e], ephemeral: true });
}

async function createReviewChannelIfNeeded(guild) {
  if (config.payment.reviewChannelId) {
    const ch = await guild.channels.fetch(config.payment.reviewChannelId).catch(() => null);
    if (isTextChannel(ch)) return ch;
  }
  const ch = await guild.channels.create({ name: 'ตรวจสอบการเงิน', type: ChannelType.GuildText, reason: 'LUCENT payment review channel' });
  config.payment.reviewChannelId = ch.id;
  save('config', config);
  return ch;
}

function reviewEmbed(p, user) {
  return new EmbedBuilder().setColor(0xf1c40f).setTitle('💰 รายการเติมเงินรอตรวจสอบ')
    .addFields(
      { name: 'ผู้เติม', value: `<@${p.userId}> (${user?.tag || p.userId})` },
      { name: 'Coins', value: `${Number(p.coins).toLocaleString()} Coins`, inline: true },
      { name: 'ยอดชำระ', value: `${money(p.amount)} บาท`, inline: true },
      { name: 'ช่องทาง', value: p.method }
    )
    .setFooter({ text: `TOPUP ID: ${p.id}` });
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
  for (const guild of client.guilds.cache.values()) {
    try {
      if (config.store.channelId) await refreshStore(guild);
      if (gacha.channelId && gacha.messageId) await updateGachaMessage(guild);
    } catch (e) { console.error('Auto refresh error:', e.message); }
  }
});

client.on('guildCreate', async guild => { await registerCommands().catch(() => {}); });

client.on('interactionCreate', async i => {
  try {
    // ---------------- SLASH COMMANDS ----------------
    if (i.isChatInputCommand()) {
      if (['pymentsetting', 'storesetup', 'storeadd', 'gift', 'gachasetup', 'gachastart', 'gachareward'].includes(i.commandName) && !isAdmin(i)) {
        return i.reply({ content: '❌ เฉพาะ Administrator เท่านั้น', ephemeral: true });
      }
      if (i.commandName === 'pymentsetting') return i.showModal(paymentSetupModal());
      if (i.commandName === 'startstore') {
        if (!config.payment.topupChannelId) return i.reply({ content: '❌ ยังไม่ได้ตั้งค่าระบบเติมเงิน ใช้ /pymentsetting ก่อน', ephemeral: true });
        const ch = await i.guild.channels.fetch(config.payment.topupChannelId).catch(() => null);
        if (!isTextChannel(ch)) return i.reply({ content: '❌ ไม่พบห้องเติมเงิน', ephemeral: true });
        const messages = await ch.messages.fetch({ limit: 20 }).catch(() => new Map());
        const old = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title === config.payment.title);
        if (old) await old.edit(paymentPanel()); else await ch.send(paymentPanel());
        return i.reply({ content: `✅ หน้าระบบเติมเงินพร้อมใช้งานที่ ${ch}`, ephemeral: true });
      }
      if (i.commandName === 'storesetup') return i.showModal(storeSetupModal());
      if (i.commandName === 'storeadd') return i.showModal(storeAddModal());
      if (i.commandName === 'gift') return i.showModal(giftButtonModal());
      if (i.commandName === 'gachasetup') return i.showModal(gachaSetup1Modal());
      if (i.commandName === 'gachastart') {
        if (!gacha.channelId) return i.reply({ content: '❌ ใช้ /gachasetup ก่อน', ephemeral: true });
        const ch = await i.guild.channels.fetch(gacha.channelId).catch(() => null);
        if (!isTextChannel(ch)) return i.reply({ content: '❌ ไม่พบห้องกาชา', ephemeral: true });
        let msg = gacha.messageId ? await ch.messages.fetch(gacha.messageId).catch(() => null) : null;
        if (msg) await msg.edit({ embeds: [gachaEmbed()], ...gachaComponents() });
        else { msg = await ch.send({ embeds: [gachaEmbed()], ...gachaComponents() }); gacha.messageId = msg.id; save('gacha', gacha); }
        await ensureGachaTicketProduct(i.guild);
        await refreshStore(i.guild);
        return i.reply({ content: `✅ ตู้กาชาพร้อมใช้งานที่ ${ch}`, ephemeral: true });
      }
      if (i.commandName === 'gachareward') {
        return i.reply({ content: '🛠️ แผงจัดการรางวัลกาชา', components: gachaAdminPanel(), ephemeral: true });
      }
      if (i.commandName === 'balance') {
        const u = getUser(i.user.id); return i.reply({ content: `🪙 Coins: **${u.coins.toLocaleString()}**\n🧂 เกลือ: **${u.salt.toLocaleString()}**\n🎟️ ตั๋วกาชา: **${u.tickets.toLocaleString()}**`, ephemeral: true });
      }
    }

    // ---------------- PAYMENT SETUP MODALS ----------------
    if (i.isModalSubmit() && i.customId === 'payment_setup_main') {
      config.payment.title = i.fields.getTextInputValue('pay_title') || '💳 ระบบเติมเงิน LUCENT';
      config.payment.description = i.fields.getTextInputValue('pay_desc') || 'เลือกช่องทางชำระเงินด้านล่าง';
      config.payment.banner = i.fields.getTextInputValue('pay_banner') || '';
      if (!validUrl(config.payment.banner)) return i.reply({ content: '❌ Banner ต้องเป็นลิงค์ http/https', ephemeral: true });
      const top = await createOrUseTextChannel(i.guild, i.fields.getTextInputValue('pay_topup'), 'เติมเงิน');
      const slip = await createOrUseTextChannel(i.guild, i.fields.getTextInputValue('pay_slip'), 'แนบสลิป');
      config.payment.topupChannelId = top.id;
      config.payment.slipChannelId = slip.id;
      await createReviewChannelIfNeeded(i.guild);
      save('config', config);
      await top.send(paymentPanel()).catch(() => {});
      return i.reply({ content: `✅ บันทึกหลักแล้ว\nห้องเติมเงิน: ${top}\nห้องแนบสลิป: ${slip}\nห้องตรวจสอบการเงิน: <#${config.payment.reviewChannelId}>\n\nต่อไปกดปุ่มด้านล่างเพื่อตั้งค่า TrueMoney / ธนาคาร / QR`, components: paymentMethodButtons(), ephemeral: true });
    }
    if (i.isButton() && i.customId.startsWith('pay_method:')) return i.showModal(methodModal(i.customId.split(':')[1]));
    if (i.isModalSubmit() && i.customId.startsWith('pay_method_modal:')) {
      const method = i.customId.split(':')[1];
      if (method === 'truemoney') {
        config.payment.methods.truemoney = { enabled: true, accountName: i.fields.getTextInputValue('account_name'), accountNumber: i.fields.getTextInputValue('account_number') };
      } else if (method === 'bank') {
        config.payment.methods.bank = { enabled: true, bankName: i.fields.getTextInputValue('bank_name'), accountName: i.fields.getTextInputValue('account_name'), accountNumber: i.fields.getTextInputValue('account_number') };
      } else {
        const imageUrl = i.fields.getTextInputValue('image_url');
        if (!validUrl(imageUrl)) return i.reply({ content: '❌ QR Code ต้องเป็นลิงค์ http/https', ephemeral: true });
        config.payment.methods.qr = { enabled: true, imageUrl };
      }
      save('config', config);
      return i.reply({ content: `✅ ตั้งค่า ${method} แล้ว\nกด /startstore เพื่อรีเฟรชหน้าระบบเติมเงินเมื่อพร้อม`, components: paymentMethodButtons(), ephemeral: true });
    }
    if (i.isButton() && i.customId === 'payment_finish') {
      save('config', config);
      const ch = await i.guild.channels.fetch(config.payment.topupChannelId).catch(() => null);
      if (isTextChannel(ch)) {
        const msgs = await ch.messages.fetch({ limit: 20 }).catch(() => new Map());
        const old = msgs.find(m => m.author.id === client.user.id && m.embeds[0]?.title === config.payment.title);
        if (old) await old.edit(paymentPanel()); else await ch.send(paymentPanel());
      }
      return i.update({ content: '✅ ตั้งค่าระบบเติมเงินเสร็จสมบูรณ์', components: [] });
    }

    // ---------------- PAYMENT USER FLOW ----------------
    if (i.isButton() && i.customId === 'topup_open') {
      if (!enabledPaymentMethods().length) return i.reply({ content: '❌ ยังไม่มีช่องทางชำระเงินที่เปิดใช้งาน', ephemeral: true });
      return i.reply({ content: 'เลือกช่องทางชำระเงิน:', components: [paymentMethodMenu()], ephemeral: true });
    }
    if (i.isStringSelectMenu() && i.customId === 'payment_method') {
      const method = i.values[0];
      return i.update({ embeds: [paymentMethodEmbed(method)], components: [packageMenu(method), customCoinOptions()] });
    }
    if (i.isStringSelectMenu() && i.customId.startsWith('topup_package:')) {
      const method = i.customId.split(':')[1];
      const coins = Number(i.values[0]);
      const amount = coins * COIN_RATE;
      return showTopupAmount(i, method, coins, amount);
    }
    if (i.isButton() && i.customId === 'topup_custom') {
      const m = new ModalBuilder().setCustomId('topup_custom_modal').setTitle('กำหนดจำนวน Coins');
      m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('custom_coins').setLabel('จำนวน Coins ที่ต้องการ').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('เช่น 100')));
      return i.showModal(m);
    }
    if (i.isModalSubmit() && i.customId === 'topup_custom_modal') {
      const coins = Number(i.fields.getTextInputValue('custom_coins').replace(/,/g, ''));
      if (!Number.isInteger(coins) || coins <= 0 || coins * COIN_RATE < 1) return i.reply({ content: '❌ จำนวน Coins ไม่ถูกต้อง (ยอดเติมขั้นต่ำ 1 บาท ดังนั้นกำหนดเองต้องอย่างน้อย 2 Coins)', ephemeral: true });
      return showTopupAmount(i, 'custom', coins, coins * COIN_RATE);
    }

    // ---------------- STORE SETUP / ADD ----------------
    if (i.isModalSubmit() && i.customId === 'store_setup') {
      config.store.name = i.fields.getTextInputValue('store_name') || '🛒 LUCENT STORE';
      config.store.description = i.fields.getTextInputValue('store_desc') || 'ร้านค้า Coins';
      config.store.channelId = cleanId(i.fields.getTextInputValue('store_channel'));
      config.store.buyButton = i.fields.getTextInputValue('store_buy') || '🛒 ซื้อสินค้า';
      config.store.banner = i.fields.getTextInputValue('store_banner') || '';
      if (!validUrl(config.store.banner)) return i.reply({ content: '❌ Banner ต้องเป็นลิงค์ http/https', ephemeral: true });
      const ch = await createOrUseTextChannel(i.guild, config.store.channelId, 'shop');
      config.store.channelId = ch.id; save('config', config);
      await refreshStore(i.guild);
      return i.reply({ content: `✅ ตั้งค่าร้านค้าเสร็จแล้ว: ${ch}\nเพิ่มสินค้าแล้วหน้าร้านจะอัปเดตทันที ไม่ต้องใช้คำสั่งซ้ำ`, ephemeral: true });
    }
    if (i.isModalSubmit() && i.customId === 'store_add') {
      const name = i.fields.getTextInputValue('item_name').trim();
      const desc = i.fields.getTextInputValue('item_desc').trim();
      const type = i.fields.getTextInputValue('item_type').trim().toUpperCase();
      const price = Number(i.fields.getTextInputValue('item_price').replace(/,/g, ''));
      const stock = Number(i.fields.getTextInputValue('item_stock').replace(/,/g, ''));
      if (!name || !['ROLE', 'ITEM'].includes(type) || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < -1) return i.reply({ content: '❌ ข้อมูลสินค้าไม่ถูกต้อง: type ต้อง ROLE/ITEM, ราคา >= 0, จำนวนเป็นจำนวนเต็ม (-1 = ไม่จำกัด)', ephemeral: true });
      if (type === 'ROLE' && !findRoleByName(i.guild, name)) return i.reply({ content: `❌ ไม่พบยศชื่อ **${name}** ในเซิร์ฟเวอร์\nตั้งชื่อ ITEM ให้ตรงกับชื่อ Role แบบเป๊ะ ๆ`, ephemeral: true });
      const id = uid('product');
      const role = type === 'ROLE' ? findRoleByName(i.guild, name) : null;
      store.products[id] = { id, name, description: desc, type, price, stock, roleId: role?.id || '', gachaTicket: false, createdAt: Date.now() };
      save('store', store);
      if (!config.store.channelId) return i.reply({ content: `✅ เพิ่มสินค้า **${name}** แล้ว แต่ยังไม่ได้ตั้งค่าร้านค้า ใช้ /storesetup`, ephemeral: true });
      await refreshStore(i.guild);
      return i.reply({ content: `✅ เพิ่มสินค้า **${name}** สำเร็จ\n📦 จำนวน: ${stock < 0 ? 'ไม่จำกัด' : stock}\n💰 ราคา: ${price} Coins\n🛒 หน้าร้านอัปเดตให้แล้วอัตโนมัติ`, ephemeral: true });
    }
    if (i.isModalSubmit() && i.customId === 'gift_button') {
      config.store.giftButton = i.fields.getTextInputValue('gift_button_name') || '🎁 แลกรางวัล'; save('config', config); await refreshStore(i.guild);
      return i.reply({ content: '✅ เปลี่ยนชื่อปุ่มแลกรางวัลและอัปเดตหน้าร้านแล้ว', ephemeral: true });
    }
    if (i.isButton() && i.customId === 'gift_open') {
      const menu = giftMenu();
      if (!menu) return i.reply({ content: '❌ ตอนนี้ยังไม่มีรางวัลให้แลก', ephemeral: true });
      const u = getUser(i.user.id);
      return i.reply({ content: `🧂 คุณมีเกลือ **${u.salt}**\nเลือกรางวัล:`, components: [menu], ephemeral: true });
    }
    if (i.isStringSelectMenu() && i.customId === 'gift_select') {
      const g = gifts.items[i.values[0]];
      if (!g) return i.reply({ content: '❌ ไม่พบรางวัล', ephemeral: true });
      const result = await grantGift(i, g);
      if (result.ok) await refreshStore(i.guild);
      return i.reply({ content: result.msg, ephemeral: true });
    }

    // ---------------- BUY FLOW ----------------
    if (i.isStringSelectMenu() && i.customId.startsWith('buy_select:')) {
      const p = store.products[i.values[0]];
      if (!p || p.stock === 0) return i.reply({ content: '❌ สินค้านี้หมดแล้ว', ephemeral: true });
      if (p.type === 'ROLE') {
        return i.reply({ content: `ชื่อสินค้า : **${p.name}**\nราคา : **${p.price} Coins**\nจำนวน : **1**\n\nยืนยันการซื้อหรือไม่?`, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`buy_confirm:${p.id}:1`).setLabel('✅ ยืนยันคำสั่งซื้อ').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('buy_cancel').setLabel('❌ ยกเลิกคำสั่งซื้อ').setStyle(ButtonStyle.Danger))], ephemeral: true });
      }
      const m = new ModalBuilder().setCustomId(`buy_qty:${p.id}`).setTitle(`ซื้อ ${p.name}`);
      m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('qty').setLabel(`จำนวนสินค้า (เหลือ ${p.stock < 0 ? 'ไม่จำกัด' : p.stock})`).setStyle(TextInputStyle.Short).setRequired(true).setValue('1')));
      return i.showModal(m);
    }
    if (i.isModalSubmit() && i.customId.startsWith('buy_qty:')) {
      const id = i.customId.split(':')[1]; const p = store.products[id];
      if (!p || p.stock === 0) return i.reply({ content: '❌ สินค้านี้หมดแล้ว', ephemeral: true });
      const qty = Number(i.fields.getTextInputValue('qty').replace(/,/g, ''));
      if (!Number.isInteger(qty) || qty <= 0 || (p.stock >= 0 && qty > p.stock)) return i.reply({ content: '❌ จำนวนสินค้าไม่ถูกต้อง', ephemeral: true });
      return i.reply({ content: `ชื่อสินค้า : **${p.name}**\nราคา : **${p.price * qty} Coins**\nจำนวน : **${qty}**\n\nยืนยันคำสั่งซื้อหรือไม่?`, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`buy_confirm:${p.id}:${qty}`).setLabel('✅ ยืนยันคำสั่งซื้อ').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('buy_cancel').setLabel('❌ ยกเลิกคำสั่งซื้อ').setStyle(ButtonStyle.Danger))], ephemeral: true });
    }
    if (i.isButton() && i.customId === 'buy_cancel') return i.update({ content: `คุณ ${i.user} ได้ยกเลิกคำสั่งซื้อแล้ว`, components: [] });
    if (i.isButton() && i.customId.startsWith('buy_confirm:')) {
      const [, id, qtyText] = i.customId.split(':'); const p = store.products[id]; const qty = Number(qtyText);
      if (!p) return i.update({ content: '❌ ไม่พบสินค้า', components: [] });
      const result = await grantStoreProduct(i, p, qty);
      if (result.ok) { await refreshStore(i.guild); return i.update({ content: `✅ ${result.msg}`, components: [] }); }
      return i.update({ content: result.msg, components: [] });
    }
    if (i.isButton() && i.customId.startsWith('store_page:')) {
      const page = Number(i.customId.split(':')[1]);
      return i.update({ embeds: [storeEmbed()], ...storeComponents(page) });
    }

    // ---------------- GACHA SETUP ----------------
    if (i.isModalSubmit() && i.customId === 'gacha_setup_1') {
      gacha.name = i.fields.getTextInputValue('g_name') || 'LUCENT GACHA';
      gacha.description = i.fields.getTextInputValue('g_desc') || 'ตู้สำหรับสุ่มกาชา';
      gacha.channelId = cleanId(i.fields.getTextInputValue('g_channel'));
      gacha.banner = i.fields.getTextInputValue('g_banner') || '';
      gacha.ticketEmoji = i.fields.getTextInputValue('g_ticket_emoji') || '🎟️';
      if (!validUrl(gacha.banner)) return i.reply({ content: '❌ Banner ต้องเป็นลิงค์ http/https', ephemeral: true });
      save('gacha', gacha);
      return i.showModal(gachaSetup2Modal());
    }
    if (i.isModalSubmit() && i.customId === 'gacha_setup_2') {
      gacha.ticketName = i.fields.getTextInputValue('g_ticket_name') || 'Gacha Ticket';
      gacha.spinButton = i.fields.getTextInputValue('g_spin_button') || '🎰 สุ่มกาชา';
      gacha.loadingBanner = i.fields.getTextInputValue('g_loading') || '';
      if (!validUrl(gacha.loadingBanner)) return i.reply({ content: '❌ Loading Banner ต้องเป็นลิงค์ http/https', ephemeral: true });
      save('gacha', gacha);
      await ensureGachaTicketProduct(i.guild);
      await refreshStore(i.guild);
      return i.reply({ content: '✅ ตั้งค่าตู้กาชาครบแล้ว และเพิ่มตั๋วกาชาในร้านให้อัตโนมัติ ราคา 5 Coins/ตั๋ว\nใช้ /gachastart เพื่อสร้าง/รีเฟรชตู้', ephemeral: true });
    }
    if (i.isButton() && i.customId === 'gacha_reward_add') return i.showModal(gachaRewardAddModal());
    if (i.isButton() && i.customId === 'gacha_reward_remove') return i.showModal(gachaRewardRemoveModal());
    if (i.isModalSubmit() && i.customId === 'gacha_reward_add_modal') {
      const rawName = i.fields.getTextInputValue('reward_name').trim();
      const name = rawName;
      const qty = Number(i.fields.getTextInputValue('reward_qty').replace(/,/g, ''));
      const chance = Number(i.fields.getTextInputValue('reward_chance'));
      const type = i.fields.getTextInputValue('reward_type').trim().toUpperCase();
      if (!name || !['ROLE', 'ITEM'].includes(type) || !Number.isFinite(chance) || chance <= 0 || !Number.isInteger(qty) || qty < -1) return i.reply({ content: '❌ ข้อมูลรางวัลไม่ถูกต้อง', ephemeral: true });
      let roleId = '';
      if (type === 'ROLE') {
        const role = findRoleByName(i.guild, name);
        if (!role) return i.reply({ content: `❌ ไม่พบยศ **${name}**`, ephemeral: true });
        roleId = role.id;
      }
      gacha.rewards.push({ id: uid('reward'), name, quantity: qty, unlimited: qty === -1, chance, type, roleId });
      save('gacha', gacha);
      await updateGachaMessage(i.guild); await refreshStore(i.guild);
      return i.reply({ content: `✅ เพิ่มรางวัล **${name}** แล้ว\nระบบคำนวณเปอร์เซ็นต์ใหม่อัตโนมัติ`, ephemeral: true });
    }
    if (i.isModalSubmit() && i.customId === 'gacha_reward_remove_modal') {
      const name = i.fields.getTextInputValue('reward_name').trim().toLowerCase();
      const before = gacha.rewards.length;
      gacha.rewards = gacha.rewards.filter(r => r.name.toLowerCase() !== name);
      if (gacha.rewards.length === before) return i.reply({ content: '❌ ไม่พบรางวัลชื่อนี้', ephemeral: true });
      save('gacha', gacha); await updateGachaMessage(i.guild); return i.reply({ content: '✅ ลบรางวัลแล้ว และคำนวณโอกาสใหม่อัตโนมัติ', ephemeral: true });
    }

    // ---------------- GACHA USER FLOW ----------------
    if (i.isButton() && i.customId === 'gacha_spin') {
      if (!gacha.rewards.length) return i.reply({ content: '❌ ตู้กาชายังไม่มีรางวัล', ephemeral: true });
      const u = getUser(i.user.id);
      if (u.tickets < 1) return i.reply({ content: `❌ คุณไม่มีตั๋วกาชา\n🎟️ ต้องใช้ 1 ตั๋วต่อ 1 ครั้ง\nตั๋วซื้อได้ในร้าน ราคา ${GACHA_TICKET_PRICE} Coins`, ephemeral: true });
      const menu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('gacha_count').setPlaceholder('เลือกจำนวนครั้ง').addOptions(
        new StringSelectMenuOptionBuilder().setLabel('1 ครั้ง — 1 ตั๋ว').setValue('1'),
        new StringSelectMenuOptionBuilder().setLabel('5 ครั้ง — 5 ตั๋ว').setValue('5'),
        new StringSelectMenuOptionBuilder().setLabel('10 ครั้ง — 10 ตั๋ว').setValue('10')
      ));
      return i.reply({ content: `🎟️ คุณมี **${u.tickets}** ตั๋ว`, components: [menu], ephemeral: true });
    }
    if (i.isStringSelectMenu() && i.customId === 'gacha_count') {
      const count = Number(i.values[0]); const u = getUser(i.user.id);
      if (u.tickets < count) return i.reply({ content: `❌ ตั๋วไม่พอ ต้องใช้ ${count} แต่คุณมี ${u.tickets}`, ephemeral: true });
      await i.deferReply({ ephemeral: true });
      u.tickets -= count;
      save('users', users);
      if (validUrl(gacha.loadingBanner)) await i.editReply({ embeds: [new EmbedBuilder().setColor(0xf1c40f).setTitle('🎰 LOADING...').setDescription(`กำลังสุ่ม ${count} ครั้ง โปรดรอประมาณ 5 วินาที`).setImage(gacha.loadingBanner)] });
      else await i.editReply({ embeds: [new EmbedBuilder().setColor(0xf1c40f).setTitle('🎰 LOADING...').setDescription(`กำลังสุ่ม ${count} ครั้ง โปรดรอประมาณ 5 วินาที...`)] });
      await new Promise(r => setTimeout(r, 5000));
      const results = [];
      for (let n = 0; n < count; n++) {
        const r = pickReward(); if (!r) break;
        results.push(r);
        if (!r.unlimited) r.quantity -= 1;
        if (r.type === 'ROLE') {
          const role = r.roleId ? i.guild.roles.cache.get(r.roleId) : findRoleByName(i.guild, r.name);
          if (role && role.position < i.guild.members.me.roles.highest.position) await i.member.roles.add(role).catch(() => {});
        } else if (r.name.toLowerCase() === 'coins' || /^coins\s+[\d,]+$/i.test(r.name)) {
          const amountMatch = r.name.match(/^coins\s+([\d,]+)$/i);
          const coinAmount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : 1;
          u.coins += Number.isFinite(coinAmount) && coinAmount > 0 ? coinAmount : 1;
        } else if (r.name.toLowerCase() === 'เกลือ' || r.name.toLowerCase() === 'salt') {
          u.salt += 1;
        } else addInventory(i.user.id, r.name, 1);
      }
      save('gacha', gacha); save('users', users);
      const lines = results.map((r, idx) => `${idx + 1}. ${r.type === 'ROLE' ? '🏷️' : '🎁'} **${r.name}**`).join('\n') || 'ไม่มีรางวัล';
      const e = new EmbedBuilder().setColor(0x57f287).setTitle('🎉 ผลการสุ่มกาชา').setDescription(lines).addFields({ name: 'สรุป', value: `สุ่ม ${count} ครั้ง\nตั๋วคงเหลือ ${u.tickets}` });
      await i.editReply({ embeds: [e], components: [] });
      await updateGachaMessage(i.guild);
      await refreshStore(i.guild);
    }

    // ---------------- PAGINATED SHOP ----------------
    if (i.isButton() && i.customId.startsWith('store_page:')) {
      const page = Number(i.customId.split(':')[1]);
      return i.update({ embeds: [storeEmbed()], ...storeComponents(page) });
    }
  } catch (err) {
    console.error('interactionCreate error:', err);
    if (!i.replied && !i.deferred) await i.reply({ content: '❌ ระบบเกิดข้อผิดพลาด โปรดลองใหม่อีกครั้ง', ephemeral: true }).catch(() => {});
    else if (i.deferred) await i.editReply({ content: '❌ ระบบเกิดข้อผิดพลาด โปรดลองใหม่อีกครั้ง' }).catch(() => {});
  }
});

async function ensureGachaTicketProduct(guild) {
  const existing = Object.values(store.products).find(p => p.gachaTicket === true);
  if (existing) {
    existing.name = gacha.ticketName;
    existing.description = `${gacha.ticketEmoji} ตั๋วสำหรับสุ่ม ${gacha.name}`;
    existing.price = GACHA_TICKET_PRICE;
    existing.type = 'ITEM';
    existing.stock = -1;
  } else {
    const id = uid('gacha_ticket');
    store.products[id] = { id, name: gacha.ticketName, description: `${gacha.ticketEmoji} ตั๋วสำหรับสุ่ม ${gacha.name}`, type: 'ITEM', price: GACHA_TICKET_PRICE, stock: -1, roleId: '', gachaTicket: true, createdAt: Date.now() };
  }
  save('store', store);
}

// ---------------- MESSAGE COMMANDS ----------------
client.on('messageCreate', async m => {
  if (m.author.bot) return;
  try {
    const text = m.content.trim();
    if (text === '!setup') {
      if (!m.member?.permissions.has(PermissionFlagsBits.Administrator)) return m.reply('❌ เฉพาะ Administrator เท่านั้น');
      const e = new EmbedBuilder().setColor(0x5865f2).setTitle('🛠️ LUCENT BOT — คำสั่งที่ใช้งานจริง').setDescription(
        '**💳 ระบบเติมเงิน**\n`/pymentsetting` — ตั้งค่าบัญชี TrueMoney / ธนาคาร / QR และห้องเติมเงิน\n`/startstore` — สร้าง/รีเฟรชหน้าปุ่มเติมเงิน\n\n' +
        '**🛒 ระบบร้านค้า**\n`/storesetup` — ตั้งค่าร้านค้า\n`/storeadd` — เพิ่ม ROLE/ITEM และหน้าร้านอัปเดตทันที\n`/gift` — ตั้งชื่อปุ่มแลกรางวัล\n`!addgift` — เปิดปุ่มเพื่อกรอกฟอร์มเพิ่มรางวัลแลกด้วยเกลือ\n\n' +
        '**🎰 ระบบกาชา**\n`/gachasetup` — ตั้งค่าตู้ครบ 8 ช่อง\n`/gachastart` — สร้าง/รีเฟรชตู้\n`/gachareward` — เปิดแผงเพิ่ม/ลบรางวัล\n\n' +
        '**👤 สมาชิก**\n`/balance` — ดู Coins / เกลือ / ตั๋ว\n`!bagpack` — ดูกระเป๋า\n\n' +
        '⚙️ ข้อมูลทั้งหมดเก็บในไฟล์ JSON อัตโนมัติ ไม่ใช้ MongoDB\n💰 1 Coin = 0.86 บาท • 🎟️ ตั๋วกาชา = 5 Coins'
      );
      return m.reply({ embeds: [e] });
    }
    if (text === '!bagpack') {
      const u = getUser(m.author.id);
      const items = Object.entries(u.inventory).filter(([, q]) => q > 0).map(([name, q]) => `• **${name}** × ${q}`).join('\n') || 'ไม่มีไอเท็ม';
      const e = new EmbedBuilder().setColor(0xf1c40f).setTitle(`🎒 กระเป๋าของ ${m.member?.displayName || m.author.username}`).addFields(
        { name: '🪙 Coins', value: `${u.coins.toLocaleString()}` },
        { name: '🧂 เกลือ', value: `${u.salt.toLocaleString()}` },
        { name: '🎟️ ตั๋วกาชา', value: `${u.tickets.toLocaleString()}` },
        { name: '📦 ไอเท็ม', value: items.slice(0, 1024) }
      );
      return m.reply({ embeds: [e] });
    }
    if (text === '!addgift') {
      if (!m.member?.permissions.has(PermissionFlagsBits.Administrator)) return m.reply('❌ เฉพาะ Administrator เท่านั้น');
      return m.reply({ content: 'กดปุ่มด้านล่างเพื่อเปิดฟอร์มเพิ่มรางวัลแลกด้วยเกลือ', components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_addgift').setLabel('➕ เพิ่มรางวัลแลก').setStyle(ButtonStyle.Success))] });
    }
    // Accept old typo/alias without exposing extra slash commands.
    if (text === '!backpack') return m.channel.send({ content: 'ใช้ !bagpack แทนคำสั่งนี้' });
  } catch (err) { console.error('messageCreate error:', err); }
});

client.on('interactionCreate', async i => {
  // This second listener is intentionally only for the prefix-command button to keep the main listener readable.
  try {
    if (i.isButton() && i.customId === 'open_addgift') {
      if (!isAdmin(i)) return i.reply({ content: '❌ เฉพาะ Administrator', ephemeral: true });
      return i.showModal(addGiftModal());
    }
    if (i.isModalSubmit() && i.customId === 'gift_add') {
      const name = i.fields.getTextInputValue('gift_name').trim();
      const cost = Number(i.fields.getTextInputValue('gift_cost').replace(/,/g, ''));
      const stock = Number(i.fields.getTextInputValue('gift_stock').replace(/,/g, ''));
      const type = i.fields.getTextInputValue('gift_type').trim().toUpperCase();
      if (!name || !['ROLE', 'ITEM'].includes(type) || !Number.isInteger(cost) || cost < 0 || !Number.isInteger(stock) || stock < -1) return i.reply({ content: '❌ ข้อมูลไม่ถูกต้อง', ephemeral: true });
      let roleId = '';
      if (type === 'ROLE') {
        const role = findRoleByName(i.guild, name);
        if (!role) return i.reply({ content: `❌ ไม่พบยศ **${name}**`, ephemeral: true });
        roleId = role.id;
      }
      const id = uid('gift');
      gifts.items[id] = { id, name, cost, stock, type, roleId, createdAt: Date.now() };
      save('gifts', gifts); await refreshStore(i.guild);
      return i.reply({ content: `✅ เพิ่มรางวัล **${name}** ราคา ${cost} เกลือแล้ว และหน้าร้านอัปเดตทันที`, ephemeral: true });
    }
  } catch (err) { console.error('secondary interaction error:', err); }
});

// ---------------- SLIP WATCHER ----------------
client.on('messageCreate', async m => {
  if (m.author.bot || !m.guild || !config.payment.slipChannelId || m.channel.id !== config.payment.slipChannelId) return;
  if (!m.attachments.size) return;
  try {
    const entries = Object.values(pending).filter(p => p.guildId === m.guild.id && p.userId === m.author.id && p.status === 'waiting_slip').sort((a, b) => b.createdAt - a.createdAt);
    const p = entries[0];
    if (!p) return m.reply({ content: '❌ ไม่พบรายการเติมเงินที่รอแนบสลิปของคุณ โปรดกดเติมเงินและเลือกราคาใหม่ก่อน', allowedMentions: { repliedUser: false } });
    p.status = 'review'; p.slipMessageId = m.id; p.slipUrl = m.attachments.first().url; save('pending', pending);
    const review = await createReviewChannelIfNeeded(m.guild);
    const e = reviewEmbed(p, m.author);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`review_approve:${p.id}`).setLabel('✅ ชำระเงิน').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`review_cancel:${p.id}`).setLabel('❌ ยกเลิก').setStyle(ButtonStyle.Danger)
    );
    await review.send({ embeds: [e], content: `📎 สลิปจาก <@${m.author.id}>`, files: [{ attachment: m.attachments.first().url, name: m.attachments.first().name || 'slip' }], components: [row] });
    await m.reply({ content: `✅ รับสลิปแล้ว ส่งให้แอดมินตรวจสอบที่ <#${review.id}>`, allowedMentions: { repliedUser: false } });
  } catch (err) { console.error('slip watcher error:', err); }
});

// ---------------- REVIEW BUTTONS ----------------
client.on('interactionCreate', async i => {
  try {
    if (!i.isButton() || !i.customId.startsWith('review_')) return;
    if (!isAdmin(i)) return i.reply({ content: '❌ เฉพาะ Administrator', ephemeral: true });
    const [action, id] = i.customId.split(':'); const p = pending[id];
    if (!p) return i.reply({ content: '❌ ไม่พบรายการนี้', ephemeral: true });
    if (p.status !== 'review') return i.reply({ content: `❌ รายการนี้ถูกดำเนินการแล้ว (${p.status})`, ephemeral: true });
    if (action === 'review_cancel') {
      p.status = 'cancelled'; p.reviewedBy = i.user.id; p.reviewedAt = Date.now(); save('pending', pending);
      await i.update({ content: `❌ ยกเลิกรายการเติมเงินของ <@${p.userId}> แล้ว`, embeds: i.message.embeds, components: [] });
      const member = await i.guild.members.fetch(p.userId).catch(() => null);
      if (member) await member.send(`❌ รายการเติมเงินของคุณถูกยกเลิก\nยอด: ${money(p.amount)} บาท\nตรวจสอบโดย: ${i.user.tag}`).catch(() => {});
      return;
    }
    const u = getUser(p.userId); u.coins += Number(p.coins); save('users', users);
    p.status = 'approved'; p.reviewedBy = i.user.id; p.reviewedAt = Date.now(); save('pending', pending);
    await i.update({ content: `✅ อนุมัติการเติมเงิน <@${p.userId}> +${Number(p.coins).toLocaleString()} Coins`, embeds: i.message.embeds, components: [] });
    const member = await i.guild.members.fetch(p.userId).catch(() => null);
    if (member) await member.send(`💰 เติมเงินสำเร็จ\nท่านได้ชำระเงินแล้วจำนวน : ${money(p.amount)} บาท\nCoins ที่ได้รับ : ${Number(p.coins).toLocaleString()} Coins\nเมื่อเวลา : ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}\nตรวจสอบโดย : ${i.user.tag}`).catch(() => {});
  } catch (err) { console.error('review error:', err); if (!i.replied) await i.reply({ content: '❌ เกิดข้อผิดพลาด', ephemeral: true }).catch(() => {}); }
});

if (!TOKEN) {
  console.error('❌ ไม่พบ DISCORD_TOKEN/TOKEN ใน Railway Variables');
  process.exit(1);
}

client.login(TOKEN).catch(err => {
  console.error('❌ Discord login failed:', err);
  process.exit(1);
});
