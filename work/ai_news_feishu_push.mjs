import crypto from "node:crypto";

const FEISHU_WEBHOOK_URL = process.env.FEISHU_WEBHOOK_URL;
const FEISHU_SIGN_SECRET = process.env.FEISHU_SIGN_SECRET || "";

const FEEDS = [
  { name: "36氪", url: "https://www.36kr.com/feed" },
  { name: "OpenAI", url: "https://openai.com/news/rss.xml" },
  { name: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { name: "MIT Technology Review", url: "https://www.technologyreview.com/feed/" },
  { name: "WIRED AI", url: "https://www.wired.com/feed/tag/ai/latest/rss" },
];

const MAX_ITEMS = Number(process.env.MAX_ITEMS || 8);
const AI_KEYWORDS = [
  "ai",
  "artificial intelligence",
  "openai",
  "chatgpt",
  "anthropic",
  "claude",
  "gemini",
  "deepmind",
  "大模型",
  "人工智能",
  "智能体",
  "机器人",
  "算力",
  "芯片",
  "模型",
  "生成式",
  "agi",
];

if (!FEISHU_WEBHOOK_URL) {
  console.error("Missing FEISHU_WEBHOOK_URL");
  process.exit(1);
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function pickTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return stripHtml(match?.[1] || "");
}

function parseGoogleNewsRss(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(([, item]) => {
    const title = pickTag(item, "title");
    const link = pickTag(item, "link");
    const pubDate = pickTag(item, "pubDate");
    const source = pickTag(item, "source");
    return { title, link, pubDate, source };
  });
}

function parseRss(xml, fallbackSource) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(([, item]) => {
    const title = pickTag(item, "title");
    const link = pickTag(item, "link") || pickTag(item, "guid");
    const pubDate = pickTag(item, "pubDate") || pickTag(item, "updated") || pickTag(item, "published");
    const source = pickTag(item, "source") || fallbackSource;
    const description = pickTag(item, "description");
    return { title, link, pubDate, source, description };
  });
}

function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/\s+-\s+[^-]+$/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

async function fetchNews() {
  const batches = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const response = await fetch(feed.url, {
        headers: { "user-agent": "Mozilla/5.0 ai-news-feishu-bot/1.0" },
      });
      if (!response.ok) throw new Error(`${feed.name} failed: ${response.status}`);
      return parseRss(await response.text(), feed.name);
    }),
  );

  const results = batches.flatMap((batch) => (batch.status === "fulfilled" ? batch.value : []));

  const seen = new Set();
  return results
    .filter((item) => item.title && item.link)
    .filter((item) => {
      const text = `${item.title} ${item.description || ""}`.toLowerCase();
      return AI_KEYWORDS.some((keyword) => text.includes(keyword.toLowerCase()));
    })
    .filter((item) => {
      const key = normalizeTitle(item.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))
    .slice(0, MAX_ITEMS);
}

function todayInShanghai() {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(new Date());
}

function buildCard(items) {
  const elements = items.length
    ? items.flatMap((item, index) => [
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**${index + 1}. [${item.title}](${item.link})**\n来源：${item.source || "Google News"} · ${item.pubDate || "今日"}`,
          },
        },
        { tag: "hr" },
      ]).slice(0, -1)
    : [
        {
          tag: "div",
          text: { tag: "lark_md", content: "今天暂时没有抓到足够新的 AI 热点。" },
        },
      ];

  return {
    config: { wide_screen_mode: true },
    header: {
      template: "blue",
      title: { tag: "plain_text", content: `AI热点日报｜${todayInShanghai()}` },
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: "AI热点日报：今日互联网 AI 相关时事热点如下。",
        },
      },
      { tag: "hr" },
      ...elements,
    ],
  };
}

function signPayload(payload) {
  if (!FEISHU_SIGN_SECRET) return payload;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const stringToSign = `${timestamp}\n${FEISHU_SIGN_SECRET}`;
  const sign = crypto.createHmac("sha256", stringToSign).update("").digest("base64");
  return { ...payload, timestamp, sign };
}

async function sendToFeishu(card) {
  const payload = signPayload({
    msg_type: "interactive",
    card,
  });
  const response = await fetch(FEISHU_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Feishu webhook failed: ${response.status} ${body}`);
  }
  console.log(body);
}

const items = process.argv.includes("--test")
  ? [
      {
        title: "机器人测试消息：AI热点日报已接通",
        link: "https://open.feishu.cn/",
        source: "Codex",
        pubDate: new Date().toUTCString(),
      },
    ]
  : await fetchNews();

await sendToFeishu(buildCard(items));
