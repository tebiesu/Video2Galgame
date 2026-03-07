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
    <div className="modal-mask" onClick={onClose} style={{ background: "rgba(0, 163, 255, 0.1)", backdropFilter: "blur(12px)" }}>
      <section className="settings-modal animate-ba" onClick={(e) => e.stopPropagation()} style={{ width: "1100px", height: "85vh", border: "3px solid var(--ba-blue)" }}>
        <aside className="settings-nav" style={{ width: "280px", padding: "40px 16px" }}>
          <div style={{ marginBottom: "30px", padding: "0 12px" }}>
            <div style={{ fontSize: "10px", fontWeight: "900", color: "var(--ba-blue)", opacity: 0.6 }}>SYSTEM ADMINISTRATION</div>
            <h3 style={{ margin: 0, fontSize: "22px", fontWeight: "900", color: "var(--ba-blue)" }}>终端设置</h3>
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <button className={`ba-nav-item ${active === "provider" ? "active" : ""}`} onClick={() => setActive("provider")}>
              <div className="ba-nav-icon">⚙</div>
              <span>核心 Provider</span>
              <span className={`nav-dot ${providerReady ? "ok" : "warn"}`} />
            </button>
            <button className={`ba-nav-item ${active === "tts" ? "active" : ""}`} onClick={() => setActive("tts")}>
              <div className="ba-nav-icon">♪</div>
              <span>语音系统 (TTS)</span>
              <span className={`nav-dot ${ttsReady ? "ok" : "warn"}`} />
            </button>
            <button className={`ba-nav-item ${active === "vn" ? "active" : ""}`} onClick={() => setActive("vn")}>
              <div className="ba-nav-icon">★</div>
              <span>交互逻辑 (GAL)</span>
            </button>
            <button className={`ba-nav-item ${active === "motion" ? "active" : ""}`} onClick={() => setActive("motion")}>
              <div className="ba-nav-icon">✦</div>
              <span>系统表现 (UI)</span>
            </button>
          </div>

          <div style={{ marginTop: "auto", padding: "20px", background: "rgba(0, 163, 255, 0.05)", borderRadius: "16px", border: "1px solid var(--ba-blue-light)" }}>
            <div style={{ fontSize: "10px", fontWeight: "900", color: "var(--ba-blue)" }}>SCHALE SECURITY</div>
            <div style={{ fontSize: "11px", color: "var(--ba-text-soft)", marginTop: "4px" }}>您的数据已受沙勒加密协议保护。</div>
          </div>
        </aside>

        <div className="settings-content" style={{ padding: "40px" }}>
          <div className="settings-top" style={{ marginBottom: "30px", borderBottom: "2px solid var(--ba-bg-base)", paddingBottom: "20px" }}>
            <div>
              <span style={{ background: "var(--ba-blue)", color: "white", padding: "2px 12px", borderRadius: "4px", fontSize: "10px", fontWeight: "900" }}>ROOT_ACCESS</span>
              <h2 style={{ margin: "8px 0 0", fontSize: "28px", fontWeight: "900" }}>
                {active === "provider" && "核心引擎配置"}
                {active === "tts" && "音频合成模组"}
                {active === "vn" && "剧情演练参数"}
                {active === "motion" && "视觉渲染引擎"}
                {active === "about" && "系统协议"}
              </h2>
            </div>
            <button className="ba-button" style={{ height: "44px", background: "var(--ba-bg-base)", border: "none", boxShadow: "none" }} onClick={onClose}>
              EXIT TERMINAL
            </button>
          </div>

          <div className="settings-scroll" style={{ paddingRight: "10px" }}>
            {active === "provider" ? (
              <section className="animate-ba">
                <div className="ba-card" style={{ padding: "30px", marginBottom: "24px", border: "2.5px solid var(--ba-blue-light)" }}>
                  <div className="ba-section-title">LLM_CORE_CONNECTIVITY / 核心连通性</div>
                  <div className="settings-grid" style={{ gap: "24px" }}>
                    <label className="field">
                      <span>API_ENDPOINT / 接口基址</span>
                      <input value={provider.baseUrl} onChange={(e) => onChange({ ...settings, provider: { ...provider, baseUrl: e.target.value } })} placeholder="https://api.example.com/v1" />
                    </label>
                    <label className="field">
                      <span>ACCESS_KEY / 通行密钥</span>
                      <div className="input-with-action">
                        <input type={showProviderKey ? "text" : "password"} value={provider.apiKey} onChange={(e) => onChange({ ...settings, provider: { ...provider, apiKey: e.target.value } })} placeholder="sk-..." />
                        <button type="button" className="ba-button" style={{ height: "48px", boxShadow: "none", border: "2px solid var(--ba-border-color)" }} onClick={() => setShowProviderKey((x) => !x)}>{showProviderKey ? "HIDE" : "SHOW"}</button>
                      </div>
                    </label>
                    <div className="split">
                      <label className="field">
                        <span>MODEL_IDENTIFIER / 选定模型</span>
                        <input value={provider.model} onChange={(e) => onChange({ ...settings, provider: { ...provider, model: e.target.value } })} />
                      </label>
                      <label className="field">
                        <span>TEMPERATURE / 发散度</span>
                        <input type="number" step={0.1} value={provider.temperature} onChange={(e) => onChange({ ...settings, provider: { ...provider, temperature: Number(e.target.value) } })} />
                      </label>
                    </div>
                  </div>
                  <div style={{ marginTop: "30px" }}>
                    <button className="ba-button ba-button-primary active-shrink" style={{ width: "100%", height: "54px" }} onClick={() => void onRunCheck(settings.provider)} disabled={checking}>
                      {checking ? "DIAGNOSING..." : "INITIALIZE DIAGNOSTIC / 启动系统诊断"}
                    </button>
                  </div>
                </div>

                {result && (
                  <div className={`health-card ${result.ok ? "good" : "bad"} animate-ba`} style={{ padding: "20px", borderRadius: "16px", border: "2px solid" }}>
                    <div style={{ fontWeight: "900", marginBottom: "10px" }}>DIAGNOSTIC_REPORT: {result.ok ? "SUCCESS" : "FAILED"}</div>
                    <pre style={{ margin: 0, fontSize: "12px", opacity: 0.8 }}>{result.preview || result.error}</pre>
                  </div>
                )}
              </section>
            ) : null}

            {active === "tts" ? (
              <section className="animate-ba">
                <div className="ba-card" style={{ padding: "30px", border: "2.5px solid var(--ba-blue-light)" }}>
                  <div className="ba-section-title">AUDIO_SYNTHESIS_UNIT / 音频合成单元</div>
                  <div className="settings-grid" style={{ gap: "20px" }}>
                    <label className="field">
                      <span>BASE_URL</span>
                      <input value={tts.baseUrl} onChange={(e) => onChange({ ...settings, tts: { ...tts, baseUrl: e.target.value } })} />
                    </label>
                    <label className="field">
                      <span>VOICE_URI</span>
                      <input value={tts.voice} onChange={(e) => onChange({ ...settings, tts: { ...tts, voice: e.target.value } })} />
                    </label>
                    <div className="settings-actions">
                      <button className="ba-button" style={{ flex: 1 }} onClick={() => void onRunTtsTest(settings.tts)} disabled={ttsChecking}>TEST VOICE</button>
                      <button className="ba-button" style={{ flex: 1 }} onClick={() => void onLoadVoices(settings.tts)} disabled={voiceBusy}>FETCH ASSETS</button>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {active === "vn" ? (
              <section className="animate-ba">
                <div className="ba-card" style={{ padding: "30px", border: "2.5px solid var(--ba-blue-light)" }}>
                  <div className="ba-section-title">STORYBOARD_PARAMETERS / 剧情参数</div>
                  <div className="settings-grid" style={{ gap: "24px" }}>
                    <label className="field">
                      <span>ACTOR_NAME / 角色名称</span>
                      <input value={settings.vn.characterName} onChange={(e) => onChange({ ...settings, vn: { ...settings.vn, characterName: e.target.value } })} />
                    </label>
                    <label className="field">
                      <span>STYLE_DIRECTIVE / 风格提示词</span>
                      <textarea rows={4} value={settings.vn.stylePrompt} onChange={(e) => onChange({ ...settings, vn: { ...settings.vn, stylePrompt: e.target.value } })} />
                    </label>
                  </div>
                </div>
              </section>
            ) : null}

            {active === "motion" ? (
              <section className="animate-ba">
                <div className="ba-card" style={{ padding: "30px", border: "2.5px solid var(--ba-blue-light)" }}>
                  <div className="ba-section-title">RENDER_ENGINE_SETTINGS / 渲染引擎</div>
                  <div className="settings-grid" style={{ gap: "30px" }}>
                    <label className="field">
                      <span>MOTION_INTENSITY / 动效强度: {settings.ui.motionLevel}%</span>
                      <input type="range" min={10} max={100} value={settings.ui.motionLevel} onChange={(e) => onChange({ ...settings, ui: { ...settings.ui, motionLevel: Number(e.target.value) } })} />
                    </label>
                    <label className="field">
                      <span>OVERLAY_OPACITY / 蒙版透明度: {settings.ui.homeOverlayTransparency}%</span>
                      <input type="range" min={0} max={100} value={settings.ui.homeOverlayTransparency} onChange={(e) => onChange({ ...settings, ui: { ...settings.ui, homeOverlayTransparency: Number(e.target.value) } })} />
                    </label>
                  </div>
                </div>
              </section>
            ) : null}
          </div>

          <div className="settings-footer" style={{ marginTop: "auto", paddingTop: "30px", borderTop: "2px solid var(--ba-bg-base)" }}>
            <button className="ba-button" style={{ border: "none", background: "none", boxShadow: "none" }} onClick={onClose}>CANCEL</button>
            <button className="ba-button ba-button-primary" style={{ width: "200px" }} onClick={onSave}>SAVE CHANGES</button>
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
        display: "grid",
        gridTemplateColumns: isModeFullscreen ? "1fr" : "300px 1fr",
        height: "100dvh",
        width: "100vw",
        overflow: "hidden",
        position: "relative",
        ["--motion-level" as string]: settings.ui.motionLevel,
        ["--home-overlay-opacity" as string]: String(globalOverlayOpacity),
        ["--global-overlay-opacity" as string]: String(globalOverlayOpacity),
        ["--home-overlay-blur" as string]: `${homeOverlayBlur}px`
      } as React.CSSProperties}
      onMouseMove={onMove}
    >
      {/* 碧蓝档案全局装饰层 */}
      <div className="ba-grid-overlay" />
      
      <div className="bubble-layer" style={{ opacity: settings.ui.bubbleLevel / 100 }}>
        <span className="bubble b1" />
        <span className="bubble b2" />
        <span className="bubble b3" />
        <span className="bubble b4" />
        <span className="bubble b5" />
      </div>

      {!isModeFullscreen && (
        <aside className="ba-sidebar animate-ba">
          <div className="ba-sidebar-header" style={{ marginBottom: "40px", padding: "0 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "48px", height: "48px", background: "var(--ba-blue)", borderRadius: "50%", display: "flex", alignItems: "center", justifyCenter: "center", color: "white", fontSize: "24px", fontWeight: "900", boxShadow: "0 0 15px var(--ba-blue-glow)" }}>
                <span style={{ margin: "auto" }}>S</span>
              </div>
              <div>
                <div className="ba-logo-text" style={{ fontSize: "20px" }}>MomoTalk</div>
                <div style={{ fontSize: "10px", fontWeight: "800", color: "var(--ba-blue)", letterSpacing: "0.1em" }}>SCHALE OS v1.0</div>
              </div>
            </div>
          </div>

          <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px" }}>
            <div className={`ba-nav-item ${activeNav === "home" ? "active" : ""}`} onClick={() => setActiveNav("home")}>
              <div className="ba-nav-icon">🏠</div>
              <span className="ba-nav-text">主页中心</span>
            </div>
            <div className={`ba-nav-item ${activeNav === "start" ? "active" : ""}`} onClick={() => setActiveNav("start")}>
              <div className="ba-nav-icon">🚀</div>
              <span className="ba-nav-text">任务调度</span>
            </div>
            <div className={`ba-nav-item ${activeNav === "saves" ? "active" : ""}`} onClick={() => setActiveNav("saves")}>
              <div className="ba-nav-icon">📖</div>
              <span className="ba-nav-text">任务档案</span>
            </div>
            <div className={`ba-nav-item ${activeNav === "workshop" ? "active" : ""}`} onClick={() => setActiveNav("workshop")}>
              <div className="ba-nav-icon">🎨</div>
              <span className="ba-nav-text">角色工坊</span>
            </div>
          </nav>

          <div style={{ padding: "20px 12px", borderTop: "1px solid var(--ba-border-color)" }}>
            <div className="ba-nav-item" onClick={openSettings}>
              <div className="ba-nav-icon">⚙️</div>
              <span className="ba-nav-text">系统设置</span>
            </div>
          </div>
        </aside>
      )}

      <section className="ba-main-content" style={{ padding: isModeFullscreen ? "0" : "40px", position: "relative" }}>
        {activeNav === "home" && (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }} className="animate-ba">
            <section className="ba-card" style={{ maxWidth: "800px", padding: "60px", textAlign: "center", border: "2px solid var(--ba-blue-light)" }}>
              <div style={{ position: "absolute", top: "0", left: "0", background: "var(--ba-blue)", color: "white", padding: "4px 20px", fontSize: "12px", fontWeight: "900", borderBottomRightRadius: "12px" }}>
                WELCOME TO SCHALE
              </div>
              <p className="ba-section-title" style={{ justifyContent: "center" }}>MISSION CONTROL CENTER</p>
              <h1 className="logo-title brand-logo" style={{ transform: "none", filter: "none", display: "flex", flexDirection: "column", gap: "10px", margin: "40px 0" }}>
                <span className="brand-video" style={{ fontSize: "80px" }}>VIDEO FETCH</span>
                <span className="brand-gal" style={{ fontSize: "40px", opacity: 0.8 }}>SYSTEM TERMINAL</span>
              </h1>
              <p className="hero-sub" style={{ margin: "24px auto", maxWidth: "500px", fontSize: "18px", color: "var(--ba-text-soft)", fontStyle: "italic" }}>{typedSub}</p>
              <div style={{ marginTop: "60px" }}>
                <button className="ba-button ba-button-primary animate-ba delay-1" onClick={() => setActiveNav("start")}>
                  INITIALIZE MISSION
                </button>
              </div>
            </section>
          </div>
        )}

        {activeNav === "start" && !isModeFullscreen && (
          <div className="animate-ba" style={{ maxWidth: "1100px", margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "32px" }}>
              <div>
                <div className="ba-section-title">ACTIVE OPERATION / 正在执行</div>
                <h2 style={{ margin: 0, fontSize: "32px", fontWeight: "900", color: "var(--ba-text-main)" }}>任务控制台</h2>
              </div>
              <div style={{ fontSize: "12px", fontWeight: "bold", color: "var(--ba-blue)", opacity: 0.6 }}>TIMESTAMP: {new Date().toLocaleTimeString()}</div>
            </div>

            {startView === "input" ? (
              <div className="animate-ba delay-1">
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
              <div className="ba-card animate-ba" style={{ padding: "60px", textAlign: "center" }}>
                <div className="waiting-panel" style={{ minHeight: "300px" }}>
                  <div style={{ width: "80px", height: "80px", margin: "0 auto 30px", border: "4px solid var(--ba-blue-light)", borderTopColor: "var(--ba-blue)", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                  <h2 className="ba-section-title" style={{ justifyContent: "center", fontSize: "24px" }}>数据解析中...</h2>
                  <div className="waiting-progress" style={{ width: "100%", height: "8px", background: "var(--ba-bg-base)", borderRadius: "10px", overflow: "hidden", margin: "30px 0" }}>
                    <div className="waiting-progress-bar" style={{ width: `${stageProgress}%`, height: "100%", background: "var(--ba-blue)", boxShadow: "0 0 10px var(--ba-blue-glow)" }} />
                  </div>
                  <p style={{ color: "var(--ba-text-soft)", fontWeight: "bold" }}>{waitingTheme.line}</p>
                </div>
              </div>
            ) : null}

            {startView === "select" && job?.summaryMarkdown ? (
              <div className="ba-card animate-ba delay-1" style={{ padding: "40px" }}>
                <div className="ba-section-title">MISSION COMPLETED / 解析完成</div>
                <p style={{ marginBottom: "30px", fontSize: "18px", fontWeight: "bold" }}>请选择数据呈现方式：</p>
                <div className="mode-select-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "30px" }}>
                  <button className="ba-button ba-button-primary" style={{ height: "120px", fontSize: "20px" }} onClick={() => setStartView("gal")}>
                    沉浸式回顾 (GAL)
                  </button>
                  <button className="ba-button" style={{ height: "120px", fontSize: "20px" }} onClick={() => setStartView("analysis")}>
                    结构化报告 (ANALYSIS)
                  </button>
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
              {workshopView === "list" ? (
                <>
                  <p className="muted" style={{ marginBottom: "20px" }}>配置立绘差分、背景图与背景音乐，打包为独立角色卡。</p>
                  <section className="role-card-grid">
                    {rolePacks.map((pack) => {
                      const thumb = pack.thumbnail || "";
                      return (
                        <button
                          key={pack.id}
                          className={`role-card-item ${activeRolePackId === pack.id ? "active" : ""}`}
                          onClick={() => {
                            setActiveRolePackId(pack.id);
                            setWorkshopView("detail");
                          }}
                        >
                          <div className="role-card-thumb">
                            {thumb ? <img src={thumb} alt={`${pack.name} 缩略图`} /> : <span>{pack.characterName.slice(0, 1) || "角"}</span>}
                          </div>
                          <h3>{pack.name}</h3>
                          <p>{pack.characterName}</p>
                        </button>
                      );
                    })}
                  </section>
                </>
              ) : null}

              {workshopView === "detail" && activeRolePack ? (
                <section className="role-editor-panel">
                  <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
                    <button className="ba-button" style={{ height: "36px", padding: "0 16px", fontSize: "13px" }} onClick={() => setWorkshopView("list")}>← 返回列表</button>
                  </div>
                  
                  <div className="split">
                    <label className="field">
                      <span>角色包名</span>
                      <input type="text" value={activeRolePack.name} onChange={(e) => updateRolePack({ name: e.target.value })} />
                    </label>
                    <label className="field">
                      <span>角色名</span>
                      <input type="text" value={activeRolePack.characterName} onChange={(e) => updateRolePack({ characterName: e.target.value })} />
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

                  <div className="ba-glass" style={{ padding: "20px", borderRadius: "16px", border: "1px solid var(--ba-border)" }}>
                    <h3 className="minor-title">背景区（图 + BGM）</h3>
                    <div className="split">
                      <UploadPreviewField
                        label="角色卡缩略图"
                        value={activeRolePack.thumbnail}
                        onPick={async (f) => await setRolePackThumbnail(f)}
                        onClear={() => void setRolePackThumbnail(null)}
                      />
                      <UploadPreviewField
                        label="自定义背景图"
                        value={sharedAppearance.backgroundImage}
                        onPick={async (f) => await setSharedBackground(f)}
                        onClear={() => void setSharedBackground(null)}
                      />
                    </div>
                    <div className="field" style={{ marginTop: "16px" }}>
                      <span className="field-title-row">
                        <span>背景音乐</span>
                        <small className={`upload-state ${sharedAppearance.backgroundMusic ? "ok" : ""}`}>{sharedAppearance.backgroundMusic ? "已配置" : "未配置"}</small>
                      </span>
                      {sharedAppearance.backgroundMusic ? (
                        <div className="audio-upload-wrap">
                          <audio className="audio-preview" controls src={sharedAppearance.backgroundMusic} />
                          <button type="button" className="preview-clear-btn" onClick={() => void setSharedBackgroundMusic(null)}>×</button>
                        </div>
                      ) : (
                        <label className="upload-shell" htmlFor="role-workshop-bgm-upload">
                          <strong>选择音频</strong>
                          <small>点击上传背景音乐</small>
                        </label>
                      )}
                      <input
                        id="role-workshop-bgm-upload"
                        className="upload-native"
                        type="file"
                        accept="audio/*"
                        onChange={async (e) => {
                          const inputEl = e.currentTarget;
                          const f = e.target.files?.[0];
                          if (!f) return;
                          await setSharedBackgroundMusic(f);
                          if (inputEl) inputEl.value = "";
                        }}
                      />
                    </div>
                  </div>

                  <div className="ba-glass" style={{ padding: "20px", borderRadius: "16px", border: "1px solid var(--ba-border)" }}>
                    <h3 className="minor-title">立绘区（含差分）</h3>
                    <div className="split">
                      <UploadPreviewField label="立绘 neutral" value={sharedAppearance.sprites?.neutral} onPick={async (f) => await setSharedSprite("neutral", f)} onClear={() => void setSharedSprite("neutral", null)} />
                      <UploadPreviewField label="立绘 happy" value={sharedAppearance.sprites?.happy} onPick={async (f) => await setSharedSprite("happy", f)} onClear={() => void setSharedSprite("happy", null)} />
                    </div>
                    <div className="split" style={{ marginTop: "16px" }}>
                      <UploadPreviewField label="立绘 serious" value={sharedAppearance.sprites?.serious} onPick={async (f) => await setSharedSprite("serious", f)} onClear={() => void setSharedSprite("serious", null)} />
                      <UploadPreviewField label="立绘 sad" value={sharedAppearance.sprites?.sad} onPick={async (f) => await setSharedSprite("sad", f)} onClear={() => void setSharedSprite("sad", null)} />
                    </div>
                    <div style={{ marginTop: "16px", maxWidth: "50%" }}>
                      <UploadPreviewField label="立绘 angry" value={sharedAppearance.sprites?.angry} onPick={async (f) => await setSharedSprite("angry", f)} onClear={() => void setSharedSprite("angry", null)} />
                    </div>
                  </div>

                  <div className="settings-actions">
                    <button className="ba-button role-save-btn active-shrink" onClick={persistRolePack} style={{ color: "white" }}>保存角色包</button>
                    <button className="ba-button ba-button-primary active-shrink" onClick={() => applyRolePack(activeRolePack)}>应用此角色包</button>
                    <button className="ba-button" style={{ background: "var(--ba-bg)", border: "1px solid var(--ba-border)" }} onClick={openSettings}>统一配置面板</button>
                  </div>
                </section>
              ) : null}
            </div>
            
            {workshopView === "list" && (
              <div className="role-workshop-grid">
                <article className="role-pack-card">
                  <h3>角色包结构</h3>
                  <p>角色名 + 风格词 + neutral/happy/serious/sad/angry 立绘差分 + 背景图 + 背景音乐。</p>
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
            )}
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
