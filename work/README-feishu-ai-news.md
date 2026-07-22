# 飞书 AI 热点日报机器人

## 1. 先测试机器人

```bash
export FEISHU_WEBHOOK_URL="你的飞书机器人 webhook"
node work/ai_news_feishu_push.mjs --test
```

群里能看到“AI热点日报已接通”就说明机器人配置成功。

## 2. 推送今日热点

```bash
export FEISHU_WEBHOOK_URL="你的飞书机器人 webhook"
node work/ai_news_feishu_push.mjs
```

脚本会抓取近 1 天互联网 AI 相关新闻，去重后推送到飞书群。

## 3. 每天自动推送

推荐用 GitHub Actions 云端定时，这样你的电脑没开机也能推送。仓库里已经准备了：

- `.github/workflows/feishu-ai-news-daily.yml`
- `package.json`

GitHub Actions 的定时任务使用 UTC 时间，配置里的 `0 1 * * *` 等于北京时间每天 09:00。

在 GitHub 仓库设置里添加两个 Actions Secrets：

- `FEISHU_WEBHOOK_URL`
- `FEISHU_SIGN_SECRET`

保存后进入仓库的 `Actions` 页面，打开 `Feishu AI News Daily`，可以点 `Run workflow` 手动跑一次确认。
