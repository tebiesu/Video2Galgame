"use client";

import { GalgamePlayer } from "@/components/GalgamePlayer";
import { HistoryPanel } from "@/components/HistoryPanel";
import { InputPanel } from "@/components/InputPanel";
import { WorkBoard } from "@/components/WorkBoard";
import { FancySelect } from "@/components/FancySelect";
import { defaultSettings, normalizeSettings, SETTINGS_STORAGE_KEY, type AppSettings, type TtsConfig } from "@/lib/settings";
import { TEMPLATES } from "@/lib/templates";
import type { JobInput, JobRecord, ModelConfig } from "@/lib/types";
import { useEffect, useMemo, useRef, useState } from "react";

type NavTab = "home" | "start" | "party" | "saves" | "workshop" | "config";
type SettingsTab = "provider" | "tts" | "motion" | "vn" | "about";
type StartView = "input" | "waiting" | "select" | "gal" | "analysis";

const CHARACTER_PRESETS: Array<{ id: string; name: string; characterName: string; stylePrompt: string }> = [
  { id: "custom", name: "自定义", characterName: "解析助手", stylePrompt: "" },
  { id: "hutao", name: "胡桃（原神）", characterName: "胡桃", stylePrompt: "请以胡桃风格总结：俏皮、古灵精怪，偶尔押韵，语气轻快但观点清晰。" },
  { id: "murasame", name: "丛雨（千恋万花）", characterName: "丛雨", stylePrompt: "请以丛雨风格总结：礼貌温柔、古风克制，重点突出条理与情感层次。" },
  { id: "atri", name: "亚托莉", characterName: "亚托莉", stylePrompt: "请以亚托莉风格总结：理性中带温度，清澈直接，结尾给出希望感的收束。" }
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
  backgroundImage?: string;
  sprites: {
    neutral?: string;
    happy?: string;
    serious?: string;
  };
}

