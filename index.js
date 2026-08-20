// ============================================================
// LUCENT DISCORD BOT - ALL IN ONE
// Node.js + discord.js v14
// Railway: node index.js
// ============================================================

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ============================================================
// CONFIG
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN) {
  console.error("❌ ไม่พบ DISCORD_TOKEN ใน Railway Variables");
  process.exit(1);
}

// ============================================================
// DATABASE
// ============================================================

const DB_FILE = path.join(__dirname, "lucent-data.json");

const defaultDB = {
  payment: {
    title: "💳 LUCENT TOPUP",
    description: "ระบบเติมเงิน",
    topupChannelId: "",
    slipChannelId: "",
    reviewChannelId: "",
    banner: "",
    methods: []
  },

  store: {
    name: "🛒 LUCENT STORE",
    description: "ร้านค้า LUCENT",
    channelId: "",
    buyLabel: "🛒 ซื้อสินค้า",
    giftLabel: "🎁 แลกรางวัล",
    banner: ""
  },

  items: [],
  gifts: [],

  gacha: {
    name: "🎰 LUCENT GACHA",
    description: "ตู้สุ่มกาชา",
    channelId: "",
    banner: "",
    ticketEmoji: "🎟️",
    ticketName: "Gacha Ticket",
    buttonLabel: "🎰 สุ่มกาชา",
    loadingBanner: "",
    ticketPrice: 5
  },

  gachaRewards: [],

  users: {}
};

function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return JSON.parse(JSON.stringify(defaultDB));
    }

    const data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));

    return {
      ...JSON.parse(JSON.stringify(defaultDB)),
      ...data,
      payment: {
        ...defaultDB.payment,
        ...(data.payment || {})
      },
      store: {
        ...defaultDB.store,
        ...(data.store || {})
      },
      gacha: {
        ...defaultDB.gacha,
        ...(data.gacha || {})
      }
    };
  } catch (error) {
    console.error("❌ DB Error:", error);
    return JSON.parse(JSON.stringify(defaultDB));
  }
}

let db = loadDB();

function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (error) {
    console.error("❌ Save DB Error:", error);
  }
}

// ============================================================
// CLIENT
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

// ============================================================
// HELPERS
// ============================================================

function isAdmin(interaction) {
  return interaction.memberPermissions?.has(
    PermissionFlagsBits.Administrator
  );
}

function getUser(userId) {
  if (!db.users[userId]) {
    db.users[userId] = {
      coins: 0,
      salt: 0,
      inventory: {},
      pendingTopup: null
    };
  }

  return db.users[userId];
}

function addItem(userId, name, amount = 1) {
  const user = getUser(userId);

  if (!user.inventory[name]) {
    user.inventory[name] = 0;
  }

  user.inventory[name] += amount;
}

function money(amount) {
  return Number(amount).toFixed(2);
}

function getTopupPrice(coins) {
  const rates = {
    10: 8.6,
    50: 43,
    115: 98.9,
    510: 438.6,
    1150: 989
  };

  if (rates[coins] !== undefined) {
    return rates[coins];
  }

  return Number((coins * 0.86).toFixed(2));
}

function getChannel(guild, id) {
  if (!id) return null;
  return guild.channels.cache.get(id);
}

function validImage(url) {
  return typeof url === "string" &&
    /^https?:\/\//i.test(url);
}

function truncate(text, max = 100) {
  text = String(text || "");

  if (text.length <= max) {
    return text;
  }

  return text.substring(0, max - 1) + "…";
}

async function sendDM(user, content) {
  try {
    await user.send(content);
  } catch {
    // ปิด DM ก็ไม่ทำให้บอทพัง
  }
}

// ============================================================
// MODAL
// ============================================================

function makeField(
  id,
  label,
  style = TextInputStyle.Short,
  required = true,
  placeholder = ""
) {
  return {
    id,
    label,
    style,
    required,
    placeholder
  };
}

function makeModal(id, title, fields) {
  const modal = new ModalBuilder()
    .setCustomId(id)
    .setTitle(title);

  for (const f of fields) {
    const input = new TextInputBuilder()
      .setCustomId(f.id)
      .setLabel(f.label)
      .setStyle(f.style || TextInputStyle.Short)
      .setRequired(f.required !== false);

    if (f.placeholder) {
      input.setPlaceholder(f.placeholder);
    }

    modal.addComponents(
      new ActionRowBuilder().addComponents(input)
    );
  }

  return modal;
}

// ============================================================
// PAYMENT UI
// ============================================================

function paymentEmbed() {
  const embed = new EmbedBuilder()
    .setTitle(db.payment.title)
    .setDescription(db.payment.description || "")
    .setColor(0x8e44ad);

  if (validImage(db.payment.banner)) {
    embed.setImage(db.payment.banner);
  }

  if (!db.payment.methods.length) {
    embed.addFields({
      name: "💳 ช่องทางชำระเงิน",
      value: "ยังไม่ได้ตั้งค่าช่องทางชำระเงิน"
    });
  } else {
    embed.addFields({
      name: "💳 ช่องทางชำระเงิน",
      value: db.payment.methods
        .map((m, i) => `${i + 1}. ${m.type}`)
        .join("\n")
    });
  }

  return embed;
}

function paymentButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("topup_open")
      .setLabel("💰 เติมเงิน")
      .setStyle(ButtonStyle.Success)
  );
}

function paymentMethodMenu() {
  const methods = db.payment.methods || [];

  const options = methods
    .slice(0, 25)
    .map((method, index) => {
      return new StringSelectMenuOptionBuilder()
        .setLabel(truncate(method.type))
        .setValue(String(index))
        .setDescription(
          truncate(method.details || method.type)
        );
    });

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("topup_method")
      .setPlaceholder("เลือกช่องทางชำระเงิน")
      .addOptions(options)
  );
}

function amountMenu() {
  const rates = [
    [10, 8.6],
    [50, 43],
    [115, 98.9],
    [510, 438.6],
    [1150, 989]
  ];

  const options = rates.map(([coins, baht]) => {
    return new StringSelectMenuOptionBuilder()
      .setLabel(
        `${coins.toLocaleString()} Coins = ${baht.toFixed(2)} บาท`
      )
      .setValue(String(coins));
  });

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("topup_amount")
      .setPlaceholder("เลือกจำนวน Coins")
      .addOptions(options)
  );
}

// ============================================================
// STORE UI
// ============================================================

function storeEmbed() {
  const embed = new EmbedBuilder()
    .setTitle(db.store.name)
    .setDescription(db.store.description || "")
    .setColor(0x3498db);

  if (validImage(db.store.banner)) {
    embed.setImage(db.store.banner);
  }

  const products =
    db.items
      .map(item => {
        return (
          `**${item.name}**\n` +
          `💰 ราคา: ${item.price.toLocaleString()} Coins\n` +
          `📦 เหลือ: ${
            item.stock < 0 ? "ไม่จำกัด" : item.stock
          }`
        );
      })
      .join("\n\n") || "ยังไม่มีสินค้า";

  const gifts =
    db.gifts
      .map(gift => {
        return (
          `🎁 **${gift.name}**\n` +
          `🧂 ใช้ ${gift.costSalt.toLocaleString()} เกลือ\n` +
          `📦 เหลือ: ${
            gift.stock < 0 ? "ไม่จำกัด" : gift.stock
          }`
        );
      })
      .join("\n\n") || "ยังไม่มีรางวัล";

  embed.addFields(
    {
      name: "🛒 สินค้าที่สามารถซื้อได้",
      value: products.substring(0, 1024)
    },
    {
      name: "🎁 สินค้าที่สามารถแลกได้",
      value: gifts.substring(0, 1024)
    }
  );

  return embed;
}

