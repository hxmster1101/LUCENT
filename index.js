// LUCENT DISCORD BOT - Railway Ready
// Node.js 20+ / discord.js v14
// Data is stored in data.json so no MongoDB is required.

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
  AttachmentBuilder
} = require('discord.js');

const fs = require('fs');
const path = require('path');

const TOKEN = process.env.TOKEN || process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN) {
  console.error('Missing TOKEN environment variable.');
  process.exit(1);
}
if (!CLIENT_ID) {
  console.error('Missing CLIENT_ID environment variable.');
  process.exit(1);
}

const DATA_FILE = path.join(__dirname, 'data.json');
const DEFAULT = {
  settings: {
    payment: {
      title: '💳 ระบบเติมเงิน LUCENT',
      description: 'เลือกช่องทางชำระเงินด้านล่าง',
      topupChannelId: '',
      slipChannelId: '',
      banner: '',
      wallet: null,
      bank: null,
      qr: null
    },
    store: {
      name: '🛒 LUCENT STORE',
      description: 'ร้านค้าสำหรับ Coins และรางวัล',
      channelId: '',
      buyButton: '🛒 ซื้อสินค้า',
      giftButton: '🎁 แลกรางวัล',
      banner: ''
    },
    gacha: {
      name: '🎰 LUCENT GACHA',
      description: 'ตู้สำหรับสุ่มกาชา',
      channelId: '',
      banner: '',
      ticketEmoji: '🎟️',
      ticketName: 'Gacha Ticket',
      rollButton: '🎰 สุ่มกาชา',
      loadingBanner: '',
      price: 5
    }
  },
  products: {},
  gifts: {},
  gachaRewards: {},
  users: {},
  pendingPayments: {}
};

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT, null, 2));
      return structuredClone(DEFAULT);
    }
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {
      ...structuredClone(DEFAULT),
      ...d,
      settings: {
        ...structuredClone(DEFAULT.settings),
        ...(d.settings || {}),
        payment: {...structuredClone(DEFAULT.settings.payment), ...(d.settings?.payment || {})},
        store: {...structuredClone(DEFAULT.settings.store), ...(d.settings?.store || {})},
        gacha: {...structuredClone(DEFAULT.settings.gacha), ...(d.settings?.gacha || {})}
      }
    };
  } catch (e) {
    console.error('Could not load data.json:', e);
    return structuredClone(DEFAULT);
  }
}
let db = loadData();

function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function money(n) {
  return Number(n).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}
function esc(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/`/g, '\\`');
}
function isAdmin(i) {
  return i.memberPermissions?.has(PermissionFlagsBits.Administrator) || i.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}
function userData(id) {
  if (!db.users[id]) db.users[id] = {coins: 0, salt: 0, items: {}, tickets: 0};
  return db.users[id];
}
function addItem(id, name, amount) {
  const u = userData(id);
  u.items[name] = (u.items[name] || 0) + amount;
}
function removeItem(id, name, amount) {
  const u = userData(id);
  u.items[name] = Math.max(0, (u.items[name] || 0) - amount);
}
function validUrl(v) {
  if (!v) return false;
  try { new URL(v); return true; } catch { return false; }
}
function parseNum(v, min=0) {
  const n = Number(String(v).replace(/,/g,''));
  return Number.isFinite(n) && n >= min ? n : null;
}
function channelIdFrom(v) {
  const m = String(v).match(/\d{15,20}/);
  return m ? m[0] : String(v);
}

async function safeReply(i, payload) {
  try {
    if (i.replied || i.deferred) return await i.followUp(payload);
    return await i.reply(payload);
  } catch (e) {
    console.error('reply error:', e);
  }
}
async function editOrReply(i, payload) {
  try {
    if (i.deferred || i.replied) return await i.editReply(payload);
    return await i.reply(payload);
  } catch (e) {
    console.error('edit/reply error:', e);
  }
}

function bannerEmbed(title, description, banner) {
  const e = new EmbedBuilder().setColor(0x8e44ad).setTitle(title).setDescription(description || '');
  if (validUrl(banner)) e.setImage(banner);
  return e;
}

function paymentMethods() {
  const p = db.settings.payment;
  const opts = [];
  if (p.wallet) opts.push({label:'TrueMoney Wallet', value:'wallet', emoji:'📱', description:'ดูข้อมูลบัญชี TrueMoney'});
  if (p.bank) opts.push({label:'บัญชีธนาคาร', value:'bank', emoji:'🏦', description:'ดูข้อมูลบัญชีธนาคาร'});
  if (p.qr) opts.push({label:'QR Code', value:'qr', emoji:'📷', description:'ดู QR Code สำหรับชำระเงิน'});
  return opts;
}

function paymentEmbed(kind) {
  const p = db.settings.payment;
  const e = new EmbedBuilder().setColor(0x8e44ad).setTitle(`💳 ${kind === 'wallet' ? 'TrueMoney Wallet' : kind === 'bank' ? 'บัญชีธนาคาร' : 'QR Code ชำระเงิน'}`);
  if (kind === 'wallet' && p.wallet) {
    e.addFields(
      {name:'ชื่อบัญชี', value:p.wallet.name || '-', inline:true},
      {name:'เลขบัญชี', value:p.wallet.number || '-', inline:true}
    );
  } else if (kind === 'bank' && p.bank) {
    e.addFields(
      {name:'ธนาคาร', value:p.bank.bank || '-', inline:true},
      {name:'ชื่อบัญชี', value:p.bank.name || '-', inline:true},
      {name:'เลขบัญชี', value:p.bank.number || '-', inline:true}
    );
  } else if (kind === 'qr' && p.qr) {
    e.setDescription('สแกน QR Code ด้านล่างเพื่อชำระเงิน');
    if (validUrl(p.qr.url)) e.setImage(p.qr.url);
  }
  return e;
}

