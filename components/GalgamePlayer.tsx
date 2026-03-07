"use client";

import { FancySelect } from "@/components/FancySelect";
import { isQuotaExceeded, toDataUrl, toOptimizedImageDataUrl } from "@/lib/clientUtils";
import { readMedia, replaceMedia } from "@/lib/mediaStore";
import type { AppSettings } from "@/lib/settings";
import { splitToSpeechChunks, summaryToVnLines } from "@/lib/galgame";
import { useEffect, useMemo, useRef, useState } from "react";

const bgmPresets: Array<{ id: string; name: string; url: string }> = [
  { id: "none", name: "关闭", url: "" },
  { id: "quiet", name: "Quiet Loop", url: "https://cdn.pixabay.com/download/audio/2021/09/06/audio_5f6f2d9b69.mp3" },
  { id: "story", name: "Story Piano", url: "https://cdn.pixabay.com/download/audio/2022/03/15/audio_5c6f4f0cf9.mp3" }
];

interface Props {
  summary: string;
  settings: AppSettings;
  pageMode?: boolean;
  speaker?: string;
  roleId?: string;
  onAppearanceChange?: (next: {
    sprites: SpriteMap;
    backgroundImage: string;
    backgroundImageRef?: string;
    backgroundMusic?: string;
    backgroundMusicRef?: string;
    backgroundMusicName?: string;
    roleId?: string;
  }) => void;
  onNotify?: (text: string, type?: "success" | "error") => void;
}

type SpriteMap = {
  neutral?: string;
  happy?: string;
  serious?: string;
};

type RuntimeStore = {
  customBgRef?: string;
  customBgName?: string;
  uploadedBgmRef?: string;
  uploadedBgmName?: string;
  bgmPreset?: string;
  autoPlay?: boolean;
};

const GAL_RUNTIME_STORAGE_KEY = "videofetch.gal.runtime.v1";

function UploadField({
  label,
  accept,
  onFile,
  fileName
}: {
  label: string;
  accept: string;
  onFile: (file: File | null) => void;
  fileName?: string;
}): React.ReactNode {
  const inputId = `upload-${label}`;
  return (
    <div className="field">
      <span>{label}</span>
      <label className="upload-shell" htmlFor={inputId}>
        <strong>选择文件</strong>
        <small>{fileName || "未选择"}</small>
      </label>
      <input
        id={inputId}
        className="upload-native"
        type="file"
        accept={accept}
        onChange={(e) => onFile(e.target.files?.[0] || null)}
      />
    </div>
  );
}

