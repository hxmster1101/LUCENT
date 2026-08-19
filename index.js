const {
  Client, GatewayIntentBits, Partials, REST, Routes,
  SlashCommandBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  EmbedBuilder
} = require("discord.js");
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const PREFIX = "!";

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const FILES = {
  config: "config.json",
  users: "users.json",
  store: "store.json",
  gifts: "gifts.json",
  gacha: "gacha.json"
};

function load(name, fallback) {
  const file = path.join(DATA_DIR, FILES[name]);

  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function save(name, data) {
  fs.writeFileSync(
    path.join(DATA_DIR, FILES[name]),
    JSON.stringify(data, null, 2)
  );
}

let config = load("config", {
  payment: {
    title: "💳 เติมเงิน",
    description: "เลือกช่องทางชำระเงินด้านล่าง",
    paymentChannelId: "",
    slipChannelId: "",
    banner: "",
    methods: {
      truemoney: {
        enabled: false,
        accountName: "",
        accountNumber: ""
      },
      bank: {
        enabled: false,
        bankName: "",
        accountName: "",
        accountNumber: ""
      },
      qr: {
        enabled: false,
        imageUrl: ""
      }
    }
  },

  store: {
    name: "LUCENT STORE",
    description: "ร้านค้า Coins",
    channelId: "",
    buyButton: "🛒 ซื้อสินค้า",
    giftButton: "🎁 แลกรางวัล",
    banner: ""
  }
});

let users = load("users", {});
let store = load("store", {
  products: {}
});

let gifts = load("gifts", {
  items: {}
});

let gacha = load("gacha", {
  name: "LUCENT GACHA",
  description: "ตู้สำหรับสุ่มกาชา",
  channelId: "",
  banner: "",
  ticketEmoji: "🎟️",
  ticketName: "Gacha Ticket",
  spinButton: "🎰 สุ่มกาชา",
  loadingBanner: "",
  rewards: []
});

function userData(id) {
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

function money(n) {
  return Number(n).toFixed(2);
}

function cleanId(s) {
  return String(s || "")
    .replace(/[<#@&>]/g, "")
    .trim();
}

function isAdmin(i) {
  return (
    i.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    i.member?.permissions?.has(PermissionFlagsBits.Administrator)
  );
}

function validUrl(url) {
  return !url || /^https?:\/\/\S+$/i.test(url);
}

function addItem(uid, name, qty) {
  const u = userData(uid);

  u.inventory[name] =
    (u.inventory[name] || 0) + qty;
}

function totalGachaChance() {
  return gacha.rewards.reduce(
    (a, r) => a + Number(r.chance || 0),
    0
  );
}

function normalizedChance(reward) {
  const total = totalGachaChance();

  return total > 0
    ? Number(reward.chance) / total * 100
    : 0;
}

function pickReward() {
  const available = gacha.rewards.filter(
    r =>
      Number(r.unlimited) === 1 ||
      Number(r.quantity) > 0
  );

  if (!available.length) return null;

  const total = available.reduce(
    (a, r) => a + Math.max(0, Number(r.chance || 0)),
    0
  );

  if (total <= 0) {
    return available[
      Math.floor(Math.random() * available.length)
    ];
  }

  let roll = Math.random() * total;

  for (const r of available) {
    roll -= Math.max(
      0,
      Number(r.chance || 0)
    );

    if (roll <= 0) return r;
  }

  return available[available.length - 1];
}

function rewardText(r) {
  const stock =
    Number(r.unlimited) === 1
      ? "ไม่จำกัด"
      : String(r.quantity);

  return `${r.type === "ROLE" ? "🏷️" : "🎁"} **${r.name}** — เหลือ ${stock} — โอกาสออก ${normalizedChance(r).toFixed(2)}%`;
}

async function safeSend(channelId, payload) {
  if (!channelId) return null;

  const ch = await client.channels
    .fetch(channelId)
    .catch(() => null);

  if (!ch || !ch.isTextBased()) return null;

  return ch.send(payload).catch(() => null);
}

function paymentMethods() {
  const m = config.payment.methods;
  const out = [];

  if (m.truemoney.enabled) {
    out.push({
      id: "truemoney",
      label: "TrueMoney Wallet",
      emoji: "💚"
    });
  }

  if (m.bank.enabled) {
    out.push({
      id: "bank",
      label: "ธนาคาร",
      emoji: "🏦"
    });
  }

  if (m.qr.enabled) {
    out.push({
      id: "qr",
      label: "QR Code",
      emoji: "📱"
    });
  }

  return out;
}

function paymentAccountEmbed(id) {
  const m = config.payment.methods[id];

  const e = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("💳 ช่องทางชำระเงิน");

  if (id === "truemoney") {
    e.setDescription(
      `**TrueMoney Wallet**

ชื่อบัญชี: ${m.accountName}

เลขบัญชี: \`${m.accountNumber}\`

หลังชำระเงินแล้ว แนบสลิปในห้อง <#${config.payment.slipChannelId}>`
    );
  }

  else if (id === "bank") {
    e.setDescription(
      `**${m.bankName}**

ชื่อบัญชี: ${m.accountName}

เลขบัญชี: \`${m.accountNumber}\`

หลังชำระเงินแล้ว แนบสลิปในห้อง <#${config.payment.slipChannelId}>`
    );
  }

  else {
    e.setDescription(
      `**QR Code ชำระเงิน**

แนบ/แสดง QR ด้านล่าง

หลังชำระเงินแล้ว แนบสลิปในห้อง <#${config.payment.slipChannelId}>`
    );

    if (m.imageUrl) {
      e.setImage(m.imageUrl);
    }
  }

  return e;
}

function paymentPanel() {
  const methods = paymentMethods();

  const menu =
    new StringSelectMenuBuilder()
      .setCustomId("payment_method")
      .setPlaceholder("เลือกช่องทางชำระเงิน")
      .addOptions(
        methods.map(x => ({
          label: x.label,
          value: x.id,
          emoji: x.emoji
        }))
      );

  const row1 =
    new ActionRowBuilder()
      .addComponents(menu);

  const e =
    new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle(
        config.payment.title ||
        "💳 เติมเงิน"
      )
      .setDescription(
        `${config.payment.description || ""}

**เรทราคา Coins**

10 Coins = 8.60 บาท
50 Coins = 43.00 บาท
115 Coins = 98.90 บาท
510 Coins = 438.60 บาท
1,150 Coins = 989.00 บาท

หรือกด **กำหนดเอง**
เพื่อกรอกจำนวนเงินที่ต้องการเติม

ขั้นต่ำ 1 บาท

เมื่อชำระเงินแล้ว
ให้แนบสลิปในห้อง <#${config.payment.slipChannelId}>`
      );

  if (
    config.payment.banner &&
    validUrl(config.payment.banner)
  ) {
    e.setImage(config.payment.banner);
  }

  const custom =
    new ButtonBuilder()
      .setCustomId("topup_custom")
      .setLabel("กำหนดเอง")
      .setStyle(ButtonStyle.Primary);

  const row2 =
    new ActionRowBuilder()
      .addComponents(custom);

  return {
    embeds: [e],
    components: [row1, row2]
  };
}

function storeEmbed() {
  const e =
    new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(config.store.name)
      .setDescription(
        config.store.description || ""
      );

  const products =
    Object.values(store.products);

  const pText =
    products.length
      ? products.map(p => {
          const stock =
            p.stock === -1
              ? "ไม่จำกัด"
              : p.stock;

          return `**${p.name}**

${p.description || "-"}

💰 ${p.price} Coins
📦 เหลือ ${stock}`;
        }).join("\n\n")
      : "ยังไม่มีสินค้า";

  const giftList =
    Object.values(gifts.items);

  const gText =
    giftList.length
      ? giftList.map(g =>
          `**${g.name}**

🎁 ${g.type}
🧂 ${g.cost} เกลือ
📦 เหลือ ${
            g.stock === -1
              ? "ไม่จำกัด"
              : g.stock
          }`
        ).join("\n\n")
      : "ยังไม่มีรางวัลแลก";

  e.addFields(
    {
      name: "🛍️ สินค้าที่สามารถซื้อได้",
      value: pText.slice(0, 1024)
    },
    {
      name: "🎁 สินค้าที่สามารถแลกได้",
      value: gText.slice(0, 1024)
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
        p =>
          p.stock === -1 ||
          p.stock > 0
      );

  const menu =
    new StringSelectMenuBuilder()
      .setCustomId("store_buy")
      .setPlaceholder(
        "เลือกสินค้าที่ต้องการซื้อ"
      );

  if (available.length) {
    menu.addOptions(
      available.slice(0, 25).map(p => ({
        label: p.name.slice(0, 100),
        description:
          `${p.price} Coins | เหลือ ${
            p.stock === -1
              ? "ไม่จำกัด"
              : p.stock
          }`.slice(0, 100),
        value: p.id
      }))
    );
  }

  else {
    menu.addOptions({
      label: "ไม่มีสินค้าที่พร้อมขาย",
      value: "none"
    });
  }

  const buyRow =
    new ActionRowBuilder()
      .addComponents(menu);

  const giftBtn =
    new ButtonBuilder()
      .setCustomId("gift_open")
      .setLabel(
        config.store.giftButton ||
        "🎁 แลกรางวัล"
      )
      .setStyle(ButtonStyle.Success);

  return {
    components: [
      buyRow,
      new ActionRowBuilder()
        .addComponents(giftBtn)
    ]
  };
}

function gachaEmbed() {
  const roles =
    gacha.rewards.filter(
      r => r.type === "ROLE"
    );

  const items =
    gacha.rewards.filter(
      r => r.type === "ITEM"
    );

  const section = arr =>
    arr.length
      ? arr.map(rewardText).join("\n")
      : "ไม่มีรางวัล";

  const e =
    new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle(gacha.name)
      .setDescription(
        `${gacha.description || ""}

**รางวัลในตู้กาชา**

**ประเภทยศ**

${section(roles)}

**ประเภทไอเท็ม**

${section(items)}

🎟️ 1 ตั๋ว = **5 Coins**`
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
  const spin =
    new ButtonBuilder()
      .setCustomId("gacha_spin")
      .setLabel(
        gacha.spinButton ||
        "🎰 สุ่มกาชา"
      )
      .setStyle(ButtonStyle.Primary);

  return {
    components: [
      new ActionRowBuilder()
        .addComponents(spin)
    ]
  };
}

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("pymentsetting")
      .setDescription(
        "ตั้งค่าระบบเติมเงิน"
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator
      ),

    new SlashCommandBuilder()
      .setName("storeadd")
      .setDescription(
        "เพิ่มสินค้าในร้านค้า"
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator
      ),

    new SlashCommandBuilder()
      .setName("gift")
      .setDescription(
        "ตั้งค่าปุ่มแลกรางวัล"
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator
      ),

    new SlashCommandBuilder()
      .setName("gachasetup")
      .setDescription(
        "ตั้งค่าตู้กาชา"
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator
      ),

    new SlashCommandBuilder()
      .setName("gachastart")
      .setDescription(
        "สร้างตู้กาชา"
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator
      ),

    new SlashCommandBuilder()
      .setName("gachareward")
      .setDescription(
        "จัดการรางวัลกาชา"
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.Administrator
      )
  ].map(x => x.toJSON());

  const rest =
    new REST({ version: "10" })
      .setToken(TOKEN);

  if (GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(
        CLIENT_ID,
        GUILD_ID
      ),
      {
        body: commands
      }
    );
  }

  else {
    await rest.put(
      Routes.applicationCommands(
        CLIENT_ID
      ),
      {
        body: commands
      }
    );
  }
}

const client =
  new Client({
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

client.once(
  "ready",
  async () => {
    console.log(
      `ONLINE: ${client.user.tag}`
    );

    try {
      await registerCommands();

      console.log(
        "Slash commands registered."
      );
    }

    catch (e) {
      console.error(
        "Command registration error:",
        e
      );
    }
  }
);

client.on(
  "interactionCreate",
  async i => {

    try {

      if (i.isChatInputCommand()) {

        if (
          [
            "pymentsetting",
            "storeadd",
            "gift",
            "gachasetup",
            "gachastart",
            "gachareward"
          ].includes(i.commandName) &&
          !isAdmin(i)
        ) {
          return i.reply({
            content:
              "❌ เฉพาะแอดมินเท่านั้น",
            ephemeral: true
          });
        }

        if (
          i.commandName ===
          "pymentsetting"
        ) {

          const modal =
            new ModalBuilder()
              .setCustomId(
                "payment_settings"
              )
              .setTitle(
                "ตั้งค่าระบบเติมเงิน"
              );

          const fields = [
            [
              "payment_title",
              "หัวข้อการชำระเงิน",
              config.payment.title
            ],

            [
              "payment_desc",
              "รายละเอียด",
              config.payment.description
            ],

            [
              "payment_channel",
              "ID ห้องเติมเงิน",
              config.payment.paymentChannelId
            ],

            [
              "slip_channel",
              "ID ห้องแนบสลิป",
              config.payment.slipChannelId
            ],

            [
              "payment_banner",
              "ลิงค์ Banner ตกแต่ง",
              config.payment.banner
            ]
          ];

          modal.addComponents(
            ...fields.map(
              ([id, label, val]) =>
                new ActionRowBuilder()
                  .addComponents(
                    new TextInputBuilder()
                      .setCustomId(id)
                      .setLabel(label)
                      .setStyle(
                        id === "payment_desc"
                          ? TextInputStyle.Paragraph
                          : TextInputStyle.Short
                      )
                      .setRequired(false)
                      .setValue(
                        String(
                          val || ""
                        ).slice(
                          0,
                          4000
                        )
                      )
                  )
            )
          );

          return i.showModal(modal);
        }

        if (
          i.commandName ===
          "storeadd"
        ) {

          const modal =
            new ModalBuilder()
              .setCustomId(
                "store_add"
              )
              .setTitle(
                "เพิ่มสินค้า"
              );

          const fields = [
            [
              "item_name",
              "ชื่อ ITEM หรือ ยศ",
              ""
            ],

            [
              "item_desc",
              "รายละเอียดสินค้า",
              ""
            ],

            [
              "item_type",
              "ประเภทสินค้า: ROLE หรือ ITEM",
              "ITEM"
            ],

            [
              "item_price",
              "ราคาสินค้า Coins",
              "5"
            ],

            [
              "item_stock",
              "จำนวนสินค้า (-1 = ไม่จำกัด)",
              "1"
            ]
          ];

          modal.addComponents(
            ...fields.map(
              ([id, label, val]) =>
                new ActionRowBuilder()
                  .addComponents(
                    new TextInputBuilder()
                      .setCustomId(id)
                      .setLabel(label)
                      .setStyle(
                        id === "item_desc"
                          ? TextInputStyle.Paragraph
                          : TextInputStyle.Short
                      )
                      .setRequired(true)
                      .setValue(val)
                  )
            )
          );

          return i.showModal(modal);
        }

        if (
          i.commandName ===
          "gift"
        ) {

          const modal =
            new ModalBuilder()
              .setCustomId(
                "gift_button"
              )
              .setTitle(
                "ตั้งค่าปุ่มแลกรางวัล"
              );

          modal.addComponents(
            new ActionRowBuilder()
              .addComponents(
                new TextInputBuilder()
                  .setCustomId(
                    "gift_button_name"
                  )
                  .setLabel(
                    "ชื่อปุ่มแลกรางวัล"
                  )
                  .setRequired(true)
                  .setStyle(
                    TextInputStyle.Short
                  )
                  .setValue(
                    config.store.giftButton ||
                    "🎁 แลกรางวัล"
                  )
              )
          );

          return i.showModal(modal);
        }

        if (
          i.commandName ===
          "gachasetup"
        ) {

          const modal =
            new ModalBuilder()
              .setCustomId(
                "gacha_setup"
              )
              .setTitle(
                "ตั้งค่าตู้กาชา"
              );

          const fields = [
            [
              "g_name",
              "ชื่อตู้กาชา",
              gacha.name
            ],

            [
              "g_desc",
              "รายละเอียด",
              gacha.description
            ],

            [
              "g_channel",
              "ID ช่องกาชา",
              gacha.channelId
            ],

            [
              "g_banner",
              "ลิงค์ Banner",
              gacha.banner
            ],

            [
              "g_ticket_emoji",
              "อิโมจิตั๋วกาชา",
              gacha.ticketEmoji
            ]
          ];

          modal.addComponents(
            ...fields.map(
              ([id, label, val]) =>
                new ActionRowBuilder()
                  .addComponents(
                    new TextInputBuilder()
                      .setCustomId(id)
                      .setLabel(label)
                      .setStyle(
                        id === "g_desc"
                          ? TextInputStyle.Paragraph
                          : TextInputStyle.Short
                      )
                      .setRequired(false)
                      .setValue(
                        String(
                          val || ""
                        ).slice(
                          0,
                          4000
                        )
                      )
                  )
            )
          );

          return i.showModal(modal);
        }

        if (
          i.commandName ===
          "gachastart"
        ) {

          const ch =
            await client.channels
              .fetch(
                gacha.channelId
              )
              .catch(
                () => null
              );

          if (
            !ch ||
            !ch.isTextBased()
          ) {
            return i.reply({
              content:
                "❌ ไม่พบ ID ช่องกาชา",
              ephemeral: true
            });
          }

          await ch.send({
            embeds: [
              gachaEmbed()
            ],
            ...gachaComponents()
          });

          return i.reply({
            content:
              `✅ สร้างตู้กาชาที่ <#${gacha.channelId}> แล้ว`,
            ephemeral: true
          });
        }

        if (
          i.commandName ===
          "gachareward"
        ) {

          return i.reply({
            ephemeral: true,

            embeds: [
              new EmbedBuilder()
                .setTitle(
                  "⚙️ จัดการรางวัลกาชา"
                )
                .setDescription(
                  "เลือกการจัดการด้านล่าง"
                )
            ],

            components: [
              new ActionRowBuilder()
                .addComponents(

                  new ButtonBuilder()
                    .setCustomId(
                      "gacha_add"
                    )
                    .setLabel(
                      "➕ เพิ่มของรางวัล"
                    )
                    .setStyle(
                      ButtonStyle.Success
                    ),

                  new ButtonBuilder()
                    .setCustomId(
                      "gacha_remove"
                    )
                    .setLabel(
                      "➖ ลบของรางวัล"
                    )
                    .setStyle(
                      ButtonStyle.Danger
                    )
                )
            ]
          });
        }
      }

      if (i.isButton()) {

        if (
          i.customId ===
          "topup_custom"
        ) {

          const modal =
            new ModalBuilder()
              .setCustomId(
                "custom_topup"
              )
              .setTitle(
                "กำหนดจำนวนเงินเติม"
              );

          modal.addComponents(
            new ActionRowBuilder()
              .addComponents(
                new TextInputBuilder()
                  .setCustomId(
                    "amount"
                  )
                  .setLabel(
                    "จำนวนเงิน (บาท) ขั้นต่ำ 1 บาท"
                  )
                  .setStyle(
                    TextInputStyle.Short
                  )
                  .setRequired(true)
              )
          );

          return i.showModal(modal);
        }

        if (
          i.customId ===
          "gift_open"
        ) {

          const available =
            Object.values(
              gifts.items
            ).filter(
              g =>
                g.stock === -1 ||
                g.stock > 0
            );

          if (
            !available.length
          ) {
            return i.reply({
              content:
                "❌ ตอนนี้ยังไม่มีรางวัลที่พร้อมแลก",
              ephemeral: true
            });
          }

          const menu =
            new StringSelectMenuBuilder()
              .setCustomId(
                "gift_select"
              )
              .setPlaceholder(
                "เลือกรางวัลที่ต้องการแลก"
              )
              .addOptions(
                available
                  .slice(0, 25)
                  .map(g => ({
                    label:
                      g.name.slice(
                        0,
                        100
                      ),

                    description:
                      `ใช้ ${g.cost} เกลือ | เหลือ ${
                        g.stock === -1
                          ? "ไม่จำกัด"
                          : g.stock
                      }`.slice(
                        0,
                        100
                      ),

                    value: g.id
                  }))
              );

          return i.reply({
            ephemeral: true,

            embeds: [
              new EmbedBuilder()
                .setTitle(
                  "🎁 แลกรางวัล"
                )
                .setDescription(
                  "เลือกของรางวัลที่ต้องการแลกด้วยเกลือ"
                )
            ],

            components: [
              new ActionRowBuilder()
                .addComponents(
                  menu
                )
            ]
          });
        }

        if (
          i.customId ===
          "gacha_spin"
        ) {

          const u =
            userData(
              i.user.id
            );

          if (
            u.tickets < 1
          ) {
            return i.reply({
              content:
                "❌ คุณไม่มีตั๋วกาชา",
              ephemeral: true
            });
          }

          const menu =
            new StringSelectMenuBuilder()
              .setCustomId(
                "gacha_count"
              )
              .setPlaceholder(
                "เลือกจำนวนครั้งที่ต้องการสุ่ม"
              )
              .addOptions(
                {
                  label:
                    "1 ครั้ง",
                  value:
                    "1",
                  description:
                    "ใช้ 1 ตั๋ว"
                },

                {
                  label:
                    "5 ครั้ง",
                  value:
                    "5",
                  description:
                    "ใช้ 5 ตั๋ว"
                },

                {
                  label:
                    "10 ครั้ง",
                  value:
                    "10",
                  description:
                    "ใช้ 10 ตั๋ว"
                }
              );

          return i.reply({
            ephemeral: true,

            content:
              "🎰 เลือกจำนวนครั้งที่จะสุ่ม",

            components: [
              new ActionRowBuilder()
                .addComponents(
                  menu
                )
            ]
          });
        }

        if (
          i.customId ===
          "buy_cancel"
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
            "buy_confirm:"
          )
        ) {

          const [
            ,
            pid,
            qtyStr
          ] =
            i.customId.split(":");

          const qty =
            Number(qtyStr);

          const p =
            store.products[
              pid
            ];

          if (!p) {
            return i.update({
              content:
                "❌ ไม่พบสินค้า",
              embeds: [],
              components: []
            });
          }

          const u =
            userData(
              i.user.id
            );

          const total =
            p.price * qty;

          if (
            u.coins < total
          ) {
            return i.update({
              content:
                `❌ Coins ไม่พอ ต้องใช้ ${total} Coins แต่คุณมี ${u.coins} Coins`,
              embeds: [],
              components: []
            });
          }

          if (
            p.stock !== -1 &&
            p.stock < qty
          ) {
            return i.update({
              content:
                "❌ สินค้าไม่พอในสต๊อก",
              embeds: [],
              components: []
            });
          }

          u.coins -= total;

          if (
            p.stock !== -1
          ) {
            p.stock -= qty;
          }

          if (
            p.type ===
            "ROLE"
          ) {

            const role =
              i.guild.roles.cache.find(
                r =>
                  r.name ===
                  p.name
              ) ||
              i.guild.roles.cache.get(
                p.roleId
              );

            if (!role) {

              u.coins +=
                total;

              return i.update({
                content:
                  `❌ ไม่พบยศ **${p.name}** ในเซิร์ฟเวอร์`,
                embeds: [],
                components: []
              });
            }

            await i.member.roles
              .add(role)
              .catch(
                () => {}
              );
          }

          else {
            addItem(
              i.user.id,
              p.name,
              qty
            );
          }

          u.purchases += 1;

          save(
            "users",
            users
          );

          save(
            "store",
            store
          );

          return i.update({
            content:
              `✅ **สั่งซื้อสินค้าแล้ว**

ชื่อสินค้า : ${p.name}
จำนวน : ${qty}
ราคา : ${total} Coins
ประเภทสินค้า : ${p.type}`,

            embeds: [],
            components: []
          });
        }

        if (
          i.customId.startsWith(
            "topup_approve:"
          )
        ) {

          if (!isAdmin(i)) {
            return i.reply({
              content:
                "❌ เฉพาะแอดมิน",
              ephemeral: true
            });
          }

          const [
            ,
            uid,
            amountStr
          ] =
            i.customId.split(":");

          const amount =
            Number(amountStr);

          const u =
            userData(uid);

          /*
           1 Coins = 0.86 บาท
           Coins = บาท / 0.86
          */

          const coins =
            Math.floor(
              amount / 0.86
            );

          u.coins += coins;

          save(
            "users",
            users
          );

          const user =
            await client.users
              .fetch(uid)
              .catch(
                () => null
              );

          if (user) {

            await user.send(
              `💰 ท่านได้ชำระเงินแล้ว

จำนวน : ${money(amount)} บาท
Coins ที่ได้รับ : ${coins} Coins

เมื่อเวลา :
${new Date().toLocaleString("th-TH")}

ตรวจสอบโดย :
${i.user.tag}`
            ).catch(
              () => {}
            );
          }

          return i.update({
            content:
              `✅ อนุมัติการเติมเงินแล้ว

ผู้ใช้: <@${uid}>
จำนวน: ${money(amount)} บาท
ได้รับ: ${coins} Coins

ตรวจสอบโดย:
${i.user.tag}`,

            embeds: [],
            components: []
          });
        }

        if (
          i.customId.startsWith(
            "topup_cancel:"
          )
        ) {

          if (!isAdmin(i)) {
            return i.reply({
              content:
                "❌ เฉพาะแอดมิน",
              ephemeral: true
            });
          }

          const [
            ,
            uid,
            amountStr
          ] =
            i.customId.split(":");

          return i.update({
            content:
              `❌ ยกเลิกการเติมเงินของ <@${uid}>

จำนวน ${money(
                Number(amountStr)
              )} บาท

ตรวจสอบโดย:
${i.user.tag}`,

            embeds: [],
            components: []
          });
        }

        if (
          i.customId ===
          "gacha_add"
        ) {

          const modal =
            new ModalBuilder()
              .setCustomId(
                "gacha_reward_add"
              )
              .setTitle(
                "เพิ่มรางวัลกาชา"
              );

          const fields = [
            [
              "r_name",
              "ชื่อรางวัล",
              ""
            ],

            [
              "r_qty",
              "จำนวน (-1 = ไม่จำกัด)",
              "1"
            ],

            [
              "r_chance",
              "โอกาสออก (น้ำหนัก)",
              "1"
            ],

            [
              "r_type",
              "ประเภทรางวัล: ROLE หรือ ITEM",
              "ITEM"
            ]
          ];

          modal.addComponents(
            ...fields.map(
              ([id, label, val]) =>
                new ActionRowBuilder()
                  .addComponents(
                    new TextInputBuilder()
                      .setCustomId(id)
                      .setLabel(label)
                      .setRequired(true)
                      .setStyle(
                        TextInputStyle.Short
                      )
                      .setValue(val)
                  )
            )
          );

          return i.showModal(
            modal
          );
        }

        if (
          i.customId ===
          "gacha_remove"
        ) {

          if (
            !gacha.rewards.length
          ) {
            return i.reply({
              content:
                "❌ ยังไม่มีรางวัล",
              ephemeral: true
            });
          }

          const menu =
            new StringSelectMenuBuilder()
              .setCustomId(
                "gacha_remove_select"
              )
              .setPlaceholder(
                "เลือกรางวัลที่ต้องการลบ"
              )
              .addOptions(
                gacha.rewards
                  .slice(0, 25)
                  .map(r => ({
                    label:
                      r.name.slice(
                        0,
                        100
                      ),

                    value:
                      r.id,

                    description:
                      `${r.type} | น้ำหนัก ${r.chance}`
                  }))
              );

          return i.reply({
            ephemeral: true,

            components: [
              new ActionRowBuilder()
                .addComponents(
                  menu
                )
            ]
          });
        }
      }

      if (
        i.isStringSelectMenu()
      ) {

        if (
          i.customId ===
          "payment_method"
        ) {

          return i.reply({
            ephemeral: true,

            embeds: [
              paymentAccountEmbed(
                i.values[0]
              )
            ]
          });
        }

        if (
          i.customId ===
          "store_buy"
        ) {

          const pid =
            i.values[0];

          const p =
            store.products[
              pid
            ];

          if (!p) {
            return i.reply({
              content:
                "❌ ไม่พบสินค้า",
              ephemeral: true
            });
          }

          if (
            p.type ===
            "ROLE"
          ) {

            const e =
              new EmbedBuilder()
                .setTitle(
                  "🛒 ยืนยันคำสั่งซื้อ"
                )
                .setDescription(
                  `ชื่อสินค้า : ${p.name}

ราคา : ${p.price} Coins

จำนวน : 1

ประเภทสินค้า : ROLE`
                );

            return i.reply({
              ephemeral: true,

              embeds: [e],

              components: [
                new ActionRowBuilder()
                  .addComponents(

                    new ButtonBuilder()
                      .setCustomId(
                        `buy_confirm:${pid}:1`
                      )
                      .setLabel(
                        "ยืนยันคำสั่งซื้อ"
                      )
                      .setStyle(
                        ButtonStyle.Success
                      ),

                    new ButtonBuilder()
                      .setCustomId(
                        "buy_cancel"
                      )
                      .setLabel(
                        "ยกเลิกคำสั่งซื้อ"
                      )
                      .setStyle(
                        ButtonStyle.Danger
                      )
                  )
              ]
            });
          }

          const modal =
            new ModalBuilder()
              .setCustomId(
                `buy_qty:${pid}`
              )
              .setTitle(
                `ซื้อ ${p.name}`
              );

          modal.addComponents(
            new ActionRowBuilder()
              .addComponents(
                new TextInputBuilder()
                  .setCustomId(
                    "qty"
                  )
                  .setLabel(
                    "จำนวนสินค้า"
                  )
                  .setStyle(
                    TextInputStyle.Short
                  )
                  .setRequired(true)
              )
          );

          return i.showModal(
            modal
          );
        }

        if (
          i.customId ===
          "gift_select"
        ) {

          const g =
            gifts.items[
              i.values[0]
            ];

          if (!g) {
            return i.reply({
              content:
                "❌ ไม่พบรางวัล",
              ephemeral: true
            });
          }

          const u =
            userData(
              i.user.id
            );

          if (
            u.salt <
            g.cost
          ) {
            return i.reply({
              content:
                `❌ เกลือไม่พอ ต้องใช้ ${g.cost} เกลือ แต่คุณมี ${u.salt}`,
              ephemeral: true
            });
          }

          if (
            g.stock !== -1 &&
            g.stock < 1
          ) {
            return i.reply({
              content:
                "❌ รางวัลหมด",
              ephemeral: true
            });
          }

          u.salt -=
            g.cost;

          if (
            g.stock !== -1
          ) {
            g.stock -= 1;
          }

          if (
            g.type ===
            "ROLE"
          ) {

            const role =
              i.guild.roles.cache.find(
                r =>
                  r.name ===
                  g.name
              );

            if (!role) {

              u.salt +=
                g.cost;

              return i.reply({
                content:
                  `❌ ไม่พบยศ ${g.name}`,
                ephemeral: true
              });
            }

            await i.member.roles
              .add(role)
              .catch(
                () => {}
              );
          }

          else {
            addItem(
              i.user.id,
              g.name,
              1
            );
          }

          save(
            "users",
            users
          );

          save(
            "gifts",
            gifts
          );

          return i.reply({
            content:
              `✅ แลกรางวัลสำเร็จ

รางวัล : ${g.name}
ใช้เกลือ : ${g.cost}`,

            ephemeral: true
          });
        }

        if (
          i.customId ===
          "gacha_count"
        ) {

          const count =
            Number(
              i.values[0]
            );

          const u =
            userData(
              i.user.id
            );

          if (
            u.tickets <
            count
          ) {
            return i.update({
              content:
                `❌ ต้องใช้ ${count} ตั๋ว แต่คุณมี ${u.tickets}`,
              components: []
            });
          }

          u.tickets -=
            count;

          save(
            "users",
            users
          );

          const loading =
            new EmbedBuilder()
              .setTitle(
                "🎰 LOADING..."
              )
              .setDescription(
                `กำลังสุ่ม ${count} ครั้ง โปรดรอสักครู่...`
              );

          if (
            gacha.loadingBanner &&
            validUrl(
              gacha.loadingBanner
            )
          ) {
            loading.setImage(
              gacha.loadingBanner
            );
          }

          await i.update({
            embeds: [loading],
            components: []
          });

          await new Promise(
            resolve =>
              setTimeout(
                resolve,
                5000
              )
          );

          const results = [];

          for (
            let n = 0;
            n < count;
            n++
          ) {

            const r =
              pickReward();

            if (!r) continue;

            results.push(r);

            if (
              Number(
                r.unlimited
              ) !== 1
            ) {
              r.quantity =
                Math.max(
                  0,
                  Number(
                    r.quantity
                  ) - 1
                );
            }

            if (
              r.type ===
              "ROLE"
            ) {

              const role =
                i.guild.roles.cache.find(
                  x =>
                    x.name ===
                    r.name
                );

              if (role) {
                await i.member.roles
                  .add(role)
                  .catch(
                    () => {}
                  );
              }
            }

            else {

              const coins =
                r.name.match(
                  /^Coins\s*(\d+)$/i
                );

              if (coins) {

                u.coins +=
                  Number(
                    coins[1]
                  );
              }

              else if (
                r.name
                  .toLowerCase() ===
                "เกลือ"
              ) {

                u.salt += 1;
              }

              else {

                addItem(
                  i.user.id,
                  r.name,
                  1
                );
              }
            }
          }

          save(
            "users",
            users
          );

          save(
            "gacha",
            gacha
          );

          const e =
            new EmbedBuilder()
              .setTitle(
                "🎉 รางวัลที่ได้รับ"
              )
              .setDescription(
                results.length
                  ? results
                      .map(
                        (r, idx) =>
                          `${idx + 1}. **${r.name}** (${r.type})`
                      )
                      .join("\n")
                  : "ไม่มีรางวัลที่พร้อมออก"
              );

          return i.editReply({
            embeds: [e],
            components: []
          });
        }

        if (
          i.customId ===
          "gacha_remove_select"
        ) {

          const id =
            i.values[0];

          const old =
            gacha.rewards.length;

          gacha.rewards =
            gacha.rewards.filter(
              r =>
                r.id !== id
            );

          save(
            "gacha",
            gacha
          );

          return i.reply({
            content:
              old ===
              gacha.rewards.length
                ? "❌ ไม่พบรางวัล"
                : "✅ ลบรางวัลแล้ว และระบบคำนวณโอกาสแสดงผลใหม่อัตโนมัติ",

            ephemeral: true
          });
        }
      }

      if (
        i.isModalSubmit()
      ) {

        if (
          i.customId ===
          "payment_settings"
        ) {

          config.payment.title =
            i.fields.getTextInputValue(
              "payment_title"
            ) ||
            "💳 เติมเงิน";

          config.payment.description =
            i.fields.getTextInputValue(
              "payment_desc"
            );

          config.payment.paymentChannelId =
            cleanId(
              i.fields.getTextInputValue(
                "payment_channel"
              )
            );

          config.payment.slipChannelId =
            cleanId(
              i.fields.getTextInputValue(
                "slip_channel"
              )
            );

          config.payment.banner =
            i.fields.getTextInputValue(
              "payment_banner"
            );

          save(
            "config",
            config
          );

          return i.reply({
            ephemeral: true,

            content:
              "✅ บันทึกการตั้งค่าระบบเติมเงินแล้ว",

            components: [
              new ActionRowBuilder()
                .addComponents(

                  new ButtonBuilder()
                    .setCustomId(
                      "pay_truemoney"
                    )
                    .setLabel(
                      "ตั้งค่า TrueMoney"
                    )
                    .setStyle(
                      ButtonStyle.Success
                    ),

                  new ButtonBuilder()
                    .setCustomId(
                      "pay_bank"
                    )
                    .setLabel(
                      "ตั้งค่าธนาคาร"
                    )
                    .setStyle(
                      ButtonStyle.Primary
                    ),

                  new ButtonBuilder()
                    .setCustomId(
                      "pay_qr"
                    )
                    .setLabel(
                      "ตั้งค่า QR Code"
                    )
                    .setStyle(
                      ButtonStyle.Secondary
                    ),

                  new ButtonBuilder()
                    .setCustomId(
                      "pay_publish"
                    )
                    .setLabel(
                      "สร้างหน้าต่างเติมเงิน"
                    )
                    .setStyle(
                      ButtonStyle.Success
                    )
                )
            ]
          });
        }

        if (
          i.customId ===
          "custom_topup"
        ) {

          const amount =
            Number(
              i.fields.getTextInputValue(
                "amount"
              )
            );

          if (
            !Number.isFinite(
              amount
            ) ||
            amount < 1
          ) {
            return i.reply({
              content:
                "❌ จำนวนเงินต้องไม่น้อยกว่า 1 บาท",
              ephemeral: true
            });
          }

          const e =
            new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle(
                "💳 แจ้งการชำระเงิน"
              )
              .setDescription(
                `จำนวนที่ต้องชำระ : **${money(amount)} บาท**

เมื่อท่านชำระเงินแล้ว
ให้แนบสลิปที่ <#${config.payment.slipChannelId}>`
              );

          return i.reply({
            ephemeral: true,
            embeds: [e]
          });
        }

        if (
          i.customId.startsWith(
            "buy_qty:"
          )
        ) {

          const pid =
            i.customId.split(
              ":"
            )[1];

          const p =
            store.products[
              pid
            ];

          const qty =
            Number(
              i.fields.getTextInputValue(
                "qty"
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
                "❌ จำนวนไม่ถูกต้อง",
              ephemeral: true
            });
          }

          if (
            p.stock !== -1 &&
            p.stock < qty
          ) {
            return i.reply({
              content:
                `❌ สินค้าเหลือเพียง ${p.stock}`,
              ephemeral: true
            });
          }

          const e =
            new EmbedBuilder()
              .setTitle(
                "🛒 ยืนยันคำสั่งซื้อ"
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
                      `buy_confirm:${pid}:${qty}`
                    )
                    .setLabel(
                      "ยืนยันคำสั่งซื้อ"
                    )
                    .setStyle(
                      ButtonStyle.Success
                    ),

                  new ButtonBuilder()
                    .setCustomId(
                      "buy_cancel"
                    )
                    .setLabel(
                      "ยกเลิกคำสั่งซื้อ"
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
          "store_add"
        ) {

          const name =
            i.fields.getTextInputValue(
              "item_name"
            );

          const desc =
            i.fields.getTextInputValue(
              "item_desc"
            );

          const type =
            i.fields.getTextInputValue(
              "item_type"
            ).toUpperCase();

          const price =
            Number(
              i.fields.getTextInputValue(
                "item_price"
              )
            );

          const stock =
            Number(
              i.fields.getTextInputValue(
                "item_stock"
              )
            );

          if (
            !["ROLE", "ITEM"]
              .includes(type) ||
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
                "❌ ข้อมูลสินค้าไม่ถูกต้อง",
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
              type === "ROLE"
                ? (
                    i.guild.roles.cache.find(
                      r =>
                        r.name ===
                        name
                    )?.id ||
                    ""
                  )
                : ""
          };

          save(
            "store",
            store
          );

          return i.reply({
            content:
              `✅ เพิ่มสินค้า **${name}** แล้ว`,
            ephemeral: true
          });
        }

        if (
          i.customId ===
          "gift_button"
        ) {

          config.store.giftButton =
            i.fields.getTextInputValue(
              "gift_button_name"
            );

          save(
            "config",
            config
          );

          return i.reply({
            content:
              "✅ ตั้งชื่อปุ่มแลกรางวัลแล้ว",
            ephemeral: true
          });
        }

        if (
          i.customId ===
          "gacha_setup"
        ) {

          gacha.name =
            i.fields.getTextInputValue(
              "g_name"
            ) ||
            gacha.name;

          gacha.description =
            i.fields.getTextInputValue(
              "g_desc"
            );

          gacha.channelId =
            cleanId(
              i.fields.getTextInputValue(
                "g_channel"
              )
            );

          gacha.banner =
            i.fields.getTextInputValue(
              "g_banner"
            );

          gacha.ticketEmoji =
            i.fields.getTextInputValue(
              "g_ticket_emoji"
            ) ||
            "🎟️";

          save(
            "gacha",
            gacha
          );

          return i.reply({
            ephemeral: true,

            content:
              "✅ บันทึกค่าหลักตู้กาชาแล้ว"
          });
        }

        if (
          i.customId ===
          "gacha_reward_add"
        ) {

          const name =
            i.fields.getTextInputValue(
              "r_name"
            );

          const qty =
            Number(
              i.fields.getTextInputValue(
                "r_qty"
              )
            );

          const chance =
            Number(
              i.fields.getTextInputValue(
                "r_chance"
              )
            );

          const type =
            i.fields.getTextInputValue(
              "r_type"
            ).toUpperCase();

          if (
            !["ROLE", "ITEM"]
              .includes(type) ||
            !Number.isFinite(
              qty
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
                "❌ ข้อมูลรางวัลไม่ถูกต้อง",
              ephemeral: true
            });
          }

          const id =
            Date.now().toString();

          gacha.rewards.push({
            id,
            name,
            quantity: qty,
            unlimited:
              qty === -1
                ? 1
                : 0,
            chance,
            type
          });

          save(
            "gacha",
            gacha
          );

          return i.reply({
            ephemeral: true,

            content:
              `✅ เพิ่ม **${name}** แล้ว

ระบบจะแสดงโอกาสแบบ normalized อัตโนมัติ`
          });
        }
      }

    }

    catch (err) {

      console.error(err);

      if (
        !i.replied &&
        !i.deferred
      ) {
        await i.reply({
          content:
            "❌ เกิดข้อผิดพลาด กรุณาตรวจสอบ Console",
          ephemeral: true
        }).catch(
          () => {}
        );
      }
    }
  }
);

client.on(
  "interactionCreate",
  async i => {

    if (
      !i.isButton() ||
      !isAdmin(i)
    ) return;

    try {

      if (
        i.customId ===
        "pay_truemoney"
      ) {

        const modal =
          new ModalBuilder()
            .setCustomId(
              "pay_tm_modal"
            )
            .setTitle(
              "ตั้งค่า TrueMoney Wallet"
            );

        modal.addComponents(

          new ActionRowBuilder()
            .addComponents(
              new TextInputBuilder()
                .setCustomId(
                  "name"
                )
                .setLabel(
                  "ชื่อบัญชี"
                )
                .setRequired(true)
                .setStyle(
                  TextInputStyle.Short
                )
            ),

          new ActionRowBuilder()
            .addComponents(
              new TextInputBuilder()
                .setCustomId(
                  "number"
                )
                .setLabel(
                  "เลขบัญชี"
                )
                .setRequired(true)
                .setStyle(
                  TextInputStyle.Short
                )
            )
        );

        return i.showModal(
          modal
        );
      }

      if (
        i.customId ===
        "pay_bank"
      ) {

        const modal =
          new ModalBuilder()
            .setCustomId(
              "pay_bank_modal"
            )
            .setTitle(
              "ตั้งค่าบัญชีธนาคาร"
            );

        modal.addComponents(

          new ActionRowBuilder()
            .addComponents(
              new TextInputBuilder()
                .setCustomId(
                  "bank"
                )
                .setLabel(
                  "ชื่อธนาคาร"
                )
                .setRequired(true)
                .setStyle(
                  TextInputStyle.Short
                )
            ),

          new ActionRowBuilder()
            .addComponents(
              new TextInputBuilder()
                .setCustomId(
                  "name"
                )
                .setLabel(
                  "ชื่อบัญชีธนาคาร"
                )
                .setRequired(true)
                .setStyle(
                  TextInputStyle.Short
                )
            ),

          new ActionRowBuilder()
            .addComponents(
              new TextInputBuilder()
                .setCustomId(
                  "number"
                )
                .setLabel(
                  "เลขบัญชีธนาคาร"
                )
                .setRequired(true)
                .setStyle(
                  TextInputStyle.Short
                )
            )
        );

        return i.showModal(
          modal
        );
      }

      if (
        i.customId ===
        "pay_qr"
      ) {

        const modal =
          new ModalBuilder()
            .setCustomId(
              "pay_qr_modal"
            )
            .setTitle(
              "ตั้งค่า QR Code"
            );

        modal.addComponents(
          new ActionRowBuilder()
            .addComponents(
              new TextInputBuilder()
                .setCustomId(
                  "url"
                )
                .setLabel(
                  "ลิงค์รูป QR Code"
                )
                .setRequired(true)
                .setStyle(
                  TextInputStyle.Short
                )
            )
        );

        return i.showModal(
          modal
        );
      }

      if (
        i.customId ===
        "pay_publish"
      ) {

        if (
          !config.payment
            .paymentChannelId
        ) {
          return i.reply({
            content:
              "❌ ยังไม่ได้ตั้ง ID ห้องเติมเงิน",
            ephemeral: true
          });
        }

        const ch =
          await client.channels
            .fetch(
              config.payment
                .paymentChannelId
            )
            .catch(
              () => null
            );

        if (
          !ch ||
          !ch.isTextBased()
        ) {
          return i.reply({
            content:
              "❌ ไม่พบห้องเติมเงิน",
            ephemeral: true
          });
        }

        await ch.send(
          paymentPanel()
        );

        return i.reply({
          content:
            "✅ สร้างหน้าต่างเติมเงินแล้ว",
          ephemeral: true
        });
      }

    }

    catch (e) {
      console.error(e);
    }
  }
);

client.on(
  "interactionCreate",
  async i => {

    if (
      !i.isModalSubmit()
    ) return;

    try {

      if (
        i.customId ===
        "pay_tm_modal"
      ) {

        config.payment.methods
          .truemoney = {
            enabled: true,

            accountName:
              i.fields.getTextInputValue(
                "name"
              ),

            accountNumber:
              i.fields.getTextInputValue(
                "number"
              )
          };

        save(
          "config",
          config
        );

        return i.reply({
          content:
            "✅ ตั้งค่า TrueMoney แล้ว",
          ephemeral: true
        });
      }

      if (
        i.customId ===
        "pay_bank_modal"
      ) {

        config.payment.methods
          .bank = {

            enabled: true,

            bankName:
              i.fields.getTextInputValue(
                "bank"
              ),

            accountName:
              i.fields.getTextInputValue(
                "name"
              ),

            accountNumber:
              i.fields.getTextInputValue(
                "number"
              )
          };

        save(
          "config",
          config
        );

        return i.reply({
          content:
            "✅ ตั้งค่าธนาคารแล้ว",
          ephemeral: true
        });
      }

      if (
        i.customId ===
        "pay_qr_modal"
      ) {

        const url =
          i.fields.getTextInputValue(
            "url"
          );

        if (
          !validUrl(url)
        ) {
          return i.reply({
            content:
              "❌ ลิงค์ไม่ถูกต้อง",
            ephemeral: true
          });
        }

        config.payment.methods
          .qr = {
            enabled: true,
            imageUrl: url
          };

        save(
          "config",
          config
        );

        return i.reply({
          content:
            "✅ ตั้งค่า QR Code แล้ว",
          ephemeral: true
        });
      }

    }

    catch (e) {
      console.error(e);
    }
  }
);

client.on(
  "messageCreate",
  async m => {

    if (
      m.author.bot
    ) return;

    if (
      m.content.startsWith(
        PREFIX
      )
    ) {

      const [
        cmd,
        ...args
      ] =
        m.content
          .slice(
            PREFIX.length
          )
          .trim()
          .split(
            /\s+/
          );

      if (
        cmd.toLowerCase() ===
        "setup"
      ) {

        if (
          !m.member.permissions
            .has(
              PermissionFlagsBits
                .Administrator
            )
        ) {
          return m.reply(
            "❌ เฉพาะแอดมิน"
          );
        }

        const e =
          new EmbedBuilder()
            .setTitle(
              "🛠️ LUCENT BOT — คำสั่งทั้งหมด"
            )
            .setDescription(
              `**Slash Commands**

\`/pymentsetting\`
ตั้งค่าระบบเติมเงิน

\`/storeadd\`
เพิ่มสินค้า ROLE / ITEM

\`/gift\`
ตั้งค่าปุ่มแลกรางวัล

\`/gachasetup\`
ตั้งค่าตู้กาชา

\`/gachastart\`
สร้างตู้กาชา

\`/gachareward\`
เพิ่ม / ลบรางวัลกาชา


**Prefix Commands**

\`!setup\`
ดูคำสั่งทั้งหมด

\`!bagpack\`
ดูกระเป๋า

\`!addgift\`
เพิ่มรางวัลแลก


**ระบบ**

💳 เติมเงิน
→ แนบสลิป
→ แอดมินอนุมัติ
→ Coins เข้าอัตโนมัติ

🛍️ ร้านค้า
→ ซื้อด้วย Coins

🎁 แลกรางวัล
→ ใช้เกลือ

🎰 Gacha
→ 1 ตั๋ว = 5 Coins

🎒 Backpack
→ Coins / เกลือ / ITEM / ตั๋ว`
            )
            .setColor(
              0x5865F2
            );

        return m.reply({
          embeds: [e]
        });
      }

      if (
        cmd.toLowerCase() ===
        "bagpack"
      ) {

        const u =
          userData(
            m.author.id
          );

        const inv =
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
            .join("\n") ||
          "ไม่มี ITEM";

        const e =
          new EmbedBuilder()
            .setTitle(
              `🎒 กระเป๋าของ ${m.author.username}`
            )
            .setDescription(
              `🪙 Coins:
**${u.coins}**

🧂 เกลือ:
**${u.salt}**

🎟️ ตั๋วกาชา:
**${u.tickets}**

**ITEM**

${inv}`
            )
            .setColor(
              0x57F287
            );

        return m.reply({
          embeds: [e]
        });
      }

      if (
        cmd.toLowerCase() ===
        "addgift"
      ) {

        if (
          !m.member.permissions
            .has(
              PermissionFlagsBits
                .Administrator
            )
        ) {
          return m.reply(
            "❌ เฉพาะแอดมิน"
          );
        }

        return m.reply(
          "รูปแบบคำสั่ง:\n`!addgift ชื่อรางวัล ราคาเกลือ จำนวน ROLE|ITEM`\n\nตัวอย่าง:\n`!addgift VIP 100 3 ROLE`"
        );
      }
    }
  }
);

client.on(
  "messageCreate",
  async m => {

    if (
      m.author.bot ||
      !m.content.startsWith(
        "!addgift"
      )
    ) return;

    if (
      !m.member?.permissions.has(
        PermissionFlagsBits
          .Administrator
      )
    ) return;

    const parts =
      m.content
        .trim()
        .split(
          /\s+/
        );

    if (
      parts.length < 5
    ) {
      return m.reply(
        "รูปแบบ:\n`!addgift ชื่อรางวัล ราคาเกลือ จำนวน ROLE|ITEM`"
      );
    }

    const type =
      parts.pop()
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
        .join(" ");

    if (
      !["ROLE", "ITEM"]
        .includes(type) ||
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
        "❌ ข้อมูลไม่ถูกต้อง"
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
      "gifts",
      gifts
    );

    await m.reply(
      `✅ เพิ่มรางวัลแลก **${name}**

🧂 ราคา: ${cost} เกลือ
📦 จำนวน: ${
        stock === -1
          ? "ไม่จำกัด"
          : stock
      }
🎁 ประเภท: ${type}`
    );
  }
);

client.login(
  TOKEN
).catch(
  e =>
    console.error(
      "Login failed:",
      e
    )
);
