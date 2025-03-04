import { SlashCommandBuilder } from "@discordjs/builders";
import {
  API,
  APIChatInputApplicationCommandInteraction,
  APIInteractionGuildMember,
  MessageFlags,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "@discordjs/core";
import { voiceStates } from "../commons/cache.js";
import { NonNullableByKey } from "../commons/types.js";
import { gateway } from "../index.js";
import Room, { roomManager } from "../voice/room.js";
import { type ICommand } from "./index.js";

export default class Join implements ICommand {
  defition(): RESTPostAPIChatInputApplicationCommandsJSONBody {
    return new SlashCommandBuilder()
      .setName("join")
      .setDescription("ボイスチャンネルに参加します")
      .setDescriptionLocalization("en-US", "Join the voice channel")
      .setDescriptionLocalization("en-GB", "Join the voice channel")
      .toJSON();
  }

  async run(
    api: API,
    i: NonNullableByKey<
      NonNullableByKey<
        APIChatInputApplicationCommandInteraction,
        "guild_id",
        string
      >,
      "member",
      APIInteractionGuildMember
    >,
  ): Promise<unknown> {
    if (roomManager.get(i.guild_id))
      return await api.interactions.editReply(i.application_id, i.token, {
        embeds: [
          {
            color: 0xff0000,
            description: "すでに Bot が別のボイスチャンネルに接続しています",
          },
        ],
        flags: MessageFlags.Ephemeral,
      });

    const states = voiceStates.get(i.guild_id);

    if (!states)
      return await api.interactions.editReply(i.application_id, i.token, {
        embeds: [
          {
            color: 0xff0000,
            description: "あなたはボイスチャンネルに接続していません",
          },
        ],
        flags: MessageFlags.Ephemeral,
      });

    const state = states.find((x) => x.user_id === i.member.user.id);

    if (!state || !state.channel_id)
      return await api.interactions.editReply(i.application_id, i.token, {
        embeds: [
          {
            color: 0xff0000,
            description: "あなたはボイスチャンネルに接続していません",
          },
        ],
        flags: MessageFlags.Ephemeral,
      });

    const room = new Room(
      gateway,
      api,
      state.channel_id,
      i.channel.id,
      i.guild_id,
    );

    api.interactions.editReply(i.application_id, i.token, {
      embeds: [
        {
          description: "接続しています...",
          color: 0xffff00,
        },
      ],
    });

    try {
      await room.connect();
      await api.interactions.editReply(i.application_id, i.token, {
        content: "",
        embeds: [
          {
            description: "接続しました",
            color: 0x00ff00,
          },
        ],
      });
    } catch (e) {
      await api.interactions.editReply(i.application_id, i.token, {
        content: "",
        embeds: [
          {
            description: `接続に失敗しました: \n\`\`\`\n${String(e)}\n\`\`\``,
            color: 0xff0000,
          },
        ],
      });
    }
  }
}
