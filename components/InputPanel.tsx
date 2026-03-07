"use client";

import { FancySelect } from "@/components/FancySelect";
import { TEMPLATES } from "@/lib/templates";
import type { JobInput, ModelConfig, ParseOptions, Platform } from "@/lib/types";
import { useMemo, useState } from "react";

interface Props {
  onSubmit: (input: JobInput) => Promise<void>;
  disabled: boolean;
  modelConfig: ModelConfig;
  templateId: string;
  onTemplateChange: (id: string) => void;
  summaryMode: "template" | "role";
  onSummaryModeChange: (mode: "template" | "role") => void;
  onOpenSettings: () => void;
  roleOptions: Array<{ value: string; label: string }>;
  selectedRoleId: string;
  onRoleChange: (id: string) => void;
  roleName: string;
  roleStylePrompt: string;
  submitError?: string;
}

const platformOptions = [
  { value: "youtube", label: "YouTube" },
  { value: "bilibili", label: "Bilibili" }
] satisfies Array<{ value: Platform; label: string }>;

export function InputPanel({
  onSubmit,
  disabled,
  modelConfig,
  templateId,
  onTemplateChange,
  summaryMode,
  onSummaryModeChange,
  onOpenSettings,
  roleOptions,
  selectedRoleId,
  onRoleChange,
  roleName,
  roleStylePrompt,
  submitError
}: Props): React.ReactNode {
  const [platform, setPlatform] = useState<Platform>("youtube");
  const [url, setUrl] = useState("");
  const [customSystemPrompt, setCustomSystemPrompt] = useState("");
  const [lang, setLang] = useState("");
  const [commentNum, setCommentNum] = useState("0");
  const [danmakuNum, setDanmakuNum] = useState("0");
  const [snapshots, setSnapshots] = useState("30,60");
  const [needSubs, setNeedSubs] = useState(true);
  const [needPbp, setNeedPbp] = useState(true);

  const selectedTemplate = useMemo(
    () => TEMPLATES.find((x) => x.id === templateId) ?? TEMPLATES[0],
    [templateId]
  );

  const providerReady =
    Boolean(modelConfig.baseUrl?.trim()) &&
    Boolean(modelConfig.apiKey?.trim()) &&
    Boolean(modelConfig.model?.trim());

  async function submitForm(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!providerReady) return;
    const parseOptions: ParseOptions = {
      lang: lang || undefined,
      commentNum: Number(commentNum || 0),
      danmakuNum: Number(danmakuNum || 0),
      snapshots: snapshots || "",
      needSubs,
      needPbp
    };

    await onSubmit({
      platform,
      url,
      templateId,
      summaryMode,
      customSystemPrompt,
      modelConfig,
      parseOptions
    });
  }

  return (
    <form className="ba-card animate-ios stack-lg" onSubmit={submitForm}>
      <div className="stack-sm">
        <h2 className="ba-section-title">视频输入</h2>
        <p className="muted" style={{ fontSize: "14px" }}>支持 YouTube / Bilibili 链接，自动解析、转写并生成总结。</p>
      </div>

      {!providerReady ? (
        <div className="ba-glass" style={{ padding: "12px", borderRadius: "12px", border: "1px solid var(--ba-pink)", color: "var(--ba-pink)", fontSize: "13px" }}>
          ⚠️ Provider 未配置完整，请先在「系统设置」中填写。
        </div>
      ) : null}
      {submitError ? <div className="error-text" style={{ fontSize: "13px" }}>提交失败：{submitError}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <label className="field">
          <span className="ba-section-title">解析平台</span>
          <FancySelect
            value={platform}
            options={platformOptions}
            onChange={(v) => setPlatform(v as Platform)}
            disabled={disabled}
          />
        </label>

        <label className="field">
          <span className="ba-section-title">总结模式</span>
          <div className="switch-row mode-switch-row" style={{ gap: "8px" }}>
            <button type="button" className={`ba-button ${summaryMode === "template" ? "ba-button-primary" : ""}`} style={{ flex: 1, height: "40px", fontSize: "13px", background: summaryMode === "template" ? "" : "var(--ba-bg)" }} onClick={() => onSummaryModeChange("template")}>
              模板模式
            </button>
            <button type="button" className={`ba-button ${summaryMode === "role" ? "ba-button-primary" : ""}`} style={{ flex: 1, height: "40px", fontSize: "13px", background: summaryMode === "role" ? "" : "var(--ba-bg)" }} onClick={() => onSummaryModeChange("role")}>
              角色模式
            </button>
          </div>
        </label>
      </div>

      <label className="field">
        <span className="ba-section-title">视频 URL</span>
        <input
          style={{ height: "48px", borderRadius: "14px", border: "1px solid var(--ba-border)" }}
          type="url"
          placeholder="https://www.youtube.com/watch?v=..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          disabled={disabled}
        />
      </label>

      <section className="field ba-glass animate-ios" style={{ padding: "16px", borderRadius: "16px" }}>
        <span className="ba-section-title">{summaryMode === "template" ? "模板总结配置" : "角色总结配置"}</span>
        <div className="mode-config-body">
          <div className="mode-config-scroll">
            {summaryMode === "template" ? (
              <>
                <label className="field">
                  <span style={{ fontSize: "12px", color: "var(--ba-text-soft)" }}>预设模板</span>
                  <FancySelect
                    value={templateId}
                    options={TEMPLATES.map((tpl) => ({ value: tpl.id, label: tpl.name }))}
                    onChange={onTemplateChange}
                    disabled={disabled}
                  />
                </label>
                <p className="muted" style={{ fontSize: "12px", marginTop: "8px" }}>{selectedTemplate.description}</p>
              </>
            ) : (
              <>
                <label className="field">
                  <span style={{ fontSize: "12px", color: "var(--ba-text-soft)" }}>选择角色</span>
                  <FancySelect
                    value={selectedRoleId}
                    options={roleOptions}
                    onChange={onRoleChange}
                    disabled={disabled}
                  />
                </label>
                <div style={{ marginTop: "8px", fontSize: "12px", display: "grid", gap: "4px" }}>
                  <p className="muted">当前角色：<strong>{roleName || "解析助手"}</strong></p>
                  <p className="muted" style={{ opacity: 0.8 }}>风格：{roleStylePrompt?.trim() ? roleStylePrompt.slice(0, 40) + "..." : "默认风格"}</p>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <label className="field">
        <span className="ba-section-title">{summaryMode === "role" ? "追加提示词" : "系统提示词"}</span>
        <textarea
          style={{ borderRadius: "14px", border: "1px solid var(--ba-border)", padding: "12px" }}
          value={customSystemPrompt}
          onChange={(e) => setCustomSystemPrompt(e.target.value)}
          rows={3}
          placeholder={summaryMode === "role" ? "例如：先给结论，再给证据..." : "例如：重点关注商业模式..."}
          disabled={disabled}
        />
      </label>

      <details className="ba-glass" style={{ borderRadius: "14px", padding: "12px" }}>
        <summary style={{ cursor: "pointer", fontSize: "13px", fontWeight: "700", color: "var(--ba-blue)" }}>高级解析参数</summary>
        <div className="stack-sm" style={{ marginTop: "12px" }}>
          <div className="split">
            <label className="field">
              <span style={{ fontSize: "12px" }}>字幕语言</span>
              <input
                style={{ height: "40px", fontSize: "13px" }}
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                placeholder="en / zh-Hans"
                disabled={disabled}
              />
            </label>
            <label className="field">
              <span style={{ fontSize: "12px" }}>快照时间点</span>
              <input
                style={{ height: "40px", fontSize: "13px" }}
                value={snapshots}
                onChange={(e) => setSnapshots(e.target.value)}
                placeholder="30,60,90"
                disabled={disabled}
              />
            </label>
          </div>

          <div className="switch-row" style={{ gap: "8px" }}>
            <button type="button" className={`ba-button ${needSubs ? "ba-button-primary" : ""}`} style={{ flex: 1, height: "36px", fontSize: "12px", background: needSubs ? "" : "var(--ba-bg)" }} onClick={() => setNeedSubs((x) => !x)}>
              获取字幕
            </button>
            <button type="button" className={`ba-button ${needPbp ? "ba-button-primary" : ""}`} style={{ flex: 1, height: "36px", fontSize: "12px", background: needPbp ? "" : "var(--ba-bg)" }} onClick={() => setNeedPbp((x) => !x)}>
              高能点
            </button>
          </div>
        </div>
      </details>

      <button type="submit" className="ba-button ba-button-primary active-shrink" style={{ width: "100%", height: "54px", fontSize: "16px" }} disabled={disabled || !providerReady}>
        {disabled ? "SCHALE 解析中..." : "开始解析与总结"}
      </button>
    </form>
  );
}
