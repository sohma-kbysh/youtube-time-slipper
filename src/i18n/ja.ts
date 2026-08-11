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
  "popup.rangeStart": "開始日（任意）",
  "popup.rangeStartHint":
    "設定すると、仮想の現在までの全期間ではなく、指定した期間だけを閲覧できます。開始日より前の動画も非表示になります。",
  "popup.rangeClear": "クリア",
  "popup.rangeSummary": "{start} 〜 {end} を表示中",
  "popup.features": "時代に合わない機能",
  "popup.hideFutureFeatures": "当時なかった機能を隠す",
  "popup.featuresHint":
    "仮想の現在より後に登場した YouTube の機能（Shorts、Playables、ポッドキャストなど）を取り除きます。チェックを外すと残せます。",
  "popup.featuresNone": "この一覧の機能は、すべて {date} の時点で存在していました。",
  "popup.featureSince": "{date} 開始",
  "popup.fillTarget": "目標の表示本数",
  "popup.fillRounds": "1 ページあたりの追加読み込み回数の上限",
  "popup.fillCost":
    "大きくするほど空きが埋まりますが、YouTube へのリクエストも増えます。",
  "popup.discover": "この時代の動画を探す",
  "popup.discoverHint":
    "ページが少ないとき、YouTube Data API の期間検索で補充します。API キーがない場合は、期間内の動画から非パーソナライズの関連動画を探します。",
  "discover.title": "Time Slipper の履歴検索結果",
  "discover.subtitleApi": "YouTube Data API で指定期間を直接検索した結果です。",
  "discover.subtitle":
    "タイムライン内の動画から関連動画をたどったフォールバック結果です。",
  "discover.searching": "このページの履歴フィードを作成しています…",
  "discover.none":
    "この時代の新しい動画はまだ見つかりませんでした。期間を広げるか、その時代の動画を一度開いてから戻ってみてください。",
  "discover.refresh": "さらに探す",
  "popup.apiSection": "YouTube Data API（任意）",
  "popup.apiIntro":
    "自分の API キーを設定すると、指定した期間に公開された動画を再生回数順で YouTube に直接問い合わせられます。今のおすすめから推測するのではなく、その時代の実際のデータです。",
  "popup.apiKey": "あなたの API キー",
  "popup.apiGetKey": "キーの取得方法",
  "popup.apiVerify": "確認して保存",
  "popup.apiRemove": "削除",
  "popup.apiPrivacy":
    "キーはこのブラウザ内にのみ保存され、送信先は googleapis.com だけです。拡張機能は独自のキーを同梱していないため、クォータはあなた専用です。",
  "popup.apiOrder": "並び順",
  "popup.apiOrderViewCount": "再生回数",
  "popup.apiOrderRelevance": "関連度",
  "popup.apiOrderDate": "期間内で新しい順",
  "popup.apiOk": "キーは有効です。期間検索が使えます。",
  "popup.apiChecking": "キーを確認しています…",
  "popup.apiUsage": "本日およそ {units} クォータを使用（上限はおよそ {limit}）。",
  "popup.apiUsageNote":
    "この数値はローカル集計です。Google 側のクォータは米国太平洋時間の深夜にリセットされます。検索 1 回で 100 クォータ、同じ検索はキャッシュされます。",
  "popup.apiErrorInvalidKey": "キーが拒否されました。全体を正しくコピーできているか確認してください。",
  "popup.apiErrorNotEnabled":
    "キー自体は有効ですが、そのプロジェクトで YouTube Data API v3 が有効化されていません。",
  "popup.apiErrorQuota": "このキーは本日のクォータを使い切っています。",
  "popup.apiErrorPermission":
    "googleapis.com へのアクセス許可が拒否されたため、キーを使用できません。",
  "popup.apiErrorNetwork": "googleapis.com に接続できませんでした。",
  "popup.apiErrorUnexpected": "キーを確認できませんでした: {detail}",
  "popup.language": "言語",
  "popup.languageAuto": "自動",
  "popup.statusOn": "{date} より後に公開された動画は非表示です。",
  "popup.statusOff": "タイムラインは無効です。YouTube はそのまま表示されます。",
  "popup.invalidDate": "有効な日付を入力してください。",
  "popup.saveError": "設定を保存できませんでした: {message}",

  "badge.tooltip": "{date} 以前に公開された動画のみを表示中",

  "block.titleFuture": "この動画はまだ存在しません。",
  "block.titleBefore": "この動画は設定した期間の外にあります。",
  "block.window": "期間",
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
  "feed.rateLimitedTitle": "YouTube が自動取得を一時的に制限しています。",
  "feed.rateLimitedBody":
    "API キーを設定すると、動画ページを個別取得せずに公開日を一括確認できます。",
  "feed.exhausted":
    "YouTube からこれ以上の動画は得られませんでした。仮想の現在を後の日付にするか、具体的な語句で検索してみてください。",
  "feed.visibleCount": "このページの {total} 本中 {visible} 本がタイムライン内の動画です。"
};
