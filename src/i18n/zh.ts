import type { Catalog } from "./en.js";

/** Simplified Chinese. */
export const zh: Catalog = {
  "popup.enabled": "启用时间线",
  "popup.virtualPresent": "虚拟当前日期",
  "popup.today": "今天",
  "popup.viewingAsOf": "正在浏览 {date} 时的 YouTube",
  "popup.unknownDates": "发布日期未知的视频",
  "popup.hide": "隐藏",
  "popup.show": "显示",
  "popup.unknownHint":
    "“隐藏”更严格：无法读取发布日期的视频，可能发布于虚拟当前日期之后。",
  "popup.surfaces": "生效范围",
  "popup.surface.home": "首页",
  "popup.surface.search": "搜索",
  "popup.surface.watchRelated": "相关视频",
  "popup.surface.channel": "频道",
  "popup.surface.subscriptions": "订阅内容",
  "popup.surface.playlists": "播放列表",
  "popup.surface.shorts": "Shorts",
  "popup.showBadge": "在 YouTube 上显示时间线标记",
  "popup.fillFeed": "持续加载直到页面填满",
  "popup.fillFeedHint": "当过滤后页面几乎为空时，向 YouTube 请求更多视频。",
  "popup.rangeStart": "起始日期（可选）",
  "popup.rangeStartHint":
    "设置后可以浏览一段时期，而不是虚拟当前日期之前的全部内容。早于起始日期的视频也会被隐藏。",
  "popup.rangeClear": "清除",
  "popup.rangeSummary": "正在显示 {start} 至 {end}",
  "popup.features": "时代功能",
  "popup.hideFutureFeatures": "隐藏当时还没有的功能",
  "popup.featuresHint":
    "移除在虚拟当前日期之后才推出的 YouTube 功能，例如 Shorts、Playables、播客等。取消勾选可保留。",
  "popup.featuresNone": "此列表中的功能在 {date} 时都已存在。",
  "popup.featureSince": "{date} 起",
  "popup.fillTarget": "目标视频数量",
  "popup.fillRounds": "每页最多额外加载次数",
  "popup.fillCost": "数值越大，空页面填充得越满，向 YouTube 发出的请求也越多。",
  "popup.discover": "寻找这个年代的视频",
  "popup.discoverHint":
    "仅靠过滤，只能得到 YouTube 已经推荐给你的那一部分，所以反复出现的总是你常看的视频。此功能改为从时间范围内的视频出发，沿着 YouTube 的相关视频向外查找，并且不带 Cookie，因此结果不会被个性化。",
  "discover.title": "这个年代的更多视频",
  "discover.subtitle": "从时间范围内的视频出发，沿着 YouTube 的相关视频找到。",
  "discover.searching": "正在更远处寻找这个年代的视频…",
  "discover.none":
    "暂时没有找到这个年代的新视频。可以放宽时间范围，或先打开一个那个时期的视频再回来。",
  "discover.refresh": "继续寻找",
  "popup.language": "语言",
  "popup.languageAuto": "自动",
  "popup.statusOn": "发布日期晚于 {date} 的视频已隐藏。",
  "popup.statusOff": "时间线已关闭 — YouTube 未经过滤。",
  "popup.invalidDate": "请输入有效的日期。",
  "popup.saveError": "无法保存设置：{message}",

  "badge.tooltip": "仅显示 {date} 或更早发布的视频",

  "block.titleFuture": "这个视频还不存在。",
  "block.titleBefore": "这个视频不在你设定的时间范围内。",
  "block.window": "时间范围",
  "block.titleUnknown": "无法确定这个视频在时间线中的位置。",
  "block.virtualPresent": "虚拟当前日期",
  "block.published": "发布日期",
  "block.unknown": "未知",
  "block.goBack": "返回",

  "feed.sparseTitle": "这个页面上还几乎没有内容。",
  "feed.sparseBody":
    "YouTube 推荐的是当下的视频，其中大部分发布于 {date} 之后。继续加载会有所帮助，但虚拟当前日期越靠前，能找到的内容就越少。",
  "feed.loadMore": "加载更多",
  "feed.loading": "正在寻找更早的视频…",
  "feed.exhausted":
    "YouTube 无法为此页面提供更多视频。可以把虚拟当前日期设置得晚一些，或者搜索具体的内容。",
  "feed.visibleCount": "本页 {total} 个视频中有 {visible} 个属于你的时间线。"
};