function storeComponents() {
  const rows = [];

  const available = db.items
    .filter(item => item.stock !== 0)
    .slice(0, 25);

  if (available.length) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("store_buy")
          .setPlaceholder(
            db.store.buyLabel || "🛒 ซื้อสินค้า"
          )
          .addOptions(
            available.map(item =>
              new StringSelectMenuOptionBuilder()
                .setLabel(truncate(item.name))
                .setValue(item.id)
                .setDescription(
                  `${item.price} Coins | เหลือ ${
                    item.stock < 0
                      ? "ไม่จำกัด"
                      : item.stock
                  }`
                )
            )
          )
      )
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("store_gift")
        .setLabel(
          db.store.giftLabel || "🎁 แลกรางวัล"
        )
        .setStyle(ButtonStyle.Success)
    )
  );

  return rows;
}

// ============================================================
// GACHA UI
// ============================================================

function gachaEmbed() {
  const embed = new EmbedBuilder()
    .setTitle(db.gacha.name)
    .setDescription(db.gacha.description || "")
    .setColor(0x9b59b6);

  if (validImage(db.gacha.banner)) {
    embed.setImage(db.gacha.banner);
  }

  if (!db.gachaRewards.length) {
    embed.addFields({
      name: "🎁 รางวัลในตู้",
      value: "ยังไม่มีรางวัล"
    });
  } else {
    const totalWeight =
      db.gachaRewards.reduce(
        (sum, reward) =>
          sum + Number(reward.weight || 0),
        0
      ) || 1;

    const roles =
      db.gachaRewards
        .filter(r => r.type === "ROLE")
        .map(r => {
          const chance =
            (Number(r.weight) / totalWeight) * 100;

          return (
            `👑 ${r.name} — ` +
            `เหลือ ${
              r.stock < 0
                ? "ไม่จำกัด"
                : r.stock
            } — ` +
            `โอกาส ${chance.toFixed(2)}%`
          );
        })
        .join("\n") || "ไม่มี";

    const items =
      db.gachaRewards
        .filter(r => r.type === "ITEM")
        .map(r => {
          const chance =
            (Number(r.weight) / totalWeight) * 100;

          return (
            `📦 ${r.name} — ` +
            `เหลือ ${
              r.stock < 0
                ? "ไม่จำกัด"
                : r.stock
            } — ` +
            `โอกาส ${chance.toFixed(2)}%`
          );
        })
        .join("\n") || "ไม่มี";

    embed.addFields(
      {
        name: "👑 ประเภทยศ",
        value: roles.substring(0, 1024)
      },
      {
        name: "📦 ประเภทไอเท็ม",
        value: items.substring(0, 1024)
      }
    );
  }

  embed.setFooter({
    text:
      `${db.gacha.ticketEmoji} ${db.gacha.ticketName} ` +
      `| 1 ตั๋ว = ${db.gacha.ticketPrice} Coins`
  });

  return embed;
}

function gachaButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("gacha_roll")
      .setLabel(
        db.gacha.buttonLabel || "🎰 สุ่มกาชา"
      )
      .setStyle(ButtonStyle.Primary)
  );
}

// ============================================================
// REFRESH STORE
// ============================================================

async function refreshStore(guild) {
  if (!db.store.channelId) return;

  const channel = getChannel(
    guild,
    db.store.channelId
  );

  if (!channel || !channel.isTextBased()) {
    return;
  }

  try {
    const messages =
      await channel.messages.fetch({
        limit: 50
      });

    const oldMessage = messages.find(
      message =>
        message.author.id === client.user.id &&
        message.components.some(row =>
          row.components.some(
            component =>
              component.customId === "store_buy" ||
              component.customId === "store_gift"
          )
        )
    );

    if (oldMessage) {
      await oldMessage.edit({
        embeds: [storeEmbed()],
        components: storeComponents()
      });
    } else {
      await channel.send({
        embeds: [storeEmbed()],
        components: storeComponents()
      });
    }
  } catch (error) {
    console.error(
      "❌ refreshStore:",
      error.message
    );
  }
}

// ============================================================
// GACHA TICKET
// ============================================================

function ensureGachaTicket() {
  const ticketName =
    db.gacha.ticketName || "Gacha Ticket";

  let item =
    db.items.find(
      x => x.gachaTicket === true
    );

  if (!item) {
    item = {
      id: "gacha-ticket",
      name: ticketName,
      description:
        "ตั๋วสำหรับสุ่มกาชา",
      type: "ITEM",
      price: db.gacha.ticketPrice || 5,
      stock: -1,
      gachaTicket: true
    };

    db.items.push(item);
  } else {
    item.name = ticketName;
    item.price =
      db.gacha.ticketPrice || 5;
    item.stock = -1;
    item.type = "ITEM";
    item.gachaTicket = true;
  }

  return item;
}

// ============================================================
// REFRESH GACHA
// ============================================================

async function refreshGacha(guild) {
  if (!db.gacha.channelId) return;

  const channel = getChannel(
    guild,
    db.gacha.channelId
  );

  if (!channel || !channel.isTextBased()) {
    return;
  }

  try {
    const messages =
      await channel.messages.fetch({
        limit: 50
      });

    const oldMessage = messages.find(
      message =>
        message.author.id === client.user.id &&
        message.components.some(row =>
          row.components.some(
            component =>
              component.customId === "gacha_roll"
          )
        )
    );

    if (oldMessage) {
      await oldMessage.edit({
        embeds: [gachaEmbed()],
        components: [gachaButton()]
      });
    } else {
      await channel.send({
        embeds: [gachaEmbed()],
        components: [gachaButton()]
      });
    }
  } catch (error) {
    console.error(
      "❌ refreshGacha:",
      error.message
    );
  }
}

// ============================================================
// SLASH COMMANDS
// ============================================================

const commands = [

  new SlashCommandBuilder()
    .setName("pymentsetting")
    .setDescription("ตั้งค่าระบบเติมเงิน")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  new SlashCommandBuilder()
    .setName("startstore")
    .setDescription("ส่งหน้าระบบเติมเงิน")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  new SlashCommandBuilder()
    .setName("store_setup")
    .setDescription("ตั้งค่าร้านค้า")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  new SlashCommandBuilder()
    .setName("storeadd")
    .setDescription("เพิ่มสินค้าเข้าร้าน")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  new SlashCommandBuilder()
    .setName("gift")
    .setDescription("ตั้งค่าปุ่มแลกรางวัล")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  new SlashCommandBuilder()
    .setName("gachasetup")
    .setDescription("ตั้งค่าตู้กาชา")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  new SlashCommandBuilder()
    .setName("gachastart")
    .setDescription("สร้างหน้าตู้กาชา")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    ),

  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("ดู Coins ของตัวเอง")

].map(command => command.toJSON());

// ============================================================
// READY
// ============================================================

client.once("ready", async () => {

  console.log(
    `✅ ONLINE: ${client.user.tag}`
  );

  try {

    if (GUILD_ID) {

      const guild =
        await client.guilds.fetch(GUILD_ID);

      await guild.commands.set(commands);

      console.log(
        "✅ Slash Commands Registered"
      );

    } else {

      await client.application.commands.set(
        commands
      );

      console.log(
        "✅ Global Slash Commands Registered"
      );
    }

  } catch (error) {

    console.error(
      "❌ Command Register Error:",
      error
    );
  }
});

