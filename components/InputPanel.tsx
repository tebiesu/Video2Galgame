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
    <form className="ba-card animate-ba stack-lg" style={{ padding: "40px", position: "relative" }} onSubmit={submitForm}>
      {/* 装饰性元素 */}
      <div style={{ position: "absolute", top: "20px", right: "20px", opacity: 0.1, pointerEvents: "none" }}>
        <div style={{ fontSize: "40px", fontWeight: "900", textAlign: "right" }}>SCHALE</div>
        <div style={{ fontSize: "12px", letterSpacing: "4px" }}>|||| ||| | ||||| ||</div>
      </div>

      <div className="stack-sm">
        <h2 className="ba-section-title" style={{ fontSize: "18px" }}>OPERATION INITIALIZATION / 任务初始化</h2>
        <p style={{ color: "var(--ba-text-soft)", fontSize: "14px", fontWeight: "600", marginLeft: "22px" }}>请录入目标视频数据，SCHALE 系统将自动执行多维解析与摘要提取。</p>
      </div>

      {!providerReady ? (
        <div className="animate-ba" style={{ background: "rgba(255, 107, 157, 0.1)", border: "2px dashed var(--ba-pink)", padding: "16px", borderRadius: "12px", color: "var(--ba-pink)", fontWeight: "bold", display: "flex", alignItems: "center", gap: "12px" }}>
          <span>⚠️</span> 系统核心未就绪：请前往「系统设置」配置 API Provider
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        <label className="field animate-ba delay-1">
          <span className="ba-section-title">PLATFORM / 目标平台</span>
          <div style={{ marginTop: "4px" }}>
            <FancySelect
              value={platform}
              options={platformOptions}
              onChange={(v) => setPlatform(v as Platform)}
              disabled={disabled}
            />
          </div>
        </label>

        <label className="field animate-ba delay-1">
          <span className="ba-section-title">MODE / 总结模式</span>
          <div className="switch-row" style={{ marginTop: "4px", background: "var(--ba-bg-base)", padding: "4px", borderRadius: "14px" }}>
            <button type="button" className={`ba-button ${summaryMode === "template" ? "ba-button-primary" : ""}`} style={{ flex: 1, height: "44px", border: "none", boxShadow: summaryMode === "template" ? "" : "none", background: summaryMode === "template" ? "" : "transparent" }} onClick={() => onSummaryModeChange("template")}>
              预设模板
            </button>
            <button type="button" className={`ba-button ${summaryMode === "role" ? "ba-button-primary" : ""}`} style={{ flex: 1, height: "44px", border: "none", boxShadow: summaryMode === "role" ? "" : "none", background: summaryMode === "role" ? "" : "transparent" }} onClick={() => onSummaryModeChange("role")}>
              角色扮演
            </button>
          </div>
        </label>
      </div>

      <label className="field animate-ba delay-2">
        <span className="ba-section-title">TARGET URL / 目标地址</span>
        <input
          style={{ width: "100%", fontSize: "16px", border: "2px solid var(--ba-blue-light)" }}
          type="url"
          placeholder="https://www.youtube.com/watch?v=... 或 Bilibili 链接"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          disabled={disabled}
        />
      </label>

      <section className="animate-ba delay-2" style={{ background: "var(--ba-blue-light)", padding: "24px", borderRadius: "18px", border: "1px solid var(--ba-blue)", position: "relative" }}>
        <div style={{ position: "absolute", top: "-10px", left: "20px", background: "var(--ba-blue)", color: "white", padding: "2px 12px", fontSize: "10px", fontWeight: "900", borderRadius: "4px" }}>CONFIGURATION</div>
        <div className="mode-config-body">
          {summaryMode === "template" ? (
            <div className="stack-sm">
              <label className="field">
                <span style={{ fontSize: "13px", fontWeight: "800", color: "var(--ba-blue)" }}>SELECT TEMPLATE / 选择模板</span>
                <FancySelect
                  value={templateId}
                  options={TEMPLATES.map((tpl) => ({ value: tpl.id, label: tpl.name }))}
                  onChange={onTemplateChange}
                  disabled={disabled}
                />
              </label>
              <p style={{ color: "var(--ba-blue-deep)", fontSize: "12px", fontWeight: "600", marginTop: "8px", background: "white", padding: "8px 12px", borderRadius: "8px" }}>{selectedTemplate.description}</p>
            </div>
          ) : (
            <div className="stack-sm">
              <label className="field">
                <span style={{ fontSize: "13px", fontWeight: "800", color: "var(--ba-blue)" }}>SELECT CHARACTER / 选择角色</span>
                <FancySelect
                  value={selectedRoleId}
                  options={roleOptions}
                  onChange={onRoleChange}
                  disabled={disabled}
                />
              </label>
              <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "auto 1fr", gap: "16px", alignItems: "center", background: "white", padding: "12px", borderRadius: "12px" }}>
                <div style={{ width: "40px", height: "40px", background: "var(--ba-blue)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "900" }}>{roleName?.[0] || "A"}</div>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: "900" }}>{roleName || "解析助手"}</div>
                  <div style={{ fontSize: "11px", color: "var(--ba-text-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{roleStylePrompt || "默认风格解析器"}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <label className="field animate-ba delay-3">
        <span className="ba-section-title">ADDITIONAL DIRECTIVES / 追加指令</span>
        <textarea
          style={{ width: "100%", border: "2px solid var(--ba-border-color)", minHeight: "100px" }}
          value={customSystemPrompt}
          onChange={(e) => setCustomSystemPrompt(e.target.value)}
          rows={3}
          placeholder="在此录入针对本次任务的特殊指令（可选）..."
          disabled={disabled}
        />
      </label>

      <div style={{ display: "flex", gap: "20px", marginTop: "20px" }} className="animate-ba delay-3">
        <button type="submit" className="ba-button ba-button-primary active-shrink" style={{ flex: 1, height: "64px", fontSize: "18px" }} disabled={disabled || !providerReady}>
          {disabled ? "EXECUTING..." : "EXECUTE MISSION / 执行任务"}
        </button>
      </div>
    </form>
  );
}