function paymentPriceText() {
  return [
    '**เรทเติม Coins**',
    '10 Coins = 8.60 บาท',
    '50 Coins = 43.00 บาท',
    '115 Coins = 98.90 บาท',
    '510 Coins = 438.60 บาท',
    '1,150 Coins = 989.00 บาท',
    '',
    'เรทปกติ: **1 Coin = 0.86 บาท**',
    'หากต้องการกำหนดจำนวนเอง ให้กดปุ่ม `กำหนดเอง`'
  ].join('\n');
}

function paymentPanel() {
  const e = bannerEmbed(
    db.settings.payment.title || '💳 ระบบเติมเงิน',
    `${db.settings.payment.description || ''}\n\n${paymentPriceText()}`,
    db.settings.payment.banner
  );
  const methods = paymentMethods();
  const rows = [];
  if (methods.length) {
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('payment_method')
        .setPlaceholder('เลือกช่องทางชำระเงิน')
        .addOptions(methods)
    ));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('payment_custom').setLabel('กำหนดเอง').setStyle(ButtonStyle.Primary).setEmoji('💰'),
    new ButtonBuilder().setCustomId('payment_how').setLabel('วิธีแจ้งสลิป').setStyle(ButtonStyle.Secondary).setEmoji('🧾')
  ));
  return {embeds:[e], components:rows};
}

function storeEmbed() {
  const s = db.settings.store;
  let desc = `${s.description || ''}\n\n**สินค้าที่สามารถซื้อได้**\n`;
  const products = Object.values(db.products);
  if (!products.length) desc += 'ยังไม่มีสินค้า';
  else {
    for (const p of products) {
      desc += `\n**${p.name}** — ${money(p.price)} Coins\nประเภท: ${p.type === 'role' ? 'ROLE' : 'ITEM'} | คงเหลือ: ${p.stock}\n${p.description || ''}\n`;
    }
  }
  desc += '\n**สินค้าที่สามารถแลกได้**\n';
  const gifts = Object.values(db.gifts);
  if (!gifts.length) desc += 'ยังไม่มีรางวัลแลก';
  else for (const g of gifts) desc += `\n**${g.name}** — ${g.cost} เกลือ | คงเหลือ: ${g.stock}\nประเภท: ${g.type.toUpperCase()}\n`;
  const e = bannerEmbed(s.name || '🛒 LUCENT STORE', desc, s.banner);
  const rows = [];
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('store_buy').setLabel(s.buyButton || '🛒 ซื้อสินค้า').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('store_gift').setLabel(s.giftButton || '🎁 แลกรางวัล').setStyle(ButtonStyle.Success)
  ));
  return {embeds:[e], components:rows};
}

function productOptions() {
  return Object.values(db.products)
    .filter(p => Number(p.stock) > 0)
    .slice(0,25)
    .map(p => ({
      label: p.name.slice(0,100),
      value: p.id,
      description: `${money(p.price)} Coins | เหลือ ${p.stock}`,
      emoji: p.type === 'role' ? '👑' : '📦'
    }));
}
function giftOptions() {
  return Object.values(db.gifts)
    .filter(g => Number(g.stock) > 0)
    .slice(0,25)
    .map(g => ({
      label: g.name.slice(0,100),
      value: g.id,
      description: `${g.cost} เกลือ | เหลือ ${g.stock}`,
      emoji: g.type === 'role' ? '👑' : '🎁'
    }));
}

function gachaEmbed() {
  const g = db.settings.gacha;
  let desc = `${g.description || ''}\n\n**ราคาสุ่ม:** ${g.price} Coins / 1 ${g.ticketName}\n\n**รางวัลในตู้**\n`;
  const rewards = Object.values(db.gachaRewards);
  if (!rewards.length) desc += 'ยังไม่มีรางวัลในตู้';
  else {
    desc += '**ROLE**\n';
    const roles = rewards.filter(x=>x.type==='role');
    desc += roles.length ? roles.map(x=>`• ${x.name} — เหลือ ${x.stock} | ${Number(x.chance).toFixed(2)}%`).join('\n') : 'ไม่มี';
    desc += '\n\n**ITEM**\n';
    const items = rewards.filter(x=>x.type==='item');
    desc += items.length ? items.map(x=>`• ${x.name} — เหลือ ${x.stock === -1 ? 'ไม่จำกัด' : x.stock} | ${Number(x.chance).toFixed(2)}%`).join('\n') : 'ไม่มี';
    desc += '\n\n**หมายเหตุ:** โอกาสรวมจะถูกปรับอัตโนมัติเป็น 100% เมื่อมีการเพิ่ม/ลบรางวัล';
  }
  const e = bannerEmbed(g.name || '🎰 LUCENT GACHA', desc, g.banner);
  return {
    embeds:[e],
    components:[
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('gacha_roll').setLabel(g.rollButton || '🎰 สุ่มกาชา').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('gacha_admin').setLabel('⚙️ จัดการรางวัล').setStyle(ButtonStyle.Secondary)
      )
    ]
  };
}

function recalcGacha() {
  const rewards = Object.values(db.gachaRewards);
  if (!rewards.length) return;
  // Respect manually supplied weights, then normalize to 100%.
  const positive = rewards.map(r => Math.max(0, Number(r.chance) || 0));
  let total = positive.reduce((a,b)=>a+b,0);
  if (total <= 0) {
    total = rewards.length;
    rewards.forEach(r=>r.chance = 100/rewards.length);
  } else {
    rewards.forEach((r,i)=>r.chance = positive[i]/total*100);
  }
  save();
}

