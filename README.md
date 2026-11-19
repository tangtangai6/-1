# LGNS Terminal

AiLGNS / AWAKE HELIX 链上数据终端。网页地址见仓库右侧「About」或 Settings → Pages。

- 价格、TVL、算力、排放等：打开网页时从 awakehelix.io 官方接口和 Anubis 链实时读取。
- 社区增长、等级分布、团队新增业绩、变动追踪：由 GitHub Actions 每 4 小时运行 `collector.js` 扫链计算，结果嵌进网页。
- 只读公开数据，不连钱包、不需要私钥、不发交易。

手动更新：Actions → 「更新 LGNS Terminal」→ Run workflow。
