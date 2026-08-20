const {
  Client, GatewayIntentBits, Partials, REST, Routes,
  SlashCommandBuilder, PermissionFlagsBits, ChannelType,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  EmbedBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const COIN_RATE = 0.86;
const PREFIX = '!';
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

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
        truemoney: {
          enabled: false,
          accountName: '',
          accountNumber: ''
        },
        bank: {
          enabled: false,
          bankName: '',
          accountName: '',
          accountNumber: ''
        },
        qr: {
          enabled: false,
          imageUrl: ''
        }
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

  store: {
    products: {}
  },

  gifts: {
    items: {}
  },

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
  }
};

const FILES = {
  config: 'config.json',
  users: 'users.json',
  store: 'store.json',
  gifts: 'gifts.json',
  gacha: 'gacha.json'
};

function load(key) {
  const file = path.join(DATA_DIR, FILES[key]);

  if (!fs.existsSync(file)) {
    fs.writeFileSync(
      file,
      JSON.stringify(DEFAULTS[key], null, 2),
      'utf8'
    );

    return structuredClone(DEFAULTS[key]);
  }

  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return structuredClone(DEFAULTS[key]);
  }
}

function save(key, obj) {
  fs.writeFileSync(
    path.join(DATA_DIR, FILES[key]),
    JSON.stringify(obj, null, 2),
    'utf8'
  );
}

let config = load('config');
let users = load('users');
let store = load('store');
let gifts = load('gifts');
let gacha = load('gacha');

function user(id) {
  if (!users[id]) {
    users[id] = {
      coins: 0,
      salt: 0,
      tickets: 0,
      inventory: {},
      purchases: 0
    };
  }

  return users[id];
}

function addItem(id, name, qty = 1) {
  const u = user(id);

  u.inventory[name] = (u.inventory[name] || 0) + qty;
}

function cleanId(v) {
  return String(v || '')
    .replace(/[<#@&>]/g, '')
    .trim();
}

function money(n) {
  return Number(n).toFixed(2);
}

function validUrl(v) {
  return !v || /^https?:\/\/\S+$/i.test(v);
}

function admin(i) {
  return Boolean(
    i.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    i.member?.permissions?.has(PermissionFlagsBits.Administrator)
  );
}

function roleByName(guild, name) {
  return guild.roles.cache.find(r => r.name === name);
}

function paymentMethods() {
  const m = config.payment.methods;
  const o = [];

  if (m.truemoney.enabled) {
    o.push({
      id: 'tm',
      label: 'TrueMoney Wallet',
      emoji: '💚'
    });
  }

  if (m.bank.enabled) {
    o.push({
      id: 'bank',
      label: 'บัญชีธนาคาร',
      emoji: '🏦'
    });
  }

  if (m.qr.enabled) {
    o.push({
      id: 'qr',
      label: 'QR Code',
      emoji: '📱'
    });
  }

  return o;
}

function coinOptions() {
  return [
    '10 Coins = 8.60 บาท',
    '50 Coins = 43.00 บาท',
    '115 Coins = 98.90 บาท',
    '510 Coins = 438.60 บาท',
    '1,150 Coins = 989.00 บาท'
  ].join('\n');
}

function paymentPanel() {
  const methods = paymentMethods();

  const e = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle(
      config.payment.title ||
      '💳 ระบบเติมเงิน'
    )
    .setDescription(
      `${config.payment.description || ''}

**เรทราคา Coins**
${coinOptions()}

หรือกด **กำหนดเอง** เพื่อกำหนดจำนวน Coins เอง
ขั้นต่ำ **1 บาท**

หลังชำระเงิน ให้แนบสลิปใน <#${config.payment.slipChannelId}>`
    );

  if (
    config.payment.banner &&
    validUrl(config.payment.banner)
  ) {
    e.setImage(config.payment.banner);
  }

  const menu =
    new StringSelectMenuBuilder()
      .setCustomId('pay_method')
      .setPlaceholder('💳 เลือกช่องทางชำระเงิน')
      .addOptions(
        methods.length
          ? methods.map(x => ({
              label: x.label,
              value: x.id,
              emoji: x.emoji
            }))
          : [{
              label: 'ยังไม่มีช่องทางชำระเงิน',
              value: 'none'
            }]
      );

  return {
    embeds: [e],

    components: [
      new ActionRowBuilder()
        .addComponents(menu),

      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('topup_custom')
            .setLabel('กำหนดเอง')
            .setStyle(ButtonStyle.Primary)
        )
    ]
  };
}

function paymentEmbed(id) {
  const m = config.payment.methods;

  const e = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('💳 ช่องทางชำระเงิน');

  if (id === 'tm') {
    e.setDescription(
      `**TrueMoney Wallet**

ชื่อบัญชี: ${m.truemoney.accountName}
เลขบัญชี: \`${m.truemoney.accountNumber}\`

ชำระแล้วแนบสลิปที่ <#${config.payment.slipChannelId}>`
    );
  }

  if (id === 'bank') {
    e.setDescription(
      `**${m.bank.bankName}**

ชื่อบัญชี: ${m.bank.accountName}
เลขบัญชี: \`${m.bank.accountNumber}\`

ชำระแล้วแนบสลิปที่ <#${config.payment.slipChannelId}>`
    );
  }

  if (id === 'qr') {
    e.setDescription(
      `**QR Code ชำระเงิน**

ชำระแล้วแนบสลิปที่ <#${config.payment.slipChannelId}>`
    );

    if (m.qr.imageUrl) {
      e.setImage(m.qr.imageUrl);
    }
  }

  return e;
}

function storeEmbed() {
  const products = Object.values(store.products);
  const giftsList = Object.values(gifts.items);

  const buy = products.length
    ? products.map(p =>
        `**${p.name}**
${p.description || '-'}
💰 ${p.price} Coins | 📦 เหลือ ${
          p.stock === -1 ? 'ไม่จำกัด' : p.stock
        }`
      ).join('\n\n')
    : 'ยังไม่มีสินค้า';

  const gift = giftsList.length
    ? giftsList.map(g =>
        `**${g.name}**
🧂 ${g.cost} เกลือ | 📦 เหลือ ${
          g.stock === -1 ? 'ไม่จำกัด' : g.stock
        } | ${g.type}`
      ).join('\n\n')
    : 'ยังไม่มีรางวัลแลก';

  const e = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(config.store.name)
    .setDescription(config.store.description || '')
    .addFields(
      {
        name: '🛍️ สินค้าที่สามารถซื้อได้',
        value: buy.slice(0, 1024)
      },
      {
        name: '🎁 สินค้าที่สามารถแลกได้',
        value: gift.slice(0, 1024)
      }
    );

  if (
    config.store.banner &&
    validUrl(config.store.banner)
  ) {
    e.setImage(config.store.banner);
  }

  return e;
}

function storeComponents() {
  const available =
    Object.values(store.products)
      .filter(
        p => p.stock === -1 || p.stock > 0
      )
      .slice(0, 25);

  const menu =
    new StringSelectMenuBuilder()
      .setCustomId('store_buy')
      .setPlaceholder('🛒 เลือกสินค้าที่ต้องการซื้อ')
      .addOptions(
        available.length
          ? available.map(p => ({
              label: p.name.slice(0, 100),
              description:
                `${p.price} Coins | เหลือ ${
                  p.stock === -1
                    ? 'ไม่จำกัด'
                    : p.stock
                }`.slice(0, 100),
              value: p.id
            }))
          : [{
              label: 'ไม่มีสินค้าที่พร้อมขาย',
              value: 'none'
            }]
      );

  return {
    components: [
      new ActionRowBuilder()
        .addComponents(menu),

      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('gift_open')
            .setLabel(
              config.store.giftButton ||
              '🎁 แลกรางวัล'
            )
            .setStyle(ButtonStyle.Success)
        )
    ]
  };
}

