# Phase 1：IPv6 直连 HelloWorld 部署

## 目标

在 Ubuntu 虚拟机上部署一个最小 Web 页面，并通过公网 IPv6 直连访问。

最终验收目标：

- Ubuntu 虚拟机运行一个 HelloWorld Web 服务。
- 服务监听 IPv6 地址。
- Windows 本机可以访问该页面。
- 非局域网手机浏览器可以通过 IPv6 URL 打开该页面。
- 页面显示明确文本：`Hello JPLearn`。

## 范围

本阶段只验证工程链路，不实现学习功能。

包含：

- 初始化最小 Web 项目。
- 创建首页 HelloWorld。
- 在 Ubuntu 虚拟机上部署运行。
- 配置服务监听 IPv6。
- 配置 Ubuntu 防火墙。
- 给出手机可访问的 IPv6 URL。

不包含：

- 数据库。
- AI 接入。
- N5 资料导入。
- 题型系统。
- 用户系统。
- HTTPS 和域名。
- Docker 生产化部署。

## 当前已知环境

项目路径：

```text
D:\Project\Web\JPLearn
```

Ubuntu 虚拟机：

```text
IP: 192.168.1.80
用户: chenmu
SSH 端口: 22
系统: Ubuntu 24.04.4 LTS
```

前一次检查结果：

- Ubuntu 可 SSH 登录。
- Ubuntu 已安装 Git。
- Ubuntu 尚未确认安装 Node.js。
- Ubuntu 尚未确认安装 Docker。
- Windows 本机当前 PowerShell 未找到 Node.js/npm。

## 关键前提

手机要能通过非局域网访问，需要同时满足：

- 虚拟机拿到可公网路由的 IPv6 地址，不只是 `fe80::` 这类本地链路地址。
- 路由器/光猫允许入站 IPv6 访问该虚拟机。
- Ubuntu 防火墙放行 Web 端口。
- 运营商没有阻断入站 IPv6。
- 手机网络本身支持 IPv6。

如果虚拟机没有公网 IPv6，或入站 IPv6 被路由器/运营商阻断，则本阶段不能用 IPv6 直连完成，需要改用 Cloudflare Tunnel、Tailscale、frp、临时公网服务器或端口映射方案。

## 技术方案

本阶段建议使用最小 Node.js HTTP 服务，而不是完整 Next.js。

原因：

- 目标是验证外网 IPv6 访问链路。
- 最小 HTTP 服务依赖少，启动快，排障简单。
- HelloWorld 通过后，再进入 Next.js 工程初始化。

服务设计：

- 服务端口：`3000`。
- 监听地址：`::`，表示监听所有 IPv6 地址；通常也兼容 IPv4。
- 响应内容：HTML 页面，包含 `Hello JPLearn`。
- 运行方式：先用命令行前台运行验证；通过后可临时使用 `systemd` 持久运行。

手机访问 URL 格式：

```text
http://[公网IPv6地址]:3000/
```

IPv6 URL 必须用方括号包住地址。

## 执行步骤

### 1. 确认虚拟机 IPv6

在 Ubuntu 上执行：

```bash
ip -6 addr
ip -6 route
```

判断标准：

- 可用地址不能只包含 `::1` 或 `fe80::/64`。
- 优先寻找类似 `240e:`、`2408:`、`2409:`、`2xxx:` 开头的公网 IPv6。
- 默认路由中应存在 `default via ...` 或可用 IPv6 默认路由。

记录：

```text
Ubuntu 公网 IPv6：
```

### 2. 确认运行环境

在 Ubuntu 上执行：

```bash
node --version
npm --version
```

如果没有 Node.js，则安装 Node.js LTS。

建议方式：

- 开发快速验证可用 Ubuntu apt 包。
- 后续正式项目可再统一 Node LTS 版本。

### 3. 创建最小 HelloWorld 服务

在项目中创建最小服务文件，例如：

```text
hello-server/server.js
```

服务行为：

- 使用 Node.js 内置 `http` 模块。
- 监听 `::` 和端口 `3000`。
- 返回 HTML：

```html
<h1>Hello JPLearn</h1>
```

### 4. 部署到 Ubuntu 虚拟机

可选方式：

- 使用 GitHub 仓库 clone/pull。
- 或从 Windows 本机通过 `scp`/`rsync` 同步。

建议本阶段使用 GitHub：

```bash
git clone https://github.com/chenmu1999/JPLearn.git
cd JPLearn
```

如果仓库已存在：

```bash
cd JPLearn
git pull
```

### 5. 启动服务

在 Ubuntu 上执行：

```bash
node hello-server/server.js
```

预期输出：

```text
Hello JPLearn server listening on [::]:3000
```

### 6. 放行 Ubuntu 防火墙

如果 `ufw` 启用：

```bash
sudo ufw status
sudo ufw allow 3000/tcp
```

如果 `ufw` 未启用，不需要额外操作，但仍要确认路由器/光猫 IPv6 入站策略。

### 7. 本机访问验证

Windows 本机浏览器访问：

```text
http://[Ubuntu公网IPv6]:3000/
```

或者在 PowerShell 中：

```powershell
curl "http://[Ubuntu公网IPv6]:3000/"
```

验收：

- 返回 HTML。
- 内容包含 `Hello JPLearn`。

### 8. 手机非局域网访问验证

手机关闭 Wi-Fi，使用蜂窝网络访问：

```text
http://[Ubuntu公网IPv6]:3000/
```

验收：

- 手机浏览器能打开页面。
- 页面显示 `Hello JPLearn`。

## 验收标准

本阶段完成必须同时满足：

- GitHub 上存在 HelloWorld 服务代码。
- Ubuntu 虚拟机运行该服务。
- 服务监听 IPv6。
- Ubuntu 防火墙允许访问端口 `3000/tcp`。
- Windows 本机可访问。
- 手机关闭 Wi-Fi 后可访问。
- 页面显示 `Hello JPLearn`。

## 风险与排障

### 虚拟机没有公网 IPv6

现象：

- `ip -6 addr` 只有 `fe80::`。
- 手机无法访问。

处理：

- 检查虚拟机网络模式是否桥接。
- 检查路由器是否给内网设备分配 IPv6。
- 检查运营商是否提供 IPv6。

### 路由器阻止入站 IPv6

现象：

- 虚拟机有公网 IPv6。
- Windows 局域网内可访问。
- 手机蜂窝网络无法访问。

处理：

- 检查路由器 IPv6 防火墙。
- 放行虚拟机 IPv6 的 `3000/tcp`。
- 如果路由器无法放行，改用隧道方案。

### Ubuntu 防火墙阻止访问

现象：

- 服务本机可访问。
- 外部访问超时。

处理：

```bash
sudo ufw status
sudo ufw allow 3000/tcp
```

### 服务只监听 IPv4

现象：

- `127.0.0.1:3000` 可访问。
- IPv6 地址不可访问。

处理：

- 确认 Node 服务监听 host 为 `::`。
- 使用 `ss -ltnp | grep 3000` 检查监听地址。

## 完成后的下一阶段

Phase 1 完成后，再进入：

- Phase 2：初始化 Next.js 项目骨架。
- Phase 3：SQLite + Prisma。
- Phase 4：N5 数据导入。
- Phase 5：知识点浏览。
- Phase 6：第一批题型实现。