// ============================================================
// INTERACTION
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {

    try {

      // ======================================================
      // SLASH COMMAND
      // ======================================================

      if (interaction.isChatInputCommand()) {

        const adminCommands = [
          "pymentsetting",
          "startstore",
          "store_setup",
          "storeadd",
          "gift",
          "gachasetup",
          "gachastart"
        ];

        if (
          adminCommands.includes(
            interaction.commandName
          ) &&
          !isAdmin(interaction)
        ) {

          return interaction.reply({
            content:
              "❌ คำสั่งนี้ใช้ได้เฉพาะแอดมิน",
            ephemeral: true
          });
        }

        // BALANCE

        if (
          interaction.commandName ===
          "balance"
        ) {

          const user =
            getUser(interaction.user.id);

          return interaction.reply(
            `🪙 คุณมี **${user.coins.toLocaleString()} Coins**`
          );
        }

        // PAYMENT SETUP

        if (
          interaction.commandName ===
          "pymentsetting"
        ) {

          return interaction.showModal(
            makeModal(
              "payment_settings",
              "ตั้งค่าระบบเติมเงิน",
              [
                makeField(
                  "title",
                  "หัวข้อการชำระเงิน"
                ),
                makeField(
                  "description",
                  "รายละเอียด",
                  TextInputStyle.Paragraph
                ),
                makeField(
                  "topupChannelId",
                  "ID ห้องเติมเงิน"
                ),
                makeField(
                  "slipChannelId",
                  "ID ห้องแนบสลิป"
                ),
                makeField(
                  "banner",
                  "ลิงค์ Banner",
                  TextInputStyle.Short,
                  false
                )
              ]
            )
          );
        }

        // START STORE

        if (
          interaction.commandName ===
          "startstore"
        ) {

          if (
            !db.payment.topupChannelId
          ) {

            return interaction.reply({
              content:
                "❌ ยังไม่ได้ตั้งค่าห้องเติมเงิน",
              ephemeral: true
            });
          }

          const channel =
            getChannel(
              interaction.guild,
              db.payment.topupChannelId
            );

          if (!channel) {

            return interaction.reply({
              content:
                "❌ ไม่พบห้องเติมเงิน",
              ephemeral: true
            });
          }

          await channel.send({
            embeds: [
              paymentEmbed()
            ],
            components: [
              paymentButton()
            ]
          });

          return interaction.reply({
            content:
              `✅ สร้างหน้าระบบเติมเงินที่ ${channel} แล้ว`,
            ephemeral: true
          });
        }

        // STORE SETUP

        if (
          interaction.commandName ===
          "store_setup"
        ) {

          return interaction.showModal(
            makeModal(
              "store_settings",
              "ตั้งค่าระบบร้านค้า",
              [
                makeField(
                  "name",
                  "ชื่อร้านค้า"
                ),
                makeField(
                  "description",
                  "รายละเอียด",
                  TextInputStyle.Paragraph
                ),
                makeField(
                  "channelId",
                  "ID ห้องร้านค้า"
                ),
                makeField(
                  "buyLabel",
                  "ชื่อปุ่มซื้อสินค้า"
                ),
                makeField(
                  "banner",
                  "ลิงค์ Banner",
                  TextInputStyle.Short,
                  false
                )
              ]
            )
          );
        }

        // STORE ADD

        if (
          interaction.commandName ===
          "storeadd"
        ) {

          return interaction.showModal(
            makeModal(
              "store_add",
              "เพิ่มสินค้า",
              [
                makeField(
                  "name",
                  "ชื่อ ITEM หรือ ยศ"
                ),
                makeField(
                  "description",
                  "รายละเอียดสินค้า",
                  TextInputStyle.Paragraph
                ),
                makeField(
                  "type",
                  "ประเภท: ROLE หรือ ITEM"
                ),
                makeField(
                  "price",
                  "ราคาสินค้า Coins"
                ),
                makeField(
                  "stock",
                  "จำนวนสินค้า (-1 = ไม่จำกัด)"
                )
              ]
            )
          );
        }

        // GIFT SETUP

        if (
          interaction.commandName ===
          "gift"
        ) {

          return interaction.showModal(
            makeModal(
              "gift_setup",
              "ตั้งค่าปุ่มแลกรางวัล",
              [
                makeField(
                  "label",
                  "ชื่อปุ่มแลกรางวัล"
                )
              ]
            )
          );
        }

        // GACHA SETUP

        if (
          interaction.commandName ===
          "gachasetup"
        ) {

          return interaction.showModal(
            makeModal(
              "gacha_setup",
              "ตั้งค่าตู้กาชา",
              [
                makeField(
                  "name",
                  "ชื่อตู้กาชา"
                ),
                makeField(
                  "description",
                  "รายละเอียด",
                  TextInputStyle.Paragraph
                ),
                makeField(
                  "channelId",
                  "ID ช่องกาชา"
                ),
                makeField(
                  "banner",
                  "ลิงค์ Banner",
                  TextInputStyle.Short,
                  false
                ),
                makeField(
                  "ticketEmoji",
                  "อิโมจิตั๋วกาชา"
                )
              ]
            )
          );
        }

        // GACHA START

        if (
          interaction.commandName ===
          "gachastart"
        ) {

          if (!db.gacha.channelId) {

            return interaction.reply({
              content:
                "❌ กรุณาตั้งค่าตู้กาชาก่อน",
              ephemeral: true
            });
          }

          ensureGachaTicket();
          saveDB();

          await refreshGacha(
            interaction.guild
          );

          await refreshStore(
            interaction.guild
          );

          return interaction.reply({
            content:
              "✅ สร้าง/อัปเดตหน้าตู้กาชาแล้ว\n" +
              "🎟️ ตั๋วกาชาถูกเพิ่มเข้าร้านอัตโนมัติ",
            components: [
              new ActionRowBuilder().addComponents(

                new ButtonBuilder()
                  .setCustomId(
                    "gacha_admin_add"
                  )
                  .setLabel(
                    "➕ เพิ่มรางวัล"
                  )
                  .setStyle(
                    ButtonStyle.Success
                  ),

                new ButtonBuilder()
                  .setCustomId(
                    "gacha_admin_remove"
                  )
                  .setLabel(
                    "➖ ลบรางวัล"
                  )
                  .setStyle(
                    ButtonStyle.Danger
                  )

              )
            ],
            ephemeral: true
          });
        }
      }

      // ======================================================
      // MODALS
      // ======================================================

      if (interaction.isModalSubmit()) {

        const value = id =>
          interaction.fields
            .getTextInputValue(id)
            .trim();

        // PAYMENT SETTINGS

        if (
          interaction.customId ===
          "payment_settings"
        ) {

          db.payment.title =
            value("title");

          db.payment.description =
            value("description");

          db.payment.topupChannelId =
            value("topupChannelId");

          db.payment.slipChannelId =
            value("slipChannelId");

          db.payment.banner =
            value("banner");

          saveDB();

          return interaction.reply({
            content:
              "✅ บันทึกระบบหลักแล้ว\n" +
              "กดปุ่มด้านล่างเพื่อเพิ่มช่องทางชำระเงิน",
            components: [
              new ActionRowBuilder().addComponents(

                new ButtonBuilder()
                  .setCustomId(
                    "payment_add"
                  )
                  .setLabel(
                    "➕ เพิ่มช่องทางชำระเงิน"
                  )
                  .setStyle(
                    ButtonStyle.Primary
                  ),

                new ButtonBuilder()
                  .setCustomId(
                    "payment_list"
                  )
                  .setLabel(
                    "📋 ดูช่องทาง"
                  )
                  .setStyle(
                    ButtonStyle.Secondary
                  )

              ]
            ],
            ephemeral: true
          });
        }

        // PAYMENT METHOD

        if (
          interaction.customId ===
          "payment_method"
        ) {

          const type =
            value("type");

          const details =
            value("details");

          const qr =
            value("qr");

          db.payment.methods.push({
            type,
            details,
            qr,
            summary: details
          });

          saveDB();

          return interaction.reply({
            content:
              `✅ เพิ่มช่องทาง **${type}** แล้ว`,
            ephemeral: true
          });
        }

        // STORE SETTINGS

        if (
          interaction.customId ===
          "store_settings"
        ) {

          db.store.name =
            value("name");

          db.store.description =
            value("description");

          db.store.channelId =
            value("channelId");

          db.store.buyLabel =
            value("buyLabel");

          db.store.banner =
            value("banner");

          saveDB();

          await refreshStore(
            interaction.guild
          );

          return interaction.reply({
            content:
              "✅ ตั้งค่าร้านค้าแล้ว และอัปเดตหน้าร้านทันที",
            ephemeral: true
          });
        }

        // STORE ADD

        if (
          interaction.customId ===
          "store_add"
        ) {

          const name =
            value("name");

          const description =
            value("description");

          const type =
            value("type").toUpperCase();

          const price =
            Number(value("price"));

          const stock =
            Number(value("stock"));

          if (
            !["ROLE", "ITEM"].includes(
              type
            )
          ) {

            return interaction.reply({
              content:
                "❌ ประเภทต้องเป็น ROLE หรือ ITEM",
              ephemeral: true
            });
          }

          if (
            !Number.isFinite(price) ||
            price < 0
          ) {

            return interaction.reply({
              content:
                "❌ ราคาสินค้าไม่ถูกต้อง",
              ephemeral: true
            });
          }

          if (
            !Number.isInteger(stock) ||
            stock === 0
          ) {

            return interaction.reply({
              content:
                "❌ จำนวนต้องเป็นจำนวนเต็ม และหากไม่จำกัดให้ใส่ -1",
              ephemeral: true
            });
          }

          const item = {
            id:
              Date.now().toString(),
            name,
            description,
            type,
            price,
            stock
          };

          // ROLE

          if (type === "ROLE") {

            const role =
              interaction.guild.roles.cache.find(
                r =>
                  r.name.toLowerCase() ===
                  name.toLowerCase()
              );

            if (!role) {

              return interaction.reply({
                content:
                  `❌ ไม่พบยศ **${name}** ในเซิร์ฟเวอร์`,
                ephemeral: true
              });
            }

            item.roleId =
              role.id;
          }

          db.items.push(item);

          saveDB();

          // สำคัญ: อัปเดตหน้าร้านทันที

          await refreshStore(
            interaction.guild
          );

          return interaction.reply({
            content:
              `✅ เพิ่มสินค้า **${name}** แล้ว\n` +
              `💰 ราคา: ${price} Coins\n` +
              `📦 จำนวน: ${
                stock < 0
                  ? "ไม่จำกัด"
                  : stock
              }\n\n` +
              "🛒 หน้าร้านถูกอัปเดตอัตโนมัติแล้ว",
            ephemeral: true
          });
        }

        // GIFT SETUP

        if (
          interaction.customId ===
          "gift_setup"
        ) {

          db.store.giftLabel =
            value("label");

          saveDB();

          await refreshStore(
            interaction.guild
          );

          return interaction.reply({
            content:
              "✅ ตั้งค่าปุ่มแลกรางวัลแล้ว",
            ephemeral: true
          });
        }

        // GACHA SETUP

        if (
          interaction.customId ===
          "gacha_setup"
        ) {

          db.gacha.name =
            value("name");

          db.gacha.description =
            value("description");

          db.gacha.channelId =
            value("channelId");

          db.gacha.banner =
            value("banner");

          db.gacha.ticketEmoji =
            value("ticketEmoji");

          saveDB();

          return interaction.reply({
            content:
              "✅ บันทึกข้อมูลตู้กาชาแล้ว\n" +
              "กดปุ่มด้านล่างเพื่อตั้งค่าตั๋วและปุ่มสุ่ม",
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(
                    "gacha_more"
                  )
                  .setLabel(
                    "⚙️ ตั้งค่าตั๋วกาชาเพิ่มเติม"
                  )
                  .setStyle(
                    ButtonStyle.Primary
                  )
              )
            ],
            ephemeral: true
          });
        }

        // GACHA MORE

        if (
          interaction.customId ===
          "gacha_more_modal"
        ) {

          db.gacha.ticketName =
            value("ticketName");

          db.gacha.buttonLabel =
            value("buttonLabel");

          db.gacha.loadingBanner =
            value("loadingBanner");

          ensureGachaTicket();

          saveDB();

          await refreshStore(
            interaction.guild
          );

          return interaction.reply({
            content:
              "✅ ตั้งค่าตั๋วกาชาแล้ว\n" +
              "🎟️ ตั๋วกาชาถูกเพิ่มเข้าร้านอัตโนมัติ",
            ephemeral: true
          });
        }

        // ADD GACHA REWARD

        if (
          interaction.customId ===
          "gacha_reward_add"
        ) {

          const name =
            value("name");

          const amount =
            Math.max(
              1,
              Number(value("amount"))
            );

          const weight =
            Number(value("weight"));

          const type =
            value("type").toUpperCase();

          if (
            !["ROLE", "ITEM"].includes(
              type
            )
          ) {

            return interaction.reply({
              content:
                "❌ ประเภทต้องเป็น ROLE หรือ ITEM",
              ephemeral: true
            });
          }

          if (
            !Number.isFinite(weight) ||
            weight <= 0
          ) {

            return interaction.reply({
              content:
                "❌ โอกาสออกต้องมากกว่า 0",
              ephemeral: true
            });
          }

          const reward = {
            id:
              Date.now().toString(),
            name,
            amount,
            weight,
            type,
            stock: amount
          };

          if (type === "ROLE") {

            const role =
              interaction.guild.roles.cache.find(
                r =>
                  r.name.toLowerCase() ===
                  name.toLowerCase()
              );

            if (!role) {

              return interaction.reply({
                content:
                  `❌ ไม่พบยศ **${name}**`,
                ephemeral: true
              });
            }

            reward.roleId =
              role.id;
          }

          db.gachaRewards.push(
            reward
          );

          saveDB();

          await refreshGacha(
            interaction.guild
          );

          return interaction.reply({
            content:
              `✅ เพิ่มรางวัล **${name}** แล้ว\n` +
              "📊 ระบบคำนวณเปอร์เซ็นต์ใหม่อัตโนมัติ",
            ephemeral: true
          });
        }

        // REMOVE GACHA REWARD

        if (
          interaction.customId ===
          "gacha_reward_remove"
        ) {

          const name =
            value("name")
              .toLowerCase();

          const before =
            db.gachaRewards.length;

          db.gachaRewards =
            db.gachaRewards.filter(
              reward =>
                reward.name
                  .toLowerCase() !==
                name
            );

          saveDB();

          await refreshGacha(
            interaction.guild
          );

          return interaction.reply({
            content:
              before ===
              db.gachaRewards.length
                ? "❌ ไม่พบรางวัล"
                : "✅ ลบรางวัลแล้ว",
            ephemeral: true
          });
        }

        // ADD GIFT

        if (
          interaction.customId ===
          "gift_add"
        ) {

          const name =
            value("name");

          const costSalt =
            Number(value("costSalt"));

          const stock =
            Number(value("stock"));

          const type =
            value("type").toUpperCase();

          if (
            !["ROLE", "ITEM"].includes(
              type
            )
          ) {

            return interaction.reply({
              content:
                "❌ ประเภทต้องเป็น ROLE หรือ ITEM",
              ephemeral: true
            });
          }

          if (
            !Number.isFinite(
              costSalt
            ) ||
            costSalt < 1
          ) {

            return interaction.reply({
              content:
                "❌ จำนวนเกลือไม่ถูกต้อง",
              ephemeral: true
            });
          }

          if (
            !Number.isInteger(stock) ||
            stock === 0
          ) {

            return interaction.reply({
              content:
                "❌ จำนวนสินค้าไม่ถูกต้อง",
              ephemeral: true
            });
          }

          const gift = {
            id:
              Date.now().toString(),
            name,
            costSalt,
            stock,
            type
          };

          if (type === "ROLE") {

            const role =
              interaction.guild.roles.cache.find(
                r =>
                  r.name.toLowerCase() ===
                  name.toLowerCase()
              );

            if (!role) {

              return interaction.reply({
                content:
                  `❌ ไม่พบยศ **${name}**`,
                ephemeral: true
              });
            }

            gift.roleId =
              role.id;
          }

          db.gifts.push(gift);

          saveDB();

          await refreshStore(
            interaction.guild
          );

          return interaction.reply({
            content:
              `✅ เพิ่มรางวัล **${name}** แล้ว\n` +
              "🎁 หน้าร้านอัปเดตอัตโนมัติ",
            ephemeral: true
          });
        }

        // CUSTOM TOPUP

        if (
          interaction.customId ===
          "custom_topup"
        ) {

          const coins =
            Math.floor(
              Number(value("coins"))
            );

          if (
            !Number.isFinite(coins) ||
            coins < 1
          ) {

            return interaction.reply({
              content:
                "❌ จำนวน Coins ต้องมากกว่า 0",
              ephemeral: true
            });
          }

          const baht =
            getTopupPrice(coins);

          getUser(
            interaction.user.id
          ).pendingTopup = {
            coins,
            baht
          };

          saveDB();

          return interaction.reply({
            content:
              `💰 จำนวน Coins: **${coins.toLocaleString()}**\n` +
              `💵 ต้องชำระ: **${money(baht)} บาท**\n\n` +
              `เมื่อชำระเงินแล้ว ให้แนบสลิปใน <#${db.payment.slipChannelId}>`,
            ephemeral: true
          });
        }

        // BUY ITEM QUANTITY

        if (
          interaction.customId.startsWith(
            "buy_quantity:"
          )
        ) {

          const itemId =
            interaction.customId.split(
              ":"
            )[1];

          const item =
            db.items.find(
              x => x.id === itemId
            );

          if (!item) {

            return interaction.reply({
              content:
                "❌ ไม่พบสินค้า",
              ephemeral: true
            });
          }

          const quantity =
            Math.floor(
              Number(value("quantity"))
            );

          if (
            !Number.isInteger(
              quantity
            ) ||
            quantity < 1
          ) {

            return interaction.reply({
              content:
                "❌ จำนวนไม่ถูกต้อง",
              ephemeral: true
            });
          }

          if (
            item.stock >= 0 &&
            item.stock < quantity
          ) {

            return interaction.reply({
              content:
                "❌ สินค้าเหลือไม่พอ",
              ephemeral: true
            });
          }

          const total =
            item.price *
            quantity;

          return interaction.reply({
            content:
              "🧾 **รายละเอียดคำสั่งซื้อ**\n\n" +
              `ชื่อสินค้า: **${item.name}**\n` +
              `ราคา: **${item.price} Coins**\n` +
              `จำนวน: **${quantity}**\n` +
              `รวม: **${total} Coins**`,
            components: [
              new ActionRowBuilder().addComponents(

                new ButtonBuilder()
                  .setCustomId(
                    `confirm_buy:${item.id}:${quantity}`
                  )
                  .setLabel(
                    "ยืนยันคำสั่งซื้อ"
                  )
                  .setStyle(
                    ButtonStyle.Success
                  ),

                new ButtonBuilder()
                  .setCustomId(
                    "cancel_buy"
                  )
                  .setLabel(
                    "ยกเลิกคำสั่งซื้อ"
                  )
                  .setStyle(
                    ButtonStyle.Danger
                  )

              )
            ],
            ephemeral: true
          });
        }
      }

      // ======================================================
      // BUTTONS
      // ======================================================

      if (interaction.isButton()) {

        // TOPUP

        if (
          interaction.customId ===
          "topup_open"
        ) {

          if (
            !db.payment.methods.length
          ) {

            return interaction.reply({
              content:
                "❌ ยังไม่มีช่องทางชำระเงิน",
              ephemeral: true
            });
          }

          return interaction.reply({
            content:
              "💳 เลือกช่องทางชำระเงิน",
            components: [
              paymentMethodMenu()
            ],
            ephemeral: true
          });
        }

        // PAYMENT ADD

        if (
          interaction.customId ===
          "payment_add"
        ) {

          return interaction.showModal(
            makeModal(
              "payment_method",
              "เพิ่มช่องทางชำระเงิน",
              [
                makeField(
                  "type",
                  "ประเภท เช่น TrueMoney / ธนาคาร / QR"
                ),
                makeField(
                  "details",
                  "รายละเอียดบัญชี",
                  TextInputStyle.Paragraph
                ),
                makeField(
                  "qr",
                  "ลิงค์รูป QR Code",
                  TextInputStyle.Short,
                  false
                )
              ]
            )
          );
        }

        // PAYMENT LIST

        if (
          interaction.customId ===
          "payment_list"
        ) {

          const methods =
            db.payment.methods;

          if (!methods.length) {

            return interaction.reply({
              content:
                "ยังไม่มีช่องทางชำระเงิน",
              ephemeral: true
            });
          }

          return interaction.reply({
            content:
              methods
                .map(
                  (m, i) =>
                    `${i + 1}. **${m.type}**\n${m.details}`
                )
                .join("\n\n"),
            ephemeral: true
          });
        }

        // CUSTOM TOPUP BUTTON

        if (
          interaction.customId ===
          "custom_topup_button"
        ) {

          return interaction.showModal(
            makeModal(
              "custom_topup",
              "กำหนดจำนวน Coins",
              [
                makeField(
                  "coins",
                  "จำนวน Coins",
                  TextInputStyle.Short,
                  true,
                  "ขั้นต่ำ 1 Coin"
                )
              ]
            )
          );
        }

        // STORE GIFT

        if (
          interaction.customId ===
          "store_gift"
        ) {

          const available =
            db.gifts
              .filter(
                x => x.stock !== 0
              )
              .slice(0, 25);

          if (!available.length) {

            return interaction.reply({
              content:
                "🎁 ยังไม่มีรางวัลที่พร้อมแลก",
              ephemeral: true
            });
          }

          return interaction.reply({
            content:
              "🎁 เลือกรางวัลที่ต้องการแลก",
            components: [
              new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                  .setCustomId(
                    "gift_select"
                  )
                  .setPlaceholder(
                    "เลือกรางวัล"
                  )
                  .addOptions(
                    available.map(
                      gift =>
                        new StringSelectMenuOptionBuilder()
                          .setLabel(
                            truncate(
                              gift.name
                            )
                          )
                          .setValue(
                            gift.id
                          )
                          .setDescription(
                            `${gift.costSalt} เกลือ | เหลือ ${
                              gift.stock < 0
                                ? "ไม่จำกัด"
                                : gift.stock
                            }`
                          )
                    )
                  )
              )
            ],
            ephemeral: true
          });
        }

        // GACHA MORE

        if (
          interaction.customId ===
          "gacha_more"
        ) {

          return interaction.showModal(
            makeModal(
              "gacha_more_modal",
              "ตั้งค่าตั๋วกาชา",
              [
                makeField(
                  "ticketName",
                  "ชื่อตั๋วกาชา"
                ),
                makeField(
                  "buttonLabel",
                  "ชื่อปุ่มสุ่มกาชา"
                ),
                makeField(
                  "loadingBanner",
                  "ลิงค์ Banner ตอนสุ่ม",
                  TextInputStyle.Short,
                  false
                )
              ]
            )
          );
        }

        // GACHA ADD

        if (
          interaction.customId ===
          "gacha_admin_add"
        ) {

          return interaction.showModal(
            makeModal(
              "gacha_reward_add",
              "เพิ่มรางวัลกาชา",
              [
                makeField(
                  "name",
                  "ชื่อรางวัล"
                ),
                makeField(
                  "amount",
                  "จำนวน"
                ),
                makeField(
                  "weight",
                  "โอกาสออก / Weight"
                ),
                makeField(
                  "type",
                  "ประเภท ROLE หรือ ITEM"
                )
              ]
            )
          );
        }

        // GACHA REMOVE

        if (
          interaction.customId ===
          "gacha_admin_remove"
        ) {

          return interaction.showModal(
            makeModal(
              "gacha_reward_remove",
              "ลบรางวัลกาชา",
              [
                makeField(
                  "name",
                  "ชื่อรางวัล"
                )
              ]
            )
          );
        }

        // GACHA ROLL

        if (
          interaction.customId ===
          "gacha_roll"
        ) {

          const user =
            getUser(
              interaction.user.id
            );

          const tickets =
            user.inventory[
              db.gacha.ticketName
            ] || 0;

          if (tickets < 1) {

            return interaction.reply({
              content:
                `❌ คุณไม่มี ${db.gacha.ticketName}`,
              ephemeral: true
            });
          }

          return interaction.reply({
            content:
              "🎰 เลือกจำนวนครั้งที่ต้องการสุ่ม",
            components: [
              new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                  .setCustomId(
                    "gacha_count"
                  )
                  .setPlaceholder(
                    "จำนวนครั้ง"
                  )
                  .addOptions(
                    [1, 5, 10].map(
                      amount =>
                        new StringSelectMenuOptionBuilder()
                          .setLabel(
                            `${amount} ครั้ง`
                          )
                          .setValue(
                            String(amount)
                          )
                          .setDescription(
                            `${amount} ตั๋ว`
                          )
                    )
                  )
              )
            ],
            ephemeral: true
          });
        }

        // CANCEL BUY

        if (
          interaction.customId ===
          "cancel_buy"
        ) {

          return interaction.update({
            content:
              `❌ คุณ ${interaction.user} ได้ยกเลิกคำสั่งซื้อแล้ว`,
            components: []
          });
        }

        // CONFIRM BUY

        if (
          interaction.customId.startsWith(
            "confirm_buy:"
          )
        ) {

          const parts =
            interaction.customId.split(
              ":"
            );

          const itemId =
            parts[1];

          const quantity =
            Number(parts[2]);

          const item =
            db.items.find(
              x => x.id === itemId
            );

          if (!item) {

            return interaction.update({
              content:
                "❌ ไม่พบสินค้า",
              components: []
            });
          }

          const user =
            getUser(
              interaction.user.id
            );

          const total =
            item.price *
            quantity;

          if (
            user.coins < total
          ) {

            return interaction.update({
              content:
                `❌ Coins ไม่พอ\nคุณมี ${user.coins} Coins แต่ต้องใช้ ${total} Coins`,
              components: []
            });
          }

          if (
            item.stock === 0 ||
            (
              item.stock > 0 &&
              item.stock < quantity
            )
          ) {

            return interaction.update({
              content:
                "❌ สินค้าเหลือไม่พอ",
              components: []
            });
          }

          user.coins -= total;

          if (item.stock > 0) {
            item.stock -= quantity;
          }

          if (
            item.type ===
            "ROLE"
          ) {

            const role =
              interaction.guild.roles.cache.get(
                item.roleId
              );

            if (role) {

              await interaction.member.roles
                .add(role)
                .catch(() => {});
            }

          } else {

            addItem(
              interaction.user.id,
              item.name,
              quantity
            );
          }

          saveDB();

          await refreshStore(
            interaction.guild
          );

          return interaction.update({
            content:
              "✅ **สั่งซื้อสินค้าแล้ว**\n\n" +
              `ชื่อสินค้า: ${item.name}\n` +
              `จำนวน: ${quantity}\n` +
              `ราคา: ${total} Coins\n` +
              `ประเภทสินค้า: ${item.type}`,
            components: []
          });
        }

        // APPROVE TOPUP

        if (
          interaction.customId.startsWith(
            "approve_topup:"
          )
        ) {

          if (!isAdmin(interaction)) {

            return interaction.reply({
              content:
                "❌ เฉพาะแอดมิน",
              ephemeral: true
            });
          }

          const parts =
            interaction.customId.split(
              ":"
            );

          const userId =
            parts[1];

          const coins =
            Number(parts[2]);

          const baht =
            Number(parts[3]);

          const user =
            getUser(userId);

          user.coins += coins;
          user.pendingTopup = null;

          saveDB();

          const discordUser =
            await client.users
              .fetch(userId)
              .catch(() => null);

          if (discordUser) {

            await sendDM(
              discordUser,
              {
                embeds: [
                  new EmbedBuilder()
                    .setTitle(
                      "✅ เติมเงินสำเร็จ"
                    )
                    .setColor(
                      0x2ecc71
                    )
                    .setDescription(
                      `ท่านได้ชำระเงินแล้วจำนวน **${money(baht)} บาท**\n\n` +
                      `ได้รับ **${coins.toLocaleString()} Coins**\n\n` +
                      `ตรวจสอบโดย: **${interaction.user.username}**\n` +
                      `เวลา: <t:${Math.floor(
                        Date.now() / 1000
                      )}:F>`
                    )
                ]
              }
            );
          }

          return interaction.update({
            content:
              `✅ อนุมัติการเติมเงิน ${coins.toLocaleString()} Coins แล้ว\n` +
              `ตรวจสอบโดย ${interaction.user}`,
            components: []
          });
        }

        // REJECT TOPUP

        if (
          interaction.customId.startsWith(
            "reject_topup:"
          )
        ) {

          if (!isAdmin(interaction)) {

            return interaction.reply({
              content:
                "❌ เฉพาะแอดมิน",
              ephemeral: true
            });
          }

          const userId =
            interaction.customId.split(
              ":"
            )[1];

          const user =
            getUser(userId);

          user.pendingTopup = null;

          saveDB();

          const discordUser =
            await client.users
              .fetch(userId)
              .catch(() => null);

          if (discordUser) {

            await sendDM(
              discordUser,
              {
                content:
                  "❌ สลิปการเติมเงินของคุณถูกยกเลิก กรุณาติดต่อแอดมิน"
              }
            );
          }

          return interaction.update({
            content:
              `❌ ยกเลิกรายการโดย ${interaction.user}`,
            components: []
          });
        }
      }

      // ======================================================
      // SELECT MENU
      // ======================================================

      if (
        interaction.isStringSelectMenu()
      ) {

        // PAYMENT METHOD

        if (
          interaction.customId ===
          "topup_method"
        ) {

          const index =
            Number(
              interaction.values[0]
            );

          const method =
            db.payment.methods[
              index
            ];

          if (!method) {

            return interaction.reply({
              content:
                "❌ ไม่พบช่องทางชำระเงิน",
              ephemeral: true
            });
          }

          const embed =
            new EmbedBuilder()
              .setTitle(
                `💳 ${method.type}`
              )
              .setDescription(
                method.details || ""
              )
              .setColor(
                0x2ecc71
              );

          if (
            validImage(method.qr)
          ) {

            embed.setImage(
              method.qr
            );
          }

          return interaction.reply({
            embeds: [embed],
            components: [
              amountMenu(),

              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(
                    "custom_topup_button"
                  )
                  .setLabel(
                    "กำหนดเอง"
                  )
                  .setStyle(
                    ButtonStyle.Primary
                  )
              )
            ],
            ephemeral: true
          });
        }

        // TOPUP AMOUNT

        if (
          interaction.customId ===
          "topup_amount"
        ) {

          const coins =
            Number(
              interaction.values[0]
            );

          const baht =
            getTopupPrice(
              coins
            );

          getUser(
            interaction.user.id
          ).pendingTopup = {
            coins,
            baht
          };

          saveDB();

          return interaction.reply({
            content:
              `💰 คุณเลือกเติม **${coins.toLocaleString()} Coins**\n` +
              `💵 ราคา **${money(baht)} บาท**\n\n` +
              `เมื่อชำระเงินแล้ว กรุณาแนบสลิปใน <#${db.payment.slipChannelId}>`,
            ephemeral: true
          });
        }

        // STORE BUY

        if (
          interaction.customId ===
          "store_buy"
        ) {

          const item =
            db.items.find(
              x =>
                x.id ===
                interaction.values[0]
            );

          if (!item) {

            return interaction.reply({
              content:
                "❌ ไม่พบสินค้า",
              ephemeral: true
            });
          }

          if (
            item.type ===
            "ROLE"
          ) {

            return interaction.reply({
              content:
                "🧾 **รายละเอียดคำสั่งซื้อ**\n\n" +
                `ชื่อสินค้า: **${item.name}**\n` +
                `ราคา: **${item.price} Coins**\n` +
                `จำนวน: **1**`,
              components: [
                new ActionRowBuilder().addComponents(

                  new ButtonBuilder()
                    .setCustomId(
                      `confirm_buy:${item.id}:1`
                    )
                    .setLabel(
                      "ยืนยันคำสั่งซื้อ"
                    )
                    .setStyle(
                      ButtonStyle.Success
                    ),

                  new ButtonBuilder()
                    .setCustomId(
                      "cancel_buy"
                    )
                    .setLabel(
                      "ยกเลิกคำสั่งซื้อ"
                    )
                    .setStyle(
                      ButtonStyle.Danger
                    )

                )
              ],
              ephemeral: true
            });
          }

          return interaction.showModal(
            makeModal(
              `buy_quantity:${item.id}`,
              "จำนวนสินค้า",
              [
                makeField(
                  "quantity",
                  "จำนวน",
                  TextInputStyle.Short,
                  true,
                  "เช่น 1"
                )
              ]
            )
          );
        }

        // GACHA COUNT

        if (
          interaction.customId ===
          "gacha_count"
        ) {

          const amount =
            Number(
              interaction.values[0]
            );

          const user =
            getUser(
              interaction.user.id
            );

          const tickets =
            user.inventory[
              db.gacha.ticketName
            ] || 0;

          if (
            tickets < amount
          ) {

            return interaction.reply({
              content:
                `❌ คุณมีตั๋วไม่พอ\nมี ${tickets} แต่ต้องใช้ ${amount}`,
              ephemeral: true
            });
          }

          if (
            !db.gachaRewards.length
          ) {

            return interaction.reply({
              content:
                "❌ ตู้กาชายังไม่มีรางวัล",
              ephemeral: true
            });
          }

          user.inventory[
            db.gacha.ticketName
          ] -= amount;

          if (
            user.inventory[
              db.gacha.ticketName
            ] <= 0
          ) {

            delete user.inventory[
              db.gacha.ticketName
            ];
          }

          saveDB();

          await interaction.reply({
            content:
              "🎰 **LOADING...**\n\n" +
              "กำลังสุ่มรางวัล...\n" +
              "กรุณารอประมาณ 5 วินาที",
            ephemeral: true
          });

          setTimeout(
            async () => {

              try {

                const results = [];

                for (
                  let count = 0;
                  count < amount;
                  count++
                ) {

                  const available =
                    db.gachaRewards.filter(
                      reward =>
                        reward.stock !== 0
                    );

                  if (
                    !available.length
                  ) {
                    break;
                  }

                  const totalWeight =
                    available.reduce(
                      (
                        sum,
                        reward
                      ) =>
                        sum +
                        Number(
                          reward.weight
                        ),
                      0
                    );

                  let random =
                    Math.random() *
                    totalWeight;

                  let selected =
                    available[
                      available.length - 1
                    ];

                  for (
                    const reward of available
                  ) {

                    random -=
                      Number(
                        reward.weight
                      );

                    if (
                      random <= 0
                    ) {

                      selected =
                        reward;

                      break;
                    }
                  }

                  if (
                    selected.stock > 0
                  ) {

                    selected.stock--;
                  }

                  results.push(
                    selected
                  );

                  if (
                    selected.type ===
                    "ROLE"
                  ) {

                    const role =
                      interaction.guild.roles.cache.get(
                        selected.roleId
                      );

                    if (role) {

                      await interaction.member.roles
                        .add(role)
                        .catch(() => {});
                    }

                  } else {

                    const rewardName =
                      selected.name
                        .toLowerCase();

                    if (
                      rewardName ===
                      "coins"
                    ) {

                      user.coins +=
                        selected.amount;

                    } else if (
                      rewardName ===
                      "เกลือ"
                    ) {

                      user.salt +=
                        selected.amount;

                    } else {

                      addItem(
                        interaction.user.id,
                        selected.name,
                        selected.amount
                      );
                    }
                  }
                }

                saveDB();

                const resultText =
                  results
                    .map(
                      reward =>
                        `🎁 **${reward.name}** ×${reward.amount}`
                    )
                    .join("\n") ||
                  "ไม่มีรางวัล";

                await interaction.editReply({
                  content:
                    `🎉 **สุ่มสำเร็จ ${amount} ครั้ง**\n\n` +
                    resultText
                });

                await refreshGacha(
                  interaction.guild
                );

              } catch (error) {

                console.error(
                  "Gacha Error:",
                  error
                );
              }

            },
            5000
          );

          return;
        }

        // GIFT SELECT

        if (
          interaction.customId ===
          "gift_select"
        ) {

          const gift =
            db.gifts.find(
              x =>
                x.id ===
                interaction.values[0]
            );

          if (!gift) {

            return interaction.reply({
              content:
                "❌ ไม่พบรางวัล",
              ephemeral: true
            });
          }

          const user =
            getUser(
              interaction.user.id
            );

          if (
            user.salt <
            gift.costSalt
          ) {

            return interaction.reply({
              content:
                `❌ เกลือไม่พอ\nคุณมี ${user.salt} เกลือ`,
              ephemeral: true
            });
          }

          user.salt -=
            gift.costSalt;

          if (
            gift.stock > 0
          ) {

            gift.stock--;
          }

          if (
            gift.type ===
            "ROLE"
          ) {

            const role =
              interaction.guild.roles.cache.get(
                gift.roleId
              );

            if (role) {

              await interaction.member.roles
                .add(role)
                .catch(() => {});
            }

          } else {

            addItem(
              interaction.user.id,
              gift.name,
              1
            );
          }

          saveDB();

          await refreshStore(
            interaction.guild
          );

          return interaction.reply({
            content:
              `🎁 แลกรางวัล **${gift.name}** สำเร็จ`,
            ephemeral: true
          });
        }
      }

    } catch (error) {

      console.error(
        "❌ Interaction Error:",
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {

        try {

          await interaction.reply({
            content:
              "❌ ระบบเกิดข้อผิดพลาด กรุณาลองใหม่",
            ephemeral: true
          });

        } catch {}
      }
    }
  }
);