async function refreshStore(guild) {
  if (!config.store.channelId) return;

  const ch = await guild.channels
    .fetch(config.store.channelId)
    .catch(() => null);

  if (!ch || !ch.isTextBased()) return;

  let msg = config.store.messageId
    ? await ch.messages
        .fetch(config.store.messageId)
        .catch(() => null)
    : null;

  if (msg) {
    await msg.edit({
      embeds: [storeEmbed()],
      ...storeComponents()
    });
  } else {
    msg = await ch.send({
      embeds: [storeEmbed()],
      ...storeComponents()
    });

    config.store.messageId = msg.id;

    save('config', config);
  }
}

function gachaChance(r) {
  const active = gacha.rewards.filter(
    x => x.unlimited === 1 || x.quantity > 0
  );

  const total = active.reduce(
    (s, x) =>
      s + Math.max(0, Number(x.chance) || 0),
    0
  );

  return total
    ? ((Number(r.chance) || 0) / total) * 100
    : 0;
}

function gachaEmbed() {
  const roles =
    gacha.rewards.filter(
      r => r.type === 'ROLE'
    );

  const items =
    gacha.rewards.filter(
      r => r.type === 'ITEM'
    );

  const fmt = a =>
    a.length
      ? a.map(r =>
          `${r.type === 'ROLE' ? '🏷️' : '🎁'} **${r.name}** เหลือ ${
            r.unlimited === 1
              ? 'ไม่จำกัด'
              : r.quantity
          } รางวัล | โอกาสออก ${gachaChance(r).toFixed(2)}%`
        ).join('\n')
      : 'ไม่มีรางวัล';

  const e = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle(gacha.name)
    .setDescription(
      `${gacha.description || ''}

**ROLE**
${fmt(roles)}

**ITEM**
${fmt(items)}

${gacha.ticketEmoji} 1 ตั๋ว = **5 Coins**`
    );

  if (
    gacha.banner &&
    validUrl(gacha.banner)
  ) {
    e.setImage(gacha.banner);
  }

  return e;
}

function gachaComponents() {
  return {
    components: [
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('gacha_spin')
            .setLabel(
              gacha.spinButton ||
              '🎰 สุ่มกาชา'
            )
            .setStyle(ButtonStyle.Primary)
        )
    ]
  };
}

function pickReward() {
  const active =
    gacha.rewards.filter(
      r => r.unlimited === 1 || r.quantity > 0
    );

  if (!active.length) return null;

  const total = active.reduce(
    (s, r) =>
      s + Math.max(0, Number(r.chance) || 0),
    0
  );

  let n = Math.random() * total;

  for (const r of active) {
    n -= Math.max(
      0,
      Number(r.chance) || 0
    );

    if (n <= 0) return r;
  }

  return active[active.length - 1];
}
async function register() {
  if (!TOKEN || !CLIENT_ID) {
    throw new Error(
      'ต้องตั้ง DISCORD_TOKEN/TOKEN และ CLIENT_ID ใน Railway'
    );
  }

  const cmds = [
    new SlashCommandBuilder()
      .setName('pymentsetting')
      .setDescription('ตั้งค่าระบบเติมเงิน')
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator
      ),

    new SlashCommandBuilder()
      .setName('startstore')
      .setDescription(
        'สร้าง/รีเฟรชหน้าระบบเติมเงิน'
      ),

    new SlashCommandBuilder()
      .setName('storeadd')
      .setDescription(
        'เพิ่มสินค้า ROLE/ITEM'
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator
      ),

    new SlashCommandBuilder()
      .setName('gift')
      .setDescription(
        'ตั้งชื่อปุ่มแลกรางวัล'
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator
      ),

    new SlashCommandBuilder()
      .setName('gachasetup')
      .setDescription(
        'ตั้งค่าตู้กาชา 8 ช่อง'
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator
      ),

    new SlashCommandBuilder()
      .setName('gachastart')
      .setDescription(
        'สร้างหน้าตู้กาชา'
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator
      ),

    new SlashCommandBuilder()
      .setName('gachareward')
      .setDescription(
        'เพิ่ม/ลบรางวัลกาชา'
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator
      ),

    new SlashCommandBuilder()
      .setName('balance')
      .setDescription(
        'ดู Coins ของตัวเอง'
      )
  ].map(x => x.toJSON());

  const rest =
    new REST({ version: '10' })
      .setToken(TOKEN);

  if (GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(
        CLIENT_ID,
        GUILD_ID
      ),
      { body: cmds }
    );
  } else {
    await rest.put(
      Routes.applicationCommands(
        CLIENT_ID
      ),
      { body: cmds }
    );
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],

  partials: [
    Partials.Channel
  ]
});

client.once('ready', async () => {
  console.log(
    `ONLINE: ${client.user.tag}`
  );

  try {
    await register();
    console.log('Slash commands registered.');
  } catch (e) {
    console.error(
      'Register commands failed:',
      e
    );
  }
});

function modalField(
  id,
  label,
  style = TextInputStyle.Short,
  required = true,
  placeholder = ''
) {
  return new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required)
    .setPlaceholder(placeholder);
}

function showPaymentSetup1(i) {
  const modal =
    new ModalBuilder()
      .setCustomId('pay_setup1')
      .setTitle(
        'ตั้งค่าระบบเติมเงิน 1/2'
      );

  modal.addComponents(
    new ActionRowBuilder()
      .addComponents(
        modalField(
          'title',
          'หัวข้อการชำระเงิน',
          TextInputStyle.Short,
          true
        )
      ),

    new ActionRowBuilder()
      .addComponents(
        modalField(
          'desc',
          'รายละเอียด',
          TextInputStyle.Paragraph,
          true
        )
      ),

    new ActionRowBuilder()
      .addComponents(
        modalField(
          'topup',
          'ID ห้องเติมเงิน',
          TextInputStyle.Short,
          true
        )
      ),

    new ActionRowBuilder()
      .addComponents(
        modalField(
          'slip',
          'ID ห้องแนบสลิป',
          TextInputStyle.Short,
          true
        )
      ),

    new ActionRowBuilder()
      .addComponents(
        modalField(
          'review',
          'ID ห้องตรวจสอบการเงิน',
          TextInputStyle.Short,
          true
        )
      )
  );

  return i.showModal(modal);
}

