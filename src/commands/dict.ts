import {
  SlashCommandBuilder,
  SlashCommandStringOption,
  SlashCommandSubcommandBuilder,
} from "@discordjs/builders";
import {
  API,
  APIApplicationCommandInteractionDataStringOption,
  APIApplicationCommandInteractionDataSubcommandOption,
  APIChatInputApplicationCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "@discordjs/core";
import { transmute } from "../common/functions.js";
import { NonNullableByKey } from "../common/types.js";
import { prisma } from "../index.js";
import { ICommand } from "./index.js";

export default class Dict implements ICommand {
  defition(): RESTPostAPIChatInputApplicationCommandsJSONBody {
    return new SlashCommandBuilder()
      .setName("dict")
      .setDescription("ユーザー辞書に関する操作を行います")
      .addSubcommand(
        new SlashCommandSubcommandBuilder()
          .setName("put")
          .setDescription("サーバーの辞書を追加・編集します")
          .addStringOption(
            new SlashCommandStringOption()
              .setName("word")
              .setDescription("単語")
              .setRequired(true),
          )
          .addStringOption(
            new SlashCommandStringOption()
              .setName("read")
              .setDescription("読み")
              .setRequired(true),
          ),
      )
      .addSubcommand(
        new SlashCommandSubcommandBuilder()
          .setName("delete")
          .setDescription("サーバーの辞書を削除します")
          .addStringOption(
            new SlashCommandStringOption()
              .setName("word")
              .setDescription("単語")
              .setRequired(true),
          ),
      )
      .toJSON();
  }

  async run(
    api: API,
    i: NonNullableByKey<
      APIChatInputApplicationCommandInteraction,
      "guild_id",
      string
    >,
  ): Promise<unknown> {
    const command = i.data.options?.[0];

    if (
      !transmute<APIApplicationCommandInteractionDataSubcommandOption>(command)
    )
      return;

    if (command.name === "put") {
      const word = command.options?.find((x) => x.name === "word");
      const read = command.options?.find((x) => x.name === "read");

      if (
        !transmute<APIApplicationCommandInteractionDataStringOption>(word) ||
        !transmute<APIApplicationCommandInteractionDataStringOption>(read)
      )
        return;

      await prisma.dictionary.upsert({
        create: { guildId: i.guild_id, read: read.value, word: word.value },
        update: { read: read.value },
        where: { guildId: i.guild_id, word: word.value },
      });

      return await api.interactions.editReply(i.application_id, i.token, {
        embeds: [
          {
            title: "辞書を編集しました",
            description: `単語: \`${word?.value}\`
読み: \`${read?.value}\``,
            color: 0x00ff00,
          },
        ],
      });
    }

    if (command.name === "delete") {
      const word = command.options?.find((x) => x.name === "word");

      if (!transmute<APIApplicationCommandInteractionDataStringOption>(word))
        return;

      const dict = await prisma.dictionary.findFirst({
        where: { guildId: i.guild_id, word: word.value },
      });

      if (!dict)
        return await api.interactions.editReply(i.application_id, i.token, {
          embeds: [
            {
              title: "エラーです",
              description: "単語が存在しません",
              color: 0xff0000,
            },
          ],
        });

      await prisma.dictionary.delete({ where: { id: dict.id } });

      return await api.interactions.editReply(i.application_id, i.token, {
        embeds: [
          {
            title: "辞書を削除しました",
            description: `単語: \`${dict.word}\`
読み: \`${dict.read}\``,
            color: 0x00ff00,
          },
        ],
      });
    }

    throw "unreachable";
  }
}