function weightedReward() {
  const available = Object.values(db.gachaRewards).filter(r => r.stock === -1 || r.stock > 0);
  if (!available.length) return null;
  const total = available.reduce((a,r)=>a+Number(r.chance),0);
  let roll = Math.random()*total;
  for (const r of available) {
    roll -= Number(r.chance);
    if (roll <= 0) return r;
  }
  return available[available.length-1];
}

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder().setName('paymentsetting').setDescription('ตั้งค่าระบบเติมเงิน'),
    new SlashCommandBuilder().setName('pymentsetting').setDescription('ตั้งค่าระบบเติมเงิน (ชื่อเดิม)'),
    new SlashCommandBuilder().setName('storeadd').setDescription('เพิ่มสินค้าเข้าร้านค้า'),
    new SlashCommandBuilder().setName('gift').setDescription('ตั้งค่าร้านค้า/ปุ่มแลกรางวัล'),
    new SlashCommandBuilder().setName('gachasetup').setDescription('ตั้งค่าตู้กาชา'),
    new SlashCommandBuilder().setName('gachastart').setDescription('สร้างตู้กาชาในห้องที่ตั้งค่า'),
    new SlashCommandBuilder().setName('bagpack').setDescription('ดูกระเป๋าของคุณ'),
    new SlashCommandBuilder().setName('setup').setDescription('ดูคำสั่งทั้งหมดของบอท'),
    new SlashCommandBuilder().setName('addgift').setDescription('เพิ่มรางวัลที่ใช้เกลือแลก'),
    new SlashCommandBuilder().setName('gachareward').setDescription('เพิ่มรางวัลเข้าตู้กาชา'),
    new SlashCommandBuilder().setName('gacharemove').setDescription('ลบรางวัลออกจากตู้กาชา')
  ].map(x=>x.toJSON());

  const rest = new REST({version:'10'}).setToken(TOKEN);
  if (GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {body:commands});
    console.log(`Registered ${commands.length} guild commands.`);
  } else {
    await rest.put(Routes.applicationCommands(CLIENT_ID), {body:commands});
    console.log(`Registered ${commands.length} global commands.`);
  }
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel]
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setActivity('LUCENT SYSTEM', {type: 3});
  try { await registerCommands(); } catch(e) { console.error('Command registration error:', e); }
});

client.on('error', console.error);
process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);

