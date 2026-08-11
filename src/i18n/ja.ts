import type { Catalog } from "./en.js";

export const ja: Catalog = {
  "popup.enabled": "タイムラインを有効にする",
  "popup.virtualPresent": "仮想の現在",
  "popup.today": "今日",
  "popup.viewingAsOf": "{date} 時点の YouTube を表示しています",
  "popup.unknownDates": "公開日が不明な動画",
  "popup.hide": "隠す",
  "popup.show": "表示する",
  "popup.unknownHint":
    "「隠す」の方が厳密です。公開日を読み取れない動画は、仮想の現在より後の動画かもしれません。",
  "popup.surfaces": "対象の画面",
  "popup.surface.home": "ホーム",
  "popup.surface.search": "検索",
  "popup.surface.watchRelated": "関連動画",
  "popup.surface.channel": "チャンネル",
  "popup.surface.subscriptions": "登録チャンネル",
  "popup.surface.playlists": "再生リスト",
  "popup.surface.shorts": "ショート",
  "popup.showBadge": "YouTube 上にバッジを表示する",
  "popup.fillFeed": "フィードが埋まるまで読み込み続ける",
  "popup.fillFeedHint":
    "フィルタの結果ページがほぼ空になったとき、YouTube に追加の動画を要求します。",
  "popup.language": "言語",
  "popup.languageAuto": "自動",
  "popup.statusOn": "{date} より後に公開された動画は非表示です。",
  "popup.statusOff": "タイムラインは無効です。YouTube はそのまま表示されます。",
  "popup.invalidDate": "有効な日付を入力してください。",
  "popup.saveError": "設定を保存できませんでした: {message}",

  "badge.tooltip": "{date} 以前に公開された動画のみを表示中",

  "block.titleFuture": "この動画はまだ存在しません。",
  "block.titleUnknown": "この動画の公開日が分かりません。",
  "block.virtualPresent": "仮想の現在",
  "block.published": "公開日",
  "block.unknown": "不明",
  "block.goBack": "戻る",

  "feed.sparseTitle": "このページには、まだほとんど何もありません。",
  "feed.sparseBody":
    "YouTube のおすすめは今日の動画が中心で、その多くは {date} より後に公開されたものです。追加で読み込むと多少は増えますが、仮想の現在を過去に設定するほど見つかる動画は少なくなります。",
  "feed.loadMore": "さらに読み込む",
  "feed.loading": "古い動画を探しています…",
  "feed.exhausted":
    "YouTube からこれ以上の動画は得られませんでした。仮想の現在を後の日付にするか、具体的な語句で検索してみてください。",
  "feed.visibleCount": "このページの {total} 本中 {visible} 本がタイムライン内の動画です。"
};
