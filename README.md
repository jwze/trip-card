# trip-card

行程卡纪念版，纯静态、无第三方依赖。仅供怀念与展示，不作为出行或健康凭证。

- 点击手机号或途经地点修改，信息仅保存在当前浏览器。
- 支持添加到主屏幕，线上首次加载完成后可离线访问。

## GitHub Pages

在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**，将代码推送到 `main`，工作流会自动测试并部署。

访问：<https://jwze.github.io/trip-card/>（Fork 后替换为自己的用户名和仓库名）。

## 本地开发

需要 Node.js 22+，无需安装第三方依赖。

```sh
npm run dev      # http://localhost:3001，修改后手动刷新
npm test         # 自动化测试
npm run build    # 生成 build/
npm run preview  # 预览构建产物
```

页面与资源位于 `src/`。路径均为相对路径，支持站点根目录或 GitHub Pages 项目子目录部署；本地开发不启用离线缓存。