function showPaymentSetup2(i) {
  const modal =
    new ModalBuilder()
      .setCustomId('pay_setup2')
      .setTitle(
        'ตั้งค่าระบบเติมเงิน 2/2'
      );

  modal.addComponents(
    new ActionRowBuilder()
      .addComponents(
        modalField(
          'banner',
          'ลิงค์ Banner',
          TextInputStyle.Short,
          false
        )
      ),

    new ActionRowBuilder()
      .addComponents(
        modalField(
          'tm',
          'TrueMoney: ชื่อบัญชี|เลขบัญชี',
          TextInputStyle.Short,
          false,
          'ชื่อบัญชี | เลขบัญชี'
        )
      ),

    new ActionRowBuilder()
      .addComponents(
        modalField(
          'bank',
          'ธนาคาร: ธนาคาร|ชื่อบัญชี|เลขบัญชี',
          TextInputStyle.Short,
          false,
          'ธนาคาร | ชื่อบัญชี | เลขบัญชี'
        )
      ),

    new ActionRowBuilder()
      .addComponents(
        modalField(
          'qr',
          'ลิงค์รูป QR Code',
          TextInputStyle.Short,
          false
        )
      ),

    new ActionRowBuilder()
      .addComponents(
        modalField(
          'enabled',
          'ช่องทางที่เปิดใช้',
          TextInputStyle.Short,
          false,
          'TM,BANK,QR'
        )
      )
  );

  return i.showModal(modal);
}

function showStoreAdd(i) {
  const modal =
    new ModalBuilder()
      .setCustomId('store_add')
      .setTitle(
        'เพิ่มสินค้าเข้าร้าน'
      );

  modal.addComponents(
    new ActionRowBuilder()
      .addComponents(
        modalField(
          'name',
          'ชื่อ ITEM หรือ ยศ'
        )
      ),

    new ActionRowBuilder()
      .addComponents(
        modalField(
          'desc',
          'รายละเอียดสินค้า',
          TextInputStyle.Paragraph
        )
      ),

    new ActionRowBuilder()
      .addComponents(
        modalField(
          'type',
          'ประเภทสินค้า ROLE หรือ ITEM',
          TextInputStyle.Short,
          true,
          'ROLE หรือ ITEM'
        )
      ),

    new ActionRowBuilder()
      .addComponents(
        modalField(
          'price',
          'ราคาสินค้า Coins'
        )
      ),

    new ActionRowBuilder()
      .addComponents(
        modalField(
          'stock',
          'จำนวนสินค้า',
          TextInputStyle.Short,
          true,
          'ใช้ -1 = ไม่จำกัด'
        )
      )
  );

  return i.showModal(modal);
}

function showGiftSetup(i) {
  const modal =
    new ModalBuilder()
      .setCustomId('gift_setup')
      .setTitle(
        'ตั้งค่าปุ่มแลกรางวัล'
      );

  modal.addComponents(
    new ActionRowBuilder()
      .addComponents(
        modalField(
          'name',
          'ชื่อปุ่มแลกรางวัล'
        )
      )
  );

  return i.showModal(modal);
}

function showGachaSetup1(i) {
  const modal =
    new ModalBuilder()
      .setCustomId('gacha_setup1')
      .setTitle(
        'ตั้งค่าตู้กาชา 1/2'
      );

  modal.addComponents(
    new ActionRowBuilder()
      .addComponents(
        modalField(
          'name',
          'ชื่อตู้กาชา'
        )
      ),

    new ActionRowBuilder()
      .addComponents(
        modalField(
          'desc',
          'รายละเอียด',
          TextInputStyle.Paragraph
        )
      ),

    new ActionRowBuilder()
      .addComponents(
        modalField(
          'channel',
          'ID ช่องกาชา'
        )
      ),

    new ActionRowBuilder()
      .addComponents(
        modalField(
          'banner',
          'ลิงค์ Banner',
          TextInputStyle.Short,
          false
        )
      ),

    new ActionRowBuilder()
      .addComponents(
        modalField(
          'loading',
          'ลิงค์ Banner ตอนกำลังสุ่ม',
          TextInputStyle.Short,
          false
        )
      )
  );

  return i.showModal(modal);
}

function showGachaSetup2(i) {
  const modal =
    new ModalBuilder()
      .setCustomId('gacha_setup2')
      .setTitle(
        'ตั้งค่าตู้กาชา 2/2'
      );

  modal.addComponents(
    new ActionRowBuilder()
      .addComponents(
        modalField(
          'ticket_emoji',
          'อิโมจิตั๋วกาชา'
        )
      ),

    new ActionRowBuilder()
      .addComponents(
        modalField(
          'ticket_name',
          'ชื่อตั๋วกาชา'
        )
      ),

    new ActionRowBuilder()
      .addComponents(
        modalField(
          'spin',
          'ชื่อปุ่มสุ่มกาชา'
        )
      )
  );

  return i.showModal(modal);
}

function showGachaReward(i) {
  const modal =
    new ModalBuilder()
      .setCustomId('gadd_modal')
      .setTitle(
        'เพิ่มรางวัลกาชา'
      );

  modal.addComponents(
    new ActionRowBuilder()
      .addComponents(
        modalField(
          'name',
          'ชื่อรางวัล'
        )
      ),

    new ActionRowBuilder()
      .addComponents(
        modalField(
          'qty',
          'จำนวน (-1 = ไม่จำกัด)'
        )
      ),

    new ActionRowBuilder()
      .addComponents(
        modalField(
          'chance',
          'โอกาสพื้นฐาน'
        )
      ),

    new ActionRowBuilder()
      .addComponents(
        modalField(
          'type',
          'ประเภทรางวัล ROLE หรือ ITEM'
        )
      )
  );

  return i.showModal(modal);
}

function showCustomAmount(i) {
  const modal =
    new ModalBuilder()
      .setCustomId('custom_amount')
      .setTitle(
        'กำหนดจำนวน Coins'
      );

  modal.addComponents(
    new ActionRowBuilder()
      .addComponents(
        modalField(
          'coins',
          'จำนวน Coins'
        )
      )
  );

  return i.showModal(modal);
}

function showQty(i, id) {
  const modal =
    new ModalBuilder()
      .setCustomId(`qty:${id}`)
      .setTitle(
        'จำนวนสินค้าที่ต้องการซื้อ'
      );

  modal.addComponents(
    new ActionRowBuilder()
      .addComponents(
        modalField(
          'qty',
          'จำนวน'
        )
      )
  );

  return i.showModal(modal);
}

