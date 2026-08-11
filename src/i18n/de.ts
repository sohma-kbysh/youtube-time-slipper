import type { Catalog } from "./en.js";

export const de: Catalog = {
  "popup.enabled": "Zeitleiste aktiviert",
  "popup.virtualPresent": "Virtuelle Gegenwart",
  "popup.today": "Heute",
  "popup.viewingAsOf": "YouTube mit Stand vom {date}",
  "popup.unknownDates": "Videos mit unbekanntem Datum",
  "popup.hide": "Ausblenden",
  "popup.show": "Anzeigen",
  "popup.unknownHint":
    "Ausblenden ist strenger: Ein Video, dessen Datum nicht lesbar ist, könnte nach deiner virtuellen Gegenwart erschienen sein.",
  "popup.surfaces": "Bereiche",
  "popup.surface.home": "Startseite",
  "popup.surface.search": "Suche",
  "popup.surface.watchRelated": "Ähnliche Videos",
  "popup.surface.channel": "Kanäle",
  "popup.surface.subscriptions": "Abos",
  "popup.surface.playlists": "Playlists",
  "popup.surface.shorts": "Shorts",
  "popup.showBadge": "Zeitleisten-Kennzeichen auf YouTube anzeigen",
  "popup.fillFeed": "Weiter laden, bis die Seite gefüllt ist",
  "popup.fillFeedHint":
    "Fordert weitere Videos von YouTube an, wenn die Seite nach dem Filtern fast leer ist.",
  "popup.rangeStart": "Startdatum (optional)",
  "popup.rangeStartHint":
    "Damit siehst du einen Zeitraum statt alles bis zu deiner virtuellen Gegenwart. Videos von davor werden ebenfalls ausgeblendet.",
  "popup.rangeClear": "Löschen",
  "popup.rangeSummary": "Zeigt {start} bis {end}",
  "popup.features": "Funktionen der Epoche",
  "popup.hideFutureFeatures": "Funktionen ausblenden, die es noch nicht gab",
  "popup.featuresHint":
    "Entfernt Teile von YouTube – Shorts, Playables, Podcasts und andere –, die nach deiner virtuellen Gegenwart erschienen sind. Häkchen entfernen, um eine zu behalten.",
  "popup.featuresNone": "Alles in dieser Liste gab es am {date} bereits.",
  "popup.featureSince": "seit {date}",
  "popup.fillTarget": "Angestrebte Anzahl Videos",
  "popup.fillRounds": "Maximale Nachladevorgänge pro Seite",
  "popup.fillCost":
    "Höhere Werte füllen leere Seiten besser und verursachen mehr Anfragen an YouTube.",
  "popup.discover": "Videos aus dieser Zeit finden",
  "popup.discoverHint":
    "Filtern kann immer nur eine Teilmenge dessen liefern, was YouTube dir ohnehin empfiehlt — deshalb erscheinen immer wieder dieselben vertrauten Videos. Dies folgt stattdessen YouTubes Graph ähnlicher Videos nach außen, ausgehend von Videos in deinem Zeitraum und ohne Cookies, sodass die Vorschläge nicht personalisiert sind.",
  "discover.title": "Mehr aus dieser Zeit",
  "discover.subtitle":
    "Gefunden, indem YouTubes ähnlichen Videos ausgehend von deinem Zeitraum gefolgt wurde.",
  "discover.searching": "Suche weiter draußen nach Videos aus dieser Zeit…",
  "discover.none":
    "Noch nichts Neues aus dieser Zeit gefunden. Versuche einen größeren Zeitraum, oder öffne ein Video aus der Zeit und komm zurück.",
  "discover.refresh": "Mehr finden",
  "popup.apiSection": "YouTube Data API (optional)",
  "popup.apiIntro":
    "Mit deinem eigenen API-Schlüssel kann die Suche YouTube direkt nach Videos fragen, die zwischen deinen Daten veröffentlicht wurden, sortiert nach Aufrufen — eine echte Stichprobe der Zeit statt einer Ableitung aus den heutigen Empfehlungen.",
  "popup.apiKey": "Dein API-Schlüssel",
  "popup.apiGetKey": "So bekommst du einen Schlüssel",
  "popup.apiVerify": "Prüfen und speichern",
  "popup.apiRemove": "Entfernen",
  "popup.apiPrivacy":
    "Der Schlüssel wird nur in diesem Browser gespeichert und ausschließlich an googleapis.com gesendet. Die Erweiterung bringt keinen eigenen Schlüssel mit, dein Kontingent gehört also dir allein.",
  "popup.apiOrder": "Ergebnisse sortieren nach",
  "popup.apiOrderViewCount": "Aufrufen",
  "popup.apiOrderRelevance": "Relevanz",
  "popup.apiOrderDate": "Neueste im Zeitraum",
  "popup.apiOk": "Schlüssel funktioniert – die Zeitraumsuche ist aktiv.",
  "popup.apiChecking": "Schlüssel wird geprüft…",
  "popup.apiUsage": "Heute etwa {units} Kontingenteinheiten verbraucht, von ungefähr {limit}.",
  "popup.apiUsageNote":
    "Lokal gezählt; Googles Kontingent wird um Mitternacht US-Pazifikzeit zurückgesetzt. Eine Suche kostet 100 Einheiten, wiederholte Suchen kommen aus dem Cache.",
  "popup.apiErrorInvalidKey": "Dieser Schlüssel wurde abgelehnt. Prüfe, ob er vollständig kopiert wurde.",
  "popup.apiErrorNotEnabled":
    "Der Schlüssel ist gültig, aber YouTube Data API v3 ist für sein Projekt nicht aktiviert.",
  "popup.apiErrorQuota": "Dieser Schlüssel hat das heutige Kontingent aufgebraucht.",
  "popup.apiErrorPermission":
    "Die Berechtigung für googleapis.com wurde abgelehnt, der Schlüssel kann nicht verwendet werden.",
  "popup.apiErrorNetwork": "googleapis.com war nicht erreichbar.",
  "popup.apiErrorUnexpected": "Der Schlüssel konnte nicht geprüft werden: {detail}",
  "popup.language": "Sprache",
  "popup.languageAuto": "Automatisch",
  "popup.statusOn": "Videos, die nach dem {date} veröffentlicht wurden, sind ausgeblendet.",
  "popup.statusOff": "Zeitleiste aus – YouTube wird ungefiltert angezeigt.",
  "popup.invalidDate": "Bitte ein gültiges Datum eingeben.",
  "popup.saveError": "Einstellungen konnten nicht gespeichert werden: {message}",

  "badge.tooltip": "Zeigt Videos, die am {date} oder früher veröffentlicht wurden",

  "block.titleFuture": "Dieses Video gibt es noch nicht.",
  "block.titleBefore": "Dieses Video liegt außerhalb deines Zeitraums.",
  "block.window": "Zeitraum",
  "block.titleUnknown": "Dieses Video hat keinen bekannten Platz in deiner Zeitleiste.",
  "block.virtualPresent": "Virtuelle Gegenwart",
  "block.published": "Veröffentlicht",
  "block.unknown": "unbekannt",
  "block.goBack": "Zurück",

  "feed.sparseTitle": "Von dieser Seite existiert noch fast nichts.",
  "feed.sparseBody":
    "YouTube empfiehlt die Videos von heute, und die meisten davon sind nach dem {date} erschienen. Mehr zu laden hilft, aber je weiter deine virtuelle Gegenwart zurückliegt, desto weniger gibt es zu finden.",
  "feed.loadMore": "Mehr laden",
  "feed.loading": "Suche nach älteren Videos…",
  "feed.exhausted":
    "YouTube hat für diese Seite keine weiteren Videos. Wähle eine spätere virtuelle Gegenwart oder suche gezielt nach etwas.",
  "feed.visibleCount":
    "{visible} von {total} Videos auf dieser Seite stammen aus deiner Zeitleiste."
};
