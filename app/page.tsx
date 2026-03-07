"use client";

import { GalgamePlayer } from "@/components/GalgamePlayer";
import { HistoryPanel } from "@/components/HistoryPanel";
import { InputPanel } from "@/components/InputPanel";
import { WorkBoard } from "@/components/WorkBoard";
import { FancySelect } from "@/components/FancySelect";
import { isQuotaExceeded, toDataUrl, toOptimizedImageDataUrl, toOptimizedSpriteDataUrl } from "@/lib/clientUtils";
import { readMedia, removeMedia, replaceMedia } from "@/lib/mediaStore";
import { defaultSettings, normalizeSettings, SETTINGS_STORAGE_KEY, type AppSettings, type TtsConfig } from "@/lib/settings";
import { TEMPLATES } from "@/lib/templates";
import type { JobInput, JobRecord, ModelConfig } from "@/lib/types";
import { useEffect, useMemo, useRef, useState } from "react";

type NavTab = "home" | "start" | "saves" | "workshop" | "config";
type SettingsTab = "provider" | "tts" | "motion" | "vn" | "about";
type StartView = "input" | "waiting" | "select" | "gal" | "analysis";

const CHARACTER_PRESETS: Array<{ id: string; name: string; characterName: string; stylePrompt: string }> = [
  { id: "custom", name: "自定义", characterName: "解析助手", stylePrompt: "" },
  { id: "hutao", name: "胡桃（原神）", characterName: "胡桃", stylePrompt: "请以胡桃风格总结：俏皮、古灵精怪，偶尔押韵，语气轻快但观点清晰。" },
  { id: "murasame", name: "丛雨（千恋万花）", characterName: "丛雨", stylePrompt: "请以丛雨风格总结：第一人称可偶尔用“吾辈”，语气礼貌克制、偏古风，像守护者一样认真负责；先给结论，再分点说明，措辞温柔但不拖沓，避免过度活泼和网络梗。" },
  { id: "atri", name: "亚托莉", characterName: "亚托莉", stylePrompt: "请以亚托莉风格总结：语气清澈直接、理性高效，信息组织像任务执行报告；可偶尔点到“高性能”式自信，但不过度卖萌；输出顺序为结论→依据→行动建议，句子短、准确、可执行。" }
];

const OFFICIAL_TTS_VOICES: Array<{ value: string; label: string }> = [
  { value: "FunAudioLLM/CosyVoice2-0.5B:alex", label: "官方男声 · alex（沉稳）" },
  { value: "FunAudioLLM/CosyVoice2-0.5B:benjamin", label: "官方男声 · benjamin（低沉）" },
  { value: "FunAudioLLM/CosyVoice2-0.5B:charles", label: "官方男声 · charles（磁性）" },
  { value: "FunAudioLLM/CosyVoice2-0.5B:david", label: "官方男声 · david（欢快）" },
  { value: "FunAudioLLM/CosyVoice2-0.5B:anna", label: "官方女声 · anna（沉稳）" },
  { value: "FunAudioLLM/CosyVoice2-0.5B:bella", label: "官方女声 · bella（激情）" },
  { value: "FunAudioLLM/CosyVoice2-0.5B:claire", label: "官方女声 · claire（温柔）" },
  { value: "FunAudioLLM/CosyVoice2-0.5B:diana", label: "官方女声 · diana（欢快）" }
];

interface HealthAttempt {
  endpoint: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  error?: string;
  preview?: string;
}

interface HealthResult {
  ok: boolean;
  status?: number;
  latencyMs?: number;
  preview?: string;
  error?: string;
  usedEndpoint?: string;
  resolvedBaseUrl?: string;
  attempts?: HealthAttempt[];
  models?: string[];
  modelsStatus?: number;
  modelsError?: string;
}

interface TtsTestResult {
  ok: boolean;
  status?: number;
  error?: string;
  detail?: string;
}

interface VoiceItem {
  uri: string;
  customName?: string;
}

interface RolePack {
  id: string;
  name: string;
  characterName: string;
  stylePrompt: string;
  recommendedVoice: string;
  backgroundTheme: string;
  thumbnail?: string;
  thumbnailRef?: string;
  backgroundImage?: string;
  sprites: {
    neutral?: string;
    happy?: string;
    serious?: string;
    sad?: string;
    angry?: string;
  };
}

const ROLE_PACKS_STORAGE_KEY = "videofetch.rolepacks.v1";
const SHARED_APPEARANCE_STORAGE_KEY = "videofetch.shared.appearance.v1";
const GLOBAL_BG_MEDIA_REF_STORAGE_KEY = "videofetch.globalbg.ref.v1";

function roleAppearanceStorageKey(roleId: string): string {
  return `videofetch.role.appearance.v1.${roleId}`;
}

type SharedAppearance = {
  backgroundImage?: string;
  backgroundImageRef?: string;
  backgroundMusic?: string;
  backgroundMusicRef?: string;
  backgroundMusicName?: string;
  sprites: {
    neutral?: string;
    happy?: string;
    serious?: string;
    sad?: string;
    angry?: string;
  };
  spriteRefs?: {
    neutral?: string;
    happy?: string;
    serious?: string;
    sad?: string;
    angry?: string;
  };
};

const WAIT_THEME_BY_ROLE: Record<string, { primary: string; secondary: string; accent: string; glow: string; line: string }> = {
  hutao: {
    primary: "#f05b72",
    secondary: "#ff9c66",
    accent: "#ffd36b",
    glow: "rgba(240, 91, 114, 0.24)",
    line: "本堂主先热热场，马上把视频要点烧成一份清晰总结。"
  },
  murasame: {
    primary: "#7a8bd6",
    secondary: "#89b7ff",
    accent: "#d8c6ff",
    glow: "rgba(122, 139, 214, 0.24)",
    line: "请稍候，妾身正在将内容整理为更易阅读的条目。"
  },
  atri: {
    primary: "#4d8fe8",
    secondary: "#5ed4d8",
    accent: "#93f0ff",
    glow: "rgba(77, 143, 232, 0.24)",
    line: "解析模块稳定运行中，即将输出结构化结果。"
  },
  custom: {
    primary: "#ee3f86",
    secondary: "#5f9dff",
    accent: "#ffd447",
    glow: "rgba(238, 63, 134, 0.24)",
    line: "正在把视频内容拆解为原文、摘要与可视化阅读素材。"
  }
};


function UploadPreviewField({
  label,
  value,
  onPick,
  onClear
}: {
  label: string;
  value?: string;
  onPick: (file: File) => Promise<void> | void;
  onClear: () => void;
}): React.ReactNode {
  const inputId = `upload-${label}`;
  return (
    <div className="field">
      <span className="field-title-row">
        <span>{label}</span>
        <small className={`upload-state ${value ? "ok" : ""}`}>{value ? "已配置" : "未配置"}</small>
      </span>
      {value ? (
        <div className="role-preview-wrap">
          <img className={`role-preview-img ${label.includes("背景") ? "role-preview-bg" : ""}`} src={value} alt={`${label} preview`} />
          <button type="button" className="preview-clear-btn" onClick={onClear} aria-label={`清除${label}`}>
            ×
          </button>
        </div>
      ) : (
        <label className="upload-shell" htmlFor={inputId}>
          <strong>选择图片</strong>
          <small>点击上传 {label}</small>
        </label>
      )}
      <input
        id={inputId}
        className="upload-native"
        type="file"
        accept="image/*"
        onChange={async (e) => {
          const inputEl = e.currentTarget;
          const f = e.target.files?.[0];
          if (!f) return;
          await onPick(f);
          if (inputEl) inputEl.value = "";
        }}
      />
    </div>
  );
}