client.on('interactionCreate', async (i) => {
  try {
    // ---------------- SLASH COMMANDS ----------------
    if (i.isChatInputCommand()) {
      if (['paymentsetting','pymentsetting'].includes(i.commandName)) {
        if (!isAdmin(i)) return safeReply(i,{content:'❌ คุณต้องเป็นแอดมินเพื่อใช้คำสั่งนี้',ephemeral:true});
        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('payment_settings_menu').setPlaceholder('เลือกสิ่งที่ต้องการตั้งค่า').addOptions(
            {label:'ตั้งค่าระบบเติมเงิน',value:'system',emoji:'💳'},
            {label:'ตั้งค่า TrueMoney Wallet',value:'wallet',emoji:'📱'},
            {label:'ตั้งค่าบัญชีธนาคาร',value:'bank',emoji:'🏦'},
            {label:'ตั้งค่า QR Code',value:'qr',emoji:'📷'},
            {label:'ดูค่าปัจจุบัน',value:'view',emoji:'👀'}
          )
        );
        return safeReply(i,{content:'⚙️ **Payment Settings**\nเลือกเมนูที่ต้องการตั้งค่าด้านล่าง',components:[row],ephemeral:true});
      }

      if (i.commandName === 'storeadd') {
        if (!isAdmin(i)) return safeReply(i,{content:'❌ เฉพาะแอดมินเท่านั้น',ephemeral:true});
        const m = new ModalBuilder().setCustomId('storeadd_modal').setTitle('เพิ่มสินค้าเข้าร้านค้า');
        m.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('ชื่อ ITEM หรือ ยศ').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('รายละเอียดสินค้า').setStyle(TextInputStyle.Paragraph).setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('ราคาสินค้า (Coins)').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('stock').setLabel('จำนวนสินค้า').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roleId').setLabel('ถ้าเป็นยศ: ใส่ Role ID (ถ้าเป็น ITEM เว้นว่าง)').setStyle(TextInputStyle.Short).setRequired(false))
        );
        return i.showModal(m);
      }

      if (i.commandName === 'gift') {
        if (!isAdmin(i)) return safeReply(i,{content:'❌ เฉพาะแอดมินเท่านั้น',ephemeral:true});
        const m = new ModalBuilder().setCustomId('gift_setup_modal').setTitle('ตั้งค่าร้านค้า');
        m.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('ชื่อร้านค้า').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('รายละเอียด').setStyle(TextInputStyle.Paragraph).setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('channelId').setLabel('ID ห้องร้านค้า').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('buyButton').setLabel('ชื่อปุ่มสำหรับซื้อสินค้า').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('banner').setLabel('ลิงค์ Banner').setStyle(TextInputStyle.Short).setRequired(false))
        );
        return i.showModal(m);
      }

      if (i.commandName === 'gachasetup') {
        if (!isAdmin(i)) return safeReply(i,{content:'❌ เฉพาะแอดมินเท่านั้น',ephemeral:true});
        const m = new ModalBuilder().setCustomId('gachasetup_modal').setTitle('ตั้งค่าตู้กาชา');
        m.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('ชื่อตู้กาชา').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('รายละเอียด').setStyle(TextInputStyle.Paragraph).setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('channelId').setLabel('ID ช่องกาชา').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('banner').setLabel('ลิงค์ Banner').setStyle(TextInputStyle.Short).setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ticketEmojiName').setLabel('Emoji และชื่อตั๋ว เช่น 🎟️|Gacha Ticket').setStyle(TextInputStyle.Short).setRequired(true))
        );
        return i.showModal(m);
      }

      if (i.commandName === 'gachastart') {
        if (!isAdmin(i)) return safeReply(i,{content:'❌ เฉพาะแอดมินเท่านั้น',ephemeral:true});
        const ch = await client.channels.fetch(channelIdFrom(db.settings.gacha.channelId)).catch(()=>null);
        if (!ch || !ch.isTextBased()) return safeReply(i,{content:'❌ ไม่พบห้องกาชาใน ID ที่ตั้งไว้',ephemeral:true});
        await ch.send(gachaEmbed());
        return safeReply(i,{content:`✅ สร้างตู้กาชาใน <#${ch.id}> แล้ว`,ephemeral:true});
      }

      if (i.commandName === 'bagpack') {
        const u = userData(i.user.id);
        let desc = `💰 Coins: **${u.coins.toLocaleString()}**\n🧂 เกลือ: **${u.salt.toLocaleString()}**\n🎟️ ${db.settings.gacha.ticketName}: **${u.tickets.toLocaleString()}**\n\n**ไอเท็ม**\n`;
        const entries = Object.entries(u.items).filter(([,n])=>n>0);
        desc += entries.length ? entries.map(([n,v])=>`• ${n} × ${v}`).join('\n') : 'ไม่มีไอเท็ม';
        return safeReply(i,{embeds:[new EmbedBuilder().setColor(0x8e44ad).setTitle(`🎒 กระเป๋าของ ${i.user.username}`).setDescription(desc)],ephemeral:true});
      }

      if (i.commandName === 'setup') {
        const e = new EmbedBuilder().setColor(0x8e44ad).setTitle('✦ LUCENT COMMAND SET ✦').setDescription(
`💳 **ระบบเติมเงิน**
/paymentsetting หรือ /pymentsetting — ตั้งค่าบัญชีชำระเงินและระบบเติมเงิน

🛒 **ระบบร้านค้า**
/storeadd — เพิ่มสินค้า ROLE/ITEM
/gift — ตั้งค่าหน้าร้านค้าและปุ่มแลกรางวัล

🎰 **ระบบกาชา**
/gachasetup — ตั้งค่าตู้กาชา
/gachastart — สร้างตู้กาชา
/gachareward — เพิ่มรางวัลเข้าตู้
/gacharemove — ลบรางวัลจากตู้

🎁 **ระบบแลกเกลือ**
/addgift — เพิ่มของรางวัลที่แลกด้วยเกลือ

🎒 **ระบบกระเป๋า**
/bagpack — ดู Coins, เกลือ, ตั๋ว และไอเท็ม

ระบบใช้ JSON เป็นฐานข้อมูล ไม่ต้องใช้ MongoDB และรองรับ Railway`);
        return safeReply(i,{embeds:[e],ephemeral:true});
      }

      if (i.commandName === 'addgift') {
        if (!isAdmin(i)) return safeReply(i,{content:'❌ เฉพาะแอดมินเท่านั้น',ephemeral:true});
        const m = new ModalBuilder().setCustomId('addgift_modal').setTitle('เพิ่มรางวัลแลกด้วยเกลือ');
        m.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('ชื่อของรางวัล').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cost').setLabel('จำนวนเกลือที่ใช้แลก').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('stock').setLabel('จำนวนคงเหลือ').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('type').setLabel('ประเภท: ROLE หรือ ITEM').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roleId').setLabel('ถ้า ROLE: ใส่ Role ID').setStyle(TextInputStyle.Short).setRequired(false))
        );
        return i.showModal(m);
      }

      if (i.commandName === 'gachareward') {
        if (!isAdmin(i)) return safeReply(i,{content:'❌ เฉพาะแอดมินเท่านั้น',ephemeral:true});
        const m = new ModalBuilder().setCustomId('gachareward_modal').setTitle('เพิ่มรางวัลกาชา');
        m.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('ชื่อรางวัล').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('stock').setLabel('จำนวน (-1 = ไม่จำกัด)').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('chance').setLabel('น้ำหนัก/โอกาสเริ่มต้น เช่น 10').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('type').setLabel('ประเภท: ROLE หรือ ITEM').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roleId').setLabel('ถ้า ROLE: ใส่ Role ID | ITEM เว้นว่าง').setStyle(TextInputStyle.Short).setRequired(false))
        );
        return i.showModal(m);
      }

      if (i.commandName === 'gacharemove') {
        if (!isAdmin(i)) return safeReply(i,{content:'❌ เฉพาะแอดมินเท่านั้น',ephemeral:true});
        const opts = Object.values(db.gachaRewards).slice(0,25).map(r=>({label:r.name.slice(0,100),value:r.id,description:`${r.type.toUpperCase()} | ${r.stock===-1?'ไม่จำกัด':r.stock}`}));
        if (!opts.length) return safeReply(i,{content:'❌ ยังไม่มีรางวัลในตู้',ephemeral:true});
        return safeReply(i,{content:'เลือกของรางวัลที่ต้องการลบ',components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('gacha_remove_select').setPlaceholder('เลือกรางวัล').addOptions(opts))],ephemeral:true});
      }
    }

    // ---------------- MODALS ----------------
    if (i.isModalSubmit()) {
      const g = id => i.fields.getTextInputValue(id).trim();

      if (i.customId === 'payment_system_modal') {
        db.settings.payment.title = g('title');
        db.settings.payment.description = g('description');
        db.settings.payment.topupChannelId = channelIdFrom(g('topupChannelId'));
        db.settings.payment.slipChannelId = channelIdFrom(g('slipChannelId'));
        db.settings.payment.banner = g('banner');
        save();
        const ch = await client.channels.fetch(db.settings.payment.topupChannelId).catch(()=>null);
        if (ch && ch.isTextBased()) await ch.send(paymentPanel()).catch(()=>{});
        return safeReply(i,{content:`✅ ตั้งค่าระบบเติมเงินเรียบร้อย${ch ? ` และสร้างข้อความใน <#${ch.id}> แล้ว` : ''}`,ephemeral:true});
      }

      if (i.customId === 'wallet_modal') {
        db.settings.payment.wallet = {name:g('name'), number:g('number')};
        save();
        return safeReply(i,{content:'✅ ตั้งค่า TrueMoney Wallet เรียบร้อย',ephemeral:true});
      }

      if (i.customId === 'bank_modal') {
        db.settings.payment.bank = {bank:g('bank'), name:g('name'), number:g('number')};
        save();
        return safeReply(i,{content:'✅ ตั้งค่าบัญชีธนาคารเรียบร้อย',ephemeral:true});
      }

      if (i.customId === 'qr_modal') {
        if (!validUrl(g('url'))) return safeReply(i,{content:'❌ ลิงค์ QR Code ไม่ถูกต้อง',ephemeral:true});
        db.settings.payment.qr = {url:g('url')};
        save();
        return safeReply(i,{content:'✅ ตั้งค่า QR Code เรียบร้อย',ephemeral:true});
      }

      if (i.customId === 'storeadd_modal') {
        const price = parseNum(g('price'),0);
        const stock = parseInt(g('stock'),10);
        if (price === null || !Number.isInteger(stock) || stock < 0) return safeReply(i,{content:'❌ ราคา/จำนวนไม่ถูกต้อง',ephemeral:true});
        const id = Date.now().toString(36);
        db.products[id] = {id,name:g('name'),description:g('description'),price,stock,type:'item',roleId:g('roleId') || '',createdAt:Date.now()};
        save();
        const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`store_type:${id}`).setPlaceholder('เลือกประเภทสินค้า').addOptions(
          {label:'ITEM',value:'item',emoji:'📦',description:'เข้ากระเป๋าอัตโนมัติ'},
          {label:'ROLE',value:'role',emoji:'👑',description:'สวมยศอัตโนมัติ'}
        ));
        return safeReply(i,{content:'เลือกประเภทของสินค้าที่เพิ่งเพิ่ม',components:[row],ephemeral:true});
      }

      if (i.customId === 'gift_setup_modal') {
        db.settings.store.name=g('name');
        db.settings.store.description=g('description');
        db.settings.store.channelId=channelIdFrom(g('channelId'));
        db.settings.store.buyButton=g('buyButton');
        db.settings.store.banner=g('banner');
        save();
        const ch=await client.channels.fetch(db.settings.store.channelId).catch(()=>null);
        if(ch&&ch.isTextBased()) await ch.send(storeEmbed()).catch(()=>{});
        return safeReply(i,{content:`✅ ตั้งค่าร้านค้าเรียบร้อย${ch ? ` และสร้างร้านใน <#${ch.id}> แล้ว` : ''}`,ephemeral:true});
      }

      if (i.customId === 'gachasetup_modal') {
        const pair=g('ticketEmojiName').split('|');
        db.settings.gacha.name=g('name');
        db.settings.gacha.description=g('description');
        db.settings.gacha.channelId=channelIdFrom(g('channelId'));
        db.settings.gacha.banner=g('banner');
        db.settings.gacha.ticketEmoji=pair[0] || '🎟️';
        db.settings.gacha.ticketName=pair[1] || 'Gacha Ticket';
        save();
        return safeReply(i,{content:'✅ ตั้งค่าตู้กาชาเรียบร้อย ใช้ /gachastart เพื่อสร้างตู้',ephemeral:true});
      }

      if (i.customId === 'custom_coins_modal') {
        const coins=parseNum(g('coins'),1);
        if(coins===null || !Number.isInteger(coins)) return safeReply(i,{content:'❌ จำนวน Coins ต้องเป็นเลขจำนวนเต็ม',ephemeral:true});
        const amount=coins*0.86;
        if(amount<1) return safeReply(i,{content:'❌ ยอดขั้นต่ำ 1 บาท ดังนั้นต้องเติมอย่างน้อย 2 Coins',ephemeral:true});
        db.pendingPayments[i.user.id]={userId:i.user.id,coins,amount,createdAt:Date.now(),status:'waiting'};
        save();
        return safeReply(i,{content:`✅ รายการเติมเงินของคุณถูกสร้างแล้ว\n\nCoins: **${coins.toLocaleString()}**\nยอดชำระ: **${money(amount)} บาท**\n\nเมื่อชำระเงินแล้ว กรุณาแนบสลิปที่ <#${db.settings.payment.slipChannelId || 'ตั้งค่าไว้ในระบบ'}>`,ephemeral:true});
      }

      if (i.customId === 'gacha_roll_count_modal') {
        const count=parseInt(g('count'),10);
        if(![1,5,10].includes(count)) return safeReply(i,{content:'❌ เลือกได้เฉพาะ 1, 5 หรือ 10 ครั้ง',ephemeral:true});
        const u=userData(i.user.id);
        const cost=db.settings.gacha.price*count;
        if(u.tickets<count) return safeReply(i,{content:`❌ ตั๋วกาชาไม่พอ ต้องใช้ ${count} ใบ แต่คุณมี ${u.tickets} ใบ`,ephemeral:true});
        u.tickets-=count;
        save();
        await i.deferReply({ephemeral:true});
        const loading = new EmbedBuilder().setColor(0x8e44ad).setTitle('🎰 LOADING...').setDescription(`กำลังสุ่ม ${count} ครั้ง โปรดรอสักครู่...`);
        if(validUrl(db.settings.gacha.loadingBanner)) loading.setImage(db.settings.gacha.loadingBanner);
        await i.editReply({embeds:[loading]});
        await new Promise(r=>setTimeout(r,5000));
        const results=[];
        for(let n=0;n<count;n++){
          const reward=weightedReward();
          if(!reward) break;
          if(reward.stock!==-1) reward.stock--;
          if(reward.type==='role' && reward.roleId){
            const role=await i.guild.roles.fetch(reward.roleId).catch(()=>null);
            if(role) await i.member.roles.add(role).catch(()=>{});
          } else {
            addItem(i.user.id,reward.name,1);
            if(reward.name.toLowerCase()==='coins') u.coins++;
            if(reward.name.toLowerCase()==='เกลือ') u.salt++;
          }
          results.push(reward.name);
        }
        save();
        const out=new EmbedBuilder().setColor(0x8e44ad).setTitle('🎉 ผลการสุ่มกาชา').setDescription(results.length ? results.map((x,n)=>`${n+1}. **${x}**`).join('\n') : 'ไม่มีรางวัลที่สามารถสุ่มได้');
        return i.editReply({embeds:[out]});
      }

      if (i.customId === 'addgift_modal') {
        const cost=parseNum(g('cost'),1), stock=parseInt(g('stock'),10), type=g('type').toLowerCase();
        if(cost===null || !Number.isInteger(stock) || stock<0 || !['role','item'].includes(type)) return safeReply(i,{content:'❌ ข้อมูลไม่ถูกต้อง',ephemeral:true});
        const id=Date.now().toString(36);
        db.gifts[id]={id,name:g('name'),cost,stock,type,roleId:g('roleId')||''};
        save();
        return safeReply(i,{content:'✅ เพิ่มรางวัลสำหรับแลกด้วยเกลือเรียบร้อย',ephemeral:true});
      }

      if (i.customId === 'gachareward_modal') {
        const stock=parseInt(g('stock'),10), chance=parseNum(g('chance'),0), type=g('type').toLowerCase();
        if(!Number.isInteger(stock) || stock<-1 || chance===null || !['role','item'].includes(type)) return safeReply(i,{content:'❌ ข้อมูลไม่ถูกต้อง',ephemeral:true});
        const id=Date.now().toString(36);
        db.gachaRewards[id]={id,name:g('name'),stock,chance,type,roleId:g('roleId')||''};
        recalcGacha();
        const ch=await client.channels.fetch(db.settings.gacha.channelId).catch(()=>null);
        if(ch&&ch.isTextBased()) await ch.send(gachaEmbed()).catch(()=>{});
        return safeReply(i,{content:'✅ เพิ่มรางวัลเข้าตู้กาชาแล้ว และระบบคำนวณโอกาสใหม่ให้อัตโนมัติ',ephemeral:true});
      }
    }

    // ---------------- SELECT MENUS ----------------
    if (i.isStringSelectMenu() && i.customId === 'gacha_count_select') {
      const m=new ModalBuilder().setCustomId('gacha_roll_count_modal').setTitle('ยืนยันจำนวนครั้ง');
      m.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('count').setLabel('จำนวนครั้ง: 1 / 5 / 10')
          .setStyle(TextInputStyle.Short).setValue(i.values[0]).setRequired(true)
      ));
      return i.showModal(m);
    }
    if (i.isStringSelectMenu()) {
      if (i.customId === 'payment_settings_menu') {
        const v=i.values[0];
        if(v==='system'){
          const m=new ModalBuilder().setCustomId('payment_system_modal').setTitle('ตั้งค่าระบบเติมเงิน');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('หัวข้อการชำระเงิน').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('รายละเอียด').setStyle(TextInputStyle.Paragraph).setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('topupChannelId').setLabel('ID ห้องเติมเงิน').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('slipChannelId').setLabel('ID ห้องแนบสลิป').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('banner').setLabel('ลิงค์ Banner').setStyle(TextInputStyle.Short).setRequired(false))
          );
          return i.showModal(m);
        }
        if(v==='wallet'){
          const m=new ModalBuilder().setCustomId('wallet_modal').setTitle('ตั้งค่า TrueMoney Wallet');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('ชื่อบัญชี').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('number').setLabel('เลขบัญชี').setStyle(TextInputStyle.Short).setRequired(true))
          );
          return i.showModal(m);
        }
        if(v==='bank'){
          const m=new ModalBuilder().setCustomId('bank_modal').setTitle('ตั้งค่าบัญชีธนาคาร');
          m.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('bank').setLabel('ชื่อธนาคาร').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('ชื่อบัญชีธนาคาร').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('number').setLabel('เลขบัญชีธนาคาร').setStyle(TextInputStyle.Short).setRequired(true))
          );
          return i.showModal(m);
        }
        if(v==='qr'){
          const m=new ModalBuilder().setCustomId('qr_modal').setTitle('ตั้งค่า QR Code');
          m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('url').setLabel('ลิงค์รูป QR Code').setStyle(TextInputStyle.Short).setRequired(true)));
          return i.showModal(m);
        }
        if(v==='view'){
          const p=db.settings.payment;
          return safeReply(i,{content:`**บัญชีที่ตั้งค่าไว้**\n📱 Wallet: ${p.wallet ? '✅' : '❌'}\n🏦 Bank: ${p.bank ? '✅' : '❌'}\n📷 QR: ${p.qr ? '✅' : '❌'}\n\nห้องเติมเงิน: ${p.topupChannelId ? `<#${p.topupChannelId}>` : '-'}\nห้องสลิป: ${p.slipChannelId ? `<#${p.slipChannelId}>` : '-'}`,ephemeral:true});
        }
      }

      if (i.customId.startsWith('store_type:')) {
        const id=i.customId.split(':')[1], p=db.products[id];
        if(!p) return safeReply(i,{content:'❌ ไม่พบสินค้า',ephemeral:true});
        p.type=i.values[0];
        save();
        return safeReply(i,{content:`✅ ตั้งประเภทสินค้า **${p.type.toUpperCase()}** แล้ว`,ephemeral:true});
      }

      if (i.customId === 'payment_method') {
        const kind=i.values[0];
        return safeReply(i,{embeds:[paymentEmbed(kind)],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('payment_custom').setLabel('กำหนดจำนวน Coins').setStyle(ButtonStyle.Primary).setEmoji('💰'))],ephemeral:true});
      }

      if (i.customId === 'store_product_select') {
        const p=db.products[i.values[0]];
        if(!p) return safeReply(i,{content:'❌ ไม่พบสินค้า',ephemeral:true});
        if(p.type==='role') {
          return safeReply(i,{embeds:[new EmbedBuilder().setColor(0x8e44ad).setTitle('🛒 ยืนยันการซื้อ').setDescription(`สินค้า: **${p.name}**\nราคา: **${money(p.price)} Coins**\nจำนวน: **1**\nประเภท: **ROLE**`)],components:[new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`buy_confirm:${p.id}:1`).setLabel('ยืนยันคำสั่งซื้อ').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('buy_cancel').setLabel('ยกเลิกคำสั่งซื้อ').setStyle(ButtonStyle.Danger)
          )],ephemeral:true});
        }
        const m=new ModalBuilder().setCustomId(`buy_amount:${p.id}`).setTitle(`ซื้อ ${p.name}`); 
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('จำนวนสินค้า').setStyle(TextInputStyle.Short).setRequired(true)));
        return i.showModal(m);
      }

      if (i.customId === 'store_gift_select') {
        const g=db.gifts[i.values[0]];
        if(!g) return safeReply(i,{content:'❌ ไม่พบรางวัล',ephemeral:true});
        return safeReply(i,{embeds:[new EmbedBuilder().setColor(0x8e44ad).setTitle('🎁 ยืนยันการแลกรางวัล').setDescription(`รางวัล: **${g.name}**\nใช้เกลือ: **${g.cost}**\nคงเหลือ: **${g.stock}**`)],components:[new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`gift_confirm:${g.id}`).setLabel('ยืนยันแลกรางวัล').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('gift_cancel').setLabel('ยกเลิก').setStyle(ButtonStyle.Danger)
        )],ephemeral:true});
      }

      if (i.customId === 'gacha_remove_select') {
        const id=i.values[0];
        delete db.gachaRewards[id];
        recalcGacha();
        return safeReply(i,{content:'✅ ลบรางวัลออกจากตู้แล้ว และคำนวณโอกาสใหม่',ephemeral:true});
      }
    }

    // ---------------- BUTTONS ----------------
    if (i.isButton()) {
      if(i.customId==='payment_custom'){
        const m=new ModalBuilder().setCustomId('custom_coins_modal').setTitle('กำหนดจำนวน Coins');
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('coins').setLabel('จำนวน Coins ที่ต้องการเติม').setStyle(TextInputStyle.Short).setRequired(true)));
        return i.showModal(m);
      }
      if(i.customId==='payment_how'){
        return safeReply(i,{content:`🧾 **วิธีแจ้งสลิป**\n1. เลือกช่องทางชำระเงิน\n2. โอนเงินตามยอดที่ต้องการ\n3. แนบสลิปใน <#${db.settings.payment.slipChannelId || 'ตั้งค่า ID ห้องสลิปก่อน'}>\n4. ระบบจะสร้างรายการรอตรวจสอบให้แอดมิน`,ephemeral:true});
      }

      if(i.customId==='store_buy'){
        const opts=productOptions();
        if(!opts.length) return safeReply(i,{content:'❌ ตอนนี้ไม่มีสินค้าที่พร้อมขาย',ephemeral:true});
        return safeReply(i,{content:'🛒 เลือกสินค้าที่ต้องการซื้อ',components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('store_product_select').setPlaceholder('เลือกสินค้า').addOptions(opts))],ephemeral:true});
      }
      if(i.customId==='store_gift'){
        const opts=giftOptions();
        if(!opts.length) return safeReply(i,{content:'❌ ตอนนี้ไม่มีรางวัลที่พร้อมแลก',ephemeral:true});
        return safeReply(i,{content:'🎁 เลือกรางวัลที่ต้องการแลก',components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('store_gift_select').setPlaceholder('เลือกรางวัล').addOptions(opts))],ephemeral:true});
      }

      if(i.customId==='gacha_roll'){
        const u=userData(i.user.id);
        return safeReply(i,{content:`🎰 คุณมี ${u.tickets} ${db.settings.gacha.ticketName}\nเลือกจำนวนครั้งที่ต้องการสุ่ม`,components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('gacha_count_select').setPlaceholder('เลือกจำนวนครั้ง').addOptions(
          {label:'1 ครั้ง',value:'1',description:'ใช้ 1 ตั๋ว'},
          {label:'5 ครั้ง',value:'5',description:'ใช้ 5 ตั๋ว'},
          {label:'10 ครั้ง',value:'10',description:'ใช้ 10 ตั๋ว'}
        ))],ephemeral:true});
      }
      if(i.customId==='gacha_admin'){
        if(!isAdmin(i)) return safeReply(i,{content:'❌ เฉพาะแอดมินเท่านั้น',ephemeral:true});
        return safeReply(i,{content:'⚙️ จัดการรางวัลกาชา',components:[new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('gacha_add_help').setLabel('➕ เพิ่มของรางวัล').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('gacha_remove_help').setLabel('➖ ลบของรางวัล').setStyle(ButtonStyle.Danger)
        )],ephemeral:true});
      }
      if(i.customId==='gacha_add_help'){
        if(!isAdmin(i)) return safeReply(i,{content:'❌ เฉพาะแอดมิน',ephemeral:true});
        return safeReply(i,{content:'ใช้คำสั่ง **/gachareward** เพื่อเพิ่มรางวัลเข้าตู้',ephemeral:true});
      }
      if(i.customId==='gacha_remove_help'){
        if(!isAdmin(i)) return safeReply(i,{content:'❌ เฉพาะแอดมิน',ephemeral:true});
        return safeReply(i,{content:'ใช้คำสั่ง **/gacharemove** เพื่อลบรางวัล',ephemeral:true});
      }

      if(i.customId.startsWith('buy_confirm:')){
        const [,id,amtS]=i.customId.split(':'); const p=db.products[id]; const amount=Number(amtS);
        if(!p) return safeReply(i,{content:'❌ ไม่พบสินค้า',ephemeral:true});
        if(amount<1 || amount>p.stock) return safeReply(i,{content:'❌ จำนวนสินค้าไม่ถูกต้องหรือสต๊อกไม่พอ',ephemeral:true});
        const total=p.price*amount, u=userData(i.user.id);
        if(u.coins<total) return safeReply(i,{content:`❌ Coins ไม่พอ ต้องใช้ ${money(total)} แต่คุณมี ${u.coins}`,ephemeral:true});
        u.coins-=total; p.stock-=amount;
        if(p.type==='role' && p.roleId){
          const role=await i.guild.roles.fetch(p.roleId).catch(()=>null);
          if(role) await i.member.roles.add(role).catch(()=>{});
        } else addItem(i.user.id,p.name,amount);
        save();
        return safeReply(i,{embeds:[new EmbedBuilder().setColor(0x57f287).setTitle('✅ สั่งซื้อสินค้าแล้ว').setDescription(`ชื่อสินค้า: **${p.name}**\nจำนวน: **${amount}**\nราคา: **${money(total)} Coins**\nประเภทสินค้า: **${p.type.toUpperCase()}**`)],ephemeral:true});
      }
      if(i.customId==='buy_cancel') return safeReply(i,{content:`❌ คุณ ${i.user} ได้ยกเลิกคำสั่งซื้อแล้ว`,ephemeral:true});

      if(i.customId.startsWith('gift_confirm:')){
        const id=i.customId.split(':')[1], g=db.gifts[id], u=userData(i.user.id);
        if(!g) return safeReply(i,{content:'❌ ไม่พบรางวัล',ephemeral:true});
        if(u.salt<g.cost) return safeReply(i,{content:`❌ เกลือไม่พอ ต้องใช้ ${g.cost} แต่คุณมี ${u.salt}`,ephemeral:true});
        if(g.stock<=0) return safeReply(i,{content:'❌ รางวัลหมดแล้ว',ephemeral:true});
        u.salt-=g.cost; g.stock--;
        if(g.type==='role' && g.roleId){
          const role=await i.guild.roles.fetch(g.roleId).catch(()=>null);
          if(role) await i.member.roles.add(role).catch(()=>{});
        } else addItem(i.user.id,g.name,1);
        save();
        return safeReply(i,{content:`🎉 แลกรางวัลสำเร็จ!\nรางวัล: **${g.name}**\nใช้เกลือ: **${g.cost}**`,ephemeral:true});
      }
      if(i.customId==='gift_cancel') return safeReply(i,{content:'❌ ยกเลิกการแลกรางวัลแล้ว',ephemeral:true});
    }

    // ---------------- SLIP ATTACHMENTS ----------------
    if(i.isMessageContextMenuCommand()) return;
  } catch (err) {
    console.error('interaction error:', err);
    if (!i.replied && !i.deferred) await safeReply(i,{content:'❌ ระบบเกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง',ephemeral:true});
  }
});

