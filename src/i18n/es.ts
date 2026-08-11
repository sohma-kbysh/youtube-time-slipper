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
  "popup.language": "Idioma",
  "popup.languageAuto": "Automático",
  "popup.statusOn": "Los vídeos publicados después del {date} están ocultos.",
  "popup.statusOff": "Línea temporal desactivada: YouTube se muestra sin filtrar.",
  "popup.invalidDate": "Introduce una fecha válida.",
  "popup.saveError": "No se pudo guardar la configuración: {message}",

  "badge.tooltip": "Mostrando vídeos publicados el {date} o antes",

  "block.titleFuture": "Este vídeo todavía no existe.",
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