function SettingsModal({
  open,
  onClose,
  settings,
  onChange,
  onSave,
  onRunCheck,
  onRunTtsTest,
  onUploadVoice,
  onLoadVoices,
  checking,
  ttsChecking,
  voiceBusy,
  result,
  ttsResult,
  voices
}: {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
  onSave: () => Promise<void> | void;
  onRunCheck: (provider: ModelConfig) => Promise<void>;
  onRunTtsTest: (tts: TtsConfig) => Promise<void>;
  onUploadVoice: (tts: TtsConfig, file: File, customName: string, text: string) => Promise<void>;
  onLoadVoices: (tts: TtsConfig) => Promise<void>;
  checking: boolean;
  ttsChecking: boolean;
  voiceBusy: boolean;
  result: HealthResult | null;
  ttsResult: TtsTestResult | null;
  voices: VoiceItem[];
}): React.ReactNode {
  const [active, setActive] = useState<SettingsTab>("provider");
  const [showProviderKey, setShowProviderKey] = useState(false);
  const [showTtsKey, setShowTtsKey] = useState(false);
  const [voiceName, setVoiceName] = useState("");
  const [voiceText, setVoiceText] = useState("");
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [voicePreviewUrl, setVoicePreviewUrl] = useState("");

  const provider = settings.provider;
  const tts = settings.tts;
  const modelOptions = (result?.models || []).map((x) => ({ value: x, label: x }));
  const customVoiceOptions = voices.map((v) => ({
    value: v.uri,
    label: v.customName ? `${v.customName} (${v.uri})` : v.uri
  }));
  const providerReady = Boolean(provider.baseUrl.trim() && provider.apiKey.trim() && provider.model.trim());
  const ttsReady = Boolean(tts.baseUrl.trim() && tts.apiKey.trim() && tts.model.trim() && tts.voice.trim());

  useEffect(() => {
    if (!voiceFile) {
      setVoicePreviewUrl("");
      return;
    }
    const u = URL.createObjectURL(voiceFile);
    setVoicePreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [voiceFile]);

  if (!open) return null;

  return (
    <div className="modal-mask" onClick={onClose}>
      <section className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <aside className="settings-nav">
          <h3>设置中心</h3>
          <button className={active === "provider" ? "active" : ""} onClick={() => setActive("provider")}>
            <span className="nav-icon">⚙</span>
            <span>Provider 与连通性</span>
            <span className={`nav-dot ${providerReady ? "ok" : "warn"}`} />
          </button>
          <button className={active === "tts" ? "active" : ""} onClick={() => setActive("tts")}>
            <span className="nav-icon">♪</span>
            <span>硅基流动 TTS</span>
            <span className={`nav-dot ${ttsReady ? "ok" : "warn"}`} />
          </button>
          <button className={active === "vn" ? "active" : ""} onClick={() => setActive("vn")}>
            <span className="nav-icon">★</span>
            <span>GalGame 参数</span>
          </button>
          <button className={active === "motion" ? "active" : ""} onClick={() => setActive("motion")}>
            <span className="nav-icon">✦</span>
            <span>动效与沉浸</span>
          </button>
          <button className={active === "about" ? "active" : ""} onClick={() => setActive("about")}>
            <span className="nav-icon">?</span>
            <span>架构说明</span>
          </button>
        </aside>

        <div className="settings-content">
          <div className="settings-top">
            <span className="muted">设置中心</span>
            <button className="ghost-btn" onClick={onClose}>
              关闭
            </button>
          </div>
          <div className="settings-scroll">
            {active === "provider" ? (
              <section className="settings-card">
                <h2>Provider 配置</h2>
                <p className="muted">用于摘要生成与模型调用。</p>
                <div className="settings-grid">
                <label>
                  <span>Base URL（建议以 /v1 结尾）</span>
                  <input value={provider.baseUrl} onChange={(e) => onChange({ ...settings, provider: { ...provider, baseUrl: e.target.value } })} placeholder="https://api.example.com/v1" />
                </label>
                <label>
                  <span>API Key</span>
                  <div className="input-with-action">
                    <input type={showProviderKey ? "text" : "password"} value={provider.apiKey} onChange={(e) => onChange({ ...settings, provider: { ...provider, apiKey: e.target.value } })} placeholder="sk-..." />
                    <button type="button" className="ghost-btn mini" onClick={() => setShowProviderKey((x) => !x)}>{showProviderKey ? "隐藏" : "显示"}</button>
                  </div>
                </label>
                <label>
                  <span>Model</span>
                  {modelOptions.length ? (
                    <FancySelect
                      value={provider.model}
                      onChange={(v) => onChange({ ...settings, provider: { ...provider, model: v } })}
                      options={modelOptions}
                    />
                  ) : (
                    <input
                      value={provider.model}
                      onChange={(e) => onChange({ ...settings, provider: { ...provider, model: e.target.value } })}
                      placeholder="gpt-4o-mini"
                    />
                  )}
                  <small className="muted">
                    {modelOptions.length
                      ? "已加载模型列表，可直接下拉选择"
                      : "先点“一键诊断连通性”以拉取模型列表"}
                  </small>
                </label>
                <div className="split">
                  <label>
                    <span>Temperature</span>
                    <input type="number" min={0} max={2} step={0.1} value={provider.temperature ?? 0.4} onChange={(e) => onChange({ ...settings, provider: { ...provider, temperature: Number(e.target.value) } })} />
                  </label>
                  <label>
                    <span>Max Tokens</span>
                    <input type="number" min={100} max={10000} step={100} value={provider.maxTokens ?? 2200} onChange={(e) => onChange({ ...settings, provider: { ...provider, maxTokens: Number(e.target.value) } })} />
                  </label>
                </div>
                  <div className="settings-actions">
                    <button className="ghost-btn" onClick={() => void onRunCheck(settings.provider)} disabled={checking}>{checking ? "诊断中..." : "一键诊断连通性"}</button>
                  </div>
                </div>

                {result ? (
                  <div className={`health-card ${result.ok ? "good" : "bad"}`}>
                    <p>结果：<strong>{result.ok ? "可用" : "不可用"}</strong></p>
                    <p>状态码：{result.status ?? "-"}</p>
                    <p>耗时：{result.latencyMs ?? "-"} ms</p>
                    <p>命中端点：{result.usedEndpoint ?? "-"}</p>
                    {result.models?.length ? <p>可用模型：{result.models.length} 个（已同步到 Model 下拉框）</p> : null}
                    {result.modelsError ? <p className="muted">模型列表：{result.modelsError}</p> : null}
                    {result.error ? <p className="error-text">{result.error}</p> : null}
                    {result.preview ? <pre>{result.preview}</pre> : null}
                  </div>
                ) : null}
              </section>
            ) : null}

            {active === "tts" ? (
              <section className="settings-card">
              <h2>硅基流动 TTS 配置</h2>
              <p className="muted">用于 GalGame 语音朗读，可直接试音。</p>
              <div className="settings-grid">
                <label>
                  <span>TTS Base URL</span>
                  <input value={tts.baseUrl} onChange={(e) => onChange({ ...settings, tts: { ...tts, baseUrl: e.target.value } })} placeholder="https://api.siliconflow.cn/v1" />
                </label>
                <label>
                  <span>TTS API Key</span>
                  <div className="input-with-action">
                    <input type={showTtsKey ? "text" : "password"} value={tts.apiKey} onChange={(e) => onChange({ ...settings, tts: { ...tts, apiKey: e.target.value } })} placeholder="sk-..." />
                    <button type="button" className="ghost-btn mini" onClick={() => setShowTtsKey((x) => !x)}>{showTtsKey ? "隐藏" : "显示"}</button>
                  </div>
                </label>
                <div className="split">
                  <label>
                    <span>TTS Model</span>
                    <FancySelect
                      value={tts.model}
                      onChange={(v) => onChange({ ...settings, tts: { ...tts, model: v } })}
                      options={[
                        { value: "FunAudioLLM/CosyVoice2-0.5B", label: "FunAudioLLM/CosyVoice2-0.5B" },
                        { value: "fnlp/MOSS-TTSD-v0.5", label: "fnlp/MOSS-TTSD-v0.5" }
                      ]}
                    />
                  </label>
                  <label>
                    <span>官方预设音色</span>
                    <FancySelect
                      value={OFFICIAL_TTS_VOICES.some((x) => x.value === tts.voice) ? tts.voice : "__custom"}
                      onChange={(v) => {
                        if (v === "__custom") return;
                        onChange({ ...settings, tts: { ...tts, voice: v } });
                      }}
                      options={[...OFFICIAL_TTS_VOICES, { value: "__custom", label: "使用自定义 voice（下方输入）" }]}
                    />
                  </label>
                </div>
                <label>
                  <span>当前 Voice URI（可粘贴自定义 speech:...）</span>
                  <input value={tts.voice} onChange={(e) => onChange({ ...settings, tts: { ...tts, voice: e.target.value } })} />
                </label>
                <div className="split">
                  <label>
                    <span>格式</span>
                    <FancySelect
                      value={tts.responseFormat}
                      onChange={(v) => onChange({ ...settings, tts: { ...tts, responseFormat: v as TtsConfig["responseFormat"] } })}
                      options={[
                        { value: "mp3", label: "mp3" },
                        { value: "wav", label: "wav" },
                        { value: "opus", label: "opus" },
                        { value: "pcm", label: "pcm" }
                      ]}
                    />
                  </label>
                  <label>
                    <span>速度</span>
                    <input type="number" min={0.5} max={2} step={0.1} value={tts.speed} onChange={(e) => onChange({ ...settings, tts: { ...tts, speed: Number(e.target.value) } })} />
                  </label>
                </div>
                <label>
                  <span>采样率</span>
                  <FancySelect
                    value={String(tts.sampleRate || 44100)}
                    onChange={(v) => onChange({ ...settings, tts: { ...tts, sampleRate: Number(v) } })}
                    options={[
                      { value: "32000", label: "32000" },
                      { value: "44100", label: "44100" },
                      { value: "48000", label: "48000" }
                    ]}
                  />
                </label>
                <div className="settings-actions">
                  <button type="button" className="ghost-btn" onClick={() => void onRunTtsTest(settings.tts)} disabled={ttsChecking}>
                    {ttsChecking ? "试音中..." : "测试语音效果"}
                  </button>
                  <button type="button" className="ghost-btn" onClick={() => void onLoadVoices(settings.tts)} disabled={voiceBusy}>
                    {voiceBusy ? "加载中..." : "拉取我的音色"}
                  </button>
                </div>
                <div className="settings-grid">
                  <label>
                    <span>上传音色名称</span>
                    <input value={voiceName} onChange={(e) => setVoiceName(e.target.value)} placeholder="例如：我的女主音色" />
                  </label>
                  <label>
                    <span>参考文案（与上传音频一致）</span>
                    <textarea rows={2} value={voiceText} onChange={(e) => setVoiceText(e.target.value)} placeholder="输入参考音频对应文本，建议 8-10 秒语音" />
                  </label>
                  <label>
                    <span>上传参考音频（小于等于 30s）</span>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(e) => setVoiceFile(e.target.files?.[0] || null)}
                    />
                    {voicePreviewUrl ? <audio className="audio-preview" controls src={voicePreviewUrl} /> : null}
                  </label>
                  <div className="settings-actions">
                    <button
                      type="button"
                      className="ghost-btn"
                      disabled={voiceBusy || !voiceFile || !voiceName.trim() || !voiceText.trim()}
                      onClick={() => {
                        if (!voiceFile) return;
                        void onUploadVoice(settings.tts, voiceFile, voiceName.trim(), voiceText.trim());
                      }}
                    >
                      {voiceBusy ? "上传中..." : "上传并注册音色"}
                    </button>
                  </div>
                </div>
                {voices.length ? (
                  <label>
                    <span>我的音色（自定义上传）</span>
                    <FancySelect
                      value={tts.voice}
                      onChange={(v) => onChange({ ...settings, tts: { ...tts, voice: v } })}
                      options={customVoiceOptions}
                    />
                  </label>
                ) : null}
                {ttsResult ? (
                  <div className={`health-card ${ttsResult.ok ? "good" : "bad"}`}>
                    <p>结果：<strong>{ttsResult.ok ? "试音成功" : "试音失败"}</strong></p>
                    <p>状态码：{ttsResult.status ?? "-"}</p>
                    {ttsResult.error ? <p className="error-text">{ttsResult.error}</p> : null}
                    {ttsResult.detail ? <pre>{ttsResult.detail}</pre> : null}
                  </div>
                ) : null}
              </div>
              </section>
            ) : null}

            {active === "vn" ? (
              <section className="settings-card">
              <h2>GalGame 参数</h2>
              <div className="settings-grid">
                <label>
                  <span>角色预设</span>
                  <FancySelect
                    value={settings.vn.presetId}
                    onChange={(v) => {
                      const p = CHARACTER_PRESETS.find((x) => x.id === v) || CHARACTER_PRESETS[0];
                      onChange({
                        ...settings,
                        vn: {
                          ...settings.vn,
                          presetId: p.id,
                          characterName: p.characterName,
                          stylePrompt: p.stylePrompt
                        }
                      });
                    }}
                    options={CHARACTER_PRESETS.map((x) => ({ value: x.id, label: x.name }))}
                  />
                </label>
                <label>
                  <span>角色名称</span>
                  <input value={settings.vn.characterName} onChange={(e) => onChange({ ...settings, vn: { ...settings.vn, characterName: e.target.value } })} />
                </label>
                <label>
                  <span>角色风格提示词</span>
                  <textarea rows={3} value={settings.vn.stylePrompt} onChange={(e) => onChange({ ...settings, vn: { ...settings.vn, stylePrompt: e.target.value } })} placeholder="会自动拼接到系统提示词中" />
                </label>
                <label>
                  <span>打字速度（字/秒）</span>
                  <input type="number" min={8} max={60} value={settings.vn.textSpeed} onChange={(e) => onChange({ ...settings, vn: { ...settings.vn, textSpeed: Number(e.target.value) } })} />
                </label>
                <label className="switch-row">
                  <button type="button" className={`switch-chip ${settings.vn.autoPlay ? "on" : ""}`} onClick={() => onChange({ ...settings, vn: { ...settings.vn, autoPlay: !settings.vn.autoPlay } })}>
                    <span className="dot" /> 自动播放语音
                  </button>
                </label>
              </div>
              </section>
            ) : null}

            {active === "motion" ? (
              <section className="settings-card">
              <h2>动效控制</h2>
              <p className="muted">控制气泡感、呼吸感和页面悬浮交互强度。</p>
              <div className="settings-grid">
                <label>
                  <span>整体动效强度：{settings.ui.motionLevel}%</span>
                  <input type="range" min={10} max={100} value={settings.ui.motionLevel} onChange={(e) => onChange({ ...settings, ui: { ...settings.ui, motionLevel: Number(e.target.value) } })} />
                </label>
                <label>
                  <span>气泡密度：{settings.ui.bubbleLevel}%</span>
                  <input type="range" min={0} max={100} value={settings.ui.bubbleLevel} onChange={(e) => onChange({ ...settings, ui: { ...settings.ui, bubbleLevel: Number(e.target.value) } })} />
                </label>
                <label>
                  <span>全局蒙版透明度：{settings.ui.homeOverlayTransparency ?? 72}%（100=全透，0=不透）</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={settings.ui.homeOverlayTransparency ?? 72}
                    onChange={(e) => onChange({ ...settings, ui: { ...settings.ui, homeOverlayTransparency: Number(e.target.value) } })}
                  />
                </label>
                <label className="switch-row">
                  <button type="button" className={`switch-chip ${settings.ui.timelineAnimate ? "on" : ""}`} onClick={() => onChange({ ...settings, ui: { ...settings.ui, timelineAnimate: !settings.ui.timelineAnimate } })}>
                    <span className="dot" /> 时间轴动画
                  </button>
                </label>
                <label>
                  <span>全局背景图（影响底层蒙版）</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      onChange({ ...settings, ui: { ...settings.ui, globalBackground: await toOptimizedImageDataUrl(f) } });
                    }}
                  />
                  {settings.ui.globalBackground ? <img className="bg-preview" src={settings.ui.globalBackground} alt="bg-preview" /> : null}
                  <div className="settings-actions">
                    <button type="button" className="ghost-btn mini" onClick={() => onChange({ ...settings, ui: { ...settings.ui, globalBackground: "" } })}>
                      清除背景图
                    </button>
                  </div>
                </label>
              </div>
              </section>
            ) : null}

            {active === "about" ? (
              <section className="settings-card">
              <h2>当前规则</h2>
              <ul className="plain-list">
                <li>连通性检测必须校验 OpenAI 兼容 JSON，非 JSON 即失败。</li>
                <li>工作台内容用按钮分页，减少信息拥挤。</li>
                <li>GalGame 模式支持立绘差分、BGM 预设与上传、语音朗读。</li>
              </ul>
              </section>
            ) : null}
          </div>

          <div className="settings-footer">
            <button className="ghost-btn" onClick={onClose}>
              取消
            </button>
            <button className="solid-btn" onClick={onSave}>
              保存设置
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function HomePage(): React.ReactNode {
  const homeTitle = "Video2Galgame";
  const homeSubs = [
    "输入视频链接，一键生成摘要，切换到 GalGame 视觉阅读与语音演绎。",
    "支持 YouTube 与 Bilibili，全流程解析、转写、总结、配音。",
    "上传角色与音色，打造你的二次元沉浸式视频解读体验。"
  ];
  const [job, setJob] = useState<JobRecord | null>(null);
  const [history, setHistory] = useState<JobRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState("");
  const [activeNav, setActiveNav] = useState<NavTab>("home");
  const [startView, setStartView] = useState<StartView>("input");
  const [historyMode, setHistoryMode] = useState<"list" | "select" | "gal" | "analysis">("list");
  const [summaryMode, setSummaryMode] = useState<"template" | "role">("template");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings());
  const [draftSettings, setDraftSettings] = useState<AppSettings>(defaultSettings());
  const [templateId, setTemplateId] = useState<string>(TEMPLATES[0].id);
  const [healthChecking, setHealthChecking] = useState(false);
  const [healthResult, setHealthResult] = useState<HealthResult | null>(null);
  const [ttsChecking, setTtsChecking] = useState(false);
  const [ttsResult, setTtsResult] = useState<TtsTestResult | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [rolePacks, setRolePacks] = useState<RolePack[]>([]);
  const [activeRolePackId, setActiveRolePackId] = useState("custom");
  const [workshopView, setWorkshopView] = useState<"list" | "detail">("list");
  const [sharedAppearance, setSharedAppearance] = useState<SharedAppearance>({ sprites: {} });
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [typedSub, setTypedSub] = useState("");
  const [cursorPress, setCursorPress] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [waitElapsedSec, setWaitElapsedSec] = useState(0);
  const sourceRef = useRef<EventSource | null>(null);
  const selectTimerRef = useRef<number | null>(null);
  const isModeFullscreen =
    (activeNav === "start" && (startView === "gal" || startView === "analysis")) ||
    (activeNav === "saves" && historyMode === "gal");
  const activeGlobalBackground = settingsOpen ? draftSettings.ui.globalBackground : settings.ui.globalBackground;
  const globalOverlayTransparency = Math.max(0, Math.min(100, settings.ui.homeOverlayTransparency ?? 72));
  const globalOverlayOpacity = Number((1 - globalOverlayTransparency / 100).toFixed(2));
  const homeOverlayBlur = Number((globalOverlayOpacity * 6).toFixed(2));

  const activeRolePack = useMemo(
    () => rolePacks.find((x) => x.id === activeRolePackId) || rolePacks[0],
    [rolePacks, activeRolePackId]
  );
  const waitingTheme = useMemo(() => {
    const byId = activeRolePack ? WAIT_THEME_BY_ROLE[activeRolePack.id] : undefined;
    if (byId) return byId;
    if (activeRolePack?.backgroundTheme === "sunset") {
      return {
        primary: "#ee3f86",
        secondary: "#5f9dff",
        accent: "#ffd447",
        glow: "rgba(238, 63, 134, 0.24)",
        line: "正在渲染日落主题流程，马上进入模式选择。"
      };
    }
    return WAIT_THEME_BY_ROLE.custom;
  }, [activeRolePack]);

  function defaultRolePacks(): RolePack[] {
    return CHARACTER_PRESETS.map((preset) => ({
      id: preset.id,
      name: preset.name,
      characterName: preset.characterName,
      stylePrompt: preset.stylePrompt,
      recommendedVoice: "FunAudioLLM/CosyVoice2-0.5B:claire",
      backgroundTheme: "sunset",
      sprites: {}
    }));
  }

  function showNotice(type: "success" | "error", text: string): void {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(null), 1800);
  }

  function sanitizeSettingsForStorage(next: AppSettings): AppSettings {
    return {
      ...next,
      vn: {
        ...next.vn,
        backgroundImage: "",
        sprites: {}
      },
      ui: {
        ...next.ui,
        globalBackground: ""
      }
    };
  }

  function sanitizeRolePacks(next: RolePack[]): RolePack[] {
    return next.map((x) => ({
      ...x,
      thumbnail: "",
      backgroundImage: "",
      sprites: {
        neutral: "",
        happy: "",
        serious: "",
        sad: "",
        angry: ""
      }
    }));
  }

  async function saveSharedAppearance(next: SharedAppearance, roleId = activeRolePackId): Promise<void> {
    const targetRoleId = roleId || "custom";
    const normalized: SharedAppearance = {
      backgroundImage: next.backgroundImage || "",
      backgroundImageRef: next.backgroundImageRef || "",
      backgroundMusic: next.backgroundMusic || "",
      backgroundMusicRef: next.backgroundMusicRef || "",
      backgroundMusicName: next.backgroundMusicName || "",
      sprites: { ...(next.sprites || {}) },
      spriteRefs: { ...(next.spriteRefs || {}) }
    };
    if (targetRoleId === activeRolePackId) {
      setSharedAppearance(normalized);
    }
    try {
      localStorage.setItem(
        roleAppearanceStorageKey(targetRoleId),
        JSON.stringify({
          backgroundImageRef: normalized.backgroundImageRef || "",
          backgroundMusicRef: normalized.backgroundMusicRef || "",
          backgroundMusicName: normalized.backgroundMusicName || "",
          spriteRefs: { ...(normalized.spriteRefs || {}) }
        })
      );
    } catch (err) {
      if (isQuotaExceeded(err)) {
        showNotice("error", "图片保存失败：本地空间不足，请使用更小图片。");
        return;
      }
      throw err;
    }
    if ((settings.vn.presetId || "custom") === targetRoleId) {
      const nextSettings: AppSettings = {
        ...settings,
        vn: {
          ...settings.vn,
          backgroundImage: normalized.backgroundImage || "",
          backgroundMusic: normalized.backgroundMusic || "",
          backgroundMusicName: normalized.backgroundMusicName || "",
          sprites: { ...(normalized.sprites || {}) }
        }
      };
      setSettings(nextSettings);
      setDraftSettings(nextSettings);
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(sanitizeSettingsForStorage(nextSettings)));
      } catch {
        // 忽略设置持久化失败，不打断主流程
      }
    }
  }

  function saveRolePacks(next: RolePack[]): boolean {
    const sanitized = sanitizeRolePacks(next);
    setRolePacks(next);
    try {
      localStorage.setItem(ROLE_PACKS_STORAGE_KEY, JSON.stringify(sanitized));
      showNotice("success", "角色包已保存");
      return true;
    } catch (err) {
      if (isQuotaExceeded(err)) {
        showNotice("error", "角色工坊保存失败：本地空间不足，请使用更小的立绘/背景图。");
        return false;
      }
      throw err;
    }
  }

  async function loadHistory(): Promise<void> {
    const res = await fetch("/api/jobs/history?limit=24");
    if (!res.ok) return;
    const payload = (await res.json()) as { items: JobRecord[] };
    setHistory(payload.items || []);
  }

  async function fetchJob(id: string): Promise<void> {
    const res = await fetch(`/api/jobs/${id}`);
    if (!res.ok) {
      setBusy(false);
      setSubmitError(`任务状态拉取失败（HTTP ${res.status}）`);
      setStartView("input");
      return;
    }
    const payload = (await res.json()) as JobRecord;
    setJob(payload);
    if (payload.status !== "running") {
      sourceRef.current?.close();
      sourceRef.current = null;
      setBusy(false);
      setJobId("");
      if (payload.status === "completed") {
        if (selectTimerRef.current) window.clearTimeout(selectTimerRef.current);
        selectTimerRef.current = window.setTimeout(() => {
          setStartView("select");
        }, 1200);
      } else if (payload.status === "failed") {
        setStartView("input");
      }
      void loadHistory();
    }
  }

  async function handleSubmit(input: JobInput): Promise<void> {
    setSubmitError("");
    setBusy(true);
    setActiveNav("start");
    setStartView("waiting");
    setWaitElapsedSec(0);
    setJob(null);
    setJobId("");
    sourceRef.current?.close();
    sourceRef.current = null;
    const rolePrompt = summaryMode === "role" ? settings.vn.stylePrompt.trim() : "";
    const mergedPrompt = rolePrompt
      ? [rolePrompt, input.customSystemPrompt || ""].filter(Boolean).join("\n")
      : input.customSystemPrompt;
    const roleId = summaryMode === "role" ? (settings.vn.presetId || activeRolePackId || "custom") : "";
    const roleName = summaryMode === "role" ? settings.vn.characterName.trim() || "解析助手" : "解析助手";

    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, summaryMode, roleId, roleName, customSystemPrompt: mergedPrompt })
    });

    if (!res.ok) {
      setBusy(false);
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      setSubmitError(payload.error || `创建任务失败（HTTP ${res.status}）`);
      setStartView("input");
      return;
    }

    const { jobId: id } = (await res.json()) as { jobId: string };
    setJobId(id);
    await fetchJob(id);

    const sse = new EventSource(`/api/jobs/${id}/events`);
    sse.addEventListener("stage", async () => {
      await fetchJob(id);
    });
    sse.onerror = () => {
      sse.close();
    };
    sourceRef.current = sse;
  }

  async function runProviderCheck(provider: ModelConfig): Promise<void> {
    setHealthChecking(true);
    setHealthResult(null);
    try {
      const res = await fetch("/api/provider/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(provider)
      });
      const payload = (await res.json()) as HealthResult;
      setHealthResult(payload);
    } finally {
      setHealthChecking(false);
    }
  }

  async function runTtsTest(tts: TtsConfig): Promise<void> {
    setTtsChecking(true);
    setTtsResult(null);
    try {
      const res = await fetch("/api/tts/siliconflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "你好，这是一段测试语音，欢迎来到 GalGame 模式。",
          config: tts
        })
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        setTtsResult({ ok: false, status: res.status, error: payload.error || "请求失败", detail: payload.detail });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      await audio.play().catch(() => undefined);
      setTtsResult({ ok: true, status: res.status });
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } finally {
      setTtsChecking(false);
    }
  }

  async function loadVoices(tts: TtsConfig): Promise<void> {
    setVoiceBusy(true);
    try {
      const res = await fetch("/api/tts/siliconflow/voice", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: tts.baseUrl, apiKey: tts.apiKey })
      });
      const payload = (await res.json().catch(() => ({}))) as { data?: Array<{ uri: string; customName?: string }>; detail?: string; error?: string } | Array<{ uri: string; customName?: string }>;
      if (!res.ok) {
        const msg = Array.isArray(payload) ? "拉取音色失败" : payload.error || "拉取音色失败";
        const detail = Array.isArray(payload) ? "" : payload.detail;
        setTtsResult({ ok: false, status: res.status, error: msg, detail });
        return;
      }
      const items = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
      setVoices(items.map((x) => ({ uri: x.uri, customName: x.customName })));
    } finally {
      setVoiceBusy(false);
    }
  }

  async function uploadVoice(tts: TtsConfig, file: File, customName: string, text: string): Promise<void> {
    setVoiceBusy(true);
    try {
      const form = new FormData();
      form.set("baseUrl", tts.baseUrl);
      form.set("apiKey", tts.apiKey);
      form.set("model", tts.model);
      form.set("customName", customName);
      form.set("text", text);
      form.set("file", file, file.name);
      const res = await fetch("/api/tts/siliconflow/voice", { method: "POST", body: form });
      const payload = (await res.json().catch(() => ({}))) as { uri?: string; error?: string; detail?: string };
      const uri = payload.uri || "";
      if (!res.ok || !uri) {
        setTtsResult({ ok: false, status: res.status, error: payload.error || "上传音色失败", detail: payload.detail });
        return;
      }
      setDraftSettings((prev) => ({ ...prev, tts: { ...prev.tts, voice: uri } }));
      setTtsResult({ ok: true, status: res.status, detail: `上传成功：${uri}` });
      await loadVoices(tts);
    } finally {
      setVoiceBusy(false);
    }
  }

  function openSettings(): void {
    setDraftSettings(settings);
    setHealthResult(null);
    setTtsResult(null);
    setSettingsOpen(true);
  }

  async function saveSettings(): Promise<void> {
    let nextBgRef = localStorage.getItem(GLOBAL_BG_MEDIA_REF_STORAGE_KEY) || "";
    try {
      const bg = draftSettings.ui.globalBackground || "";
      if (bg) {
        nextBgRef = await replaceMedia(nextBgRef, bg, "image", "global-background");
        localStorage.setItem(GLOBAL_BG_MEDIA_REF_STORAGE_KEY, nextBgRef);
      } else if (nextBgRef) {
        await removeMedia(nextBgRef);
        nextBgRef = "";
        localStorage.removeItem(GLOBAL_BG_MEDIA_REF_STORAGE_KEY);
      }
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(sanitizeSettingsForStorage(draftSettings)));
      setSettings(draftSettings);
      setSettingsOpen(false);
      showNotice("success", "设置已保存");
    } catch (err) {
      if (isQuotaExceeded(err)) {
        showNotice("error", "本地空间不足，建议清理浏览器站点数据后重试。");
        return;
      }
      throw err;
    }
  }

  function updateRolePack(patch: Partial<RolePack>): void {
    if (!activeRolePack) return;
    if (Object.prototype.hasOwnProperty.call(patch, "backgroundImage")) {
      void saveSharedAppearance({
        ...sharedAppearance,
        backgroundImage: patch.backgroundImage || "",
        backgroundImageRef: patch.backgroundImage ? sharedAppearance.backgroundImageRef || "" : ""
      });
      return;
    }
    const next = rolePacks.map((x) => (x.id === activeRolePack.id ? { ...x, ...patch } : x));
    saveRolePacks(next);
  }

  async function setRolePackThumbnail(file: File | null): Promise<void> {
    if (!activeRolePack) return;
    try {
      const prevRef = activeRolePack.thumbnailRef || "";
      if (!file) {
        if (prevRef) await removeMedia(prevRef).catch(() => undefined);
        const next = rolePacks.map((x) =>
          x.id === activeRolePack.id ? { ...x, thumbnail: "", thumbnailRef: "" } : x
        );
        saveRolePacks(next);
        return;
      }
      const data = await toOptimizedImageDataUrl(file, 960, 0.82);
      const ref = await replaceMedia(prevRef, data, "image", `thumb-${activeRolePack.id}`);
      const next = rolePacks.map((x) =>
        x.id === activeRolePack.id ? { ...x, thumbnail: data, thumbnailRef: ref } : x
      );
      saveRolePacks(next);
    } catch {
      showNotice("error", "缩略图保存失败，请更换更小图片。");
    }
  }

  async function setSharedSprite(kind: "neutral" | "happy" | "serious" | "sad" | "angry", file: File | null): Promise<void> {
    try {
      const prevRef = sharedAppearance.spriteRefs?.[kind] || "";
      if (!file) {
        if (prevRef) await removeMedia(prevRef).catch(() => undefined);
        void saveSharedAppearance({
          ...sharedAppearance,
          sprites: { ...(sharedAppearance.sprites || {}), [kind]: "" },
          spriteRefs: { ...(sharedAppearance.spriteRefs || {}), [kind]: "" }
        });
        return;
      }
      const data = await toOptimizedSpriteDataUrl(file, 900, 1400, 0.82);
      const ref = await replaceMedia(prevRef, data, "image", `sprite-${kind}`);
      void saveSharedAppearance({
        ...sharedAppearance,
        sprites: { ...(sharedAppearance.sprites || {}), [kind]: data },
        spriteRefs: { ...(sharedAppearance.spriteRefs || {}), [kind]: ref }
      });
    } catch {
      showNotice("error", "立绘保存失败，请更换更小图片。");
    }
  }

  async function setSharedBackground(file: File | null): Promise<void> {
    try {
      const prevRef = sharedAppearance.backgroundImageRef || "";
      if (!file) {
        if (prevRef) await removeMedia(prevRef).catch(() => undefined);
        void saveSharedAppearance({
          ...sharedAppearance,
          backgroundImage: "",
          backgroundImageRef: ""
        });
        return;
      }
      const data = await toOptimizedImageDataUrl(file, 1600, 0.82);
      const ref = await replaceMedia(prevRef, data, "image", "gal-background");
      void saveSharedAppearance({
        ...sharedAppearance,
        backgroundImage: data,
        backgroundImageRef: ref
      });
    } catch {
      showNotice("error", "背景图保存失败，请更换更小图片。");
    }
  }

  async function setSharedBackgroundMusic(file: File | null): Promise<void> {
    try {
      const prevRef = sharedAppearance.backgroundMusicRef || "";
      if (!file) {
        if (prevRef) await removeMedia(prevRef).catch(() => undefined);
        void saveSharedAppearance({
          ...sharedAppearance,
          backgroundMusic: "",
          backgroundMusicRef: "",
          backgroundMusicName: ""
        });
        return;
      }
      const data = await toDataUrl(file);
      const ref = await replaceMedia(prevRef, data, "audio", file.name);
      void saveSharedAppearance({
        ...sharedAppearance,
        backgroundMusic: data,
        backgroundMusicRef: ref,
        backgroundMusicName: file.name
      });
    } catch {
      showNotice("error", "背景音乐保存失败，请更换文件重试。");
    }
  }

  function persistRolePack(): void {
    if (!activeRolePack) return;
    void saveRolePacks(rolePacks);
  }

  function applyRolePack(pack: RolePack): void {
    setActiveRolePackId(pack.id);
    void (async () => {
      const appearance = await loadAppearanceByRoleId(pack.id);
      const nextSettings: AppSettings = {
        ...settings,
        tts: {
          ...settings.tts,
          voice: pack.recommendedVoice || settings.tts.voice
        },
        vn: {
          ...settings.vn,
          presetId: pack.id,
          characterName: pack.characterName,
          stylePrompt: pack.stylePrompt,
          defaultBackground: pack.backgroundTheme || settings.vn.defaultBackground,
          backgroundImage: appearance.backgroundImage || "",
          backgroundMusic: appearance.backgroundMusic || "",
          backgroundMusicName: appearance.backgroundMusicName || "",
          sprites: { ...(appearance.sprites || {}) }
        }
      };
      setSharedAppearance(appearance);
      setSettings(nextSettings);
      setDraftSettings(nextSettings);
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(sanitizeSettingsForStorage(nextSettings)));
      setSummaryMode("role");
      setActiveNav("start");
    })();
  }

  function emptyAppearance(): SharedAppearance {
    return {
      backgroundImage: "",
      backgroundImageRef: "",
      backgroundMusic: "",
      backgroundMusicRef: "",
      backgroundMusicName: "",
      sprites: {},
      spriteRefs: {}
    };
  }

  async function loadAppearanceByRoleId(roleId: string): Promise<SharedAppearance> {
    const key = roleAppearanceStorageKey(roleId);
    const raw = localStorage.getItem(key) || (roleId === "custom" ? localStorage.getItem(SHARED_APPEARANCE_STORAGE_KEY) : "");
    if (!raw) return emptyAppearance();
    try {
      const parsed = JSON.parse(raw) as SharedAppearance;
      const spriteRefs = { ...(parsed?.spriteRefs || {}) };
      return {
        backgroundImageRef: parsed?.backgroundImageRef || "",
        backgroundImage: await readMedia(parsed?.backgroundImageRef || ""),
        backgroundMusicRef: parsed?.backgroundMusicRef || "",
        backgroundMusicName: parsed?.backgroundMusicName || "",
        backgroundMusic: await readMedia(parsed?.backgroundMusicRef || ""),
        sprites: {
          neutral: await readMedia(spriteRefs.neutral || ""),
          happy: await readMedia(spriteRefs.happy || ""),
          serious: await readMedia(spriteRefs.serious || ""),
          sad: await readMedia(spriteRefs.sad || ""),
          angry: await readMedia(spriteRefs.angry || "")
        },
        spriteRefs
      };
    } catch {
      return emptyAppearance();
    }
  }

  function selectRoleForWorkbench(roleId: string): void {
    const pack = rolePacks.find((x) => x.id === roleId);
    if (!pack) return;
    setActiveRolePackId(pack.id);
    void (async () => {
      const appearance = await loadAppearanceByRoleId(pack.id);
      const nextSettings: AppSettings = {
        ...settings,
        tts: {
          ...settings.tts,
          voice: pack.recommendedVoice || settings.tts.voice
        },
        vn: {
          ...settings.vn,
          presetId: pack.id,
          characterName: pack.characterName,
          stylePrompt: pack.stylePrompt,
          defaultBackground: pack.backgroundTheme || settings.vn.defaultBackground,
          backgroundImage: appearance.backgroundImage || "",
          backgroundMusic: appearance.backgroundMusic || "",
          backgroundMusicName: appearance.backgroundMusicName || "",
          sprites: { ...(appearance.sprites || {}) }
        }
      };
      setSharedAppearance(appearance);
      setSettings(nextSettings);
      setDraftSettings(nextSettings);
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(sanitizeSettingsForStorage(nextSettings)));
    })();
  }

  function syncAppearanceFromGalgame(next: {
    sprites: RolePack["sprites"];
    backgroundImage: string;
    backgroundImageRef?: string;
    backgroundMusic?: string;
    backgroundMusicRef?: string;
    backgroundMusicName?: string;
    roleId?: string;
  }): void {
    const jobRoleId = job?.input.roleId?.trim() || "";
    const inferredHistoryRoleId =
      activeNav === "saves" && job?.input.summaryMode === "role"
        ? jobRoleId || rolePacks.find((x) => x.characterName === (job?.input.roleName || "").trim())?.id || ""
        : "";
    const roleId =
      next.roleId ||
      inferredHistoryRoleId ||
      (summaryMode === "role" ? activeRolePackId : "") ||
      settings.vn.presetId ||
      "custom";
    void (async () => {
      const existing = await loadAppearanceByRoleId(roleId || "custom");
      await saveSharedAppearance({
        backgroundImage: next.backgroundImage || "",
        backgroundImageRef: next.backgroundImageRef || "",
        backgroundMusic: next.backgroundMusic || "",
        backgroundMusicRef: next.backgroundMusicRef || "",
        backgroundMusicName: next.backgroundMusicName || "",
        sprites: {
          ...(existing.sprites || {}),
          ...(next.sprites || {})
        },
        spriteRefs: { ...(existing.spriteRefs || {}) }
      }, roleId || "custom");
    })();
  }

  function onMove(e: React.MouseEvent<HTMLElement>): void {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    e.currentTarget.style.setProperty("--mx", `${x}`);
    e.currentTarget.style.setProperty("--my", `${y}`);
    e.currentTarget.style.setProperty("--cx", `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty("--cy", `${e.clientY - rect.top}px`);
  }

  useEffect(() => {
    void loadHistory();
    let bootSettings = defaultSettings();
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = normalizeSettings(JSON.parse(raw) as Partial<AppSettings>);
        bootSettings = parsed;
        setSettings(parsed);
        setDraftSettings(parsed);
      } catch {
        const fallback = defaultSettings();
        bootSettings = fallback;
        setSettings(fallback);
        setDraftSettings(fallback);
      }
    } else {
      bootSettings = defaultSettings();
    }
    const roleRaw = localStorage.getItem(ROLE_PACKS_STORAGE_KEY);
    const hydrateRolePacks = async (base: RolePack[]): Promise<RolePack[]> => {
      const out = await Promise.all(
        base.map(async (pack) => {
          const thumb = await readMedia(pack.thumbnailRef || "");
          return { ...pack, thumbnail: thumb || "" };
        })
      );
      return out;
    };
    if (roleRaw) {
      try {
        const parsed = JSON.parse(roleRaw) as RolePack[];
        if (Array.isArray(parsed) && parsed.length) {
          const sanitized = sanitizeRolePacks(parsed);
          void hydrateRolePacks(sanitized).then((hydrated) => {
            setRolePacks(hydrated);
            setActiveRolePackId(hydrated[0].id);
          });
        } else {
          const defaults = defaultRolePacks();
          setRolePacks(defaults);
          setActiveRolePackId(defaults[0].id);
        }
      } catch {
        const defaults = defaultRolePacks();
        setRolePacks(defaults);
        setActiveRolePackId(defaults[0].id);
      }
    } else {
      const defaults = defaultRolePacks();
      setRolePacks(defaults);
      setActiveRolePackId(defaults[0].id);
    }

    const hydrateMedia = async (): Promise<void> => {
      const bgRef = localStorage.getItem(GLOBAL_BG_MEDIA_REF_STORAGE_KEY) || "";
      if (bgRef) {
        const bg = await readMedia(bgRef);
        if (bg) {
          setSettings((prev) => ({ ...prev, ui: { ...prev.ui, globalBackground: bg } }));
          setDraftSettings((prev) => ({ ...prev, ui: { ...prev.ui, globalBackground: bg } }));
        }
      }

      setSharedAppearance({
        backgroundImage: bootSettings.vn.backgroundImage || "",
        sprites: { ...(bootSettings.vn.sprites || {}) },
        backgroundMusic: bootSettings.vn.backgroundMusic || "",
        backgroundMusicName: bootSettings.vn.backgroundMusicName || ""
      });
    };
    void hydrateMedia();
  }, []);

  useEffect(() => {
    if (!activeRolePackId) return;
    const loadRoleAppearance = async (): Promise<void> => {
      const key = roleAppearanceStorageKey(activeRolePackId);
      const raw = localStorage.getItem(key) || (activeRolePackId === "custom" ? localStorage.getItem(SHARED_APPEARANCE_STORAGE_KEY) : "");
      if (!raw) {
        const fallback: SharedAppearance = emptyAppearance();
        setSharedAppearance(fallback);
        if ((settings.vn.presetId || "custom") === activeRolePackId) {
          const nextSettings: AppSettings = {
            ...settings,
            vn: {
              ...settings.vn,
              backgroundImage: "",
              backgroundMusic: "",
              backgroundMusicName: "",
              sprites: {}
            }
          };
          setSettings(nextSettings);
          setDraftSettings(nextSettings);
        }
        return;
      }
      try {
        const merged = await loadAppearanceByRoleId(activeRolePackId);
        setSharedAppearance(merged);
        if ((settings.vn.presetId || "custom") === activeRolePackId) {
          const nextSettings: AppSettings = {
            ...settings,
            vn: {
              ...settings.vn,
              backgroundImage: merged.backgroundImage || "",
              backgroundMusic: merged.backgroundMusic || "",
              backgroundMusicName: merged.backgroundMusicName || "",
              sprites: { ...(merged.sprites || {}) }
            }
          };
          setSettings(nextSettings);
          setDraftSettings(nextSettings);
        }
      } catch {
        setSharedAppearance(emptyAppearance());
      }
    };
    void loadRoleAppearance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRolePackId]);

  useEffect(() => {
    if (!busy || !jobId) return;
    // SSE 活跃时不轮询，仅作为 SSE 断开后的 fallback
    if (sourceRef.current) return;
    const t = setInterval(() => {
      void fetchJob(jobId);
    }, 1800);
    return () => clearInterval(t);
  }, [busy, jobId]);

  useEffect(() => {
    if (!busy || startView !== "waiting") return;
    const t = setInterval(() => {
      setWaitElapsedSec((x) => x + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [busy, startView]);

  const stageProgress = useMemo(() => {
    const stage = job?.stage ?? "queued";
    const map: Record<string, number> = {
      queued: 8,
      parsing: 35,
      transcribing: 62,
      summarizing: 86,
      completed: 100,
      failed: 100
    };
    const base = map[stage] ?? 8;
    if (job?.status === "running" && waitElapsedSec > 0) {
      const drift = Math.min(8, Math.floor(waitElapsedSec / 15));
      return Math.min(96, base + drift);
    }
    return base;
  }, [job?.stage, job?.status, waitElapsedSec]);

  const waitTimedOut = busy && startView === "waiting" && waitElapsedSec >= 180;

  useEffect(
    () => () => {
      if (selectTimerRef.current) window.clearTimeout(selectTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (activeNav !== "home") return;
    setTypedSub("");
    let subIdx = 0;
    let phrase = 0;
    let deleting = false;
    const timer = setInterval(() => {
      const current = homeSubs[phrase];
      if (!deleting) {
        subIdx += 1;
        setTypedSub(current.slice(0, subIdx));
        if (subIdx >= current.length) deleting = true;
      } else {
        subIdx -= 1;
        setTypedSub(current.slice(0, Math.max(0, subIdx)));
        if (subIdx <= 0) {
          deleting = false;
          phrase = (phrase + 1) % homeSubs.length;
        }
      }
    }, 56);
    return () => clearInterval(timer);
  }, [activeNav]);

  useEffect(() => {
    if (activeNav !== "workshop") return;
    setWorkshopView("list");
  }, [activeNav]);

  return (
    <main
      className={`ba-container ${isModeFullscreen ? "immersive-root" : ""}`}
      style={{
        ["--motion-level" as string]: settings.ui.motionLevel,
        ["--home-overlay-opacity" as string]: String(globalOverlayOpacity),
        ["--global-overlay-opacity" as string]: String(globalOverlayOpacity),
        ["--home-overlay-blur" as string]: `${homeOverlayBlur}px`
      } as React.CSSProperties}
      onMouseMove={onMove}
    >
      <div className="bg-pattern" />
      <div className="bubble-layer" style={{ opacity: settings.ui.bubbleLevel / 100 }}>
        <span className="bubble b1" />
        <span className="bubble b2" />
        <span className="bubble b3" />
        <span className="bubble b4" />
        <span className="bubble b5" />
      </div>

      {!isModeFullscreen && (
        <aside className="ba-sidebar ba-glass">
          <div className="ba-sidebar-header">
            <div className="ba-logo-text">MomoTalk</div>
            <p className="muted" style={{ fontSize: "10px", marginTop: "4px" }}>SCHALE TECHNOLOGY</p>
          </div>
          <nav style={{ flex: 1 }}>
            <div className={`ba-nav-item ${activeNav === "home" ? "active" : ""}`} onClick={() => setActiveNav("home")}>
              <span style={{ fontSize: "18px" }}>🏠</span>
              <span className="ba-nav-text">首页</span>
            </div>
            <div className={`ba-nav-item ${activeNav === "start" ? "active" : ""}`} onClick={() => setActiveNav("start")}>
              <span style={{ fontSize: "18px" }}>🚀</span>
              <span className="ba-nav-text">工作台</span>
            </div>
            <div className={`ba-nav-item ${activeNav === "saves" ? "active" : ""}`} onClick={() => setActiveNav("saves")}>
              <span style={{ fontSize: "18px" }}>📖</span>
              <span className="ba-nav-text">历史</span>
            </div>
            <div className={`ba-nav-item ${activeNav === "workshop" ? "active" : ""}`} onClick={() => setActiveNav("workshop")}>
              <span style={{ fontSize: "18px" }}>🎨</span>
              <span className="ba-nav-text">角色工坊</span>
            </div>
          </nav>
          <div className="ba-nav-item" onClick={openSettings}>
            <span style={{ fontSize: "18px" }}>⚙️</span>
            <span className="ba-nav-text">系统设置</span>
          </div>
        </aside>
      )}

      <section className="ba-main-content">
        {activeNav === "home" && (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <section className="ba-card animate-ios hover-lift" style={{ maxWidth: "800px", textAlign: "center" }}>
              <p className="ba-section-title" style={{ justifyContent: "center" }}>视频解析工作室</p>
              <h1 className="logo-title brand-logo" style={{ transform: "none", filter: "none", display: "block" }}>
                <span className="brand-video">Video</span>
                <span className="brand-two">2</span>
                <span className="brand-gal">Galgame</span>
              </h1>
              <p className="hero-sub" style={{ margin: "24px auto" }}>{typedSub}</p>
              <div className="hero-tags" style={{ justifyContent: "center" }}>
                <span>视频解析</span>
                <span>智能摘要</span>
                <span>视觉小说</span>
                <span>语音演绎</span>
              </div>
              <div style={{ marginTop: "40px" }}>
                <button className="ba-button ba-button-primary active-shrink" onClick={() => setActiveNav("start")}>
                  立即开始解析
                </button>
              </div>
            </section>
          </div>
        )}

        {activeNav === "start" && !isModeFullscreen && (
          <div className="animate-ios" style={{ maxWidth: "1000px", margin: "0 auto" }}>
            <div className="ba-section-title">工作台</div>
            {startView === "input" ? (
              <div className="ba-card">
                <InputPanel
                  onSubmit={handleSubmit}
                  disabled={busy}
                  modelConfig={settings.provider}
                  templateId={templateId}
                  onTemplateChange={setTemplateId}
                  summaryMode={summaryMode}
                  onSummaryModeChange={setSummaryMode}
                  onOpenSettings={openSettings}
                  roleOptions={rolePacks.map((x) => ({ value: x.id, label: `${x.name} · ${x.characterName}` }))}
                  selectedRoleId={activeRolePackId}
                  onRoleChange={selectRoleForWorkbench}
                  roleName={settings.vn.characterName}
                  roleStylePrompt={settings.vn.stylePrompt}
                  submitError={submitError}
                />
              </div>
            ) : null}

            {startView === "waiting" ? (
              <div className="ba-card">
                <div className="waiting-panel" style={{ minHeight: "400px" }}>
                  <h2 className="panel-title">解析中...</h2>
                  <div className="waiting-progress" style={{ width: "100%" }}>
                    <div className="waiting-progress-bar" style={{ width: `${stageProgress}%` }} />
                  </div>
                  <p className="muted">{waitingTheme.line}</p>
                </div>
              </div>
            ) : null}

            {startView === "select" && job?.summaryMarkdown ? (
              <div className="ba-card animate-ios">
                <div className="ba-section-title">选择阅读模式</div>
                <div className="mode-select-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                  <button className="ba-button ba-button-primary" onClick={() => setStartView("gal")}>GalGame 模式</button>
                  <button className="ba-button" style={{ background: "var(--ba-bg)" }} onClick={() => setStartView("analysis")}>原文摘要</button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {activeNav === "start" && startView === "gal" && job?.summaryMarkdown ? (
          <div className="immersive-page animate-ios">
            <div className="immersive-backbar">
              <button className="ba-button ba-glass" onClick={() => setStartView("select")}>← 返回</button>
            </div>
            <GalgamePlayer
              summary={job.summaryMarkdown}
              settings={settings}
              pageMode
              speaker={job.input.roleName || "解析助手"}
              roleId={job?.input.roleId || settings.vn.presetId || activeRolePackId || "custom"}
              onAppearanceChange={syncAppearanceFromGalgame}
              onNotify={(text, type) => showNotice(type === "success" ? "success" : "error", text)}
            />
          </div>
        ) : null}

        {activeNav === "start" && startView === "analysis" ? (
          <div className="immersive-page animate-ios">
            <WorkBoard
              job={job}
              pageMode
              showTimeline={false}
              switchAlign="right"
              topLeft={<button className="ba-button ba-glass" onClick={() => setStartView("select")}>← 返回</button>}
            />
          </div>
        ) : null}

        {activeNav === "saves" && historyMode !== "gal" && (
           <div className="animate-ios" style={{ maxWidth: "1000px", margin: "0 auto" }}>
              <div className="ba-section-title">历史任务</div>
              <div className="ba-card">
                 {historyMode === "list" && (
                   <HistoryPanel
                     items={history}
                     currentId={job?.id}
                     onPick={(id) => { setHistoryMode("select"); void fetchJob(id); }}
                     onRefresh={() => void loadHistory()}
                   />
                 )}
                 {historyMode === "select" && (
                    <div className="mode-select-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                       <button className="ba-button ba-button-primary" onClick={() => setHistoryMode("gal")}>GalGame 模式</button>
                       <button className="ba-button" style={{ background: "var(--ba-bg)" }} onClick={() => setHistoryMode("analysis")}>分析模式</button>
                       <button className="ba-button" style={{ gridColumn: "span 2" }} onClick={() => setHistoryMode("list")}>返回列表</button>
                    </div>
                 )}
              </div>
           </div>
        )}

        {activeNav === "saves" && historyMode === "gal" && (
           <div className="immersive-page animate-ios">
              <div className="immersive-backbar">
                 <button className="ba-button ba-glass" onClick={() => setHistoryMode("select")}>← 返回</button>
              </div>
              <GalgamePlayer
                summary={job?.summaryMarkdown || ""}
                settings={settings}
                pageMode
                speaker={job?.input.roleName || "解析助手"}
                roleId={job?.input.roleId || "custom"}
                onAppearanceChange={syncAppearanceFromGalgame}
                onNotify={(text, type) => showNotice(type === "success" ? "success" : "error", text)}
              />
           </div>
        )}

        {activeNav === "workshop" && (
          <div className="animate-ios" style={{ maxWidth: "1200px", margin: "0 auto" }}>
            <div className="ba-section-title">角色工坊</div>
            <div className="ba-card">
               {/* 简化版工坊 logic */}
               <p className="muted">工坊功能正在适配 MomoTalk 风格，请通过设置面板进行深度配置。</p>
            </div>
          </div>
        )}
      </section>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={draftSettings}
        onChange={setDraftSettings}
        onSave={saveSettings}
        onRunCheck={runProviderCheck}
        onRunTtsTest={runTtsTest}
        onUploadVoice={uploadVoice}
        onLoadVoices={loadVoices}
        checking={healthChecking}
        ttsChecking={ttsChecking}
        voiceBusy={voiceBusy}
        result={healthResult}
        ttsResult={ttsResult}
        voices={voices}
      />
      {notice ? (
        <div className="top-toast ba-glass" style={{ border: "1px solid var(--ba-blue)", color: "var(--ba-blue)" }}>
          {notice.text}
        </div>
      ) : null}
    </main>
  );
}
