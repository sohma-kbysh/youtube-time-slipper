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
  "popup.language": "语言",
  "popup.languageAuto": "自动",
  "popup.statusOn": "发布日期晚于 {date} 的视频已隐藏。",
  "popup.statusOff": "时间线已关闭 — YouTube 未经过滤。",
  "popup.invalidDate": "请输入有效的日期。",
  "popup.saveError": "无法保存设置：{message}",

  "badge.tooltip": "仅显示 {date} 或更早发布的视频",

  "block.titleFuture": "这个视频还不存在。",
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