// Automatic slip watcher. Users can post an image in the configured slip channel.
client.on('messageCreate', async (m) => {
  try {
    if(m.author.bot) return;
    const slipId=db.settings.payment.slipChannelId;
    if(!slipId || m.channel.id!==slipId || !m.attachments.size) return;

    const pending=db.pendingPayments[m.author.id];
    if(!pending || pending.status!=='waiting') {
      await m.reply('⚠️ ไม่พบรายการเติมเงินที่กำลังรอชำระของคุณ กรุณากด `กำหนดเอง` ในห้องเติมเงินก่อนแนบสลิป').catch(()=>{});
      return;
    }
    const adminChannelId = db.settings.payment.slipChannelId;
    const adminCh=await client.channels.fetch(adminChannelId).catch(()=>null);
    if(!adminCh || !adminCh.isTextBased()) return;

    const first=[...m.attachments.values()][0];
    const e=new EmbedBuilder().setColor(0xf1c40f).setTitle('🧾 รายการตรวจสอบการเงิน')
      .setDescription(`ผู้เติม: ${m.author} (${m.author.id})\nจำนวน Coins: **${pending.coins.toLocaleString()}**\nยอดชำระ: **${money(pending.amount)} บาท**\nเวลา: <t:${Math.floor(Date.now()/1000)}:F>`)
      .setImage(first.contentType?.startsWith('image/') ? first.url : null);
    const row=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`pay_approve:${m.author.id}`).setLabel('ชำระเงิน').setStyle(ButtonStyle.Success).setEmoji('✅'),
      new ButtonBuilder().setCustomId(`pay_cancel:${m.author.id}`).setLabel('ยกเลิก').setStyle(ButtonStyle.Danger).setEmoji('❌')
    );
    await adminCh.send({embeds:[e],components:[row]});
    await m.reply('✅ รับสลิปแล้ว รอแอดมินตรวจสอบ').catch(()=>{});
  } catch(e) { console.error('slip watcher:',e); }
});

