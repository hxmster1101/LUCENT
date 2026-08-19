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
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

// ============================================================
// LUCENT BOT - Railway / Node.js
// ระบบเดิม: Topup / Store / Gacha / Backpack / Coins
// ระบบเพิ่ม: แนบสลิปในห้อง -> ส่งห้องแอดมิน -> อนุมัติ/ยกเลิก
// หมายเหตุ: ฐานข้อมูลยังเป็น In-Memory เหมือนไฟล์ Python เดิม
// ============================================================

const db = {
  topup_settings: {},
  store_settings: {},
  store_items: [],
  gacha_settings: {},
  gacha_items: [],
  user_balances: new Map(),      // userId -> coins
  user_inventories: new Map(),   // userId -> Map(itemName -> count)
  pending_topups: new Map(),     // userId -> pending topup
  processed_topups: new Set()    // messageId -> processed
};

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

const COIN_RATE = 0.86; // 1 Coin = 0.86 บาท
const MIN_TOPUP_BAHT = 5;

// -------------------- Helpers --------------------

function isAdmin(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

function getCoins(userId) {
  return db.user_balances.get(userId) || 0;
}

function setCoins(userId, amount) {
  db.user_balances.set(userId, Math.max(0, Math.floor(amount)));
}

function addCoins(userId, amount) {
  setCoins(userId, getCoins(userId) + amount);
}

function getInventory(userId) {
  if (!db.user_inventories.has(userId)) {
    db.user_inventories.set(userId, new Map());
  }
  return db.user_inventories.get(userId);
}

function addItem(userId, itemName, count = 1) {
  const inv = getInventory(userId);
  inv.set(itemName, (inv.get(itemName) || 0) + count);
}

function money(value) {
  return Number(value).toFixed(2);
}

function channelMention(guild, id) {
  const ch = guild.channels.cache.get(id);
  return ch ? ch.toString() : `<#${id}>`;
}

async function safeDM(user, embed) {
  try {
    await user.send({ embeds: [embed] });
  } catch (_) {
    // ผู้ใช้ปิด DM ก็ไม่ให้ระบบหลักพัง
  }
}

function adminOnlyMessage(interaction) {
  return interaction.reply({
    content: '❌ คำสั่งนี้ใช้ได้เฉพาะแอดมิน/Administrator เท่านั้น',
    ephemeral: true
  });
}

// -------------------- Slash command definitions --------------------

const commands = [
  new SlashCommandBuilder()
    .setName('topup_setting')
    .setDescription('ตั้งค่าบัญชีรับเงิน ห้องแนบสลิป และห้องตรวจสอบสลิป')
    .addStringOption(o => o.setName('bank_name').setDescription('ชื่อบัญชีธนาคาร/เจ้าของบัญชี').setRequired(true))
    .addStringOption(o => o.setName('account_type').setDescription('ประเภทบัญชี เช่น พร้อมเพย์/ธนาคาร/TrueMoney').setRequired(true))
    .addStringOption(o => o.setName('account_number').setDescription('เลขบัญชี/เบอร์โทรศัพท์').setRequired(true))
    .addChannelOption(o => o.setName('admin_channel').setDescription('ห้องที่แอดมินตรวจสอบสลิป').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addChannelOption(o => o.setName('slip_channel').setDescription('ห้องที่สมาชิกใช้แนบสลิป').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption(o => o.setName('qr_link').setDescription('ลิงก์รูป QR Code (ใส่หรือไม่ใส่ก็ได้)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('topup_setup')
    .setDescription('สร้างหน้าต่างเติมเงิน')
    .addStringOption(o => o.setName('title').setDescription('ชื่อหัวข้อระบบเติมเงิน').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('รายละเอียดระบบเติมเงิน').setRequired(true))
    .addChannelOption(o => o.setName('channel').setDescription('ห้องที่จะวางระบบเติมเงิน').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption(o => o.setName('button_label').setDescription('ชื่อปุ่มเติมเงิน').setRequired(true))
    .addStringOption(o => o.setName('banner_url').setDescription('ลิงก์ Banner/GIF (ไม่ใส่ได้)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('store_setup')
    .setDescription('ตั้งค่าหน้าร้านค้า')
    .addStringOption(o => o.setName('store_name').setDescription('ชื่อร้านค้า').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('รายละเอียดร้านค้า').setRequired(true))
    .addChannelOption(o => o.setName('channel').setDescription('ห้องที่จะวางร้านค้า').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption(o => o.setName('banner_url').setDescription('ลิงก์ Banner/GIF (ไม่ใส่ได้)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('add_item')
    .setDescription('เพิ่มสินค้าเข้าร้านค้า')
    .addStringOption(o => o.setName('item_type').setDescription('ประเภทสินค้า').addChoices(
      { name: 'ยศ Discord', value: 'role' },
      { name: 'ไอเท็ม', value: 'item' }
    ).setRequired(true))
    .addIntegerOption(o => o.setName('price').setDescription('ราคา Coins').setMinValue(1).setRequired(true))
    .addStringOption(o => o.setName('name').setDescription('ชื่อสินค้า/ไอเท็ม').setRequired(true))
    .addStringOption(o => o.setName('emoji').setDescription('Emoji สินค้า').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('ยศที่จะมอบให้ (กรณี item_type = ยศ)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('gacha_setup')
    .setDescription('ตั้งค่าตู้กาชา')
    .addStringOption(o => o.setName('box_name').setDescription('ชื่อตู้กาชา').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('รายละเอียดตู้กาชา').setRequired(true))
    .addChannelOption(o => o.setName('channel').setDescription('ห้องที่จะวางกาชา').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption(o => o.setName('button_label').setDescription('ชื่อปุ่มสุ่ม').setRequired(true))
    .addStringOption(o => o.setName('ticket_name').setDescription('ชื่อ Ticket ที่ใช้สุ่ม').setRequired(true))
    .addStringOption(o => o.setName('ticket_icon').setDescription('Emoji Ticket').setRequired(true))
    .addStringOption(o => o.setName('banner_url').setDescription('ลิงก์ Banner/GIF (ไม่ใส่ได้)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('gacha_start')
    .setDescription('สร้างตู้กาชาในห้องที่ตั้งไว้'),

  new SlashCommandBuilder()
    .setName('backpack')
    .setDescription('ดู Coins และไอเท็มในกระเป๋า'),

  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('ดูยอด Coins ของตัวเอง')
];

// -------------------- Store display --------------------

async function refreshStoreDisplay(guild) {
  const settings = db.store_settings;
  if (!settings.channel_id) return;

  const channel = guild.channels.cache.get(settings.channel_id);
  if (!channel || !channel.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setTitle(`🏪 ${settings.name}`)
    .setDescription(settings.description || '-')
    .setColor(0x57F287);

  if (settings.banner_url) embed.setImage(settings.banner_url);

  let itemsText = '';
  for (const item of db.store_items) {
    itemsText += `${item.emoji || '🏷️'} **${item.name}** - ราคา \`${item.price}\` Coins\n`;
  }

  embed.addFields({
    name: 'รายการสินค้าทั้งหมด',
    value: itemsText || 'ยังไม่มีสินค้าในร้าน',
    inline: false
  });

  const components = [];
  if (db.store_items.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('store_buy')
      .setPlaceholder('เลือกสินค้าที่ต้องการซื้อ...')
      .addOptions(
        db.store_items.slice(0, 25).map((item, index) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(`${item.name} - ${item.price} Coins`.slice(0, 100))
            .setValue(String(index))
            .setEmoji(item.emoji || '🏷️')
        )
      );
    components.push(new ActionRowBuilder().addComponents(menu));
  }

  const row = components[0];
  try {
    if (settings.message_id) {
      const old = await channel.messages.fetch(settings.message_id);
      await old.edit({ embeds: [embed], components: row ? [row] : [] });
      return;
    }
  } catch (_) {
    // ข้อความเดิมหาย -> สร้างใหม่
  }

  const msg = await channel.send({ embeds: [embed], components: row ? [row] : [] });
  settings.message_id = msg.id;
}

// -------------------- Topup display --------------------

function buildTopupEmbed(settings) {
  const embed = new EmbedBuilder()
    .setTitle(settings.title)
    .setDescription(settings.description)
    .setColor(0xF1C40F);

  if (settings.banner_url) embed.setImage(settings.banner_url);
  return embed;
}

function buildTopupButton(label) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('topup_open')
      .setLabel(label)
      .setEmoji('🪙')
      .setStyle(ButtonStyle.Success)
  );
}

function buildPaymentMethodMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('topup_payment_method')
      .setPlaceholder('เลือกช่องทางการชำระเงิน...')
      .addOptions(
        { label: 'บัญชีธนาคาร / พร้อมเพย์', value: 'บัญชีธนาคาร/พร้อมเพย์', emoji: '🏦' },
        { label: 'QR Code PromptPay', value: 'QR Code PromptPay', emoji: '📱' },
        { label: 'TrueMoney Wallet', value: 'TrueMoney Wallet', emoji: '🟧' }
      )
  );
}

function buildAdminTopupButtons(userId, coins, amount) {
  // ข้อมูลอยู่ใน customId เพื่อให้ปุ่มทำงานต่อได้แม้บอทรีสตาร์ต
  const safeAmount = Number(amount).toFixed(2);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`topup_approve:${userId}:${coins}:${safeAmount}`)
      .setLabel('อนุมัติสลิป')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`topup_reject:${userId}:${coins}:${safeAmount}`)
      .setLabel('ยกเลิกการชำระเงิน')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
  );
}

// -------------------- Gacha display --------------------

function buildGachaButton(label) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('gacha_open')
      .setLabel(label)
      .setEmoji('🎰')
      .setStyle(ButtonStyle.Primary)
  );
}

function buildGachaRollMenu() {
  const s = db.gacha_settings;
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('gacha_roll')
      .setPlaceholder('เลือกจำนวนรอบที่ต้องการสุ่ม...')
      .addOptions(
        { label: `1 ${s.ticket_name} (สุ่ม 1 รอบ)`.slice(0, 100), value: '1', emoji: s.ticket_icon || '🎟️' },
        { label: `5 ${s.ticket_name} (สุ่ม 5 รอบ)`.slice(0, 100), value: '5', emoji: s.ticket_icon || '🎟️' },
        { label: `10 ${s.ticket_name} (สุ่ม 10 รอบ)`.slice(0, 100), value: '10', emoji: s.ticket_icon || '🎟️' }
      )
  );
}

// -------------------- Ready / registration --------------------

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag} (ID: ${client.user.id})`);

  const guildId = process.env.GUILD_ID;
  try {
    if (guildId) {
      const guild = await client.guilds.fetch(guildId);
      await guild.commands.set(commands.map(c => c.toJSON()));
      console.log(`Slash commands synced to guild: ${guild.name}`);
    } else {
      await client.application.commands.set(commands.map(c => c.toJSON()));
      console.log('Global slash commands synced.');
    }
  } catch (err) {
    console.error('Slash command sync error:', err);
  }
});

// -------------------- Interaction handler --------------------

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (['topup_setting', 'topup_setup', 'store_setup', 'add_item', 'gacha_setup', 'gacha_start'].includes(interaction.commandName)) {
        if (!isAdmin(interaction)) return adminOnlyMessage(interaction);
      }

      // ===== TOPUP SETTING =====
      if (interaction.commandName === 'topup_setting') {
        const bankName = interaction.options.getString('bank_name');
        const accountType = interaction.options.getString('account_type');
        const accountNumber = interaction.options.getString('account_number');
        const adminChannel = interaction.options.getChannel('admin_channel');
        const slipChannel = interaction.options.getChannel('slip_channel');
        const qrLink = interaction.options.getString('qr_link') || '';

        db.topup_settings = {
          bank_name: bankName,
          account_type: accountType,
          account_number: accountNumber,
          qr_link: qrLink,
          admin_channel_id: adminChannel.id,
          slip_channel_id: slipChannel.id
        };

        return interaction.reply({
          content:
            `✅ บันทึกระบบเติมเงินเรียบร้อยแล้ว\n` +
            `🧾 ห้องแนบสลิป: ${slipChannel}\n` +
            `🔎 ห้องตรวจสอบ: ${adminChannel}\n` +
            `💱 เรท: 1 Coin = ${COIN_RATE.toFixed(2)} บาท\n` +
            `🔻 ขั้นต่ำ: ${MIN_TOPUP_BAHT.toFixed(2)} บาท`,
          ephemeral: true
        });
      }

      // ===== TOPUP SETUP =====
      if (interaction.commandName === 'topup_setup') {
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const channel = interaction.options.getChannel('channel');
        const buttonLabel = interaction.options.getString('button_label');
        const bannerUrl = interaction.options.getString('banner_url') || '';

        const embed = buildTopupEmbed({
          title,
          description,
          banner_url: bannerUrl
        });

        await channel.send({
          embeds: [embed],
          components: [buildTopupButton(buttonLabel)]
        });

        return interaction.reply({
          content: `✅ สร้างหน้าต่างเติมเงินที่ ${channel} เรียบร้อยแล้ว`,
          ephemeral: true
        });
      }

      // ===== STORE SETUP =====
      if (interaction.commandName === 'store_setup') {
        db.store_settings = {
          name: interaction.options.getString('store_name'),
          description: interaction.options.getString('description'),
          banner_url: interaction.options.getString('banner_url') || '',
          channel_id: interaction.options.getChannel('channel').id,
          message_id: null
        };

        await refreshStoreDisplay(interaction.guild);
        return interaction.reply({ content: '✅ ตั้งค่าร้านค้าเรียบร้อยแล้ว', ephemeral: true });
      }

      // ===== ADD ITEM =====
      if (interaction.commandName === 'add_item') {
        const type = interaction.options.getString('item_type');
        const price = interaction.options.getInteger('price');
        const name = interaction.options.getString('name');
        const emoji = interaction.options.getString('emoji');
        const role = interaction.options.getRole('role');

        if (type === 'role' && !role) {
          return interaction.reply({
            content: '❌ ถ้าเป็นสินค้าแบบยศ ต้องเลือกช่อง `role` ด้วย',
            ephemeral: true
          });
        }

        const newItem = {
          id: type === 'role' ? role.id : name,
          name: type === 'role' ? role.name : name,
          type,
          price,
          emoji
        };

        db.store_items.push(newItem);
        await refreshStoreDisplay(interaction.guild);

        return interaction.reply({
          content: `✅ เพิ่มสินค้า **${newItem.name}** ราคา ${price} Coins เรียบร้อยแล้ว`,
          ephemeral: true
        });
      }

      // ===== GACHA SETUP =====
      if (interaction.commandName === 'gacha_setup') {
        db.gacha_settings = {
          name: interaction.options.getString('box_name'),
          description: interaction.options.getString('description'),
          banner_url: interaction.options.getString('banner_url') || '',
          channel_id: interaction.options.getChannel('channel').id,
          button_label: interaction.options.getString('button_label'),
          ticket_name: interaction.options.getString('ticket_name'),
          ticket_icon: interaction.options.getString('ticket_icon')
        };

        return interaction.reply({
          content: '✅ บันทึกการตั้งค่าตู้กาชาเรียบร้อยแล้ว! ใช้ `/gacha_start` เพื่อสร้างตู้',
          ephemeral: true
        });
      }

      // ===== GACHA START =====
      if (interaction.commandName === 'gacha_start') {
        const s = db.gacha_settings;
        if (!s.channel_id) {
          return interaction.reply({
            content: '❌ กรุณาตั้งค่าตู้กาชาก่อนโดยใช้ `/gacha_setup`',
            ephemeral: true
          });
        }

        const channel = interaction.guild.channels.cache.get(s.channel_id);
        if (!channel) {
          return interaction.reply({ content: '❌ ไม่พบห้องสำหรับวางตู้กาชา', ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setTitle(`🎰 ${s.name}`)
          .setDescription(s.description)
          .setColor(0x9B59B6);

        if (s.banner_url) embed.setImage(s.banner_url);

        await channel.send({
          embeds: [embed],
          components: [buildGachaButton(s.button_label)]
        });

        return interaction.reply({
          content: `✅ สร้างตู้กาชาที่ ${channel} เรียบร้อยแล้ว`,
          ephemeral: true
        });
      }

      // ===== BACKPACK SLASH =====
      if (interaction.commandName === 'backpack') {
        const inv = getInventory(interaction.user.id);
        const coins = getCoins(interaction.user.id);

        let items = '';
        for (const [name, count] of inv.entries()) {
          if (count > 0) items += `- **${name}** : ${count}\n`;
        }

        const embed = new EmbedBuilder()
          .setTitle(`🎒 กระเป๋าของ ${interaction.user.displayName}`)
          .setColor(0xF1C40F)
          .addFields(
            { name: '🪙 Coins', value: `${coins.toLocaleString()} Coins`, inline: false },
            { name: '📦 ไอเท็มในกระเป๋า', value: items || 'ไม่มีไอเท็มในกระเป๋า', inline: false }
          );

        return interaction.reply({ embeds: [embed] });
      }

      // ===== BALANCE =====
      if (interaction.commandName === 'balance') {
        return interaction.reply(`🪙 คุณมี **${getCoins(interaction.user.id).toLocaleString()} Coins**`);
      }

      return;
    }

    // ===== TOPUP BUTTON =====
    if (interaction.isButton() && interaction.customId === 'topup_open') {
      if (!db.topup_settings.admin_channel_id || !db.topup_settings.slip_channel_id) {
        return interaction.reply({
          content: '❌ ระบบเติมเงินยังไม่ได้ตั้งค่า กรุณาแจ้งแอดมินใช้ `/topup_setting`',
          ephemeral: true
        });
      }

      return interaction.reply({
        content: 'กรุณาเลือกช่องทางการชำระเงิน:',
        components: [buildPaymentMethodMenu()],
        ephemeral: true
      });
    }

    // ===== PAYMENT METHOD =====
    if (interaction.isStringSelectMenu() && interaction.customId === 'topup_payment_method') {
      const paymentMethod = interaction.values[0];

      const embed = new EmbedBuilder()
        .setTitle('📄 รายละเอียดการชำระเงิน')
        .setDescription('กรุณากรอกจำนวน Coins ที่ต้องการเติมในข้อความนี้ เช่น `100`')
        .setColor(0x3498DB)
        .addFields(
          { name: '💱 เรท', value: `1 Coin = ${COIN_RATE.toFixed(2)} บาท`, inline: true },
          { name: '🔻 ขั้นต่ำ', value: `${MIN_TOPUP_BAHT.toFixed(2)} บาท`, inline: true },
          { name: '💳 ช่องทาง', value: `\`${paymentMethod}\``, inline: false },
          { name: '📌 ห้องแนบสลิป', value: channelMention(interaction.guild, db.topup_settings.slip_channel_id), inline: false }
        );

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`topup_amount:${paymentMethod}`)
          .setLabel('กรอกจำนวน Coins')
          .setEmoji('🪙')
          .setStyle(ButtonStyle.Primary)
      );

      return interaction.update({ embeds: [embed], components: [buttons] });
    }

    // ===== AMOUNT MODAL =====
    if (interaction.isButton() && interaction.customId.startsWith('topup_amount:')) {
      const paymentMethod = interaction.customId.slice('topup_amount:'.length);

      const modal = new ModalBuilder()
        .setCustomId(`topup_amount_modal:${paymentMethod}`)
        .setTitle('กรอกจำนวน Coins ที่ต้องการเติม');

      const amountInput = new TextInputBuilder()
        .setCustomId('coins_amount')
        .setLabel('จำนวน Coins')
        .setPlaceholder('เช่น 100')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(12);

      modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
      return interaction.showModal(modal);
    }

    // ===== AMOUNT MODAL SUBMIT =====
    if (interaction.isModalSubmit() && interaction.customId.startsWith('topup_amount_modal:')) {
      const paymentMethod = interaction.customId.slice('topup_amount_modal:'.length);
      const raw = interaction.fields.getTextInputValue('coins_amount').trim().replace(/,/g, '');
      const coins = Number(raw);

      if (!Number.isInteger(coins) || coins <= 0) {
        return interaction.reply({
          content: '❌ กรุณากรอกจำนวน Coins เป็นเลขจำนวนเต็มบวกเท่านั้น',
          ephemeral: true
        });
      }

      const amountBaht = coins * COIN_RATE;

      if (amountBaht < MIN_TOPUP_BAHT) {
        return interaction.reply({
          content:
            `❌ ยอดเติมขั้นต่ำคือ **${MIN_TOPUP_BAHT.toFixed(2)} บาท**\n` +
            `คุณกรอก **${coins.toLocaleString()} Coins** = **${money(amountBaht)} บาท** ซึ่งต่ำกว่าขั้นต่ำ`,
          ephemeral: true
        });
      }

      const settings = db.topup_settings;
      const slipChannel = interaction.guild.channels.cache.get(settings.slip_channel_id);

      db.pending_topups.set(interaction.user.id, {
        coins,
        amount_baht: amountBaht,
        payment_method: paymentMethod,
        guild_id: interaction.guild.id
      });

      const paymentEmbed = new EmbedBuilder()
        .setTitle('📄 รายละเอียดการชำระเงิน')
        .setDescription(
          `กรุณาโอนเงินตามยอด **${money(amountBaht)} บาท** แล้วแนบรูปสลิปที่ ${slipChannel || `<#${settings.slip_channel_id}>`}`
        )
        .setColor(0x3498DB)
        .addFields(
          { name: '🪙 จำนวน Coins ที่ต้องการเติม', value: `**${coins.toLocaleString()} Coins**`, inline: true },
          { name: '💵 ยอดเงินที่ต้องชำระ', value: `**${money(amountBaht)} บาท**`, inline: true },
          { name: '💱 เรท', value: `1 Coin = ${COIN_RATE.toFixed(2)} บาท`, inline: true },
          { name: '💳 ช่องทางการชำระ', value: `\`${paymentMethod}\``, inline: false },
          { name: '🏦 ชื่อบัญชี', value: settings.bank_name || '-', inline: true },
          { name: '🔢 หมายเลขบัญชี/เบอร์', value: `\`${settings.account_number || '-'}\``, inline: true },
          { name: '🧾 แนบสลิปที่', value: slipChannel ? slipChannel.toString() : `<#${settings.slip_channel_id}>`, inline: false }
        );

      if (paymentMethod === 'QR Code PromptPay' && settings.qr_link) {
        paymentEmbed.setImage(settings.qr_link);
      }

      return interaction.reply({ embeds: [paymentEmbed], ephemeral: true });
    }

    // ===== ADMIN APPROVE / REJECT =====
    if (interaction.isButton() && (interaction.customId.startsWith('topup_approve:') || interaction.customId.startsWith('topup_reject:'))) {
      if (!isAdmin(interaction)) return adminOnlyMessage(interaction);

      const [action, userId, coinsText, amountText] = interaction.customId.split(':');
      const coins = Number(coinsText);
      const amount = Number(amountText);

      if (!Number.isInteger(coins) || coins <= 0 || !Number.isFinite(amount)) {
        return interaction.reply({ content: '❌ ข้อมูลรายการเติมเงินไม่ถูกต้อง', ephemeral: true });
      }

      if (db.processed_topups.has(interaction.message.id)) {
        return interaction.reply({ content: '⚠️ รายการนี้ถูกดำเนินการไปแล้ว', ephemeral: true });
      }

      db.processed_topups.add(interaction.message.id);

      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`done:${interaction.message.id}`)
          .setLabel(action === 'topup_approve' ? 'อนุมัติแล้ว' : 'ยกเลิกแล้ว')
          .setEmoji(action === 'topup_approve' ? '✅' : '❌')
          .setStyle(action === 'topup_approve' ? ButtonStyle.Success : ButtonStyle.Danger)
          .setDisabled(true)
      );

      await interaction.update({ components: [disabledRow] });

      let user;
      try {
        user = await client.users.fetch(userId);
      } catch (_) {
        user = null;
      }

      if (action === 'topup_approve') {
        addCoins(userId, coins);

        const dm = new EmbedBuilder()
          .setTitle('🎉 เติมเงินสำเร็จ!')
          .setDescription(
            `ยอดเติมเงิน **${money(amount)} บาท** ได้รับการอนุมัติแล้ว\n` +
            `ได้รับ **+${coins.toLocaleString()} Coins** เข้ากระเป๋าเรียบร้อย!\n\n` +
            `🪙 ยอด Coins ปัจจุบัน: **${getCoins(userId).toLocaleString()} Coins**`
          )
          .setColor(0x57F287);

        if (user) await safeDM(user, dm);

        return interaction.followUp({
          content: `✅ อนุมัติการเติมเงิน **${coins.toLocaleString()} Coins** ให้ <@${userId}> เรียบร้อยแล้ว`,
          ephemeral: false
        });
      }

      const dm = new EmbedBuilder()
        .setTitle('❌ การเติมเงินถูกยกเลิก')
        .setDescription(
          `รายการเติมเงิน **${money(amount)} บาท** ของคุณไม่ผ่านการอนุมัติ\n` +
          `หากมีข้อสงสัยโปรดติดต่อแอดมิน`
        )
        .setColor(0xED4245);

      if (user) await safeDM(user, dm);

      return interaction.followUp({
        content: `❌ ปฏิเสธรายการเติมเงินของ <@${userId}> แล้ว`,
        ephemeral: false
      });
    }

    // ===== STORE BUY =====
    if (interaction.isStringSelectMenu() && interaction.customId === 'store_buy') {
      const idx = Number(interaction.values[0]);
      const item = db.store_items[idx];

      if (!item) {
        return interaction.reply({ content: '❌ ไม่พบสินค้านี้แล้ว', ephemeral: true });
      }

      const userId = interaction.user.id;
      const coins = getCoins(userId);

      if (coins < item.price) {
        return interaction.reply({
          content: `❌ คุณมี Coins ไม่พอ (ต้องการ ${item.price} Coins แต่คุณมี ${coins} Coins)`,
          ephemeral: true
        });
      }

      if (item.type === 'role') {
        const role = interaction.guild.roles.cache.get(item.id);
        if (!role) {
          return interaction.reply({ content: '❌ ไม่พบยศในเซิร์ฟเวอร์ จึงยังไม่หัก Coins', ephemeral: true });
        }

        try {
          await interaction.member.roles.add(role);
        } catch (_) {
          return interaction.reply({
            content: '❌ บอทไม่สามารถมอบยศนี้ได้ กรุณาตรวจสอบ Role Hierarchy และสิทธิ์ Manage Roles',
            ephemeral: true
          });
        }
      }

      // หัก Coins หลังจากผ่านเงื่อนไขทั้งหมดแล้ว
      setCoins(userId, coins - item.price);

      if (item.type === 'role') {
        return interaction.reply({
          content: `🎉 คุณได้ซื้อยศ <@&${item.id}> เรียบร้อยแล้ว! หัก ${item.price} Coins`,
          ephemeral: true
        });
      }

      addItem(userId, item.name, 1);
      return interaction.reply({
        content: `🎉 คุณได้รับไอเท็ม \`${item.name}\` เรียบร้อยแล้ว! หัก ${item.price} Coins`,
        ephemeral: true
      });
    }

    // ===== GACHA OPEN =====
    if (interaction.isButton() && interaction.customId === 'gacha_open') {
      if (!db.gacha_settings.ticket_name) {
        return interaction.reply({ content: '❌ ระบบกาชายังไม่ได้ตั้งค่า', ephemeral: true });
      }

      return interaction.reply({
        content: 'เลือกจำนวนรอบที่ต้องการสุ่ม:',
        components: [buildGachaRollMenu()],
        ephemeral: true
      });
    }

    // ===== GACHA ROLL =====
    if (interaction.isStringSelectMenu() && interaction.customId === 'gacha_roll') {
      const amount = Number(interaction.values[0]);
      const userId = interaction.user.id;
      const settings = db.gacha_settings;
      const ticketName = settings.ticket_name || 'Gacha Ticket';

      const inv = getInventory(userId);
      const tickets = inv.get(ticketName) || 0;

      if (tickets < amount) {
        return interaction.reply({
          content: `❌ คุณมี \`${ticketName}\` ไม่พอ (ต้องการ ${amount} ชิ้น แต่คุณมี ${tickets} ชิ้น)`,
          ephemeral: true
        });
      }

      inv.set(ticketName, tickets - amount);

      const rewardsPool = db.gacha_items.length
        ? db.gacha_items
        : [
            { name: 'Coins +100', icon: '🪙' },
            { name: 'Coins +500', icon: '💰' },
            { name: 'เกลือ (Salt)', icon: '🧂' },
            { name: 'ยศ VIP (1 วัน)', icon: '👑' }
          ];

      const summary = new Map();

      for (let i = 0; i < amount; i++) {
        const reward = rewardsPool[Math.floor(Math.random() * rewardsPool.length)];
        const itemStr = `${reward.icon} ${reward.name}`;
        summary.set(itemStr, (summary.get(itemStr) || 0) + 1);

        // รักษาพฤติกรรมเดิม: รางวัลทุกชนิดเข้ากระเป๋าเป็นไอเท็ม
        addItem(userId, reward.name, 1);
      }

      let rewardsText = '';
      for (const [name, count] of summary.entries()) {
        rewardsText += `- ${name} : ${count}\n`;
      }

      return interaction.reply({
        content:
          `คุณ ${interaction.user} ได้รับรางวัล GACHA แล้ว\n` +
          `**รางวัลที่ได้รับ**\n${rewardsText}\n` +
          `เช็ครางวัลในกระเป๋าโดย \`/backpack\` หรือ \`!backpack\``,
        ephemeral: true
      });
    }
  } catch (err) {
    console.error('Interaction error:', err);

    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: '❌ เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง',
          ephemeral: true
        });
      } catch (_) {}
    }
  }
});

