import type { Catalog } from "./en.js";

export const ko: Catalog = {
  "popup.enabled": "타임라인 사용",
  "popup.virtualPresent": "가상의 현재",
  "popup.today": "오늘",
  "popup.viewingAsOf": "{date} 시점의 YouTube를 보고 있습니다",
  "popup.unknownDates": "게시일을 알 수 없는 동영상",
  "popup.hide": "숨기기",
  "popup.show": "표시",
  "popup.unknownHint":
    "‘숨기기’가 더 엄격합니다. 게시일을 읽을 수 없는 동영상은 가상의 현재 이후에 올라온 것일 수 있습니다.",
  "popup.surfaces": "적용 화면",
  "popup.surface.home": "홈",
  "popup.surface.search": "검색",
  "popup.surface.watchRelated": "관련 동영상",
  "popup.surface.channel": "채널",
  "popup.surface.subscriptions": "구독",
  "popup.surface.playlists": "재생목록",
  "popup.surface.shorts": "Shorts",
  "popup.showBadge": "YouTube에 타임라인 배지 표시",
  "popup.fillFeed": "피드가 찰 때까지 계속 불러오기",
  "popup.fillFeedHint":
    "필터링 후 페이지가 거의 비었을 때 YouTube에 동영상을 더 요청합니다.",
  "popup.rangeStart": "시작일 (선택)",
  "popup.rangeStartHint":
    "설정하면 가상의 현재까지 전부가 아니라 특정 기간만 볼 수 있습니다. 시작일보다 이전에 게시된 동영상도 숨겨집니다.",
  "popup.rangeClear": "지우기",
  "popup.rangeSummary": "{start} ~ {end} 표시 중",
  "popup.features": "시대에 맞지 않는 기능",
  "popup.hideFutureFeatures": "당시에 없던 기능 숨기기",
  "popup.featuresHint":
    "가상의 현재 이후에 나온 YouTube 기능(Shorts, Playables, 팟캐스트 등)을 제거합니다. 체크를 해제하면 남겨 둘 수 있습니다.",
  "popup.featuresNone": "이 목록의 기능은 {date} 시점에 모두 있었습니다.",
  "popup.featureSince": "{date} 시작",
  "popup.fillTarget": "목표 동영상 수",
  "popup.fillRounds": "페이지당 최대 추가 로드 횟수",
  "popup.fillCost":
    "값이 클수록 빈 페이지가 잘 채워지지만 YouTube에 보내는 요청도 늘어납니다.",
  "popup.discover": "이 시대의 동영상 찾기",
  "popup.discoverHint":
    "필터링만으로는 YouTube가 이미 추천하는 것의 일부만 남기 때문에, 늘 보던 동영상만 반복해서 나옵니다. 이 기능은 기간 안의 동영상에서 출발해 YouTube의 관련 동영상을 따라 바깥으로 탐색합니다. 쿠키 없이 가져오므로 결과가 개인화되지 않습니다.",
  "discover.title": "이 시대의 다른 동영상",
  "discover.subtitleApi": "YouTube Data API가 선택한 기간으로 검색한 결과입니다.",
  "discover.subtitle": "기간 안의 동영상에서 출발해 YouTube의 관련 동영상을 따라 찾았습니다.",
  "discover.searching": "더 멀리서 이 시대의 동영상을 찾는 중…",
  "discover.none":
    "아직 이 시대의 새로운 동영상을 찾지 못했습니다. 기간을 넓히거나, 그 시기의 동영상을 한 번 연 뒤 다시 시도해 보세요.",
  "discover.refresh": "더 찾기",
  "popup.apiSection": "YouTube Data API (선택)",
  "popup.apiIntro":
    "직접 발급한 API 키를 넣으면, 지정한 기간에 게시된 동영상을 조회수 순으로 YouTube에 바로 요청할 수 있습니다. 오늘의 추천에서 추측하는 것이 아니라 그 시대의 실제 표본입니다.",
  "popup.apiKey": "내 API 키",
  "popup.apiGetKey": "키 발급 방법",
  "popup.apiVerify": "확인 후 저장",
  "popup.apiRemove": "삭제",
  "popup.apiPrivacy":
    "키는 이 브라우저에만 저장되며 googleapis.com 외에는 어디로도 전송되지 않습니다. 확장 프로그램은 자체 키를 포함하지 않으므로 할당량은 온전히 사용자의 것입니다.",
  "popup.apiOrder": "정렬 기준",
  "popup.apiOrderViewCount": "조회수",
  "popup.apiOrderRelevance": "관련성",
  "popup.apiOrderDate": "기간 내 최신순",
  "popup.apiOk": "키가 정상입니다 — 시대 검색을 사용할 수 있습니다.",
  "popup.apiChecking": "키를 확인하는 중…",
  "popup.apiUsage": "오늘 약 {units} 할당량 사용 (상한 약 {limit}).",
  "popup.apiUsageNote":
    "이 수치는 로컬 집계이며, Google의 할당량은 미국 태평양 시간 자정에 초기화됩니다. 검색 1회에 100 할당량이 들고, 같은 검색은 캐시됩니다.",
  "popup.apiErrorInvalidKey": "키가 거부되었습니다. 전체가 정확히 복사되었는지 확인하세요.",
  "popup.apiErrorNotEnabled":
    "키는 유효하지만 해당 프로젝트에서 YouTube Data API v3가 활성화되어 있지 않습니다.",
  "popup.apiErrorQuota": "이 키는 오늘 할당량을 모두 사용했습니다.",
  "popup.apiErrorPermission":
    "googleapis.com 접근 권한이 거부되어 키를 사용할 수 없습니다.",
  "popup.apiErrorNetwork": "googleapis.com에 연결할 수 없습니다.",
  "popup.apiErrorUnexpected": "키를 확인하지 못했습니다: {detail}",
  "popup.language": "언어",
  "popup.languageAuto": "자동",
  "popup.statusOn": "{date} 이후에 게시된 동영상은 숨겨집니다.",
  "popup.statusOff": "타임라인이 꺼져 있습니다 — YouTube가 그대로 표시됩니다.",
  "popup.invalidDate": "올바른 날짜를 입력하세요.",
  "popup.saveError": "설정을 저장하지 못했습니다: {message}",

  "badge.tooltip": "{date} 이전에 게시된 동영상만 표시 중",

  "block.titleFuture": "이 동영상은 아직 존재하지 않습니다.",
  "block.titleBefore": "이 동영상은 설정한 기간 밖에 있습니다.",
  "block.window": "기간",
  "block.titleUnknown": "이 동영상이 타임라인의 어디에 속하는지 알 수 없습니다.",
  "block.virtualPresent": "가상의 현재",
  "block.published": "게시일",
  "block.unknown": "알 수 없음",
  "block.goBack": "돌아가기",

  "feed.sparseTitle": "이 페이지에는 아직 볼 것이 거의 없습니다.",
  "feed.sparseBody":
    "YouTube는 오늘의 동영상을 추천하며, 대부분은 {date} 이후에 게시된 것입니다. 더 불러오면 조금 나아지지만, 가상의 현재가 과거일수록 찾을 수 있는 동영상은 줄어듭니다.",
  "feed.loadMore": "더 불러오기",
  "feed.loading": "더 오래된 동영상을 찾는 중…",
  "feed.rateLimitedTitle": "YouTube가 자동 조회를 일시적으로 제한하고 있습니다.",
  "feed.rateLimitedBody": "YouTube Data API 키를 설정하면 게시일을 일괄 확인할 수 있습니다.",
  "feed.exhausted":
    "이 페이지에 대해 YouTube가 더 제공할 동영상이 없습니다. 가상의 현재를 더 나중으로 옮기거나, 구체적인 검색어로 찾아보세요.",
  "feed.visibleCount": "이 페이지의 동영상 {total}개 중 {visible}개가 타임라인 안에 있습니다."
};