async function updateGachaMessage(guild) {
  if (
    !gacha.channelId ||
    !gacha.messageId
  ) {
    return;
  }

  const ch = await guild.channels
    .fetch(gacha.channelId)
    .catch(() => null);

  if (!ch) return;

  const msg = await ch.messages
    .fetch(gacha.messageId)
    .catch(() => null);

  if (msg) {
    await msg.edit({
      embeds: [gachaEmbed()],
      ...gachaComponents()
    }).catch(() => {});
  }
}
client.on(
  'interactionCreate',
  async i => {
    try {

      if (i.isChatInputCommand()) {

        if (
          i.commandName ===
          'pymentsetting'
        ) {
          if (!admin(i)) {
            return i.reply({
              content:
                '❌ เฉพาะ Administrator',
              ephemeral: true
            });
          }

          return showPaymentSetup1(i);
        }

        if (
          i.commandName ===
          'startstore'
        ) {
          if (!admin(i)) {
            return i.reply({
              content:
                '❌ เฉพาะ Administrator',
              ephemeral: true
            });
          }

          await i.deferReply({
            ephemeral: true
          });

          await refreshStore(i.guild);

          const ch =
            await i.guild.channels
              .fetch(
                config.payment.topupChannelId
              )
              .catch(() => null);

          if (
            ch &&
            ch.isTextBased()
          ) {
            await ch.send(
              paymentPanel()
            );
          }

          return i.editReply(
            '✅ สร้าง/รีเฟรชระบบเติมเงินแล้ว'
          );
        }

        if (
          i.commandName ===
          'storeadd'
        ) {
          if (!admin(i)) {
            return i.reply({
              content:
                '❌ เฉพาะ Administrator',
              ephemeral: true
            });
          }

          return showStoreAdd(i);
        }

        if (
          i.commandName ===
          'gift'
        ) {
          if (!admin(i)) {
            return i.reply({
              content:
                '❌ เฉพาะ Administrator',
              ephemeral: true
            });
          }

          return showGiftSetup(i);
        }

        if (
          i.commandName ===
          'gachasetup'
        ) {
          if (!admin(i)) {
            return i.reply({
              content:
                '❌ เฉพาะ Administrator',
              ephemeral: true
            });
          }

          return showGachaSetup1(i);
        }

        if (
          i.commandName ===
          'gachastart'
        ) {
          if (!admin(i)) {
            return i.reply({
              content:
                '❌ เฉพาะ Administrator',
              ephemeral: true
            });
          }

          if (!gacha.channelId) {
            return i.reply({
              content:
                '❌ กรุณาใช้ /gachasetup ก่อน',
              ephemeral: true
            });
          }

          const ch =
            await i.guild.channels
              .fetch(gacha.channelId)
              .catch(() => null);

          if (
            !ch ||
            !ch.isTextBased()
          ) {
            return i.reply({
              content:
                '❌ ไม่พบห้องกาชา',
              ephemeral: true
            });
          }

          const msg =
            await ch.send({
              embeds: [
                gachaEmbed()
              ],
              ...gachaComponents()
            });

          gacha.messageId =
            msg.id;

          save('gacha', gacha);

          return i.reply({
            content:
              '✅ สร้างหน้าตู้กาชาแล้ว',
            ephemeral: true
          });
        }

        if (
          i.commandName ===
          'gachareward'
        ) {
          if (!admin(i)) {
            return i.reply({
              content:
                '❌ เฉพาะ Administrator',
              ephemeral: true
            });
          }

          return showGachaReward(i);
        }

        if (
          i.commandName ===
          'balance'
        ) {
          const u =
            user(i.user.id);

          return i.reply({
            content:
              `🪙 Coins: **${u.coins}**\n` +
              `🧂 เกลือ: **${u.salt}**\n` +
              `🎟️ ตั๋วกาชา: **${u.tickets}**`,
            ephemeral: true
          });
        }
      }

      if (
        i.isButton()
      ) {

        if (
          i.customId ===
          'topup_custom'
        ) {
          return showCustomAmount(i);
        }

        if (
          i.customId ===
          'gift_open'
        ) {
          const list =
            Object.values(
              gifts.items
            ).filter(
              g =>
                g.stock === -1 ||
                g.stock > 0
            ).slice(0, 25);

          const menu =
            new StringSelectMenuBuilder()
              .setCustomId(
                'gift_select'
              )
              .setPlaceholder(
                '🎁 เลือกรางวัลที่ต้องการแลก'
              )
              .addOptions(
                list.length
                  ? list.map(g => ({
                      label:
                        g.name.slice(
                          0,
                          100
                        ),
                      description:
                        `${g.cost} เกลือ`.slice(
                          0,
                          100
                        ),
                      value: g.id
                    }))
                  : [{
                      label:
                        'ยังไม่มีรางวัล',
                      value:
                        'none'
                    }]
              );

          return i.reply({
            content:
              '🎁 เลือกรางวัลที่ต้องการแลก',
            components: [
              new ActionRowBuilder()
                .addComponents(
                  menu
                )
            ],
            ephemeral: true
          });
        }

        if (
          i.customId ===
          'gacha_spin'
        ) {
          const u =
            user(i.user.id);

          const menu =
            new StringSelectMenuBuilder()
              .setCustomId(
                'gacha_count'
              )
              .setPlaceholder(
                '🎰 เลือกจำนวนครั้ง'
              )
              .addOptions(
                {
                  label:
                    'สุ่ม 1 ครั้ง',
                  description:
                    'ใช้ 1 ตั๋ว',
                  value:
                    '1'
                },
                {
                  label:
                    'สุ่ม 5 ครั้ง',
                  description:
                    'ใช้ 5 ตั๋ว',
                  value:
                    '5'
                },
                {
                  label:
                    'สุ่ม 10 ครั้ง',
                  description:
                    'ใช้ 10 ตั๋ว',
                  value:
                    '10'
                }
              );

          return i.reply({
            content:
              `🎟️ ตั๋วของคุณ: **${u.tickets}**`,
            components: [
              new ActionRowBuilder()
                .addComponents(
                  menu
                )
            ],
            ephemeral: true
          });
        }

        if (
          i.customId ===
          'buycancel'
        ) {
          return i.update({
            content:
              `❌ คุณ ${i.user} ได้ยกเลิกคำสั่งซื้อแล้ว`,
            embeds: [],
            components: []
          });
        }

        if (
          i.customId.startsWith(
            'buyok:'
          )
        ) {
          const [
            ,
            id,
            qtyText
          ] =
            i.customId.split(':');

          const qty =
            Number(qtyText);

          const p =
            store.products[id];

          if (!p) {
            return i.reply({
              content:
                '❌ ไม่พบสินค้า',
              ephemeral: true
            });
          }

          const u =
            user(i.user.id);

          const total =
            p.price * qty;

          if (
            u.coins < total
          ) {
            return i.reply({
              content:
                `❌ Coins ไม่พอ\nต้องใช้ ${total} Coins\nคุณมี ${u.coins} Coins`,
              ephemeral: true
            });
          }

          if (
            p.stock !== -1 &&
            p.stock < qty
          ) {
            return i.reply({
              content:
                '❌ สินค้าไม่พอ',
              ephemeral: true
            });
          }

          u.coins -= total;

          if (
            p.stock !== -1
          ) {
            p.stock -= qty;
          }

          if (
            p.gachaTicket
          ) {
            u.tickets += qty;
          } else if (
            p.type ===
            'ROLE'
          ) {
            const role =
              p.roleId
                ? i.guild.roles.cache.get(
                    p.roleId
                  )
                : roleByName(
                    i.guild,
                    p.name
                  );

            if (role) {
              await i.member.roles
                .add(role)
                .catch(() => {});
            }
          } else {
            addItem(
              i.user.id,
              p.name,
              qty
            );
          }

          u.purchases++;

          save('users', users);
          save('store', store);

          await refreshStore(
            i.guild
          );

          return i.update({
            content:
              `✅ **สั่งซื้อสินค้าแล้ว**\n\n` +
              `ชื่อสินค้า : ${p.name}\n` +
              `จำนวน : ${qty}\n` +
              `ราคา : ${total} Coins\n` +
              `ประเภทสินค้า : ${p.type}`,
            embeds: [],
            components: []
          });
        }

        if (
          i.customId.startsWith(
            'approve:'
          )
        ) {
          if (!admin(i)) {
            return i.reply({
              content:
                '❌ เฉพาะ Administrator',
              ephemeral: true
            });
          }

          const [
            ,
            uid,
            coins,
            amount
          ] =
            i.customId.split(':');

          const u =
            user(uid);

          u.coins +=
            Number(coins);

          save(
            'users',
            users
          );

          const member =
            await i.guild.members
              .fetch(uid)
              .catch(() => null);

          if (member) {
            await member.send(
              `💰 **ชำระเงินสำเร็จ**

ท่านได้ชำระเงินแล้วจำนวน : **${money(amount)} บาท**
ได้รับ : **${Number(coins).toLocaleString()} Coins**
เมื่อเวลา : ${new Date().toLocaleString('th-TH')}
ตรวจสอบโดย : **${i.user.tag}**`
            ).catch(() => {});
          }

          return i.update({
            content:
              `✅ อนุมัติการเติมเงินแล้ว\nผู้ใช้ <@${uid}>\nจำนวน ${amount} บาท\nได้รับ ${coins} Coins\nตรวจสอบโดย ${i.user}`,
            embeds: [],
            components: []
          });
        }

        if (
          i.customId.startsWith(
            'reject:'
          )
        ) {
          if (!admin(i)) {
            return i.reply({
              content:
                '❌ เฉพาะ Administrator',
              ephemeral: true
            });
          }

          const [
            ,
            uid,
            ,
            amount
          ] =
            i.customId.split(':');

          const member =
            await i.guild.members
              .fetch(uid)
              .catch(() => null);

          if (member) {
            await member.send(
              `❌ รายการเติมเงินของคุณถูกยกเลิก

ยอดที่แจ้ง : ${money(amount)} บาท
ตรวจสอบโดย : ${i.user.tag}`
            ).catch(() => {});
          }

          return i.update({
            content:
              `❌ ยกเลิกรายการเติมเงินแล้ว\nผู้ใช้ <@${uid}>\nตรวจสอบโดย ${i.user}`,
            embeds: [],
            components: []
          });
        }
      }

      if (
        i.isStringSelectMenu()
      ) {

        if (
          i.customId ===
          'pay_method'
        ) {
          if (
            i.values[0] ===
            'none'
          ) {
            return i.reply({
              content:
                '❌ ยังไม่ได้ตั้งค่าช่องทางชำระเงิน',
              ephemeral: true
            });
          }

          return i.reply({
            embeds: [
              paymentEmbed(
                i.values[0]
              )
            ],
            ephemeral: true
          });
        }

        if (
          i.customId ===
          'store_buy'
        ) {
          const id =
            i.values[0];

          if (
            id === 'none'
          ) {
            return i.reply({
              content:
                '❌ ยังไม่มีสินค้าที่พร้อมขาย',
              ephemeral: true
            });
          }

          const p =
            store.products[id];

          if (!p) {
            return i.reply({
              content:
                '❌ ไม่พบสินค้า',
              ephemeral: true
            });
          }

          if (
            p.stock !== -1 &&
            p.stock <= 0
          ) {
            return i.reply({
              content:
                '❌ สินค้าหมดแล้ว',
              ephemeral: true
            });
          }

          if (
            p.type ===
            'ROLE' ||
            p.gachaTicket
          ) {
            const e =
              new EmbedBuilder()
                .setColor(
                  0x5865F2
                )
                .setTitle(
                  '🛒 ยืนยันคำสั่งซื้อ'
                )
                .setDescription(
                  `ชื่อสินค้า : ${p.name}\n` +
                  `ราคา : ${p.price} Coins\n` +
                  `จำนวน : 1`
                );

            return i.reply({
              ephemeral: true,
              embeds: [e],
              components: [
                new ActionRowBuilder()
                  .addComponents(
                    new ButtonBuilder()
                      .setCustomId(
                        `buyok:${id}:1`
                      )
                      .setLabel(
                        'ยืนยันคำสั่งซื้อ'
                      )
                      .setStyle(
                        ButtonStyle.Success
                      ),

                    new ButtonBuilder()
                      .setCustomId(
                        'buycancel'
                      )
                      .setLabel(
                        'ยกเลิกคำสั่งซื้อ'
                      )
                      .setStyle(
                        ButtonStyle.Danger
                      )
                  )
              ]
            });
          }

          return showQty(
            i,
            id
          );
        }

        if (
          i.customId ===
          'gift_select'
        ) {
          const id =
            i.values[0];

          const g =
            gifts.items[id];

          if (!g) {
            return i.reply({
              content:
                '❌ ไม่พบรางวัล',
              ephemeral: true
            });
          }

          const u =
            user(i.user.id);

          if (
            u.salt < g.cost
          ) {
            return i.reply({
              content:
                `❌ เกลือไม่พอ\nต้องใช้ ${g.cost} เกลือ\nคุณมี ${u.salt} เกลือ`,
              ephemeral: true
            });
          }

          if (
            g.stock !== -1 &&
            g.stock <= 0
          ) {
            return i.reply({
              content:
                '❌ รางวัลหมดแล้ว',
              ephemeral: true
            });
          }

          u.salt -= g.cost;

          if (
            g.stock !== -1
          ) {
            g.stock--;
          }

          if (
            g.type ===
            'ROLE'
          ) {
            const role =
              roleByName(
                i.guild,
                g.name
              );

            if (role) {
              await i.member.roles
                .add(role)
                .catch(() => {});
            }
          } else {
            addItem(
              i.user.id,
              g.name,
              1
            );
          }

          save(
            'users',
            users
          );

          save(
            'gifts',
            gifts
          );

          await refreshStore(
            i.guild
          );

          return i.reply({
            content:
              `🎁 แลกรางวัลสำเร็จ\n\n` +
              `รางวัล : **${g.name}**\n` +
              `ใช้ : **${g.cost} เกลือ**`,
            ephemeral: true
          });
        }

        if (
          i.customId ===
          'gacha_count'
        ) {
          const count =
            Number(i.values[0]);

          const u =
            user(i.user.id);

          if (
            u.tickets < count
          ) {
            return i.update({
              content:
                `❌ ตั๋วกาชาไม่พอ\nต้องใช้ ${count} ตั๋ว\nคุณมี ${u.tickets} ตั๋ว`,
              components: []
            });
          }

          u.tickets -= count;

          const rewards = [];

          for (
            let n = 0;
            n < count;
            n++
          ) {
            const r =
              pickReward();

            if (!r) break;

            rewards.push(r);

            if (
              r.unlimited !== 1 &&
              r.quantity > 0
            ) {
              r.quantity--;
            }

            if (
              r.type ===
              'ROLE'
            ) {
              const role =
                roleByName(
                  i.guild,
                  r.name
                );

              if (role) {
                await i.member.roles
                  .add(role)
                  .catch(() => {});
              }
            } else if (
              r.name.toLowerCase() ===
              'coins'
            ) {
              u.coins +=
                Number(
                  r.quantity ||
                  1
                );
            } else if (
              r.name.toLowerCase() ===
              'เกลือ'
            ) {
              u.salt++;
            } else {
              addItem(
                i.user.id,
                r.name,
                1
              );
            }
          }

          save(
            'users',
            users
          );

          save(
            'gacha',
            gacha
          );

          await i.update({
            content:
              '🎰 **กำลังสุ่มกาชา...**\n\nLOADING...',
            components: []
          });

          setTimeout(
            async () => {
              const names =
                rewards.length
                  ? rewards.map(
                      r =>
                        `🎁 ${r.name}`
                    ).join('\n')
                  : '❌ ไม่มีรางวัล';

              await i.editReply({
                content:
                  `🎰 **สุ่มกาชาเสร็จแล้ว!**\n\n${names}`,
                components: []
              }).catch(
                () => {}
              );

              await updateGachaMessage(
                i.guild
              );
            },
            5000
          );

          return;
        }

        if (
          i.customId ===
          'gacha_delete'
        ) {
          if (!admin(i)) {
            return i.reply({
              content:
                '❌ เฉพาะ Administrator',
              ephemeral: true
            });
          }

          gacha.rewards =
            gacha.rewards.filter(
              x =>
                x.id !==
                i.values[0]
            );

          save(
            'gacha',
            gacha
          );

          await updateGachaMessage(
            i.guild
          );

          return i.reply({
            content:
              '✅ ลบรางวัลแล้ว และโอกาสออกถูกคำนวณใหม่อัตโนมัติ',
            ephemeral: true
          });
        }
      }

      if (
        i.isModalSubmit()
      ) {

        if (
          i.customId ===
          'pay_setup1'
        ) {
          config.payment.title =
            i.fields.getTextInputValue(
              'title'
            ) ||
            config.payment.title;

          config.payment.description =
            i.fields.getTextInputValue(
              'desc'
            );

          config.payment.topupChannelId =
            cleanId(
              i.fields.getTextInputValue(
                'topup'
              )
            );

          config.payment.slipChannelId =
            cleanId(
              i.fields.getTextInputValue(
                'slip'
              )
            );

          config.payment.reviewChannelId =
            cleanId(
              i.fields.getTextInputValue(
                'review'
              )
            );

          save(
            'config',
            config
          );

          return showPaymentSetup2(
            i
          );
        }

        if (
          i.customId ===
          'pay_setup2'
        ) {
          config.payment.banner =
            i.fields.getTextInputValue(
              'banner'
            );

          const tm =
            i.fields
              .getTextInputValue(
                'tm'
              )
              .split('|')
              .map(
                x =>
                  x.trim()
              );

          const bk =
            i.fields
              .getTextInputValue(
                'bank'
              )
              .split('|')
              .map(
                x =>
                  x.trim()
              );

          const qr =
            i.fields
              .getTextInputValue(
                'qr'
              )
              .trim();

          const en =
            i.fields
              .getTextInputValue(
                'enabled'
              )
              .toUpperCase()
              .split(',')
              .map(
                x =>
                  x.trim()
              );

          if (
            tm.length >= 2
          ) {
            config.payment.methods.truemoney = {
              enabled:
                en.includes(
                  'TM'
                ),
              accountName:
                tm[0],
              accountNumber:
                tm[1]
            };
          }

          if (
            bk.length >= 3
          ) {
            config.payment.methods.bank = {
              enabled:
                en.includes(
                  'BANK'
                ),
              bankName:
                bk[0],
              accountName:
                bk[1],
              accountNumber:
                bk[2]
            };
          }

          if (qr) {
            config.payment.methods.qr = {
              enabled:
                en.includes(
                  'QR'
                ),
              imageUrl:
                qr
            };
          }

          save(
            'config',
            config
          );

          const ch =
            await i.guild.channels
              .fetch(
                config.payment.topupChannelId
              )
              .catch(
                () => null
              );

          if (
            ch &&
            ch.isTextBased()
          ) {
            await ch.send(
              paymentPanel()
            ).catch(
              () => {}
            );
          }

          return i.reply({
            content:
              '✅ ตั้งค่าระบบเติมเงินและสร้างหน้าต่างเติมเงินแล้ว',
            ephemeral: true
          });
        }

        if (
          i.customId ===
          'custom_amount'
        ) {
          const coins =
            Number(
              i.fields.getTextInputValue(
                'coins'
              )
            );

          if (
            !Number.isInteger(
              coins
            ) ||
            coins < 2
          ) {
            return i.reply({
              content:
                '❌ จำนวน Coins ต้องเป็นจำนวนเต็ม และต้องมีมูลค่าอย่างน้อย 1 บาท (ขั้นต่ำ 2 Coins)',
              ephemeral: true
            });
          }

          const amount =
            coins * COIN_RATE;

          return i.reply({
            ephemeral: true,
            embeds: [
              new EmbedBuilder()
                .setColor(
                  0x57F287
                )
                .setTitle(
                  '💳 แจ้งยอดเติมเงิน'
                )
                .setDescription(
                  `จำนวน Coins : **${coins.toLocaleString()} Coins**
ยอดชำระ : **${money(amount)} บาท**

เมื่อชำระเงินแล้ว แนบสลิปที่ <#${config.payment.slipChannelId}>`
                )
            ]
          });
        }

        if (
          i.customId ===
          'store_add'
        ) {
          const name =
            i.fields.getTextInputValue(
              'name'
            );

          const desc =
            i.fields.getTextInputValue(
              'desc'
            );

          const type =
            i.fields.getTextInputValue(
              'type'
            ).toUpperCase();

          const price =
            Number(
              i.fields.getTextInputValue(
                'price'
              )
            );

          const stock =
            Number(
              i.fields.getTextInputValue(
                'stock'
              )
            );

          if (
            !['ROLE', 'ITEM'].includes(
              type
            ) ||
            !Number.isFinite(
              price
            ) ||
            price < 0 ||
            !Number.isInteger(
              stock
            ) ||
            stock === 0
          ) {
            return i.reply({
              content:
                '❌ ข้อมูลไม่ถูกต้อง',
              ephemeral: true
            });
          }

          const id =
            Date.now().toString();

          store.products[id] = {
            id,
            name,
            description: desc,
            type,
            price,
            stock,
            roleId:
              type === 'ROLE'
                ? (
                    roleByName(
                      i.guild,
                      name
                    )?.id || ''
                  )
                : ''
          };

          save(
            'store',
            store
          );

          await refreshStore(
            i.guild
          );

          return i.reply({
            content:
              `✅ เพิ่มสินค้า **${name}** และอัปเดตหน้าร้านอัตโนมัติแล้ว`,
            ephemeral: true
          });
        }

        if (
          i.customId ===
          'gift_setup'
        ) {
          config.store.giftButton =
            i.fields.getTextInputValue(
              'name'
            );

          save(
            'config',
            config
          );

          await refreshStore(
            i.guild
          );

          return i.reply({
            content:
              '✅ ตั้งค่าปุ่มแลกรางวัลและอัปเดตหน้าร้านแล้ว',
            ephemeral: true
          });
        }

        if (
          i.customId ===
          'gacha_setup1'
        ) {
          gacha.name =
            i.fields.getTextInputValue(
              'name'
            ) ||
            gacha.name;

          gacha.description =
            i.fields.getTextInputValue(
              'desc'
            );

          gacha.channelId =
            cleanId(
              i.fields.getTextInputValue(
                'channel'
              )
            );

          gacha.banner =
            i.fields.getTextInputValue(
              'banner'
            );

          gacha.loadingBanner =
            i.fields.getTextInputValue(
              'loading'
            );

          save(
            'gacha',
            gacha
          );

          return showGachaSetup2(
            i
          );
        }

        if (
          i.customId ===
          'gacha_setup2'
        ) {
          gacha.ticketEmoji =
            i.fields.getTextInputValue(
              'ticket_emoji'
            );

          gacha.ticketName =
            i.fields.getTextInputValue(
              'ticket_name'
            );

          gacha.spinButton =
            i.fields.getTextInputValue(
              'spin'
            );

          save(
            'gacha',
            gacha
          );

          await ensureTicketProduct(
            i.guild
          );

          return i.reply({
            content:
              `✅ ตั้งค่าตู้กาชาครบ 8 ช่องแล้ว
🎟️ ระบบสร้าง/อัปเดตสินค้า **${gacha.ticketEmoji} ${gacha.ticketName}** ราคา **5 Coins** ในร้านให้อัตโนมัติแล้ว`,
            ephemeral: true
          });
        }

        if (
          i.customId.startsWith(
            'qty:'
          )
        ) {
          const id =
            i.customId.slice(4);

          const p =
            store.products[id];

          const qty =
            Number(
              i.fields.getTextInputValue(
                'qty'
              )
            );

          if (
            !p ||
            !Number.isInteger(
              qty
            ) ||
            qty < 1
          ) {
            return i.reply({
              content:
                '❌ จำนวนไม่ถูกต้อง',
              ephemeral: true
            });
          }

          if (
            p.stock !== -1 &&
            p.stock < qty
          ) {
            return i.reply({
              content:
                `❌ สินค้าเหลือ ${p.stock}`,
              ephemeral: true
            });
          }

          const e =
            new EmbedBuilder()
              .setTitle(
                '🛒 ยืนยันคำสั่งซื้อ'
              )
              .setDescription(
                `ชื่อสินค้า : ${p.name}
ราคา : ${p.price * qty} Coins
จำนวน : ${qty}
ประเภทสินค้า : ${p.type}`
              );

          return i.reply({
            ephemeral: true,
            embeds: [e],
            components: [
              new ActionRowBuilder()
                .addComponents(
                  new ButtonBuilder()
                    .setCustomId(
                      `buyok:${id}:${qty}`
                    )
                    .setLabel(
                      'ยืนยันคำสั่งซื้อ'
                    )
                    .setStyle(
                      ButtonStyle.Success
                    ),

                  new ButtonBuilder()
                    .setCustomId(
                      'buycancel'
                    )
                    .setLabel(
                      'ยกเลิกคำสั่งซื้อ'
                    )
                    .setStyle(
                      ButtonStyle.Danger
                    )
                )
            ]
          });
        }

        if (
          i.customId ===
          'gadd_modal'
        ) {
          const name =
            i.fields.getTextInputValue(
              'name'
            );

          const qty =
            Number(
              i.fields.getTextInputValue(
                'qty'
              )
            );

          const chance =
            Number(
              i.fields.getTextInputValue(
                'chance'
              )
            );

          const type =
            i.fields.getTextInputValue(
              'type'
            ).toUpperCase();

          if (
            !['ROLE', 'ITEM'].includes(
              type
            ) ||
            !Number.isInteger(
              qty
            ) ||
            qty === 0 ||
            !Number.isFinite(
              chance
            ) ||
            chance <= 0
          ) {
            return i.reply({
              content:
                '❌ ข้อมูลรางวัลกาชาไม่ถูกต้อง',
              ephemeral: true
            });
          }

          gacha.rewards.push({
            id:
              Date.now().toString(),
            name,
            quantity:
              qty,
            unlimited:
              qty === -1
                ? 1
                : 0,
            chance,
            type
          });

          save(
            'gacha',
            gacha
          );

          await updateGachaMessage(
            i.guild
          );

          return i.reply({
            content:
              `✅ เพิ่มรางวัล **${name}** แล้ว และโอกาสจะแสดงเป็นเปอร์เซ็นต์อัตโนมัติ`,
            ephemeral: true
          });
        }
      }

    } catch (e) {
      console.error(
        'interactionCreate',
        e
      );

      if (
        !i.replied &&
        !i.deferred
      ) {
        await i.reply({
          content:
            '❌ เกิดข้อผิดพลาด กรุณาตรวจสอบ Railway Logs',
          ephemeral: true
        }).catch(
          () => {}
        );
      }
    }
  }
);