client.on('interactionCreate', async (i) => {
  // Separate handler for payment approval buttons to keep the main handler simple.
  if (!i.isButton() || !/^pay_(approve|cancel):/.test(i.customId)) return;
  try {
    if(!isAdmin(i)) return safeReply(i,{content:'❌ เฉพาะแอดมินเท่านั้น',ephemeral:true});
    const [action,userId]=i.customId.split(':');
    const p=db.pendingPayments[userId];
    if(!p) return safeReply(i,{content:'❌ ไม่พบรายการนี้',ephemeral:true});
    const user=await client.users.fetch(userId).catch(()=>null);
    if(action==='pay_approve'){
      userData(userId).coins += p.coins;
      p.status='approved'; p.checkedBy=i.user.id; p.checkedAt=Date.now();
      save();
      if(user) await user.send(`✅ ท่านได้ชำระเงินแล้ว\nจำนวน Coins: **${p.coins.toLocaleString()} Coins**\nจำนวนเงิน: **${money(p.amount)} บาท**\nเมื่อเวลา: <t:${Math.floor(Date.now()/1000)}:F>\nตรวจสอบโดย: **${i.user.username}**`).catch(()=>{});
      await i.update({content:`✅ อนุมัติการเติมเงินของ ${user ? user.tag : userId} แล้ว\nตรวจสอบโดย: ${i.user}`,embeds:[],components:[]});
    } else {
      p.status='cancelled'; p.checkedBy=i.user.id; p.checkedAt=Date.now(); save();
      if(user) await user.send(`❌ รายการเติมเงินของคุณถูกยกเลิก\nจำนวน Coins: **${p.coins.toLocaleString()}**\nยอด: **${money(p.amount)} บาท**\nตรวจสอบโดย: **${i.user.username}**`).catch(()=>{});
      await i.update({content:`❌ ยกเลิกรายการของ ${user ? user.tag : userId} แล้ว`,embeds:[],components:[]});
    }
  } catch(e) {
    console.error('payment button error:',e);
    await safeReply(i,{content:'❌ ไม่สามารถดำเนินการรายการนี้ได้',ephemeral:true});
  }
});

client.login(TOKEN);