// ============================================================
// MESSAGE COMMANDS
// ============================================================

client.on(
  "messageCreate",
  async message => {

    try {

      if (
        message.author.bot ||
        !message.guild
      ) {
        return;
      }

      // ======================================================
      // BAGPACK
      // ======================================================

      if (
        message.content.trim() ===
          "!bagpack" ||
        message.content.trim() ===
          "!backpack"
      ) {

        const user =
          getUser(
            message.author.id
          );

        const inventory =
          Object.entries(
            user.inventory
          )
            .filter(
              ([, amount]) =>
                amount > 0
            )
            .map(
              ([name, amount]) =>
                `• **${name}** ×${amount}`
            )
            .join("\n") ||
          "ไม่มีไอเท็ม";

        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                `🎒 กระเป๋าของ ${
                  message.member?.displayName ||
                  message.author.username
                }`
              )
              .setColor(
                0xf1c40f
              )
              .addFields(
                {
                  name: "🪙 Coins",
                  value:
                    `${user.coins.toLocaleString()} Coins`
                },
                {
                  name: "🧂 เกลือ",
                  value:
                    `${user.salt.toLocaleString()}`
                },
                {
                  name: "📦 ไอเท็ม",
                  value:
                    inventory
                }
              )
          ]
        });
      }

      // ======================================================
      // SETUP
      // ======================================================

      if (
        message.content.trim() ===
        "!setup"
      ) {

        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(
                "🛠️ LUCENT COMMANDS"
              )
              .setColor(
                0x5865f2
              )
              .setDescription(
                "รายการคำสั่งทั้งหมด"
              )
              .addFields(

                {
                  name:
                    "💳 ระบบเติมเงิน",
                  value:
                    "`/pymentsetting` ตั้งค่าระบบเติมเงิน\n" +
                    "`/startstore` สร้างหน้าต่างเติมเงิน\n" +
                    "`/balance` ดู Coins"
                },

                {
                  name:
                    "🛒 ระบบร้านค้า",
                  value:
                    "`/store_setup` ตั้งค่าร้านค้า\n" +
                    "`/storeadd` เพิ่มสินค้า\n" +
                    "`/gift` ตั้งค่าปุ่มแลกรางวัล"
                },

                {
                  name:
                    "🎰 ระบบกาชา",
                  value:
                    "`/gachasetup` ตั้งค่าตู้กาชา\n" +
                    "`/gachastart` สร้างตู้กาชา"
                },

                {
                  name:
                    "🎒 ระบบกระเป๋า",
                  value:
                    "`!bagpack` ดู Coins / เกลือ / ไอเท็ม"
                },

                {
                  name:
                    "🎁 ระบบแลกรางวัล",
                  value:
                    "`!addgift` เพิ่มรางวัลที่ใช้เกลือแลก"
                }

              )
          ]
        });
      }

      // ======================================================
      // ADD GIFT
      // ======================================================

      if (
        message.content.trim() ===
          "!addgift" &&
        message.member.permissions.has(
          PermissionFlagsBits.Administrator
        )
      ) {

        return message.reply({
          content:
            "🎁 **ระบบเพิ่มรางวัลแลกด้วยเกลือ**",
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(
                  "gift_admin_add"
                )
                .setLabel(
                  "➕ เพิ่มรางวัล"
                )
                .setStyle(
                  ButtonStyle.Success
                )
            )
          ]
        });
      }

      // ======================================================
      // ADD GIFT BUTTON
      // ======================================================

      if (
        message.content.trim() ===
          "!addgift"
      ) {

        return;
      }

      // ======================================================
      // SLIP
      // ======================================================

      if (
        db.payment.slipChannelId &&
        message.channel.id ===
          db.payment.slipChannelId &&
        message.attachments.size
      ) {

        const user =
          getUser(
            message.author.id
          );

        if (
          !user.pendingTopup
        ) {
          return;
        }

        const reviewChannel =
          getChannel(
            message.guild,
            db.payment.reviewChannelId ||
              db.payment.slipChannelId
          );

        if (!reviewChannel) {
          return;
        }

        const attachment =
          message.attachments.first();

        const embed =
          new EmbedBuilder()
            .setTitle(
              "💰 ตรวจสอบการเติมเงิน"
            )
            .setColor(
              0xf1c40f
            )
            .addFields(
              {
                name:
                  "👤 ผู้ใช้",
                value:
                  `${message.author} (${message.author.id})`
              },
              {
                name:
                  "🪙 Coins",
                value:
                  `${user.pendingTopup.coins}`
              },
              {
                name:
                  "💵 ยอดชำระ",
                value:
                  `${money(
                    user.pendingTopup.baht
                  )} บาท`
              }
            )
            .setImage(
              attachment.url
            );

        await reviewChannel.send({
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(

              new ButtonBuilder()
                .setCustomId(
                  `approve_topup:${message.author.id}:${user.pendingTopup.coins}:${user.pendingTopup.baht}`
                )
                .setLabel(
                  "ชำระเงิน"
                )
                .setStyle(
                  ButtonStyle.Success
                ),

              new ButtonBuilder()
                .setCustomId(
                  `reject_topup:${message.author.id}`
                )
                .setLabel(
                  "ยกเลิก"
                )
                .setStyle(
                  ButtonStyle.Danger
                )

            )
          ]
        });

        await message.reply({
          content:
            "✅ รับสลิปแล้ว กรุณารอแอดมินตรวจสอบ",
          allowedMentions: {
            repliedUser: false
          }
        });
      }

    } catch (error) {

      console.error(
        "❌ Message Error:",
        error
      );
    }
  }
);

// ============================================================
// GIFT ADMIN BUTTON
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {

    if (
      !interaction.isButton()
    ) {
      return;
    }

    if (
      interaction.customId ===
      "gift_admin_add"
    ) {

      if (
        !isAdmin(interaction)
      ) {

        return interaction.reply({
          content:
            "❌ เฉพาะแอดมิน",
          ephemeral: true
        });
      }

      return interaction.showModal(
        makeModal(
          "gift_add",
          "เพิ่มรางวัลแลกด้วยเกลือ",
          [
            makeField(
              "name",
              "ชื่อรางวัล"
            ),
            makeField(
              "costSalt",
              "จำนวนเกลือที่ใช้แลก"
            ),
            makeField(
              "stock",
              "จำนวน (-1 = ไม่จำกัด)"
            ),
            makeField(
              "type",
              "ประเภท ROLE หรือ ITEM"
            )
          ]
        )
      );
    }
  }
);

// ============================================================
// LOGIN
// ============================================================

client.login(TOKEN)
  .then(() => {

    console.log(
      "🚀 LUCENT BOT กำลังเริ่มทำงาน..."
    );

  })
  .catch(error => {

    console.error(
      "❌ Discord Login Error:",
      error
    );

    process.exit(1);
  });
