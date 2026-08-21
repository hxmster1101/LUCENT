const {
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  SlashCommandBuilder,
} = require("discord.js");

/*
LUCENT - Coin Activity Module

เพิ่มระบบ:
1. /addcoins
2. ออนไลน์ในห้องเสียงรับ Coins

วิธีเชื่อมกับ index.js:

const { installCoinActivity } = require("./coin_activity");
installCoinActivity(client, { getCoins, addCoins });

Railway:
VOICE_REWARD_CATEGORY_ID=ID หมวดหมู่ห้องเสียง
*/

const REWARD_INTERVAL_MS = 10 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

function installCoinActivity(client, wallet) {
  if (
    !client ||
    typeof wallet?.getCoins !== "function" ||
    typeof wallet?.addCoins !== "function"
  ) {
    throw new Error(
      "coin_activity: ต้องส่ง client + getCoins + addCoins จาก index.js"
    );
  }

  const sessions = new Map();

  const command = new SlashCommandBuilder()
    .setName("addcoins")
    .setDescription("เสก Coins ให้สมาชิก")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator.toString()
    );

  function isAdmin(interaction) {
    return interaction.memberPermissions?.has(
      PermissionFlagsBits.Administrator
    );
  }

  function getCategoryId() {
    return process.env.VOICE_REWARD_CATEGORY_ID?.trim() || "";
  }

  function isRewardVoice(channel) {
    const categoryId = getCategoryId();

    if (!categoryId || !channel) return false;

    return (
      channel.type === 2 &&
      channel.parentId === categoryId
    );
  }

  function formatDuration(ms) {
    const totalSeconds = Math.max(
      0,
      Math.floor(ms / 1000)
    );

    const hours = Math.floor(totalSeconds / 3600);

    const minutes = Math.floor(
      (totalSeconds % 3600) / 60
    );

    const seconds = totalSeconds % 60;

    return [
      hours,
      minutes,
      seconds,
    ]
      .map((n) => String(n).padStart(2, "0"))
      .join(":");
  }

  function getNextRewardTime(startedAt) {
    const elapsed = Date.now() - startedAt;

    const next =
      Math.floor(elapsed / REWARD_INTERVAL_MS) + 1;

    return startedAt + next * REWARD_INTERVAL_MS;
  }

  function createOnlineEmbed(session) {
    const elapsed =
      Date.now() - session.startedAt;

    const nextRewardAt =
      getNextRewardTime(session.startedAt);

    const remaining = Math.max(
      0,
      nextRewardAt - Date.now()
    );

    const completedMinutes =
      Math.floor(
        elapsed / REWARD_INTERVAL_MS
      );

    const nextReward =
      completedMinutes + 1 === 6
        ? "50 Coins"
        : "สุ่ม 1–10 Coins";

    return new EmbedBuilder()
      .setTitle(
        "🟢 สถานะการใช้งาน : ออนไลน์"
      )
      .setColor(0x57f287)
      .addFields(
        {
          name: "⏱️ เริ่มจับเวลาออนไลน์",
          value: formatDuration(elapsed),
          inline: false,
        },
        {
          name: "🪙 จะได้รับเหรียญในอีก",
          value: formatDuration(remaining),
          inline: true,
        },
        {
          name: "🎁 รางวัลรอบถัดไป",
          value: nextReward,
          inline: true,
        },
        {
          name: "💰 Coins ปัจจุบัน",
          value:
            `${wallet
              .getCoins(session.userId)
              .toLocaleString()} Coins`,
          inline: false,
        }
      )
      .setFooter({
        text:
          "ออกจากห้องเสียงแล้วระบบจะหยุดจับเวลา",
      });
  }

  async function updateOnlineDM(session) {
    try {
      const user = await client.users.fetch(
        session.userId
      );

      const embed =
        createOnlineEmbed(session);

      if (!session.dmMessage) {
        session.dmMessage =
          await user.send({
            embeds: [embed],
          });
      } else {
        await session.dmMessage.edit({
          embeds: [embed],
        });
      }
    } catch (error) {
      /*
      ถ้าผู้ใช้ปิด DM
      ระบบยังทำงานต่อได้ตามปกติ
      */
    }
  }

  async function sendRewardDM(
    session,
    reward,
    isHourReward
  ) {
    try {
      const user =
        await client.users.fetch(
          session.userId
        );

      const elapsed =
        Date.now() - session.startedAt;

      const embed =
        new EmbedBuilder()
          .setTitle(
            "🎉 ได้รับ Coins จากการออนไลน์"
          )
          .setColor(0xf1c40f)
          .setDescription(
            `คุณได้ออนไลน์ไปแล้ว : **${formatDuration(
              elapsed
            )}**\n` +
            `เหรียญที่ได้รับ : **+${reward} Coins**\n` +
            `เหรียญคงเหลือ : **${wallet
              .getCoins(session.userId)
              .toLocaleString()} Coins**`
          );

      if (isHourReward) {
        embed.addFields({
          name:
            "⭐ รางวัลครบ 1 ชั่วโมง",
          value:
            "ได้รับรางวัลพิเศษ **50 Coins**",
        });
      }

      await user.send({
        embeds: [embed],
      });
    } catch (error) {
      /*
      ถ้าผู้ใช้ปิด DM
      ไม่ทำให้ระบบหลักพัง
      */
    }
  }

  function stopSession(userId) {
    const session =
      sessions.get(userId);

    if (!session) return;

    if (session.rewardTimer) {
      clearInterval(
        session.rewardTimer
      );
    }

    if (session.updateTimer) {
      clearInterval(
        session.updateTimer
      );
    }

    sessions.delete(userId);
  }

  function startSession(member) {
    const userId = member.id;

    if (sessions.has(userId)) {
      return;
    }

    const session = {
      userId: userId,
      guildId: member.guild.id,
      channelId: member.voice.channelId,
      startedAt: Date.now(),
      rewardedIntervals: 0,
      dmMessage: null,
      rewardTimer: null,
      updateTimer: null,
    };

    sessions.set(
      userId,
      session
    );

    /*
    DM ทันทีเมื่อเข้า Voice
    */
    updateOnlineDM(session);

    /*
    อัปเดตเวลาใน DM ทุก 30 วินาที
    */
    session.updateTimer =
      setInterval(
        async () => {
          const current =
            sessions.get(userId);

          if (!current) return;

          const guild =
            client.guilds.cache.get(
              current.guildId
            );

          const memberNow =
            guild?.members.cache.get(
              userId
            );

          if (
            !memberNow ||
            !isRewardVoice(
              memberNow.voice.channel
            )
          ) {
            stopSession(userId);
            return;
          }

          current.channelId =
            memberNow.voice.channelId;

          await updateOnlineDM(
            current
          );
        },
        30 * 1000
      );

    /*
    ตรวจรางวัลทุก 15 วินาที
    */
    session.rewardTimer =
      setInterval(
        async () => {
          const current =
            sessions.get(userId);

          if (!current) return;

          const guild =
            client.guilds.cache.get(
              current.guildId
            );

          const memberNow =
            guild?.members.cache.get(
              userId
            );

          if (
            !memberNow ||
            !isRewardVoice(
              memberNow.voice.channel
            )
          ) {
            stopSession(userId);
            return;
          }

          const elapsed =
            Date.now() -
            current.startedAt;

          const completedIntervals =
            Math.floor(
              elapsed /
                REWARD_INTERVAL_MS
            );

          if (
            completedIntervals <=
            current.rewardedIntervals
          ) {
            return;
          }

          /*
          กรณี timer ช้า
          ให้จ่ายเฉพาะรอบที่เพิ่งถึง
          */

          current.rewardedIntervals =
            completedIntervals;

          /*
          ครบ 1 ชั่วโมง
          */
          if (
            completedIntervals >= 6 &&
            !current.hourRewarded
          ) {
            current.hourRewarded =
              true;

            wallet.addCoins(
              userId,
              50
            );

            await sendRewardDM(
              current,
              50,
              true
            );

            await updateOnlineDM(
              current
            );

            return;
          }

          /*
          ก่อนครบ 1 ชั่วโมง
          สุ่ม 1-10 Coins
          */

          const reward =
            Math.floor(
              Math.random() * 10
            ) + 1;

          wallet.addCoins(
            userId,
            reward
          );

          await sendRewardDM(
            current,
            reward,
            false
          );

          await updateOnlineDM(
            current
          );
        },
        15 * 1000
      );
  }

  /*
  Sync /addcoins
  */
  client.once(
    "ready",
    async () => {
      try {
        const guildId =
          process.env.GUILD_ID?.trim();

        if (guildId) {
          const guild =
            await client.guilds.fetch(
              guildId
            );

          const commands =
            await guild.commands.fetch();

          const existing =
            commands.filter(
              (command) =>
                command.name !==
                "addcoins"
            );

          await guild.commands.set([
            ...existing.map((command) =>
              command.toJSON()
            ),
            command.toJSON(),
          ]);

          console.log(
            "✅ /addcoins synced"
          );
        } else {
          console.log(
            "⚠️ ไม่พบ GUILD_ID"
          );
        }

        console.log(
          "🪙 Coin Activity System Loaded"
        );

        console.log(
          "🎙️ Voice Category:",
          getCategoryId() ||
            "ไม่ได้ตั้งค่า"
        );
      } catch (error) {
        console.error(
          "❌ Coin Activity Sync Error:",
          error
        );
      }
    }
  );

  /*
  /addcoins
  */
  client.on(
    "interactionCreate",
    async (interaction) => {
      try {
        if (
          !interaction.isChatInputCommand()
        ) {
          return;
        }

        if (
          interaction.commandName !==
          "addcoins"
        ) {
          return;
        }

        if (!isAdmin(interaction)) {
          return interaction.reply({
            content:
              "❌ คำสั่งนี้ใช้ได้เฉพาะ Administrator",
            ephemeral: true,
          });
        }

        const modal =
          new ModalBuilder()
            .setCustomId(
              "coin_activity_addcoins"
            )
            .setTitle(
              "🪙 เสก Coins"
            );

        const userId =
          new TextInputBuilder()
            .setCustomId(
              "target_user_id"
            )
            .setLabel(
              "ID ผู้ใช้"
            )
            .setPlaceholder(
              "เช่น 123456789012345678"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(true);

        const amount =
          new TextInputBuilder()
            .setCustomId(
              "coin_amount"
            )
            .setLabel(
              "จำนวน Coins ที่จะให้"
            )
            .setPlaceholder(
              "เช่น 100"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setRequired(true);

        const reason =
          new TextInputBuilder()
            .setCustomId(
              "coin_reason"
            )
            .setLabel(
              "เหตุผลที่ให้"
            )
            .setPlaceholder(
              "เช่น รางวัลกิจกรรม"
            )
            .setStyle(
              TextInputStyle.Paragraph
            )
            .setRequired(true)
            .setMaxLength(500);

        modal.addComponents(
          new ActionRowBuilder()
            .addComponents(
              userId
            ),

          new ActionRowBuilder()
            .addComponents(
              amount
            ),

          new ActionRowBuilder()
            .addComponents(
              reason
            )
        );

        await interaction.showModal(
          modal
        );
      } catch (error) {
        console.error(
          "❌ /addcoins Error:",
          error
        );
      }
    }
  );

  /*
  รับข้อมูลจาก Modal /addcoins
  */
  client.on(
    "interactionCreate",
    async (interaction) => {
      try {
        if (
          !interaction.isModalSubmit()
        ) {
          return;
        }

        if (
          interaction.customId !==
          "coin_activity_addcoins"
        ) {
          return;
        }

        if (!isAdmin(interaction)) {
          return interaction.reply({
            content:
              "❌ ไม่มีสิทธิ์ใช้คำสั่งนี้",
            ephemeral: true,
          });
        }

        const targetId =
          interaction.fields
            .getTextInputValue(
              "target_user_id"
            )
            .trim();

        const amount =
          Number(
            interaction.fields
              .getTextInputValue(
                "coin_amount"
              )
              .trim()
              .replace(/,/g, "")
          );

        const reason =
          interaction.fields
            .getTextInputValue(
              "coin_reason"
            )
            .trim();

        if (
          !/^\d{17,25}$/.test(
            targetId
          )
        ) {
          return interaction.reply({
            content:
              "❌ ID ผู้ใช้ไม่ถูกต้อง",
            ephemeral: true,
          });
        }

        if (
          !Number.isInteger(
            amount
          ) ||
          amount <= 0
        ) {
          return interaction.reply({
            content:
              "❌ จำนวน Coins ต้องเป็นจำนวนเต็มมากกว่า 0",
            ephemeral: true,
          });
        }

        if (!reason) {
          return interaction.reply({
            content:
              "❌ กรุณาระบุเหตุผล",
            ephemeral: true,
          });
        }

        let targetUser;

        try {
          targetUser =
            await client.users.fetch(
              targetId
            );
        } catch {
          return interaction.reply({
            content:
              "❌ ไม่พบผู้ใช้จาก ID นี้",
            ephemeral: true,
          });
        }

        const oldCoins =
          wallet.getCoins(
            targetId
          );

        wallet.addCoins(
          targetId,
          amount
        );

        const newCoins =
          wallet.getCoins(
            targetId
          );

        /*
        DM สมาชิก
        */
        try {
          const dmEmbed =
            new EmbedBuilder()
              .setTitle(
                "🪙 คุณได้รับ Coins"
              )
              .setColor(0x57f287)
              .setDescription(
                `คุณได้รับ Coins จำนวน **${amount.toLocaleString()} Coins**`
              )
              .addFields(
                {
                  name:
                    "💰 เหรียญคงเหลือ",
                  value:
                    `**${newCoins.toLocaleString()} Coins**`,
                },
                {
                  name:
                    "👤 ผู้ส่งเหรียญ",
                  value:
                    `${interaction.user}`,
                },
                {
                  name:
                    "📝 เหตุผล",
                  value:
                    reason,
                }
              )
              .setTimestamp();

          await targetUser.send({
            embeds: [
              dmEmbed,
            ],
          });
        } catch {
          /*
          ปิด DM ก็ยังให้ Coins สำเร็จ
          */
        }

        return interaction.reply({
          content:
            `✅ **เสก Coins สำเร็จ**\n\n` +
            `👤 ผู้รับ: <@${targetId}>\n` +
            `🪙 จำนวน: **+${amount.toLocaleString()} Coins**\n` +
            `💰 ยอดเดิม: **${oldCoins.toLocaleString()} Coins**\n` +
            `💰 ยอดใหม่: **${newCoins.toLocaleString()} Coins**\n` +
            `📝 เหตุผล: **${reason}**\n` +
            `👮 ผู้ให้: **${interaction.user.tag}**`,
          ephemeral: true,
        });
      } catch (error) {
        console.error(
          "❌ /addcoins Submit Error:",
          error
        );

        if (
          !interaction.replied &&
          !interaction.deferred
        ) {
          await interaction.reply({
            content:
              "❌ เกิดข้อผิดพลาดในการเสก Coins",
            ephemeral: true,
          }).catch(() => {});
        }
      }
    }
  );

  /*
  ระบบตรวจสอบการเข้า / ออกจาก Voice
  */
  client.on(
    "voiceStateUpdate",
    async (
      oldState,
      newState
    ) => {
      try {
        const oldIn =
          isRewardVoice(
            oldState.channel
          );

        const newIn =
          isRewardVoice(
            newState.channel
          );

        /*
        เข้า Voice
        */
        if (
          !oldIn &&
          newIn
        ) {
          startSession(
            newState.member
          );

          return;
        }

        /*
        ออกจาก Voice
        */
        if (
          oldIn &&
          !newIn
        ) {
          stopSession(
            newState.id
          );

          return;
        }

        /*
        ย้ายห้องภายในหมวดเดียวกัน
        ไม่เริ่มเวลาใหม่
        */
        if (
          oldIn &&
          newIn
        ) {
          const session =
            sessions.get(
              newState.id
            );

          if (session) {
            session.channelId =
              newState.channelId;
          }
        }
      } catch (error) {
        console.error(
          "❌ Voice Reward Error:",
          error
        );
      }
    }
  );

  return {
    sessions,

    getActiveSession(
      userId
    ) {
      return (
        sessions.get(
          userId
        ) || null
      );
    },
  };
}

module.exports = {
  installCoinActivity,
};
