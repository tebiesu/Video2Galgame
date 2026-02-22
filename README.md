# VideoFetch

动态视频解析网站（MVP），支持：

- YouTube / Bilibili 解析
- 视频转文字（含插件侧字幕兜底与 ASR 兜底）
- 通过 OpenAI 兼容 `new api` 渠道做 AI 总结
- 支持自定义系统提示词 + 6 种预设模板
- Markdown 结果渲染（允许 `<img>` 快照标签）
- 内置 YouTube/Bilibili 解析插件逻辑（不依赖外部目录）

## 项目结构

```text
.
├── app/                       # Next.js 页面与 API
├── components/                # 前端组件
├── lib/                       # 任务编排、模板与类型
├── services/video-adapter/    # FastAPI 适配层（封装插件）
│   ├── app/
│   └── plugins/               # 内置 YouTubeFetch / BilibiliFetch
├── docker-compose.yml
└── .env.example
```

## 快速开始（本地）

1. 安装依赖：

```bash
npm install
```

2. 复制环境变量并填写：

```bash
cp .env.example .env
```

3. 启动前端：

```bash
npm run dev
```

4. 启动适配层（另一个终端）：

```bash
cd services/video-adapter
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Docker 启动

```bash
docker compose up --build
```

- Web: `http://localhost:3000`
- Adapter: `http://localhost:8000/health`

## API 概览

- `POST /api/jobs`：创建任务
- `GET /api/jobs/:id`：查询任务状态和结果
- `GET /api/jobs/:id/events`：SSE 实时阶段流

Adapter：
- `POST /parse/youtube`
- `POST /parse/bilibili`

## 说明

- 当前为 MVP：无登录、无历史记录持久化。
- 任务状态为内存存储，服务重启会丢失任务记录。
- 适配层默认优先使用仓库内置插件；如需覆盖可通过 `YOUTUBE_PLUGIN_FILE` / `BILIBILI_PLUGIN_FILE` 指定。
