import { Readable } from "stream";
import { API, APIMessage } from "@discordjs/core";
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnection,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from "@discordjs/voice";
import { WebSocketManager } from "@discordjs/ws";
import { Mutex } from "async-mutex";
import cleanContent from "../common/cleanContent.js";
import { __catch, except } from "../common/functions.js";
import { prisma } from "../index.js";
import Synthesizer from "../synthesizer/index.js";
import voiceAdapterCreator from "./voiceAdapterCreator.js";

export default class Room {
  private connection?: VoiceConnection;

  constructor(
    private gateway: WebSocketManager,
    public api: API,
    public voiceChannelId: string,
    public textChannelId: string,
    public guildId: string,
    private audioResourceLock = new Mutex(),
    private audioPlayer = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Play },
    }),
  ) {
    roomManager.set(guildId, this);
  }

  async connect() {
    this.connection = joinVoiceChannel({
      adapterCreator: voiceAdapterCreator(this.guildId, this.gateway),
      guildId: this.guildId,
      channelId: this.voiceChannelId,
    });
    this.connection?.subscribe(this.audioPlayer);

    await entersState(this.connection, VoiceConnectionStatus.Ready, 10_000);
  }

  async destroy() {
    this.connection?.disconnect();
    this.connection?.destroy();
    this.audioResourceLock.cancel();
    roomManager.delete(this.guildId);
  }

  async speak(message: APIMessage & { guild_id: string }) {
    const release = await this.audioResourceLock.acquire();

    try {
      const userConfig = await prisma.synthesizer.findFirst({
        where: { userId: message.author.id },
      });
      const dictionaries = await prisma.dictionary.findMany({
        where: { guildId: message.guild_id },
      });
      const synthesizer = new Synthesizer(
        except(process.env["key"]),
        except(process.env["region"]),
        userConfig?.voice ?? "ja-JP-NanamiNeural",
        message.author.id,
        userConfig?.pitch ?? 1,
        userConfig?.speed ?? 1,
      );

      let content = cleanContent(message);

      for (const dict of dictionaries) {
        content = content.replaceAll(dict.word, dict.read);
      }

      const resource = createAudioResource(
        Readable.fromWeb(
          (await synthesizer.synthesis(content)) ||
            (() => {
              throw "fuck";
            })(),
        ),
        {
          inputType: StreamType.OggOpus,
          metadata: {},
        },
      );

      this.audioPlayer.play(resource);

      await entersState(this.audioPlayer, AudioPlayerStatus.Idle, 5_000).catch(
        () => this.audioPlayer.stop(),
      );
    } finally {
      release();
    }
  }

  async stop() {
    this.audioResourceLock.cancel();
    this.audioPlayer.stop(true);
    await entersState(this.audioPlayer, AudioPlayerStatus.Idle, 5_000);
  }
}

export const roomManager = new Map<string, Room>();
