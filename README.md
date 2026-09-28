# 家谱

一个跑在飞牛 NAS 上的家族树应用：网页访问、树状图交互编辑、多人协作、可导出图片 / PDF。
数据全部存在你自己的 NAS 上，不依赖任何第三方云。

当前进度：**M1 可用版**（建人建关系 + 树状图 + 导出 + 账号登录）。

## 本地开发

需要 Node 22（SQLite 原生模块在 Node 24 上不兼容，别用更高版本）。

```bash
npm install
npm run dev          # 前端 5173，后端 8080
npm run typecheck
npm run build
npm run smoke        # 需要先起服务：PORT=8099 npm -w server run start
```

首次打开 http://localhost:5173 会引导创建管理员账号（第一个账号自动是管理员）。

## NAS 部署

镜像由 GitHub Actions 构建（amd64 + arm64 双架构），推到 GHCR。

```bash
# 建议放在统一目录
mkdir -p /vol1/1000/docker/family-tree/data
cd /vol1/1000/docker/family-tree
# 把 docker-compose.yml 放进来，镜像地址改成自己的仓库
docker compose up -d
```

访问 `http://<NAS IP>:8080`。

**国内拉 GHCR 慢或超时**时，用镜像加速前缀，例如：

```bash
docker pull ghcr.nju.edu.cn/<owner>/family-tree:latest
```

或在 `/etc/docker/daemon.json` 里配 `registry-mirrors` 后重启 docker。

数据卷 `./data` 里有：

- `app.db` 数据库
- `uploads/` 头像与照片
- `jwt-secret` 登录密钥（丢失会导致所有人需要重新登录）

## 备份

不要用 `cp` 直接复制 `app.db`（SQLite 开着 WAL 时会拿到不一致的快照），用：

```bash
sqlite3 /vol1/1000/docker/family-tree/data/app.db ".backup '/vol2/backup/family-tree-$(date +%F).db'"
```

配合飞牛的存储快照做双保险。

## 数据结构

「个人 + 家庭（Union）」两层模型，天然支持再婚、多段婚姻、领养：

- `persons` 人物：姓名、性别、生卒（支持只知年份 / 约）、头像、简介、联系方式
- `unions` 家庭：婚姻状态与时间
- `union_members` 成员：一个人在某个家庭里是配偶还是子女，子女带长幼序

数据库带 `schema_version` 表，升级容器时会自动执行迁移；删除是软删除，进回收站可恢复。

## 导出

- **PNG / SVG**：右上角「导出」，按当前画布可见范围生成（折叠的支系不会导出）
- **PDF**：同一个面板里「打印 / 存为 PDF」，浏览器打印对话框选「另存为 PDF」，纸张 A4 横向；默认自适应一页，也可以选 75% / 50% 缩小

不引入 Chromium，镜像体积可控，ARM 机器也能跑。

## 账号与权限

- **三种注册模式**（顶栏「管理」→ 站点设置）：
  - **邀请码**（默认）：管理 → 邀请码 → 生成（选角色、有效期），点「复制链接」把链接发给家人，对方打开填码即可加入
  - **开放申请 + 审核**：任何人可提交注册，你在「成员账号」里点「通过」才生效
  - **关闭注册**：只能管理员手动建账号
- **角色**：管理员（管人管设置）、编辑者（增删改家谱）、访客（只读）
- 管理员可以随时停用账号、重置密码、删除账号；**至少要保留一个可用管理员**，改不动也不会把自己锁死
- 初始化时创建的第一个账号自动是管理员

## 照片

每个人有照片墙（详情抽屉底部）：添加照片时浏览器自动压成两份上传——原图（≤1600px）和缩略图（≤320px），列表用缩略图、点开看原图。头像是单独的一张（≤512px）。后端不需要 sharp，镜像体积不受影响。

## 安全

- 登录后才可查看，未登录写入返回 401
- 角色分管理员 / 编辑者 / 访客，M1 阶段默认账号由管理员创建
- 保存带冲突检测：别人先改过时提示刷新，不会静默覆盖
- 远程访问务必叠加 HTTPS（飞牛反代或 Cloudflare Tunnel），不要裸奔公网
