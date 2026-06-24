# Phase 1：ngrok 隧道部署验证

## 目标

在 Ubuntu 虚拟机上运行 JPLearn，并通过 ngrok HTTPS 隧道提供测试访问。

测试阶段不再使用公网 IPv6 直连，也不要求在路由器或 Ubuntu 防火墙上开放公网 Web 端口。

## 当前环境

```text
虚拟机地址: 192.168.1.80
SSH 用户: chenmu
系统: Ubuntu 24.04.4 LTS
项目目录: /home/chenmu/JPLearn
应用端口: 3000
ngrok 路径: /home/chenmu/ngrok
```

ngrok 已在虚拟机完成安装和认证配置。

## 技术方案

```text
浏览器
  -> ngrok HTTPS 公网地址
  -> ngrok agent（Ubuntu 虚拟机）
  -> http://127.0.0.1:3000
  -> Next.js
```

- Next.js 监听虚拟机本地 `3000` 端口。
- ngrok 使用 `ngrok http 3000` 建立临时 HTTPS 隧道。
- 公网 URL 由 ngrok 分配，免费隧道重启后可能变化。
- 测试地址不得写死在应用代码中。

## 部署步骤

### 1. 同步项目

将 Windows 工作区同步到：

```text
/home/chenmu/JPLearn
```

不要同步 `.git`、`.next` 和 `node_modules`。

### 2. 安装依赖并构建

```bash
cd ~/JPLearn
pnpm install --frozen-lockfile
pnpm build
```

### 3. 启动 Next.js

```bash
cd ~/JPLearn
pnpm start --hostname 127.0.0.1 --port 3000
```

先在虚拟机内验证：

```bash
curl http://127.0.0.1:3000/
```

### 4. 启动 ngrok

```bash
~/ngrok http 3000
```

后台运行时可以将日志写入 `/tmp/ngrok.log`，并通过本地检查接口读取公网 URL：

```bash
curl http://127.0.0.1:4040/api/tunnels
```

### 5. 外网验收

使用 ngrok 返回的 `https://*.ngrok-free.dev` 地址访问。

验收标准：

- 虚拟机内访问 `127.0.0.1:3000` 成功。
- ngrok 隧道状态正常。
- Windows 浏览器可以通过 HTTPS 公网地址打开 JPLearn。
- 手机关闭 Wi-Fi 后也可以打开同一地址。
- 页面显示正式的 JPLearn Next.js 首页。

## 运行管理

测试阶段允许使用后台进程运行应用和 ngrok。进程重启后需要重新确认公网 URL。

后续需要长期稳定运行时，再补充 systemd、Docker Compose、固定 ngrok 域名或正式反向代理方案。

## 常见问题

### ngrok 返回 502

通常表示隧道存在，但 `127.0.0.1:3000` 没有正常服务。检查：

```bash
ss -ltnp | grep 3000
curl http://127.0.0.1:3000/
```

### 公网 URL 变化

免费 ngrok 隧道重启后 URL 可能变化，以 `http://127.0.0.1:4040/api/tunnels` 返回值为准。

### Node.js 版本不兼容

以 `package.json` 中当前 Next.js 版本要求为准。测试机优先使用项目独立的 Node.js LTS，避免影响系统软件。