const ROLE_PACKS_STORAGE_KEY = "videofetch.rolepacks.v1";

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
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
  onSave: () => void;
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
                      onChange({ ...settings, ui: { ...settings.ui, globalBackground: await toDataUrl(f) } });
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
  const homeTitle = "视频流解析导航";
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
  const [historyMode, setHistoryMode] = useState<"select" | "gal" | "analysis">("select");
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
  const [typedTitle, setTypedTitle] = useState("");
  const [typedSub, setTypedSub] = useState("");
  const sourceRef = useRef<EventSource | null>(null);
  const selectTimerRef = useRef<number | null>(null);
  const isModeFullscreen = activeNav === "start" && (startView === "gal" || startView === "analysis");
  const activeGlobalBackground = settingsOpen ? draftSettings.ui.globalBackground : settings.ui.globalBackground;
  const globalOverlayTransparency = Math.max(0, Math.min(100, settings.ui.homeOverlayTransparency ?? 72));
  const globalOverlayOpacity = Number((1 - globalOverlayTransparency / 100).toFixed(2));
  const homeOverlayBlur = Number((globalOverlayOpacity * 6).toFixed(2));

  const activeRolePack = useMemo(
    () => rolePacks.find((x) => x.id === activeRolePackId) || rolePacks[0],
    [rolePacks, activeRolePackId]
  );

  const stats = useMemo(() => {
    const total = history.length;
    const completed = history.filter((x) => x.status === "completed").length;
    const running = history.filter((x) => x.status === "running").length;
    const failed = history.filter((x) => x.status === "failed").length;
    return { total, completed, running, failed };
  }, [history]);

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

  function saveRolePacks(next: RolePack[]): void {
    setRolePacks(next);
    localStorage.setItem(ROLE_PACKS_STORAGE_KEY, JSON.stringify(next));
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
    setBusy(true);
    setActiveNav("start");
    setStartView("waiting");
    sourceRef.current?.close();
    sourceRef.current = null;
    const rolePrompt = summaryMode === "role" ? settings.vn.stylePrompt.trim() : "";
    const mergedPrompt = rolePrompt
      ? [rolePrompt, input.customSystemPrompt || ""].filter(Boolean).join("\n")
      : input.customSystemPrompt;
    const roleName = summaryMode === "role" ? settings.vn.characterName.trim() || "解析助手" : "解析助手";

    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, summaryMode, roleName, customSystemPrompt: mergedPrompt })
    });

    if (!res.ok) {
      setBusy(false);
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
      const q = new URLSearchParams({
        baseUrl: tts.baseUrl,
        apiKey: tts.apiKey
      });
      const res = await fetch(`/api/tts/siliconflow/voice?${q.toString()}`);
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

  function saveSettings(): void {
    setSettings(draftSettings);
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(draftSettings));
    setSettingsOpen(false);
  }

  function updateRolePack(patch: Partial<RolePack>): void {
    if (!activeRolePack) return;
    const next = rolePacks.map((x) => (x.id === activeRolePack.id ? { ...x, ...patch } : x));
    saveRolePacks(next);
  }

  function updateRolePackSprite(kind: "neutral" | "happy" | "serious", value?: string): void {
    if (!activeRolePack) return;
    const next = rolePacks.map((x) =>
      x.id === activeRolePack.id
        ? { ...x, sprites: { ...x.sprites, [kind]: value } }
        : x
    );
    saveRolePacks(next);
  }

  function applyRolePack(pack: RolePack): void {
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
        defaultBackground: pack.backgroundTheme || settings.vn.defaultBackground
      }
    };
    setSettings(nextSettings);
    setDraftSettings(nextSettings);
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings));
    setSummaryMode("role");
    setActiveNav("start");
  }

  function onMove(e: React.MouseEvent<HTMLElement>): void {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    e.currentTarget.style.setProperty("--mx", `${x}`);
    e.currentTarget.style.setProperty("--my", `${y}`);
  }

  useEffect(() => {
    void loadHistory();
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = normalizeSettings(JSON.parse(raw) as Partial<AppSettings>);
        setSettings(parsed);
        setDraftSettings(parsed);
      } catch {
        const fallback = defaultSettings();
        setSettings(fallback);
        setDraftSettings(fallback);
      }
    }
    const roleRaw = localStorage.getItem(ROLE_PACKS_STORAGE_KEY);
    if (roleRaw) {
      try {
        const parsed = JSON.parse(roleRaw) as RolePack[];
        if (Array.isArray(parsed) && parsed.length) {
          setRolePacks(parsed);
          setActiveRolePackId(parsed[0].id);
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
  }, []);

  useEffect(() => {
    if (!busy || !jobId) return;
    const t = setInterval(() => {
      void fetchJob(jobId);
    }, 1800);
    return () => clearInterval(t);
  }, [busy, jobId]);

  useEffect(
    () => () => {
      if (selectTimerRef.current) window.clearTimeout(selectTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (activeNav !== "home") return;
    setTypedTitle("");
    setTypedSub("");
    let titleIdx = 0;
    let subIdx = 0;
    let phrase = 0;
    let deleting = false;
    const timer = setInterval(() => {
      if (titleIdx < homeTitle.length) {
        titleIdx += 1;
        setTypedTitle(homeTitle.slice(0, titleIdx));
        return;
      }
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

  return (
    <main
      className={`gal-shell ${activeNav === "home" ? "home-mode" : ""} ${isModeFullscreen ? "immersive-root" : ""} ${activeGlobalBackground ? "has-global-bg" : ""}`}
      style={{
        ["--motion-level" as string]: settings.ui.motionLevel,
        ["--home-overlay-opacity" as string]: String(globalOverlayOpacity),
        ["--global-overlay-opacity" as string]: String(globalOverlayOpacity),
        ["--home-overlay-blur" as string]: `${homeOverlayBlur}px`
      } as React.CSSProperties}
      onMouseMove={onMove}
    >
      {activeGlobalBackground ? (
        <div className="bg-global-image" style={{ backgroundImage: `url(${activeGlobalBackground})` }} />
      ) : null}
      <div className="bg-pattern" />
      <div className="bubble-layer" style={{ opacity: settings.ui.bubbleLevel / 100 }}>
        <span className="bubble b1" />
        <span className="bubble b2" />
        <span className="bubble b3" />
        <span className="bubble b4" />
        <span className="bubble b5" />
      </div>

      {activeNav === "home" ? (
        <section className="landing-home panel kawaii-panel">
          <div className="landing-copy">
            <p className="jp-caption">视频解析工作室</p>
            <h1 className="logo-title cn">{typedTitle}<span className="caret">|</span></h1>
            <p className="hero-sub">{typedSub}</p>
            <div className="hero-tags">
              <span>视频解析</span>
              <span>智能摘要</span>
              <span>视觉小说</span>
              <span>语音演绎</span>
            </div>
          </div>
          <div className="landing-orb">
            <span className="orb-dot o1" />
            <span className="orb-dot o2" />
            <span className="orb-dot o3" />
          </div>
        </section>
      ) : null}

      {!isModeFullscreen ? <nav className="top-nav panel hover-float">
        <button className={activeNav === "home" ? "on" : ""} onClick={() => setActiveNav("home")}>
          <strong>首页</strong>
        </button>
        <button className={activeNav === "start" ? "on" : ""} onClick={() => setActiveNav("start")}>
          <strong>工作台</strong>
        </button>
        <button className={activeNav === "saves" ? "on" : ""} onClick={() => setActiveNav("saves")}>
          <strong>历史</strong>
        </button>
        <button className={activeNav === "party" ? "on" : ""} onClick={() => setActiveNav("party")}>
          <strong>队列</strong>
        </button>
        <button className={activeNav === "workshop" ? "on" : ""} onClick={() => setActiveNav("workshop")}>
          <strong>角色工坊</strong>
        </button>
        <button className={settingsOpen ? "on" : ""} onClick={() => { openSettings(); }}>
          <strong>设置</strong>
        </button>
      </nav> : null}

      {activeNav === "start" && !isModeFullscreen ? (
        <div className="module-mask stage-mask" onClick={() => setActiveNav("home")}>
        <section className="module-shell stage-shell" onClick={(e) => e.stopPropagation()}>
          <div className="module-head">
            <h3>工作台</h3>
            <button className="ghost-btn mini" onClick={() => setActiveNav("home")}>关闭</button>
          </div>
          <section className="scene single-layout">
          {startView === "input" ? (
            <section className="start-layout">
              <InputPanel
                onSubmit={handleSubmit}
                disabled={busy}
                modelConfig={settings.provider}
                templateId={templateId}
                onTemplateChange={setTemplateId}
                summaryMode={summaryMode}
                onSummaryModeChange={setSummaryMode}
                onOpenSettings={openSettings}
              />
              <section className="panel mode-guide">
                <h2 className="panel-title">流程引导</h2>
                <p className="muted">先输入视频并开始解析，完成后可进入模式选择页面。</p>
                <div className="queue-notes">
                  <p>当前阶段：{job?.stage ?? "等待开始"}</p>
                  <p>当前任务：{job?.id ?? "-"}</p>
                  {job?.summaryMarkdown ? (
                    <button type="button" className="ghost-btn mini" onClick={() => setStartView("select")}>进入模式选择</button>
                  ) : null}
                  {job?.error ? <p className="error-text">失败原因：{job.error}</p> : null}
                </div>
              </section>
            </section>
          ) : null}

          {startView === "waiting" ? (
            <section className="panel waiting-panel">
              <div className="waiting-header">
                <h2 className="panel-title">正在解析视频</h2>
                <p className="muted">二次元流光引擎正在处理视频内容，请稍候...</p>
              </div>
              <div className="anime-loader">
                <span className="ribbon r1" />
                <span className="ribbon r2" />
                <span className="ribbon r3" />
                <span className="spark s1" />
                <span className="spark s2" />
                <span className="spark s3" />
                <span className="spark s4" />
              </div>
              <div className="waiting-stage">
                <span>当前阶段：{job?.stage ?? "queued"}</span>
                <span>任务ID：{job?.id ?? "-"}</span>
                <span>{job?.status === "completed" ? "解析完成，正在进入模式选择..." : "请保持当前页面，结果将自动切换"}</span>
              </div>
            </section>
          ) : null}

          {startView === "select" && job?.summaryMarkdown ? (
            <section className="panel mode-select-page">
              <div className="mode-topbar mode-topbar-left">
                <button className="ghost-btn" onClick={() => setStartView("input")}>← 返回视频解析</button>
              </div>
              <h2 className="panel-title">选择阅读模式</h2>
              <p className="muted">解析完成，按当前总结模式进入对应阅读方式。</p>
              <div className="settings-actions">
                <button className="ghost-btn mini" onClick={openSettings}>模式配置</button>
              </div>
              <div className="mode-select-grid">
                {job?.input.summaryMode === "role" ? (
                  <button className="mode-card" onClick={() => setStartView("gal")}>
                    <h3>GalGame 模式</h3>
                    <p>全屏角色对话、自动语音、立绘与背景。</p>
                  </button>
                ) : (
                  <article className="mode-card mode-card-muted">
                    <h3>GalGame 模式</h3>
                    <p>当前是模板总结任务。切换为“角色总结”后可开启沉浸模式。</p>
                  </article>
                )}
                <button className="mode-card" onClick={() => setStartView("analysis")}>
                  <h3>原文摘要快照</h3>
                  <p>查看原文、Markdown 摘要与视频快照。</p>
                </button>
              </div>
            </section>
          ) : null}

          </section>
        </section>
        </div>
      ) : null}

      {activeNav === "start" && startView === "gal" && job?.summaryMarkdown ? (
        <section className="scene mode-page immersive-page">
          <div className="immersive-backbar">
            <button className="ghost-btn" onClick={() => setStartView("select")}>← 返回模式选择</button>
          </div>
          <GalgamePlayer summary={job.summaryMarkdown} settings={settings} pageMode speaker={job.input.roleName || "解析助手"} />
        </section>
      ) : null}

      {activeNav === "start" && startView === "analysis" ? (
        <section className="scene mode-page immersive-page">
          <div className="immersive-backbar">
            <button className="ghost-btn" onClick={() => setStartView("select")}>← 返回模式选择</button>
          </div>
          <WorkBoard job={job} pageMode />
        </section>
      ) : null}

      {activeNav === "saves" ? (
        <div className="module-mask stage-mask" onClick={() => setActiveNav("home")}>
        <section className="module-shell history-shell" onClick={(e) => e.stopPropagation()}>
          <div className="module-head">
            <h3>历史任务</h3>
            <button className="ghost-btn mini" onClick={() => setActiveNav("home")}>关闭</button>
          </div>
          <section className="scene history-layout">
          <HistoryPanel
            items={history}
            currentId={job?.id}
            onPick={(id) => {
              setHistoryMode("select");
              void fetchJob(id);
            }}
            onRefresh={() => void loadHistory()}
          />
          <div className="right-stack">
            {historyMode === "select" ? (
              <section className="panel mode-select-page history-select-page">
                <div className="mode-topbar">
                  <div className="mode-mini-switch">
                    <button className={historyMode === "select" ? "on" : ""}>模式选择</button>
                  </div>
                </div>
                <h2 className="panel-title">模式选择</h2>
                <div className="mode-select-grid">
                  {job?.input.summaryMode === "role" ? (
                    <button className="mode-card" onClick={() => setHistoryMode("gal")} disabled={!job?.summaryMarkdown}>
                      <h3>GalGame 模式</h3>
                      <p>按历史摘要进入角色化阅读。</p>
                    </button>
                  ) : (
                    <article className="mode-card mode-card-muted">
                      <h3>GalGame 模式</h3>
                      <p>该历史任务为模板总结，不开启 GalGame。</p>
                    </article>
                  )}
                  <button className="mode-card" onClick={() => setHistoryMode("analysis")} disabled={!job}>
                    <h3>原文摘要快照</h3>
                    <p>查看该任务原文、摘要、快照。</p>
                  </button>
                </div>
              </section>
            ) : null}
            {historyMode === "gal" ? (
              <section className="mode-page history-mode-page">
                <div className="mode-topbar">
                  <div className="mode-mini-switch">
                    <button onClick={() => setHistoryMode("select")}>选择</button>
                    <button className="on">GalGame</button>
                    <button onClick={() => setHistoryMode("analysis")}>阅读</button>
                  </div>
                </div>
                {job?.summaryMarkdown ? <GalgamePlayer summary={job.summaryMarkdown} settings={settings} speaker={job.input.roleName || "解析助手"} /> : <GalgamePlayer summary="" settings={settings} />}
              </section>
            ) : null}
            {historyMode === "analysis" ? (
              <section className="mode-page history-mode-page">
                <div className="mode-topbar">
                  <div className="mode-mini-switch">
                    <button onClick={() => setHistoryMode("select")}>选择</button>
                    {job?.input.summaryMode === "role" ? (
                      <button onClick={() => setHistoryMode("gal")}>GalGame</button>
                    ) : null}
                    <button className="on">阅读</button>
                  </div>
                </div>
                <WorkBoard job={job} compact />
              </section>
            ) : null}
          </div>
          </section>
        </section>
        </div>
      ) : null}

      {activeNav === "party" ? (
        <section className="scene single-layout">
          <section className="panel queue-grid hover-float">
            <h2 className="panel-title">队列与进度</h2>
            <div className="stats-grid">
              <article className="stat-card"><strong>{stats.total}</strong><span>总任务</span></article>
              <article className="stat-card"><strong>{stats.running}</strong><span>进行中</span></article>
              <article className="stat-card"><strong>{stats.completed}</strong><span>已完成</span></article>
              <article className="stat-card"><strong>{stats.failed}</strong><span>失败</span></article>
            </div>
            <div className="queue-notes">
              <p>当前阶段：{job?.stage ?? "暂无任务"}</p>
              <p>当前任务：{job?.id ?? "-"}</p>
              {job?.error ? <p className="error-text">失败原因：{job.error}</p> : null}
            </div>
          </section>
        </section>
      ) : null}

      {activeNav === "workshop" ? (
        <section className="scene single-layout">
          <section className="panel workshop-grid hover-float">
            <h2 className="panel-title">角色工坊</h2>
            <p className="muted">统一管理角色包：人设、语气、立绘差分、背景与推荐音色。</p>
            <div className="role-editor-layout">
              <div className="role-editor-list">
                {rolePacks.map((pack) => (
                  <button
                    key={pack.id}
                    className={`template-card ${activeRolePackId === pack.id ? "active" : ""}`}
                    onClick={() => setActiveRolePackId(pack.id)}
                  >
                    <h3>{pack.name}</h3>
                    <p>{pack.characterName}</p>
                  </button>
                ))}
              </div>
              {activeRolePack ? (
                <section className="role-editor-panel">
                  <div className="split">
                    <label className="field">
                      <span>角色包名</span>
                      <input value={activeRolePack.name} onChange={(e) => updateRolePack({ name: e.target.value })} />
                    </label>
                    <label className="field">
                      <span>角色名</span>
                      <input value={activeRolePack.characterName} onChange={(e) => updateRolePack({ characterName: e.target.value })} />
                    </label>
                  </div>
                  <label className="field">
                    <span>角色风格提示词</span>
                    <textarea rows={3} value={activeRolePack.stylePrompt} onChange={(e) => updateRolePack({ stylePrompt: e.target.value })} />
                  </label>
                  <div className="split">
                    <label className="field">
                      <span>推荐音色</span>
                      <FancySelect
                        value={activeRolePack.recommendedVoice}
                        onChange={(v) => updateRolePack({ recommendedVoice: v })}
                        options={OFFICIAL_TTS_VOICES}
                      />
                    </label>
                    <label className="field">
                      <span>背景主题</span>
                      <FancySelect
                        value={activeRolePack.backgroundTheme}
                        onChange={(v) => updateRolePack({ backgroundTheme: v })}
                        options={[
                          { value: "sunset", label: "日落粉蓝" },
                          { value: "default", label: "柔光白粉" }
                        ]}
                      />
                    </label>
                  </div>
                  <div className="split">
                    <label className="field">
                      <span>立绘 neutral</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          updateRolePackSprite("neutral", await toDataUrl(f));
                        }}
                      />
                    </label>
                    <label className="field">
                      <span>立绘 happy</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          updateRolePackSprite("happy", await toDataUrl(f));
                        }}
                      />
                    </label>
                  </div>
                  <div className="split">
                    <label className="field">
                      <span>立绘 serious</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          updateRolePackSprite("serious", await toDataUrl(f));
                        }}
                      />
                    </label>
                    <label className="field">
                      <span>自定义背景图</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          updateRolePack({ backgroundImage: await toDataUrl(f) });
                        }}
                      />
                    </label>
                  </div>
                  <div className="settings-actions">
                    <button className="solid-btn" onClick={() => applyRolePack(activeRolePack)}>应用此角色包到工作台</button>
                    <button className="ghost-btn" onClick={openSettings}>打开统一配置面板</button>
                  </div>
                </section>
              ) : null}
            </div>
            <div className="role-workshop-grid">
              <article className="role-pack-card">
                <h3>角色包结构</h3>
                <p>角色名 + 风格词 + neutral/happy/serious 立绘 + 背景主题 + 推荐音色。</p>
              </article>
              <article className="role-pack-card">
                <h3>历史隔离策略</h3>
                <p>历史任务固化角色信息，后续切换角色不会影响旧任务回放。</p>
              </article>
              <article className="role-pack-card">
                <h3>语音与立绘联动</h3>
                <p>同一角色包可绑定官方预设音色或自定义 voice uri。</p>
              </article>
            </div>
            <div className="settings-actions">
              <button className="solid-btn" onClick={openSettings}>打开统一配置面板（立绘差分/语音/背景）</button>
            </div>
          </section>
        </section>
      ) : null}

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
    </main>
  );
}