// -------------------- Message listener --------------------
// 1) รับจำนวน Coins หลังจากสมาชิกกด "กรอกจำนวน Coins"
// 2) รับไฟล์รูปสลิปในห้อง slip_channel_id

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  try {
    const pending = db.pending_topups.get(message.author.id);

    // ===== แนบสลิป =====
    if (db.topup_settings.slip_channel_id && message.channel.id === db.topup_settings.slip_channel_id) {
      if (!pending || !Number.isInteger(pending.coins) || pending.coins <= 0) {
        return;
      }

      const image = message.attachments.find(a => {
        const type = a.contentType || '';
        return type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(a.name);
      });

      if (!image) {
        await message.reply('❌ กรุณาแนบ **รูปภาพสลิป** เช่น PNG, JPG หรือ WEBP');
        return;
      }

      const adminChannel = message.guild.channels.cache.get(db.topup_settings.admin_channel_id);
      if (!adminChannel || !adminChannel.isTextBased()) {
        await message.reply('❌ ไม่พบห้องตรวจสอบสลิปของแอดมิน กรุณาแจ้งแอดมิน');
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('📥 มีรายการแจ้งเติมเงินใหม่!')
        .setDescription('กรุณาตรวจสอบยอดเงินและสลิปก่อนกดอนุมัติ')
        .setColor(0xF1C40F)
        .addFields(
          { name: '👤 สมาชิก', value: `<@${message.author.id}>`, inline: true },
          { name: '🪙 จำนวน Coins', value: `**${pending.coins.toLocaleString()} Coins**`, inline: true },
          { name: '💵 ยอดเงิน', value: `**${money(pending.amount_baht)} บาท**`, inline: true },
          { name: '💳 ช่องทาง', value: pending.payment_method || '-', inline: true },
          { name: '📎 ไฟล์สลิป', value: `[เปิดรูปสลิป](${image.url})`, inline: true }
        )
        .setImage(image.url)
        .setFooter({ text: `User ID: ${message.author.id} • Slip: ${image.name}` });

      await adminChannel.send({
        embeds: [embed],
        components: [buildAdminTopupButtons(message.author.id, pending.coins, pending.amount_baht)]
      });

      // ลบ pending หลังส่งเข้าห้องแอดมิน เพื่อไม่ให้สลิปซ้ำ
      db.pending_topups.delete(message.author.id);

      await message.reply(
        '✅ ส่งสลิปเรียบร้อยแล้ว!\n' +
        '📨 ระบบส่งสลิปให้แอดมินตรวจสอบแล้ว\n' +
        '⏳ เมื่อแอดมินอนุมัติ Coins จะเข้าสู่บัญชีของคุณอัตโนมัติ'
      );
      return;
    }

    // ===== !backpack เดิม =====
    if (message.content.trim() === '!backpack') {
      const inv = getInventory(message.author.id);
      const coins = getCoins(message.author.id);

      let items = '';
      for (const [name, count] of inv.entries()) {
        if (count > 0) items += `- **${name}** : ${count}\n`;
      }

      const embed = new EmbedBuilder()
        .setTitle(`🎒 กระเป๋าของ ${message.member?.displayName || message.author.username}`)
        .setColor(0xF1C40F)
        .addFields(
          { name: '🪙 Coins', value: `${coins.toLocaleString()} Coins`, inline: false },
          { name: '📦 ไอเท็มในกระเป๋า', value: items || 'ไม่มีไอเท็มในกระเป๋า', inline: false }
        );

      await message.channel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error('messageCreate error:', err);
  }
});

// -------------------- Login --------------------

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('❌ ไม่พบ DISCORD_TOKEN ใน Railway Environment Variables');
  process.exit(1);
}

client.login(token).catch(err => {
  console.error('❌ Discord login failed:', err);
  process.exit(1);
});
