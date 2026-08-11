import type { Catalog } from "./en.js";

export const es: Catalog = {
  "popup.enabled": "Línea temporal activada",
  "popup.virtualPresent": "Presente virtual",
  "popup.today": "Hoy",
  "popup.viewingAsOf": "Viendo YouTube tal como estaba el {date}",
  "popup.unknownDates": "Vídeos con fecha desconocida",
  "popup.hide": "Ocultar",
  "popup.show": "Mostrar",
  "popup.unknownHint":
    "Ocultar es más estricto: un vídeo cuya fecha no se puede leer podría ser posterior a tu presente virtual.",
  "popup.surfaces": "Secciones",
  "popup.surface.home": "Inicio",
  "popup.surface.search": "Búsqueda",
  "popup.surface.watchRelated": "Relacionados",
  "popup.surface.channel": "Canales",
  "popup.surface.subscriptions": "Suscripciones",
  "popup.surface.playlists": "Listas",
  "popup.surface.shorts": "Shorts",
  "popup.showBadge": "Mostrar el distintivo en YouTube",
  "popup.fillFeed": "Seguir cargando hasta llenar la página",
  "popup.fillFeedHint":
    "Pide más vídeos a YouTube cuando el filtrado deja la página casi vacía.",
  "popup.rangeStart": "Fecha inicial (opcional)",
  "popup.rangeStartHint":
    "Úsala para navegar por un periodo en lugar de todo lo anterior a tu presente virtual. Los vídeos publicados antes también se ocultan.",
  "popup.rangeClear": "Borrar",
  "popup.rangeSummary": "Mostrando del {start} al {end}",
  "popup.features": "Funciones de la época",
  "popup.hideFutureFeatures": "Ocultar funciones que aún no existían",
  "popup.featuresHint":
    "Quita partes de YouTube — Shorts, Playables, Podcasts y demás — que aparecieron después de tu presente virtual. Desmarca una para conservarla.",
  "popup.featuresNone": "Todo lo de esta lista ya existía el {date}.",
  "popup.featureSince": "desde el {date}",
  "popup.fillTarget": "Vídeos que se intentarán mostrar",
  "popup.fillRounds": "Cargas adicionales máximas por página",
  "popup.fillCost":
    "Valores más altos llenan mejor las páginas vacías y suponen más peticiones a YouTube.",
  "popup.discover": "Buscar vídeos de esta época",
  "popup.discoverHint":
    "Filtrar sólo puede devolver un subconjunto de lo que YouTube ya te recomienda, y por eso reaparecen siempre los mismos vídeos conocidos. Esto recorre el grafo de vídeos relacionados de YouTube partiendo de los que están en tu periodo, sin cookies, así que las sugerencias no están personalizadas.",
  "discover.title": "Más de esta época",
  "discover.subtitle":
    "Encontrados siguiendo los vídeos relacionados de YouTube a partir de los que ya están en tu periodo.",
  "discover.searching": "Buscando más lejos vídeos de esta época…",
  "discover.none":
    "Todavía no se ha encontrado nada nuevo de esta época. Prueba con un periodo más amplio, o abre un vídeo de entonces y vuelve.",
  "discover.refresh": "Buscar más",
  "popup.language": "Idioma",
  "popup.languageAuto": "Automático",
  "popup.statusOn": "Los vídeos publicados después del {date} están ocultos.",
  "popup.statusOff": "Línea temporal desactivada: YouTube se muestra sin filtrar.",
  "popup.invalidDate": "Introduce una fecha válida.",
  "popup.saveError": "No se pudo guardar la configuración: {message}",

  "badge.tooltip": "Mostrando vídeos publicados el {date} o antes",

  "block.titleFuture": "Este vídeo todavía no existe.",
  "block.titleBefore": "Este vídeo queda fuera de tu periodo.",
  "block.window": "Periodo",
  "block.titleUnknown": "Este vídeo no tiene un lugar conocido en tu línea temporal.",
  "block.virtualPresent": "Presente virtual",
  "block.published": "Publicado",
  "block.unknown": "desconocida",
  "block.goBack": "Volver",

  "feed.sparseTitle": "De esta página todavía no existe casi nada.",
  "feed.sparseBody":
    "YouTube recomienda vídeos de hoy, y la mayoría se publicaron después del {date}. Cargar más ayuda, pero cuanto más atrás esté tu presente virtual, menos habrá que encontrar.",
  "feed.loadMore": "Cargar más",
  "feed.loading": "Buscando vídeos más antiguos…",
  "feed.exhausted":
    "YouTube no tiene más vídeos que ofrecer para esta página. Prueba con un presente virtual más reciente o busca algo concreto.",
  "feed.visibleCount":
    "{visible} de los {total} vídeos de esta página pertenecen a tu línea temporal."
};