async function ensureTicketProduct(
  guild
) {
  const existing =
    Object.values(
      store.products
    ).find(
      p =>
        p.gachaTicket === true
    );

  if (existing) {
    existing.name =
      gacha.ticketName;

    existing.description =
      `${gacha.ticketEmoji} ตั๋วสำหรับสุ่ม ${gacha.name}`;

    existing.price = 5;
    existing.type = 'ITEM';
    existing.stock = -1;

  } else {

    const id =
      `gacha_ticket_${Date.now()}`;

    store.products[id] = {
      id,
      name:
        gacha.ticketName,
      description:
        `${gacha.ticketEmoji} ตั๋วสำหรับสุ่ม ${gacha.name}`,
      type:
        'ITEM',
      price:
        5,
      stock:
        -1,
      roleId:
        '',
      gachaTicket:
        true
    };
  }

  save(
    'store',
    store
  );

  await refreshStore(
    guild
  );
}

client.on(
  'messageCreate',
  async m => {
    if (m.author.bot) return;

    try {
      const text =
        m.content.trim();

      if (
        text ===
        '!setup'
      ) {
        if (
          !m.member?.permissions.has(
            PermissionFlagsBits.Administrator
          )
        ) {
          return m.reply(
            '❌ เฉพาะ Administrator'
          );
        }

        const e =
          new EmbedBuilder()
            .setColor(
              0x5865F2
            )
            .setTitle(
              '🛠️ LUCENT BOT — คำสั่งทั้งหมด'
            )
            .setDescription(
              `**ระบบเติมเงิน**

\`/pymentsetting\`
— ตั้งค่าบัญชีและห้องเติมเงิน

\`/startstore\`
— สร้างหน้าระบบเติมเงิน

**ระบบร้านค้า**

\`/storeadd\`
— เพิ่ม ROLE/ITEM และอัปเดตหน้าร้านทันที

\`/gift\`
— ตั้งชื่อปุ่มแลกรางวัล

**ระบบกาชา**

\`/gachasetup\`
— ตั้งค่าตู้ครบ 8 ช่อง

\`/gachastart\`
— สร้างตู้กาชา

\`/gachareward\`
— เพิ่ม/ลบรางวัล

**สมาชิก**

\`!bagpack\`
— ดู Coins/เกลือ/ตั๋ว/ไอเท็ม

\`/balance\`
— ดู Coins

\`!addgift\`
— เพิ่มของแลกด้วยเกลือ

🎟️ ตั้งค่าตู้กาชาแล้วตั๋วจะถูกเพิ่มในร้านอัตโนมัติ ราคา 5 Coins`
            );

        return m.reply({
          embeds: [e]
        });
      }

      if (
        text ===
        '!bagpack'
      ) {
        const u =
          user(m.author.id);

        const items =
          Object.entries(
            u.inventory
          )
            .filter(
              ([, v]) =>
                v > 0
            )
            .map(
              ([k, v]) =>
                `• ${k} × ${v}`
            )
            .join('\n') ||
          'ไม่มี ITEM';

        return m.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(
                0x57F287
              )
              .setTitle(
                `🎒 กระเป๋าของ ${
                  m.member?.displayName ||
                  m.author.username
                }`
              )
              .setDescription(
                `🪙 Coins: **${u.coins}**
🧂 เกลือ: **${u.salt}**
🎟️ ตั๋วกาชา: **${u.tickets}**

**ITEM**
${items}`
              )
          ]
        });
      }

      if (
        text.startsWith(
          '!addgift'
        )
      ) {
        if (
          !m.member?.permissions.has(
            PermissionFlagsBits.Administrator
          )
        ) {
          return m.reply(
            '❌ เฉพาะ Administrator'
          );
        }

        const parts =
          text.split(
            /\s+/
          );

        if (
          parts.length < 5
        ) {
          return m.reply(
            'รูปแบบ: `!addgift ชื่อรางวัล ราคาเกลือ จำนวน ROLE|ITEM`'
          );
        }

        const type =
          parts
            .pop()
            .toUpperCase();

        const stock =
          Number(
            parts.pop()
          );

        const cost =
          Number(
            parts.pop()
          );

        const name =
          parts
            .slice(1)
            .join(' ');

        if (
          !['ROLE', 'ITEM'].includes(
            type
          ) ||
          !Number.isFinite(
            cost
          ) ||
          cost < 0 ||
          !Number.isInteger(
            stock
          ) ||
          stock === 0
        ) {
          return m.reply(
            '❌ ข้อมูลไม่ถูกต้อง'
          );
        }

        const id =
          Date.now().toString();

        gifts.items[id] = {
          id,
          name,
          cost,
          stock,
          type
        };

        save(
          'gifts',
          gifts
        );

        await refreshStore(
          m.guild
        );

        return m.reply(
          `✅ เพิ่มรางวัลแลก **${name}** และอัปเดตหน้าร้านแล้ว`
        );
      }

      if (
        config.payment.slipChannelId &&
        m.channel.id ===
          config.payment.slipChannelId &&
        m.attachments.size
      ) {
        const img =
          m.attachments.find(
            a =>
              a.contentType?.startsWith(
                'image/'
              ) ||
              /\.(png|jpe?g|webp)$/i.test(
                a.name || ''
              )
          );

        if (!img) return;

        const ask =
          await m.author
            .send(
              `📸 รับสลิปแล้ว

กรุณาตอบ DM นี้ด้วยจำนวนเงินที่โอน (บาท)
เช่น 50`
            )
            .catch(
              () => null
            );

        if (!ask) {
          return m.reply(
            '⚠️ ไม่สามารถส่ง DM ได้'
          );
        }

        const filter =
          x =>
            x.author.id ===
              m.author.id &&
            /^\d+(\.\d+)?$/.test(
              x.content.trim()
            );

        const col =
          ask.channel
            .createMessageCollector({
              filter,
              time:
                120000,
              max:
                1
            });

        col.on(
          'collect',
          async x => {
            const amount =
              Number(
                x.content
              );

            const coins =
              Math.floor(
                amount /
                  COIN_RATE
              );

            const reviewId =
              config.payment
                .reviewChannelId ||
              config.payment
                .slipChannelId;

            const e =
              new EmbedBuilder()
                .setColor(
                  0xFEE75C
                )
                .setTitle(
                  '💰 ตรวจสอบสลิปเติมเงิน'
                )
                .setDescription(
                  `ผู้ใช้: <@${m.author.id}>
จำนวน: **${money(amount)} บาท**
Coins ที่จะได้รับ: **${coins} Coins**`
                )
                .setImage(
                  img.url
                );

            const ch =
              await m.guild.channels
                .fetch(
                  reviewId
                )
                .catch(
                  () => null
                );

            if (
              ch &&
              ch.isTextBased()
            ) {
              await ch.send({
                embeds: [e],

                components: [
                  new ActionRowBuilder()
                    .addComponents(
                      new ButtonBuilder()
                        .setCustomId(
                          `approve:${m.author.id}:${coins}:${amount}`
                        )
                        .setLabel(
                          'ชำระเงิน'
                        )
                        .setStyle(
                          ButtonStyle.Success
                        ),

                      new ButtonBuilder()
                        .setCustomId(
                          `reject:${m.author.id}:${coins}:${amount}`
                        )
                        .setLabel(
                          'ยกเลิก'
                        )
                        .setStyle(
                          ButtonStyle.Danger
                        )
                    )
                ]
              });
            }
          }
        );
      }

    } catch (e) {
      console.error(
        'messageCreate',
        e
      );
    }
  }
);

client.login(
  TOKEN
).catch(e => {
  console.error(
    'Login failed:',
    e
  );

  process.exit(1);
});
