const { 
    Client, GatewayIntentBits, Partials, REST, Routes, 
    SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, 
    ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, 
    EmbedBuilder 
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User]
});

const db = {
    paymentAccounts: { wallet: '-', bank: '-', qrcode: '-' },
    shopItems: [],
    gachaItems: [],
    users: {}
};

function getUser(userId) {
    if (!db.users[userId]) {
        db.users[userId] = { coins: 100, salt: 0, bag: [] };
    }
    return db.users[userId];
}

// เหลือคำสั่งหลักๆ ให้ใช้งานง่าย ไม่ต้องพิมพ์หลายคำสั่ง
const commands = [
    new SlashCommandBuilder().setName('setpayment').setDescription('ตั้งค่าบัญชีและส่งระบบเติมเงินไปยังห้องที่ระบุทันทีในคำสั่งเดียว'),
    new SlashCommandBuilder().setName('shopsetup').setDescription('ตั้งค่าและส่งร้านค้าไปยังห้องที่ระบุทันที'),
    new SlashCommandBuilder().setName('storeadd').setDescription('เพิ่มสินค้าในร้านค้า'),
    new SlashCommandBuilder().setName('gift').setDescription('เปิดเมนูแลกรางวัลด้วยเกลือ'),
    new SlashCommandBuilder().setName('gachasetup').setDescription('ตั้งค่าและส่งตู้กาชาไปยังห้องที่ระบุทันที'),
    new SlashCommandBuilder().setName('gachaadd').setDescription('เพิ่มของรางวัลในตู้กาชา')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user.tag}`);
    try {
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );
        console.log('Successfully registered all Slash Commands.');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        // คำสั่งเดียวจบ: ตั้งค่าบัญชี + ตั้งค่าข้อความ + ส่งไปห้องเติมเงินทันที
        if (commandName === 'setpayment') {
            const modal = new ModalBuilder().setCustomId('modal_setpayment').setTitle('ตั้งค่าระบบเติมเงินและบัญชี');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('wallet_info').setLabel('TrueMoney (ชื่อ | เลขบัญชี)').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('bank_info').setLabel('ธนาคาร (ชื่อธนาคาร|ชื่อ|เลข)').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('qr_link').setLabel('ลิงค์รูป QR Code ชำระเงิน').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('room_id').setLabel('ID ห้องเติมเงินที่จะให้ส่งไป').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('banner').setLabel('ลิงค์ Banner ตกแต่ง').setStyle(TextInputStyle.Short).setRequired(true))
            );
            await interaction.showModal(modal);
        }
        else if (commandName === 'shopsetup') {
            const modal = new ModalBuilder().setCustomId('modal_shopsetup').setTitle('ตั้งค่าและส่งร้านค้าทันที');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('ชื่อร้านค้า (ใส่อิโมจิได้)').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('รายละเอียดร้านค้า').setStyle(TextInputStyle.Paragraph).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('room').setLabel('ID ห้องร้านค้า').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('btn_name').setLabel('ชื่อปุ่มซื้อสินค้า').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('banner').setLabel('ลิงค์ Banner ตกแต่ง').setStyle(TextInputStyle.Short).setRequired(true))
            );
            await interaction.showModal(modal);
        }
        else if (commandName === 'storeadd') {
            const modal = new ModalBuilder().setCustomId('modal_storeadd').setTitle('เพิ่มสินค้าในร้าน');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('ชื่อ ITEM หรือ ยศ').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('รายละเอียดสินค้า').setStyle(TextInputStyle.Paragraph).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('type').setLabel('ประเภท (role หรือ item)').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('ราคาสินค้า (Coins)').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('stock').setLabel('จำนวนสินค้า').setStyle(TextInputStyle.Short).setRequired(true))
            );
            await interaction.showModal(modal);
        }
        else if (commandName === 'gift') {
            const modal = new ModalBuilder().setCustomId('modal_gift_btn').setTitle('ตั้งชื่อปุ่มแลกรางวัล');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('btn_name').setLabel('ชื่อปุ่มแลกรางวัล').setStyle(TextInputStyle.Short).setRequired(true))
            );
            await interaction.showModal(modal);
        }
        else if (commandName === 'gachasetup') {
            const modal = new ModalBuilder().setCustomId('modal_gacha').setTitle('ตั้งค่าและส่งตู้กาชาทันที');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('ชื่อตู้กาชา').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('รายละเอียดตู้').setStyle(TextInputStyle.Paragraph).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('room').setLabel('ID ช่องกาชา').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('banner').setLabel('ลิงค์ Banner ตู้').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ticket').setLabel('ชื่อตั๋วกาชา').setStyle(TextInputStyle.Short).setRequired(true))
            );
            await interaction.showModal(modal);
        }
        else if (commandName === 'gachaadd') {
            const modal = new ModalBuilder().setCustomId('modal_gacha_add').setTitle('เพิ่มของรางวัลในตู้กาชา');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('ชื่อรางวัล').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('count').setLabel('จำนวน (-1 สำหรับไม่จำกัด)').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('chance').setLabel('โอกาสออก (%) เช่น 2.98').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('type').setLabel('ประเภท (role หรือ item)').setStyle(TextInputStyle.Short).setRequired(true))
            );
            await interaction.showModal(modal);
        }
    }
    else if (interaction.isModalSubmit()) {
        // เมื่อกรอกฟอร์มตั้งค่าเติมเงินเสร็จ ส่งข้อความไปห้องนั้นทันที
        if (interaction.customId === 'modal_setpayment') {
            db.paymentAccounts.wallet = interaction.fields.getTextInputValue('wallet_info');
            db.paymentAccounts.bank = interaction.fields.getTextInputValue('bank_info');
            db.paymentAccounts.qrcode = interaction.fields.getTextInputValue('qr_link');
            
            const roomId = interaction.fields.getTextInputValue('room_id');
            const banner = interaction.fields.getTextInputValue('banner');

            const channel = await client.channels.fetch(roomId).catch(() => null);
            if (channel) {
                const embed = new EmbedBuilder()
                    .setTitle('💳 ระบบเติมเงินอัตโนมัติ')
                    .setDescription('กดปุ่มด้านล่างเพื่อเลือกช่องทางชำระเงินและดูรายละเอียดการเติมเงิน')
                    .setImage(banner)
                    .setColor('Gold');
                
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_topup').setLabel('เติมเงิน').setStyle(ButtonStyle.Success).setEmoji('💳')
                );
                
                await channel.send({ embeds: [embed], components: [row] });
                await interaction.reply({ content: `✅ บันทึกบัญชีและส่งระบบเติมเงินไปที่ห้อง <#${roomId}> เรียบร้อยแล้ว!`, ephemeral: true });
            } else {
                await interaction.reply({ content: `❌ หา ID ห้อง ${roomId} ไม่พบ กรุณาตรวจสอบ ID อีกครั้ง`, ephemeral: true });
            }
        }
        else if (interaction.customId === 'modal_shopsetup') {
            const name = interaction.fields.getTextInputValue('name');
            const desc = interaction.fields.getTextInputValue('desc');
            const room = interaction.fields.getTextInputValue('room');
            const btnName = interaction.fields.getTextInputValue('btn_name');
            const banner = interaction.fields.getTextInputValue('banner');

            const channel = await client.channels.fetch(room).catch(() => null);
            if (channel) {
                const embed = new EmbedBuilder().setTitle(name).setDescription(desc).setImage(banner).setColor('Blue');
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_buyshop').setLabel(btnName).setStyle(ButtonStyle.Primary).setEmoji('🛒'),
                    new ButtonBuilder().setCustomId('btn_giftshop').setLabel('แลกรางวัล (เกลือ)').setStyle(ButtonStyle.Secondary).setEmoji('🎁')
                );
                await channel.send({ embeds: [embed], components: [row] });
                await interaction.reply({ content: `✅ ส่งระบบร้านค้าไปที่ห้อง <#${room}> เรียบร้อยแล้ว!`, ephemeral: true });
            } else {
                await interaction.reply({ content: `❌ หา ID ห้อง ${room} ไม่พบ`, ephemeral: true });
            }
        }
        else if (interaction.customId === 'modal_storeadd') {
            db.shopItems.push({
                name: interaction.fields.getTextInputValue('name'),
                desc: interaction.fields.getTextInputValue('desc'),
                type: interaction.fields.getTextInputValue('type'),
                price: parseInt(interaction.fields.getTextInputValue('price')),
                stock: parseInt(interaction.fields.getTextInputValue('stock'))
            });
            await interaction.reply({ content: '✅ เพิ่มสินค้าเข้าร้านค้าเรียบร้อย!', ephemeral: true });
        }
        else if (interaction.customId === 'modal_gacha') {
            const name = interaction.fields.getTextInputValue('name');
            const desc = interaction.fields.getTextInputValue('desc');
            const room = interaction.fields.getTextInputValue('room');
            const banner = interaction.fields.getTextInputValue('banner');

            const channel = await client.channels.fetch(room).catch(() => null);
            if (channel) {
                const embed = new EmbedBuilder().setTitle(name).setDescription(desc).setImage(banner).setColor('Purple');
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_gacha_spin').setLabel('สุ่มกาชา').setStyle(ButtonStyle.Success).setEmoji('🎰')
                );
                await channel.send({ embeds: [embed], components: [row] });
                await interaction.reply({ content: `✅ ส่งตู้กาชาไปที่ห้อง <#${room}> เรียบร้อยแล้ว!`, ephemeral: true });
            } else {
                await interaction.reply({ content: `❌ หา ID ห้อง ${room} ไม่พบ`, ephemeral: true });
            }
        }
        else if (interaction.customId === 'modal_gacha_add') {
            db.gachaItems.push({
                name: interaction.fields.getTextInputValue('name'),
                count: interaction.fields.getTextInputValue('count'),
                chance: parseFloat(interaction.fields.getTextInputValue('chance')),
                type: interaction.fields.getTextInputValue('type')
            });
            await interaction.reply({ content: '✅ เพิ่มของรางวัลเข้าตู้กาชาเรียบร้อย!', ephemeral: true });
        }
    }
    // เมื่อกดปุ่มเติมเงิน แสดง Dropdown ช่องทางชำระเงิน
    else if (interaction.isButton() && interaction.customId === 'btn_topup') {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_pay_channel')
            .setPlaceholder('เลือกช่องทางชำระเงิน')
            .addOptions([
                { label: 'TrueMoney Wallet', value: 'wallet', description: 'ชำระผ่านทรูมันนี่วอลเล็ท' },
                { label: 'บัญชีธนาคาร', value: 'bank', description: 'โอนผ่านบัญชีธนาคาร' },
                { label: 'QR Code ชำระเงิน', value: 'qrcode', description: 'สแกน QR Code เพื่อจ่ายเงิน' }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.reply({ 
            content: '💰 **เลือกช่องทางชำระเงินด้านล่าง:**', 
            components: [row], 
            ephemeral: true 
        });
    }
    // เมื่อเลือกช่องทางชำระเงิน แสดงข้อมูลบัญชีและเรทราคา
    else if (interaction.isStringSelectMenu() && interaction.customId === 'select_pay_channel') {
        const choice = interaction.values[0];
        let detailText = '';

        if (choice === 'wallet') {
            detailText = `**ช่องทาง: TrueMoney Wallet**\nข้อมูลบัญชี: \`${db.paymentAccounts.wallet}\``;
        } else if (choice === 'bank') {
            detailText = `**ช่องทาง: บัญชีธนาคาร**\nข้อมูลบัญชี: \`${db.paymentAccounts.bank}\``;
        } else if (choice === 'qrcode') {
            detailText = `**ช่องทาง: QR Code ชำระเงิน**\nลิงก์รูปภาพ: ${db.paymentAccounts.qrcode}`;
        }

        const rateText = 
            `\n\n📌 **จำนวนราคาเติมเงิน:**\n` +
            `• 10 Coins = 8.60 บาท\n` +
            `• 50 Coins = 43.00 บาท\n` +
            `• 115 Coins = 98.90 บาท\n` +
            `• 510 Coins = 438.60 บาท\n` +
            `• 1,150 Coins = 989.00 บาท`;

        await interaction.update({ 
            content: `${detailText}\n${rateText}`, 
            components: [], 
            ephemeral: true 
        });
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.content === '!bagpak') {
        const user = getUser(message.author.id);
        const embed = new EmbedBuilder()
            .setTitle(`🎒 กระเป๋าของ ${message.author.username}`)
            .setDescription(`🪙 Coins: **${user.coins}**\n🧂 เกลือสะสม: **${user.salt}**`)
            .addFields({ name: '📦 ไอเท็ม/ยศในกระเป๋า', value: user.bag.length > 0 ? user.bag.join('\n') : 'ไม่มีไอเท็มในกระเป๋า' })
            .setColor('Green');
        message.reply({ embeds: [embed] });
    }

    if (message.content === '!setup') {
        const embed = new EmbedBuilder()
            .setTitle('📜 คู่มือการใช้งานคำสั่งทั้งหมดของบอท')
            .addFields(
                { name: '/setpayment', value: 'ตั้งค่าบัญชีและส่งระบบเติมเงินไปยังห้องที่ระบุทันที' },
                { name: '/shopsetup', value: 'ตั้งค่าและส่งระบบร้านค้าไปยังห้องที่ระบุทันที' },
                { name: '/storeadd', value: 'เพิ่มสินค้าเข้าร้านค้า' },
                { name: '/gift', value: 'ตั้งชื่อปุ่มแลกรางวัล' },
                { name: '/gachasetup', value: 'ตั้งค่าและส่งตู้กาชาไปยังห้องที่ระบุทันที' },
                { name: '/gachaadd', value: 'เพิ่มของรางวัลเข้าตู้กาชา' },
                { name: '!bagpak', value: 'ตรวจสอบกระเป๋า' }
            )
            .setColor('Blue');
        message.reply({ embeds: [embed] });
    }
});

client.login(process.env.TOKEN);
