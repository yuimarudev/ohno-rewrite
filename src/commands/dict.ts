import {
  SlashCommandBuilder,
  SlashCommandStringOption,
  SlashCommandSubcommandBuilder,
} from "@discordjs/builders";
import {
  API,
  APIApplicationCommandAutocompleteInteraction,
  APIApplicationCommandInteractionDataStringOption,
  APIApplicationCommandInteractionDataSubcommandOption,
  APIChatInputApplicationCommandInteraction,
  APIInteractionGuildMember,
  ApplicationCommandOptionType,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "@discordjs/core";
import { transmute } from "../commons/functions.js";
import { NonNullableByKey } from "../commons/types.js";
import { prisma } from "../index.js";
import { ICommand } from "./index.js";

const wordsCache = new Map<
  string,
  { word: string; read: string; guildId: string; id: number }[]
>();

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
              .setRequired(true)
              .setAutocomplete(true),
          ),
      )
      .addSubcommand(
        new SlashCommandSubcommandBuilder()
          .setName("list")
          .setDescription("サーバーの辞書の一覧をテキストファイルで送信します"),
      )
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
        where: {
          guildId: i.guild_id,
          word: word.value,
          guildId_word: { guildId: i.guild_id, word: word.value },
        },
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
      wordsCache.delete(i.guild_id);

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

    if (command.name === "list") {
      const dictionaries = await prisma.dictionary.findMany({
        where: { guildId: i.guild_id },
      });
      const csv = [["ID", "単語", "読み"]]
        .concat(
          dictionaries.map((x) => [
            x.id.toString(),
            escapeCsvCell(x.word),
            escapeCsvCell(x.read),
          ]),
        )
        .map((x) => x.join(","))
        .join("\n");

      return await api.interactions.editReply(i.application_id, i.token, {
        files: [{ name: "0", data: csv }],
        attachments: [{ id: 0, filename: "list.csv" }],
      });
    }

    throw "unreachable";
  }

  async autoComplete(
    api: API,
    i: APIApplicationCommandAutocompleteInteraction,
  ) {
    if (!i.guild_id) return;

    const command = i.data.options.at(
      0,
    ) as APIApplicationCommandInteractionDataSubcommandOption;

    if (command.name === "delete") {
      let cache = wordsCache.get(i.guild_id);

      if (!cache || !cache.length) {
        cache = await prisma.dictionary.findMany({
          where: { guildId: i.guild_id },
        });
        wordsCache.set(i.guild_id, cache);
      }

      const focusedOption = command.options?.find(
        (x) => x.type === ApplicationCommandOptionType.String && x.focused,
      ) as APIApplicationCommandInteractionDataStringOption | undefined;

      await api.interactions.createAutocompleteResponse(i.id, i.token, {
        choices: cache
          .filter((x) => x.word.startsWith(focusedOption?.value ?? ""))
          .map((x) => ({ name: x.word, value: x.word })),
      });
    }
  }
}

function escapeCsvCell(input: string) {
  let text = input;

  if (input.includes('"') || input.includes(",")) {
    text = `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}
