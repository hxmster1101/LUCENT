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

// Database จำลองในหน่วยความจำ
const db = {
    payment: {},
    storeConfig: {},
    items: [],
    gachaConfig: {},
    gachaItems: [],
    users: {} // เก็บ Coins, กระเป๋า, เกลือ
};

// ฟังก์ชันดึงข้อมูลผู้ใช้
function getUserData(userId) {
    if (!db.users[userId]) {
        db.users[userId] = { coins: 0, bag: [], salt: 0 };
    }
    return db.users[userId];
}

// ลงทะเบียน Slash Commands
const commands = [
    new SlashCommandBuilder().setName('pymentsetting').setDescription('ตั้งค่าระบบเติมเงิน'),
    new SlashCommandBuilder().setName('gift').setDescription('เปิดเมนูแลกรางวัลด้วยเกลือ'),
    new SlashCommandBuilder().setName('storeadd').setDescription('เพิ่มสินค้าในร้านค้า'),
    new SlashCommandBuilder().setName('gachasetup').setDescription('ตั้งค่าตู้กาชา'),
    new SlashCommandBuilder().setName('gachastart').setDescription('เริ่มเปิดใช้งานตู้กาชา'),
    new SlashCommandBuilder().setName('setup').setDescription('แสดงคู่มือและคำสั่งทั้งหมดของบอท')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user.tag}`);
    try {
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );
        console.log('Successfully registered application commands.');
    } catch (error) {
        console.error(error);
    }
});

// จัดการการใช้งานคำสั่งและปุ่ม
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'pymentsetting') {
            const modal = new ModalBuilder().setCustomId('modal_payment').setTitle('ตั้งค่าระบบเติมเงิน');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('หัวข้อการชำระเงิน').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('รายละเอียด').setStyle(TextInputStyle.Paragraph).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('room_id').setLabel('ID ห้องเติมเงิน').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('slip_room_id').setLabel('ID ห้องแนบสลิป').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('banner').setLabel('ลิงค์ Banner ตกแต่ง').setStyle(TextInputStyle.Short).setRequired(true))
            );
            await interaction.showModal(modal);
        } 
        else if (commandName === 'storeadd') {
            const modal = new ModalBuilder().setCustomId('modal_storeadd').setTitle('เพิ่มสินค้าในร้านค้า');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('ชื่อ ITEM หรือ ยศ').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('รายละเอียดสินค้า').setStyle(TextInputStyle.Paragraph).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('type').setLabel('ประเภท (role หรือ item)').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('ราคาสินค้า (Coins)').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('stock').setLabel('จำนวนสินค้า').setStyle(TextInputStyle.Short).setRequired(true))
            );
            await interaction.showModal(modal);
        }
        else if (commandName === 'gachasetup') {
            const modal = new ModalBuilder().setCustomId('modal_gachasetup').setTitle('ตั้งค่าตู้กาชา');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('ชื่อตู้กาชา').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('รายละเอียด').setStyle(TextInputStyle.Paragraph).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('room').setLabel('ID ช่องกาชา').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('banner').setLabel('ลิงค์ Banner').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ticket_name').setLabel('ชื่อตั๋วกาชา').setStyle(TextInputStyle.Short).setRequired(true))
            );
            await interaction.showModal(modal);
        }
        else if (commandName === 'gachastart') {
            await interaction.reply({ content: 'สร้างตู้กาชาเรียบร้อยแล้ว!', ephemeral: true });
        }
        else if (commandName === 'gift') {
            await interaction.reply({ content: 'ระบบแลกรางวัลด้วยเกลือ เปิดใช้งานแล้ว', ephemeral: true });
        }
        else if (commandName === 'setup') {
            const embed = new EmbedBuilder()
                .setTitle('คู่มือการใช้งานบอททั้งหมด')
                .setDescription('รายการคำสั่งทั้งหมดที่สามารถใช้งานได้:')
                .addFields(
                    { name: '/pymentsetting', value: 'ตั้งค่าฟอร์มและช่องทางการเติมเงิน' },
                    { name: '/storeadd', value: 'เพิ่มสินค้าประเภท ยศ หรือ ไอเท็ม เข้าร้านค้า' },
                    { name: '/gachasetup', value: 'ตั้งค่าระบบตู้กาชา' },
                    { name: '/gachastart', value: 'เริ่มต้นเปิดใช้งานตู้กาชา' },
                    { name: '/gift', value: 'เปิดเมนูแลกรางวัลด้วยเกลือ' },
                    { name: '!bagpak', value: 'ตรวจสอบสิ่งของและ Coins ในกระเป๋าของคุณ' },
                    { name: '!addgift', value: 'เพิ่มรางวัลหน้าร้านค้าประเภทแลกด้วยเกลือ' }
                )
                .setColor('Blue');
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    } else if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_payment') {
            await interaction.reply({ content: 'ตั้งค่าระบบเติมเงินเรียบร้อยแล้ว!', ephemeral: true });
        } else if (interaction.customId === 'modal_storeadd') {
            db.items.push({
                name: interaction.fields.getTextInputValue('name'),
                desc: interaction.fields.getTextInputValue('desc'),
                type: interaction.fields.getTextInputValue('type'),
                price: parseInt(interaction.fields.getTextInputValue('price')),
                stock: parseInt(interaction.fields.getTextInputValue('stock'))
            });
            await interaction.reply({ content: 'เพิ่มสินค้าหน้าร้านสำเร็จ!', ephemeral: true });
        }
    }
});

// จัดการข้อความทั่วไปสำหรับคำสั่ง Prefix (!bagpak, !addgift)
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.content === '!bagpak') {
        const userData = getUserData(message.author.id);
        const embed = new EmbedBuilder()
            .setTitle(`กระเป๋าของ ${message.author.username}`)
            .setDescription(`🪙 Coins: **${userData.coins}**\n🧂 เกลือสะสม: **${userData.salt}**`)
            .addFields({ name: 'ไอเท็มในกระเป๋า', value: userData.bag.length > 0 ? userData.bag.join('\n') : 'ไม่มีไอเท็มในกระเป๋า' })
            .setColor('Green');
        message.reply({ embeds: [embed] });
    }

    if (message.content === '!addgift') {
        message.reply('กรุณาใช้ฟอร์มระบบแอดมินเพื่อเพิ่มรางวัลแลกด้วยเกลือ');
    }
});

client.login(process.env.TOKEN);
