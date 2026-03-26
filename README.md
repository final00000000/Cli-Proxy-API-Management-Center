# CLI Proxy API 管理中心（技术文档）

[English](README_EN.md)

## 1. 项目定位

本仓库仅包含 **CLI Proxy API Management Center** 的前端管理界面。

- 技术栈：React 19 + TypeScript + Vite
- 运行方式：构建为 **单文件 `management.html`**
- 作用范围：通过后端 **Management API** 管理配置、认证文件、配额、日志、统计等
- 不包含：代理转发逻辑、模型请求转发逻辑、服务端业务实现

> 结论：这是 **前端管理面板仓库**，不是后端代理仓库。

---

## 2. 运行要求

### 2.1 后端要求

- CLI Proxy API 已启动
- 后端暴露 `/management.html` 与 `/v0/management/*`
- 建议后端版本：`>= 6.8.15`

### 2.2 前端开发要求

- Node.js `>= 20`
- npm `>= 10`

---

## 3. 本地开发

```bash
npm ci
npm run dev
```

默认开发地址：

```text
http://localhost:5173
```

打开后连接你的 CLI Proxy API 管理端地址即可。

---

## 4. 质量校验

```bash
npm test
npm run type-check
npm run build
```

说明：

- `npm test`：Vitest 单元测试
- `npm run type-check`：TypeScript 类型检查
- `npm run build`：生成单文件构建产物

---

## 5. 构建产物

执行：

```bash
npm run build
```

产物位置：

```text
dist/index.html
```

该文件已内联 JS / CSS，可直接作为：

```text
management.html
```

部署到 CLI Proxy API 静态目录。

---

## 6. 部署方式

### 6.1 直接替换静态文件

将构建产物复制到后端静态目录：

```powershell
Copy-Item "dist/index.html" "<CLI_PROXY_API_ROOT>/static/management.html" -Force
```

如果你是 Windows 本地目录部署，通常只需要覆盖 `static/management.html`。

### 6.2 Docker 部署

如果后端运行在 Docker 中，推荐两种方式：

1. 宿主机挂载静态目录  
2. 重新复制 `management.html` 到容器映射目录后重启容器

示例流程：

```powershell
npm run build
Copy-Item "dist/index.html" "<docker-mapped-static-dir>/management.html" -Force
docker restart <your-cli-proxy-api-container>
```

> 如果静态目录是宿主机 bind mount，通常覆盖文件后刷新浏览器即可；  
> 若容器内有缓存或你希望稳妥生效，可执行重启。

---

## 7. 仓库结构

```text
src/
├─ components/        # 通用组件与业务组件
├─ features/          # 页面级功能模块
├─ hooks/             # 通用 hooks
├─ i18n/              # 多语言资源
├─ pages/             # 路由页面
├─ services/api/      # 前端 API 封装
├─ stores/            # Zustand 状态管理
├─ styles/            # 全局样式与变量
└─ utils/             # 工具函数
```

关键页面：

- `AuthFilesPage.tsx`：认证文件管理
- `QuotaPage.tsx`：额度管理
- `UsagePage.tsx`：使用统计
- `ConfigPage.tsx`：配置管理
- `LogsPage.tsx`：日志管理

---

## 8. 当前定制能力

本分支重点维护以下能力：

- 认证文件：
  - 支持 `JSON` / `ZIP` 上传
  - 上传结果展示导入 / 跳过 / 失败统计
  - 列表状态持久化
  - 单页数量上限扩展

- 额度管理：
  - 搜索配置文件
  - 自定义单页数量
  - 顶部手动刷新
  - 自动刷新与刷新间隔
  - 检测 401 后自动删除
  - 周额度低于阈值自动删除

- 使用统计：
  - 保留自动刷新控制面板
  - 时间范围筛选
  - 导出 / 导入
  - 图表与详情统计

---

## 9. 分支约定

- `main`
  - 用于跟踪上游主线
- `feat/usage-stats-autorefresh-dashboard`
  - 用于维护当前自定义增强功能

当前建议：

- 日常改动优先在维护分支进行
- 合并上游更新后再回归验证
- 提交信息优先使用 **中文**

---

## 10. 常见问题

### 10.1 页面 401 / 无法连接

优先检查：

- 管理地址是否正确
- 管理密钥是否正确
- 后端是否允许远程管理

### 10.2 构建成功但页面没变化

优先检查：

- 是否把 `dist/index.html` 复制为 `management.html`
- 是否复制到了正确的静态目录
- Docker 是否使用了旧的映射目录
- 浏览器是否命中缓存

### 10.3 认证文件上传失败

优先检查：

- 文件类型是否为 `json` 或 `zip`
- 后端 Management API 是否支持对应上传逻辑
- ZIP 内文件结构是否符合后端导入要求

---

## 11. 许可证

MIT