export function GalgamePlayer({ summary, settings, pageMode = false, speaker, roleId, onAppearanceChange, onNotify }: Props): React.ReactNode {
  const runtimeStorageKey = `${GAL_RUNTIME_STORAGE_KEY}.${roleId || "custom"}`;
  const speakerName = (speaker || settings.vn.characterName || "解析助手").trim();
  const lines = useMemo(() => summaryToVnLines(summary, speakerName), [summary, speakerName]);
  const [lineIndex, setLineIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [sprites, setSprites] = useState<SpriteMap>({});
  const [manualExpression, setManualExpression] = useState<"auto" | "neutral" | "happy" | "serious">("auto");
  const [bgmPreset, setBgmPreset] = useState("none");
  const [uploadedBgm, setUploadedBgm] = useState("");
  const [uploadedBgmName, setUploadedBgmName] = useState("");
  const [uploadedBgmRef, setUploadedBgmRef] = useState("");
  const [customBg, setCustomBg] = useState("");
  const [customBgName, setCustomBgName] = useState("");
  const [customBgRef, setCustomBgRef] = useState("");
  const [playVoice, setPlayVoice] = useState(settings.vn.autoPlay);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceTokenRef = useRef(0);

  useEffect(() => {
    try {
      localStorage.removeItem("videofetch.gal.runtime.shared.v1");
    } catch {
      // ignore
    }
  }, []);

  const current = lines[Math.min(lineIndex, Math.max(0, lines.length - 1))];
  const expression = manualExpression === "auto" ? current.expression : manualExpression;
  const currentSprite = sprites[expression];

  useEffect(() => {
    const roleSprites = settings.vn.sprites || {};
    const roleBackground = settings.vn.backgroundImage || "";
    const roleBgm = settings.vn.backgroundMusic || "";
    const roleBgmName = settings.vn.backgroundMusicName || "";
    const init = async (): Promise<void> => {
      try {
      const raw = localStorage.getItem(runtimeStorageKey);
      if (!raw) {
        setSprites({ ...roleSprites });
        setCustomBg(roleBackground);
        setCustomBgName(roleBackground ? "角色包背景" : "");
        setUploadedBgm(roleBgm);
        setUploadedBgmName(roleBgmName);
        return;
      }
      const parsed = JSON.parse(raw) as RuntimeStore;

      const mergedSprites: SpriteMap = { ...roleSprites };
      setSprites(mergedSprites);

      const runtimeBg = await readMedia(parsed.customBgRef || "");
      const runtimeBgm = await readMedia(parsed.uploadedBgmRef || "");
      const finalBg = runtimeBg || roleBackground || "";
      setCustomBg(finalBg);
      setCustomBgName(parsed.customBgName || (roleBackground ? "角色包背景" : ""));
      setCustomBgRef(parsed.customBgRef || "");
      setUploadedBgm(runtimeBgm || roleBgm || "");
      setUploadedBgmName(parsed.uploadedBgmName || roleBgmName || "");
      setUploadedBgmRef(parsed.uploadedBgmRef || "");

      if (parsed.bgmPreset) setBgmPreset(parsed.bgmPreset);
      if (typeof parsed.autoPlay === "boolean") setPlayVoice(parsed.autoPlay);
      } catch {
      setSprites({ ...roleSprites });
      setCustomBg(roleBackground);
      setCustomBgName(roleBackground ? "角色包背景" : "");
      setUploadedBgm(roleBgm);
      setUploadedBgmName(roleBgmName);
      setUploadedBgmRef("");
      setCustomBgRef("");
    }
    };
    void init();
  }, [settings.vn.backgroundImage, settings.vn.sprites, settings.vn.backgroundMusic, settings.vn.backgroundMusicName, runtimeStorageKey]);

  useEffect(() => {
    setTyped("");
    let i = 0;
    const speed = Math.max(8, settings.vn.textSpeed);
    const timer = setInterval(() => {
      i += 1;
      setTyped(current.text.slice(0, i));
      if (i >= current.text.length) clearInterval(timer);
    }, Math.round(1000 / speed));
    return () => clearInterval(timer);
  }, [current.id, current.text, settings.vn.textSpeed]);

  useEffect(() => {
    setPlayVoice(settings.vn.autoPlay);
  }, [settings.vn.autoPlay]);

  useEffect(() => {
    const preset = bgmPresets.find((x) => x.id === bgmPreset);
    const src = uploadedBgm || preset?.url || "";
    const el = bgmRef.current;
    if (!el) return;
    if (!src) {
      el.pause();
      el.src = "";
      return;
    }
    el.src = src;
    el.loop = true;
    el.volume = 0.22;
    void el.play().catch(() => undefined);
  }, [bgmPreset, uploadedBgm]);

  useEffect(() => {
    try {
      const payload: RuntimeStore = {
        customBgRef,
        customBgName,
        uploadedBgmRef,
        uploadedBgmName,
        bgmPreset,
        autoPlay: playVoice
      };
      localStorage.setItem(runtimeStorageKey, JSON.stringify(payload));
    } catch (err) {
      if (isQuotaExceeded(err)) {
        if (onNotify) onNotify("GalGame 资源保存失败：本地空间不足，请上传更小图片。", "error");
        else window.alert("GalGame 资源保存失败：本地空间不足，请上传更小的背景图或立绘。");
      }
    }
  }, [sprites, customBg, customBgRef, customBgName, uploadedBgmRef, uploadedBgmName, bgmPreset, playVoice, runtimeStorageKey]);

  function stopCurrentVoice(): void {
    voiceTokenRef.current += 1;
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.src = "";
      activeAudioRef.current = null;
    }
  }

  async function playLineVoice(): Promise<void> {
    if (!playVoice || !current?.text.trim()) return;
    stopCurrentVoice();
    const token = voiceTokenRef.current;
    setVoiceBusy(true);
    try {
      const chunks = splitToSpeechChunks(current.text).slice(0, 3);
      for (const chunk of chunks) {
        if (token !== voiceTokenRef.current) break;
        const resp = await fetch("/api/tts/siliconflow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: chunk, config: settings.tts })
        });
        if (!resp.ok) break;
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = new Audio(url);
        activeAudioRef.current = a;
        a.volume = 0.95;
        await a.play().catch(() => undefined);
        await new Promise<void>((resolve) => {
          a.onended = () => {
            URL.revokeObjectURL(url);
            if (activeAudioRef.current === a) activeAudioRef.current = null;
            resolve();
          };
          a.onerror = () => {
            URL.revokeObjectURL(url);
            if (activeAudioRef.current === a) activeAudioRef.current = null;
            resolve();
          };
        });
      }
    } finally {
      setVoiceBusy(false);
    }
  }

  useEffect(() => {
    if (!playVoice) return;
    void playLineVoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineIndex]);

  useEffect(() => {
    if (!playVoice) return;
    void playLineVoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playVoice]);

  useEffect(() => {
    if (playVoice) return;
    stopCurrentVoice();
  }, [playVoice]);

  useEffect(() => () => stopCurrentVoice(), []);

  function stageBackgroundStyle(): React.CSSProperties | undefined {
    if (!customBg) return undefined;
    return {
      backgroundImage: `radial-gradient(220px 120px at 82% 12%, rgba(255,255,255,.35), rgba(255,255,255,0)), url(${customBg})`,
      backgroundSize: "cover",
      backgroundPosition: "center"
    };
  }

  function renderStage(extraClass = ""): React.ReactNode {
    return (
      <div className={`gal-stage ${extraClass}`}>
        <div className={`gal-bg ${customBg ? "custom" : ""}`} data-theme={settings.vn.defaultBackground} style={stageBackgroundStyle()} />
        <div className="gal-character-shell">
          {currentSprite ? (
            <img
              key={`${expression}-${lineIndex}`}
              src={currentSprite}
              alt="sprite"
              className="gal-character gal-character-enter"
            />
          ) : (
            <div className="gal-character placeholder">角色工坊未配置立绘</div>
          )}
        </div>

        <div className="gal-dialog">
          <strong>{current.speaker}</strong>
          <p className="typed-line">{typed || "..."}</p>
          <div className="gal-nav">
            <button className="nav-btn" onClick={() => setLineIndex((x) => Math.max(0, x - 1))}>上一句</button>
            <span>{lineIndex + 1} / {lines.length}</span>
            <button className="nav-btn primary" onClick={() => setLineIndex((x) => Math.min(lines.length - 1, x + 1))}>下一句</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className={pageMode ? "galgame-page" : "panel galgame-panel hover-float kawaii-panel"}>
      {!pageMode ? (
        <header className="galgame-head">
          <h3>GalGame 播放模式</h3>
          <div className="galgame-head-actions">
            <span className={`voice-pill ${voiceBusy ? "busy" : playVoice ? "on" : "off"}`}>
              <i />
              {voiceBusy ? "语音生成中" : playVoice ? "自动语音开启" : "自动语音关闭"}
            </span>
            <button className="ghost-btn" onClick={() => setPlayVoice((x) => !x)}>
              {playVoice ? "关闭语音" : "开启语音"}
            </button>
            <button className="ghost-btn" onClick={() => void playLineVoice()} disabled={voiceBusy}>
              {voiceBusy ? "朗读中..." : "重读本句"}
            </button>
          </div>
        </header>
      ) : null}

      <div className={pageMode ? "gal-page-stage" : ""}>
        {renderStage(pageMode ? "fullscreen" : "")}
        {pageMode ? (
          <div className="gal-page-hud">
            <span className={`voice-pill ${voiceBusy ? "busy" : playVoice ? "on" : "off"}`}>
              <i />
              {voiceBusy ? "语音生成中" : playVoice ? "自动语音开启" : "自动语音关闭"}
            </span>
            <button className="ghost-btn" onClick={() => setPlayVoice((x) => !x)}>
              {playVoice ? "关闭语音" : "开启语音"}
            </button>
            <button className="ghost-btn" onClick={() => void playLineVoice()} disabled={voiceBusy}>
              {voiceBusy ? "朗读中..." : "重读本句"}
            </button>
            <button className="ghost-btn" onClick={() => setConfigOpen((x) => !x)}>{configOpen ? "关闭配置" : "打开配置"}</button>
          </div>
        ) : null}
      </div>

      {!pageMode ? (
      <section className="gal-config-grid">
        <label className="field">
          <span>表情控制</span>
          <div className="seg-row">
            {(["auto", "neutral", "happy", "serious"] as const).map((x) => (
              <button key={x} type="button" className={`seg-btn ${manualExpression === x ? "on" : ""}`} onClick={() => setManualExpression(x)}>
                {x}
              </button>
            ))}
          </div>
        </label>

        <div className="split">
          <label className="field">
            <span>背景音乐预设</span>
            <FancySelect
              value={bgmPreset}
              onChange={setBgmPreset}
              options={bgmPresets.map((x) => ({ value: x.id, label: x.name }))}
            />
          </label>
          <UploadField
            label="上传背景音乐"
            accept="audio/*"
            fileName={uploadedBgmName}
            onFile={async (f) => {
              if (!f) return;
              const data = await toDataUrl(f);
              const ref = await replaceMedia(uploadedBgmRef, data, "audio", f.name);
              setUploadedBgm(data);
              setUploadedBgmName(f.name);
              setUploadedBgmRef(ref);
              onAppearanceChange?.({ sprites, backgroundImage: customBg, backgroundImageRef: customBgRef, backgroundMusic: data, backgroundMusicRef: ref, backgroundMusicName: f.name, roleId });
            }}
          />
        </div>

        <UploadField
          label="自定义背景图"
          accept="image/*"
          fileName={customBgName}
          onFile={async (f) => {
            if (!f) return;
            const data = await toOptimizedImageDataUrl(f, 1440, 0.8);
            const ref = await replaceMedia(customBgRef, data, "image", f.name);
            setCustomBg(data);
            setCustomBgName(f.name);
            setCustomBgRef(ref);
            onAppearanceChange?.({ sprites, backgroundImage: data, backgroundImageRef: ref, backgroundMusic: uploadedBgm, backgroundMusicRef: uploadedBgmRef, backgroundMusicName: uploadedBgmName, roleId });
          }}
        />
      </section>
      ) : null}

      {pageMode && configOpen ? (
        <aside className="gal-config-float">
          <h4>沉浸配置</h4>
          <details open>
            <summary>背景与音乐</summary>
            <div className="seg-row">
              {(["auto", "neutral", "happy", "serious"] as const).map((x) => (
                <button key={x} type="button" className={`seg-btn ${manualExpression === x ? "on" : ""}`} onClick={() => setManualExpression(x)}>{x}</button>
              ))}
            </div>
            <label className="field">
              <span>背景音乐预设</span>
              <FancySelect value={bgmPreset} onChange={setBgmPreset} options={bgmPresets.map((x) => ({ value: x.id, label: x.name }))} />
            </label>
            <UploadField
              label="上传背景音乐"
              accept="audio/*"
              fileName={uploadedBgmName}
              onFile={async (f) => {
                if (!f) return;
                const data = await toDataUrl(f);
                const ref = await replaceMedia(uploadedBgmRef, data, "audio", f.name);
                setUploadedBgm(data);
                setUploadedBgmName(f.name);
                setUploadedBgmRef(ref);
                onAppearanceChange?.({ sprites, backgroundImage: customBg, backgroundImageRef: customBgRef, backgroundMusic: data, backgroundMusicRef: ref, backgroundMusicName: f.name, roleId });
              }}
            />
            <UploadField
              label="自定义背景图"
              accept="image/*"
              fileName={customBgName}
              onFile={async (f) => {
                if (!f) return;
                const data = await toOptimizedImageDataUrl(f, 1440, 0.8);
                const ref = await replaceMedia(customBgRef, data, "image", f.name);
                setCustomBg(data);
                setCustomBgName(f.name);
                setCustomBgRef(ref);
                onAppearanceChange?.({ sprites, backgroundImage: data, backgroundImageRef: ref, backgroundMusic: uploadedBgm, backgroundMusicRef: uploadedBgmRef, backgroundMusicName: uploadedBgmName, roleId });
              }}
            />
          </details>
        </aside>
      ) : null}

      <audio ref={bgmRef} />
    </section>
  );
}

