"use client";

import Link from "next/link";

export default function ProviderPage(): React.ReactNode {
  return (
    <main className="provider-page">
      <section className="provider-shell">
        <header className="ba-card stack-sm">
          <h1 className="ba-section-title">Provider 诊断入口已迁移</h1>
          <p className="muted">
            为避免配置冗余，Provider 配置与连通性测试已经整合到首页「设置中心」。
          </p>
          <Link href="/" className="ba-button ba-button-primary" style={{ display: "inline-flex", textDecoration: "none" }}>
            返回首页并打开设置
          </Link>
        </header>
      </section>
    </main>
  );
}

