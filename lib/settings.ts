import type { ModelConfig } from "@/lib/types";

export interface TtsConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
  responseFormat: "mp3" | "wav" | "opus" | "pcm";
  sampleRate?: number;
  speed: number;
  gain: number;
}

export interface VnConfig {
  presetId: string;
  stylePrompt: string;
  characterName: string;
  textSpeed: number;
  autoPlay: boolean;
  defaultBackground: string;
}

export interface AppSettings {
  provider: ModelConfig;
  tts: TtsConfig;
  vn: VnConfig;
  ui: {
    motionLevel: number;
    bubbleLevel: number;
    timelineAnimate: boolean;
    globalBackground?: string;
    homeOverlayTransparency?: number;
  };
}

export const SETTINGS_STORAGE_KEY = "videofetch.settings.v2";

export function defaultSettings(): AppSettings {
  return {
    provider: {
      baseUrl: process.env.NEXT_PUBLIC_NEWAPI_BASE_URL || "",
      apiKey: process.env.NEXT_PUBLIC_NEWAPI_API_KEY || "",
      model: process.env.NEXT_PUBLIC_NEWAPI_MODEL || "",
      temperature: 0.4,
      maxTokens: 2200
    },
    tts: {
      baseUrl: process.env.NEXT_PUBLIC_SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1",
      apiKey: process.env.NEXT_PUBLIC_SILICONFLOW_API_KEY || "",
      model: "FunAudioLLM/CosyVoice2-0.5B",
      voice: "FunAudioLLM/CosyVoice2-0.5B:claire",
      responseFormat: "mp3",
      sampleRate: 44100,
      speed: 1,
      gain: 0
    },
    vn: {
      presetId: "custom",
      stylePrompt: "",
      characterName: "解析助手",
      textSpeed: 24,
      autoPlay: true,
      defaultBackground: "sunset"
    },
    ui: {
      motionLevel: 78,
      bubbleLevel: 72,
      timelineAnimate: true,
      globalBackground: "",
      homeOverlayTransparency: 72
    }
  };
}

export function normalizeSettings(input: Partial<AppSettings> | null | undefined): AppSettings {
  const fallback = defaultSettings();
  if (!input) return fallback;
  return {
    provider: {
      ...fallback.provider,
      ...(input.provider || {})
    },
    tts: {
      ...fallback.tts,
      ...(input.tts || {})
    },
    vn: {
      ...fallback.vn,
      ...(input.vn || {})
    },
    ui: {
      ...fallback.ui,
      ...(input.ui || {})
    }
  };
}
