import { usePlaylist } from "../context/PlaylistContext";

// Map stored language setting value → ISO code
export type Lang = "en" | "fr" | "es" | "de" | "it" | "ar";
const langMap: Record<string, Lang> = {
  english: "en",
  français: "fr",
  español: "es",
  deutsch: "de",
  italiano: "it",
  arabic: "ar",
};
export const getLang = (stored: string): Lang => langMap[stored] ?? "en";
export const isRTL = (lang: Lang) => lang === "ar";

export interface Translations {
  // Navigation
  live: string;
  movies: string;
  series: string;
  radio: string;
  home: string;
  settings: string;
  account: string;

  // Home
  changePlaylist: string;
  reload: string;
  openUrlFile: string;
  enterStreamUrl: string;
  externalStream: string;
  reloadingPlaylist: string;
  playlistCacheCleared: string;
  failedToReloadPlaylist: string;
  lifetime: string;

  // Common actions
  loading: string;
  retry: string;
  back: string;
  cancel: string;
  close: string;
  on: string;
  off: string;
  enabled: string;
  disabled: string;
  search: string;
  favorites: string;
  all: string;
  noResults: string;

  // Live TV
  allChannels: string;
  searchChannels: string;
  failedToLoadChannels: string;
  nowPlaying: string;
  liveLabel: string;
  categoriesLoading: string;

  // Movies
  allMovies: string;
  searchMovies: string;
  noMovies: string;
  categoriesLoaded: string;

  // Series
  allSeries: string;
  searchSeries: string;
  noSeries: string;

  // Radio
  allStations: string;
  searchStations: string;
  noStations: string;

  // Settings labels
  settingsTitle: string;
  accountInfo: string;
  parentalControl: string;
  changeLanguage: string;
  changeLayout: string;
  hideLiveCategories: string;
  hideVodCategories: string;
  hideSeriesCategories: string;
  clearHistoryChannels: string;
  clearHistoryMovies: string;
  clearHistorySeries: string;
  liveChannelSort: string;
  streamFormat: string;
  automatic: string;
  timeFormat: string;
  themes: string;
  subtitleSettings: string;
  pipSettings: string;
  logout: string;

  // Language modal
  selectLanguage: string;
  languageChanged: string;

  // Layout modal
  chooseLayout: string;
  gridView: string;
  gridViewDesc: string;
  listView: string;
  listViewDesc: string;

  // Sort modal
  channelSorting: string;
  defaultOrder: string;
  nameAZ: string;
  nameZA: string;
  recentlyAdded: string;
  sortingChanged: string;

  // Stream format modal
  streamFormatTitle: string;
  formatChanged: string;

  // Category hide modal
  hideCategories: string;
  noCategoriesFound: string;

  // Parental modal
  parentalControlTitle: string;
  setPinDesc: string;
  verifyPinDesc: string;
  enterNewPin: string;
  setPin: string;
  verifyPin: string;
  removePin: string;
  incorrectPin: string;
  pinSet: string;
  pinRemoved: string;
  pinVerified: string;
  enterPinToAccess: string;

  // Subtitle modal
  subtitleFontSize: string;
  subtitleTextColor: string;
  small: string;
  medium: string;
  large: string;
  colorWhite: string;
  colorYellow: string;
  colorCyan: string;
  colorGreen: string;

  // Themes modal
  accentColor: string;
  backgroundImage: string;
  uploadBackground: string;
  removeBackground: string;
  previewNote: string;

  // Playlist / Account
  accountInformation: string;
  refreshInfo: string;
  refreshingAccount: string;
  accountUpdated: string;
  failedToRefresh: string;
  expiry: string;
  expires: string;
  daysLeft: string;
  serverInfo: string;
  connections: string;
  status: string;
  activeConnections: string;
  maxConnections: string;
  serverTimezone: string;
  serverTime: string;
  unlimited: string;
  active: string;
  notConnected: string;
  daysRemaining: string;
  expiresIn: string;

  // Playlist Setup
  addPlaylist: string;
  xtreamCode: string;
  m3uPlaylist: string;
  serverUrl: string;
  username: string;
  password: string;
  m3uUrl: string;
  playlistName: string;
  connect: string;
  connecting: string;
  fillAllFields: string;
  invalidM3uUrl: string;
  invalidServerUrl: string;
  playlistAdded: string;
  failedToConnect: string;

  // Manage Playlists modal
  managePlaylists: string;
  noPlaylistsAdded: string;
  addNewPlaylist: string;
  confirmDelete: string;
  active_playlist: string;
  switchTo: string;

  // Live/Movies/Series UI
  noPlaylistConnected: string;
  loadingChannels: string;
  loadingMovies: string;
  loadingSeries: string;
  watchFullScreen: string;
  addToFavorite: string;
  favorited: string;
  programGuide: string;
  loadingGuide: string;
  noGuideInfo: string;
  noChannelsFound: string;
  noMoviesFound: string;
  noSeriesFound: string;
  contentUnlocked: string;
  unlock: string;
  verify: string;
  playlistSwitched: string;
  playlistRemovedMsg: string;
  loggedOutSuccess: string;
  loadingSmall: string;
  noPlaylistLiveMsg: string;
  addPlaylistBtn: string;
  enablePip: string;
  watchWhileBrowsing: string;
  settingsLocked: string;
  timeFormatChanged: string;
  autoPlaybackChanged: string;
  backgroundUpdated: string;
  pinProtectedCategories: string;
  pinProtectedCategoriesDesc: string;
  disableParentalControl: string;
  changePin: string;
  noPinnedCategories: string;
}

const en: Translations = {
  live: "Live",
  movies: "Movies",
  series: "Series",
  radio: "Radio",
  home: "Home",
  settings: "Settings",
  account: "Account",
  changePlaylist: "Change Playlist",
  reload: "Reload",
  openUrlFile: "Open URL/File",
  enterStreamUrl: "Enter stream URL (HLS/MP4/TS):",
  externalStream: "External Stream",
  reloadingPlaylist: "Reloading playlist...",
  playlistCacheCleared: "Playlist cache cleared!",
  failedToReloadPlaylist: "Failed to reload playlist",
  lifetime: "Lifetime",
  loading: "Loading...",
  retry: "Retry",
  back: "Go Back",
  cancel: "Cancel",
  close: "Close",
  on: "On",
  off: "Off",
  enabled: "Enabled",
  disabled: "Disabled",
  search: "Search",
  favorites: "Favorites",
  all: "All",
  noResults: "No results found",
  allChannels: "All Channels",
  searchChannels: "Search channels...",
  failedToLoadChannels: "Failed to load channels",
  nowPlaying: "Playing",
  liveLabel: "Live",
  categoriesLoading: "Loading categories...",
  allMovies: "All Movies",
  searchMovies: "Search movies...",
  noMovies: "No movies found",
  categoriesLoaded: "categories loaded",
  allSeries: "All Series",
  searchSeries: "Search series...",
  noSeries: "No series found",
  allStations: "All Stations",
  searchStations: "Search stations...",
  noStations: "No stations found",
  settingsTitle: "Settings",
  accountInfo: "Account Info",
  parentalControl: "Parental Control",
  changeLanguage: "Change Language",
  changeLayout: "Change Layout",
  hideLiveCategories: "Hide Live Categories",
  hideVodCategories: "Hide Vod Categories",
  hideSeriesCategories: "Hide Series Categories",
  clearHistoryChannels: "Clear History Channels",
  clearHistoryMovies: "Clear History Movies",
  clearHistorySeries: "Clear History Series",
  liveChannelSort: "Live Channel Sort",
  streamFormat: "Stream Format (HLS/TS)",
  automatic: "Automatic",
  timeFormat: "Time Format",
  themes: "Themes",
  subtitleSettings: "Subtitle Settings",
  pipSettings: "PIP Settings",
  logout: "Logout",
  selectLanguage: "Select Language",
  languageChanged: "Language changed to",
  chooseLayout: "Choose Layout",
  gridView: "Grid View",
  gridViewDesc: "Standard poster grid layout",
  listView: "List View",
  listViewDesc: "Compact list with details",
  channelSorting: "Channel Sorting",
  defaultOrder: "Default Order",
  nameAZ: "Name (A-Z)",
  nameZA: "Name (Z-A)",
  recentlyAdded: "Recently Added",
  sortingChanged: "Sorting changed to",
  streamFormatTitle: "Stream Format",
  formatChanged: "Stream format changed to",
  hideCategories: "Hide Categories",
  noCategoriesFound: "No categories found. Please connect a playlist.",
  parentalControlTitle: "Parental Control",
  setPinDesc: "Set a 4-digit PIN to restrict access to certain categories.",
  verifyPinDesc: "Enter your 4-digit PIN to access parental settings.",
  enterNewPin: "Enter New PIN",
  setPin: "Set PIN",
  verifyPin: "Verify PIN",
  removePin: "Remove PIN",
  incorrectPin: "Incorrect PIN",
  pinSet: "Parental PIN set successfully",
  pinRemoved: "PIN removed",
  pinVerified: "PIN verified",
  enterPinToAccess: "Enter your 4-digit PIN to access these settings.",
  subtitleFontSize: "Font Size",
  subtitleTextColor: "Text Color",
  small: "Small",
  medium: "Medium",
  large: "Large",
  colorWhite: "White",
  colorYellow: "Yellow",
  colorCyan: "Cyan",
  colorGreen: "Green",
  accentColor: "Accent Color",
  backgroundImage: "Background Image",
  uploadBackground: "Upload Background",
  removeBackground: "Remove Background",
  previewNote: "Changes apply instantly",
  accountInformation: "Account Information",
  refreshInfo: "Refresh Info",
  refreshingAccount: "Refreshing account info...",
  accountUpdated: "Account info updated!",
  failedToRefresh: "Failed to refresh info. Check your connection.",
  expiry: "Exp:",
  expires: "Expires",
  daysLeft: "days left",
  serverInfo: "Server Info",
  connections: "Connections",
  status: "Status",
  activeConnections: "Active",
  maxConnections: "Max Connections",
  serverTimezone: "Timezone",
  serverTime: "Server Time",
  unlimited: "Unlimited",
  active: "Active",
  notConnected: "Not Connected",
  daysRemaining: "days remaining",
  expiresIn: "Expires in",
  addPlaylist: "Add Playlist",
  xtreamCode: "Xtream Code",
  m3uPlaylist: "M3U Playlist",
  serverUrl: "Server URL",
  username: "Username",
  password: "Password",
  m3uUrl: "M3U URL",
  playlistName: "Playlist Name",
  connect: "Connect",
  connecting: "Connecting...",
  fillAllFields: "Please fill in all fields",
  invalidM3uUrl: "Invalid M3U URL. Must start with http:// or https://",
  invalidServerUrl: "Invalid Server URL. Must start with http:// or https://",
  playlistAdded: "Playlist added successfully!",
  failedToConnect: "Failed to connect. Check your details.",
  managePlaylists: "Manage Playlists",
  noPlaylistsAdded: "No playlists added yet.",
  addNewPlaylist: "Add New Playlist",
  confirmDelete: "Remove",
  active_playlist: "Active",
  switchTo: "Switch",
  noPlaylistConnected: "No playlist connected",
  loadingChannels: "Loading Channels...",
  loadingMovies: "Loading Movies...",
  loadingSeries: "Loading Series...",
  watchFullScreen: "Watch Full Screen",
  addToFavorite: "Add to Favorite",
  favorited: "Favorited",
  programGuide: "Program Guide",
  loadingGuide: "Loading guide...",
  noGuideInfo: "No guide information available",
  noChannelsFound: "No channels found",
  noMoviesFound: "No movies found matching your search",
  noSeriesFound: "No series found matching your search",
  contentUnlocked: "Parental content unlocked",
  unlock: "Unlock",
  verify: "Verify",
  playlistSwitched: "Switched to",
  playlistRemovedMsg: "Playlist removed",
  loggedOutSuccess: "Logged out successfully",
  loadingSmall: "Loading...",
  noPlaylistLiveMsg: "Please add a playlist in settings to view live channels.",
  addPlaylistBtn: "Add Playlist",
  enablePip: "Enable PIP",
  watchWhileBrowsing: "Watch while browsing",
  settingsLocked: "settings are currently locked",
  timeFormatChanged: "Time format changed to",
  autoPlaybackChanged: "Automatic Playback",
  backgroundUpdated: "Background updated",
  pinProtectedCategories: "PIN-Protected Categories",
  pinProtectedCategoriesDesc: "Categories that require a PIN to access",
  disableParentalControl: "Disable Parental Control",
  changePin: "Change PIN",
  noPinnedCategories: "No categories are PIN-protected",
};

const fr: Translations = {
  live: "Direct",
  movies: "Films",
  series: "Séries",
  radio: "Radio",
  home: "Accueil",
  settings: "Paramètres",
  account: "Compte",
  changePlaylist: "Changer de Playlist",
  reload: "Actualiser",
  openUrlFile: "Ouvrir URL/Fichier",
  enterStreamUrl: "Entrez l'URL du flux (HLS/MP4/TS) :",
  externalStream: "Flux externe",
  reloadingPlaylist: "Rechargement...",
  playlistCacheCleared: "Cache vidé !",
  failedToReloadPlaylist: "Échec du rechargement",
  lifetime: "Illimité",
  loading: "Chargement...",
  retry: "Réessayer",
  back: "Retour",
  cancel: "Annuler",
  close: "Fermer",
  on: "Activé",
  off: "Désactivé",
  enabled: "Activé",
  disabled: "Désactivé",
  search: "Rechercher",
  favorites: "Favoris",
  all: "Tous",
  noResults: "Aucun résultat",
  allChannels: "Toutes les chaînes",
  searchChannels: "Rechercher des chaînes...",
  failedToLoadChannels: "Échec du chargement des chaînes",
  nowPlaying: "En cours",
  liveLabel: "En direct",
  categoriesLoading: "Chargement des catégories...",
  allMovies: "Tous les films",
  searchMovies: "Rechercher des films...",
  noMovies: "Aucun film trouvé",
  categoriesLoaded: "catégories chargées",
  allSeries: "Toutes les séries",
  searchSeries: "Rechercher des séries...",
  noSeries: "Aucune série trouvée",
  allStations: "Toutes les stations",
  searchStations: "Rechercher des stations...",
  noStations: "Aucune station trouvée",
  settingsTitle: "Paramètres",
  accountInfo: "Infos du compte",
  parentalControl: "Contrôle parental",
  changeLanguage: "Changer la langue",
  changeLayout: "Changer la mise en page",
  hideLiveCategories: "Masquer catégories Live",
  hideVodCategories: "Masquer catégories VOD",
  hideSeriesCategories: "Masquer catégories Séries",
  clearHistoryChannels: "Effacer historique chaînes",
  clearHistoryMovies: "Effacer historique films",
  clearHistorySeries: "Effacer historique séries",
  liveChannelSort: "Trier les chaînes",
  streamFormat: "Format de flux (HLS/TS)",
  automatic: "Automatique",
  timeFormat: "Format d'heure",
  themes: "Thèmes",
  subtitleSettings: "Sous-titres",
  pipSettings: "Paramètres PIP",
  logout: "Déconnexion",
  selectLanguage: "Choisir la langue",
  languageChanged: "Langue changée en",
  chooseLayout: "Choisir la mise en page",
  gridView: "Grille",
  gridViewDesc: "Disposition en grille standard",
  listView: "Liste",
  listViewDesc: "Liste compacte avec détails",
  channelSorting: "Tri des chaînes",
  defaultOrder: "Ordre par défaut",
  nameAZ: "Nom (A-Z)",
  nameZA: "Nom (Z-A)",
  recentlyAdded: "Récemment ajouté",
  sortingChanged: "Tri changé en",
  streamFormatTitle: "Format de flux",
  formatChanged: "Format changé en",
  hideCategories: "Masquer catégories",
  noCategoriesFound: "Aucune catégorie trouvée. Connectez une playlist.",
  parentalControlTitle: "Contrôle parental",
  setPinDesc:
    "Définissez un code PIN à 4 chiffres pour restreindre l'accès à certaines catégories.",
  verifyPinDesc:
    "Entrez votre code PIN à 4 chiffres pour accéder aux paramètres parentaux.",
  enterNewPin: "Entrer un nouveau PIN",
  setPin: "Définir le PIN",
  verifyPin: "Vérifier le PIN",
  removePin: "Supprimer le PIN",
  incorrectPin: "PIN incorrect",
  pinSet: "PIN parental défini avec succès",
  pinRemoved: "PIN supprimé",
  pinVerified: "PIN vérifié",
  enterPinToAccess:
    "Entrez votre PIN à 4 chiffres pour accéder à ces paramètres.",
  subtitleFontSize: "Taille de police",
  subtitleTextColor: "Couleur du texte",
  small: "Petit",
  medium: "Moyen",
  large: "Grand",
  colorWhite: "Blanc",
  colorYellow: "Jaune",
  colorCyan: "Cyan",
  colorGreen: "Vert",
  accentColor: "Couleur d'accentuation",
  backgroundImage: "Image de fond",
  uploadBackground: "Télécharger un fond",
  removeBackground: "Supprimer le fond",
  previewNote: "Les changements s'appliquent instantanément",
  accountInformation: "Informations du compte",
  refreshInfo: "Actualiser les infos",
  refreshingAccount: "Actualisation du compte...",
  accountUpdated: "Informations mises à jour !",
  failedToRefresh: "Échec de l'actualisation. Vérifiez votre connexion.",
  expiry: "Exp :",
  expires: "Expire",
  daysLeft: "jours restants",
  serverInfo: "Infos serveur",
  connections: "Connexions",
  status: "Statut",
  activeConnections: "Actives",
  maxConnections: "Connexions max",
  serverTimezone: "Fuseau horaire",
  serverTime: "Heure serveur",
  unlimited: "Illimité",
  active: "Actif",
  notConnected: "Non connecté",
  daysRemaining: "jours restants",
  expiresIn: "Expire dans",
  addPlaylist: "Ajouter une playlist",
  xtreamCode: "Code Xtream",
  m3uPlaylist: "Playlist M3U",
  serverUrl: "URL du serveur",
  username: "Nom d'utilisateur",
  password: "Mot de passe",
  m3uUrl: "URL M3U",
  playlistName: "Nom de la playlist",
  connect: "Connexion",
  connecting: "Connexion en cours...",
  fillAllFields: "Veuillez remplir tous les champs",
  invalidM3uUrl: "URL M3U invalide. Doit commencer par http:// ou https://",
  invalidServerUrl:
    "URL serveur invalide. Doit commencer par http:// ou https://",
  playlistAdded: "Playlist ajoutée avec succès !",
  failedToConnect: "Échec de la connexion. Vérifiez vos informations.",
  managePlaylists: "Gérer les playlists",
  noPlaylistsAdded: "Aucune playlist ajoutée.",
  addNewPlaylist: "Ajouter une nouvelle playlist",
  confirmDelete: "Supprimer",
  active_playlist: "Actif",
  switchTo: "Changer",
  noPlaylistConnected: "Aucune playlist connectée",
  loadingChannels: "Chargement des chaînes...",
  loadingMovies: "Chargement des films...",
  loadingSeries: "Chargement des séries...",
  watchFullScreen: "Regarder en plein écran",
  addToFavorite: "Ajouter aux favoris",
  favorited: "En favoris",
  programGuide: "Guide des programmes",
  loadingGuide: "Chargement du guide...",
  noGuideInfo: "Aucune information de guide disponible",
  noChannelsFound: "Aucune chaîne trouvée",
  noMoviesFound: "Aucun film trouvé pour cette recherche",
  noSeriesFound: "Aucune série trouvée pour cette recherche",
  contentUnlocked: "Contenu parental déverrouillé",
  unlock: "Déverrouiller",
  verify: "Vérifier",
  playlistSwitched: "Basculé vers",
  playlistRemovedMsg: "Playlist supprimée",
  loggedOutSuccess: "Déconnexion réussie",
  loadingSmall: "Chargement...",
  noPlaylistLiveMsg:
    "Veuillez ajouter une playlist dans les paramètres pour voir les chaînes en direct.",
  addPlaylistBtn: "Ajouter une playlist",
  enablePip: "Activer le PIP",
  watchWhileBrowsing: "Regarder en naviguant",
  settingsLocked: "paramètres actuellement verrouillés",
  timeFormatChanged: "Format d'heure changé en",
  autoPlaybackChanged: "Lecture automatique",
  backgroundUpdated: "Fond mis à jour",
  pinProtectedCategories: "Catégories protégées par PIN",
  pinProtectedCategoriesDesc: "Catégories nécessitant un PIN pour accéder",
  disableParentalControl: "Désactiver le contrôle parental",
  changePin: "Changer le PIN",
  noPinnedCategories: "Aucune catégorie n'est protégée par PIN",
};

const es: Translations = {
  live: "En Vivo",
  movies: "Películas",
  series: "Series",
  radio: "Radio",
  home: "Inicio",
  settings: "Ajustes",
  account: "Cuenta",
  changePlaylist: "Cambiar lista",
  reload: "Recargar",
  openUrlFile: "Abrir URL/Archivo",
  enterStreamUrl: "Ingresa la URL del stream (HLS/MP4/TS):",
  externalStream: "Stream externo",
  reloadingPlaylist: "Recargando lista...",
  playlistCacheCleared: "¡Caché limpiado!",
  failedToReloadPlaylist: "Error al recargar lista",
  lifetime: "De por vida",
  loading: "Cargando...",
  retry: "Reintentar",
  back: "Volver",
  cancel: "Cancelar",
  close: "Cerrar",
  on: "Activado",
  off: "Desactivado",
  enabled: "Activado",
  disabled: "Desactivado",
  search: "Buscar",
  favorites: "Favoritos",
  all: "Todos",
  noResults: "No se encontraron resultados",
  allChannels: "Todos los canales",
  searchChannels: "Buscar canales...",
  failedToLoadChannels: "Error al cargar canales",
  nowPlaying: "Reproduciendo",
  liveLabel: "En vivo",
  categoriesLoading: "Cargando categorías...",
  allMovies: "Todas las películas",
  searchMovies: "Buscar películas...",
  noMovies: "No se encontraron películas",
  categoriesLoaded: "categorías cargadas",
  allSeries: "Todas las series",
  searchSeries: "Buscar series...",
  noSeries: "No se encontraron series",
  allStations: "Todas las estaciones",
  searchStations: "Buscar estaciones...",
  noStations: "No se encontraron estaciones",
  settingsTitle: "Ajustes",
  accountInfo: "Info de cuenta",
  parentalControl: "Control parental",
  changeLanguage: "Cambiar idioma",
  changeLayout: "Cambiar diseño",
  hideLiveCategories: "Ocultar categorías Live",
  hideVodCategories: "Ocultar categorías VOD",
  hideSeriesCategories: "Ocultar categorías Series",
  clearHistoryChannels: "Borrar historial canales",
  clearHistoryMovies: "Borrar historial películas",
  clearHistorySeries: "Borrar historial series",
  liveChannelSort: "Ordenar canales",
  streamFormat: "Formato de stream (HLS/TS)",
  automatic: "Automático",
  timeFormat: "Formato de hora",
  themes: "Temas",
  subtitleSettings: "Subtítulos",
  pipSettings: "Ajustes PIP",
  logout: "Cerrar sesión",
  selectLanguage: "Seleccionar idioma",
  languageChanged: "Idioma cambiado a",
  chooseLayout: "Elegir diseño",
  gridView: "Vista en cuadrícula",
  gridViewDesc: "Diseño estándar en cuadrícula",
  listView: "Vista en lista",
  listViewDesc: "Lista compacta con detalles",
  channelSorting: "Ordenar canales",
  defaultOrder: "Orden predeterminado",
  nameAZ: "Nombre (A-Z)",
  nameZA: "Nombre (Z-A)",
  recentlyAdded: "Añadido recientemente",
  sortingChanged: "Orden cambiado a",
  streamFormatTitle: "Formato de stream",
  formatChanged: "Formato cambiado a",
  hideCategories: "Ocultar categorías",
  noCategoriesFound: "No se encontraron categorías. Conecta una lista.",
  parentalControlTitle: "Control parental",
  setPinDesc:
    "Establece un PIN de 4 dígitos para restringir el acceso a ciertas categorías.",
  verifyPinDesc:
    "Ingresa tu PIN de 4 dígitos para acceder a los ajustes parentales.",
  enterNewPin: "Ingresa nuevo PIN",
  setPin: "Establecer PIN",
  verifyPin: "Verificar PIN",
  removePin: "Eliminar PIN",
  incorrectPin: "PIN incorrecto",
  pinSet: "PIN parental establecido",
  pinRemoved: "PIN eliminado",
  pinVerified: "PIN verificado",
  enterPinToAccess: "Ingresa tu PIN de 4 dígitos para acceder a estos ajustes.",
  subtitleFontSize: "Tamaño de fuente",
  subtitleTextColor: "Color del texto",
  small: "Pequeño",
  medium: "Mediano",
  large: "Grande",
  colorWhite: "Blanco",
  colorYellow: "Amarillo",
  colorCyan: "Cian",
  colorGreen: "Verde",
  accentColor: "Color de acento",
  backgroundImage: "Imagen de fondo",
  uploadBackground: "Subir fondo",
  removeBackground: "Eliminar fondo",
  previewNote: "Los cambios se aplican al instante",
  accountInformation: "Información de cuenta",
  refreshInfo: "Actualizar info",
  refreshingAccount: "Actualizando cuenta...",
  accountUpdated: "¡Info de cuenta actualizada!",
  failedToRefresh: "Error al actualizar. Verifica tu conexión.",
  expiry: "Vence:",
  expires: "Vence",
  daysLeft: "días restantes",
  serverInfo: "Info del servidor",
  connections: "Conexiones",
  status: "Estado",
  activeConnections: "Activas",
  maxConnections: "Máx. conexiones",
  serverTimezone: "Zona horaria",
  serverTime: "Hora del servidor",
  unlimited: "Ilimitado",
  active: "Activo",
  notConnected: "No conectado",
  daysRemaining: "días restantes",
  expiresIn: "Vence en",
  addPlaylist: "Añadir lista",
  xtreamCode: "Código Xtream",
  m3uPlaylist: "Lista M3U",
  serverUrl: "URL del servidor",
  username: "Usuario",
  password: "Contraseña",
  m3uUrl: "URL M3U",
  playlistName: "Nombre de la lista",
  connect: "Conectar",
  connecting: "Conectando...",
  fillAllFields: "Por favor, completa todos los campos",
  invalidM3uUrl: "URL M3U inválida. Debe comenzar con http:// o https://",
  invalidServerUrl:
    "URL de servidor inválida. Debe comenzar con http:// o https://",
  playlistAdded: "¡Lista añadida exitosamente!",
  failedToConnect: "Error al conectar. Verifica tus datos.",
  managePlaylists: "Gestionar listas",
  noPlaylistsAdded: "Ninguna lista añadida.",
  addNewPlaylist: "Añadir nueva lista",
  confirmDelete: "Eliminar",
  active_playlist: "Activo",
  switchTo: "Cambiar",
  noPlaylistConnected: "No hay playlist conectada",
  loadingChannels: "Cargando canales...",
  loadingMovies: "Cargando películas...",
  loadingSeries: "Cargando series...",
  watchFullScreen: "Ver en pantalla completa",
  addToFavorite: "Agregar a favoritos",
  favorited: "En favoritos",
  programGuide: "Guía de programas",
  loadingGuide: "Cargando guía...",
  noGuideInfo: "No hay información de guía disponible",
  noChannelsFound: "No se encontraron canales",
  noMoviesFound: "No se encontraron películas para tu búsqueda",
  noSeriesFound: "No se encontraron series para tu búsqueda",
  contentUnlocked: "Contenido parental desbloqueado",
  unlock: "Desbloquear",
  verify: "Verificar",
  playlistSwitched: "Cambiado a",
  playlistRemovedMsg: "Lista eliminada",
  loggedOutSuccess: "Sesión cerrada exitosamente",
  loadingSmall: "Cargando...",
  noPlaylistLiveMsg:
    "Por favor agrega una lista en configuración para ver canales en vivo.",
  addPlaylistBtn: "Agregar lista",
  enablePip: "Activar PIP",
  watchWhileBrowsing: "Ver mientras navegas",
  settingsLocked: "ajustes bloqueados actualmente",
  timeFormatChanged: "Formato de hora cambiado a",
  autoPlaybackChanged: "Reproducción automática",
  backgroundUpdated: "Fondo actualizado",
  pinProtectedCategories: "Categorías protegidas por PIN",
  pinProtectedCategoriesDesc: "Categorías que requieren un PIN para acceder",
  disableParentalControl: "Desactivar control parental",
  changePin: "Cambiar PIN",
  noPinnedCategories: "No hay categorías protegidas por PIN",
};

const de: Translations = {
  live: "Live",
  movies: "Filme",
  series: "Serien",
  radio: "Radio",
  home: "Startseite",
  settings: "Einstellungen",
  account: "Konto",
  changePlaylist: "Playlist wechseln",
  reload: "Neu laden",
  openUrlFile: "URL/Datei öffnen",
  enterStreamUrl: "Stream-URL eingeben (HLS/MP4/TS):",
  externalStream: "Externer Stream",
  reloadingPlaylist: "Playlist wird geladen...",
  playlistCacheCleared: "Cache geleert!",
  failedToReloadPlaylist: "Playlist konnte nicht neu geladen werden",
  lifetime: "Unbegrenzt",
  loading: "Laden...",
  retry: "Wiederholen",
  back: "Zurück",
  cancel: "Abbrechen",
  close: "Schließen",
  on: "An",
  off: "Aus",
  enabled: "Aktiviert",
  disabled: "Deaktiviert",
  search: "Suchen",
  favorites: "Favoriten",
  all: "Alle",
  noResults: "Keine Ergebnisse gefunden",
  allChannels: "Alle Sender",
  searchChannels: "Sender suchen...",
  failedToLoadChannels: "Sender konnten nicht geladen werden",
  nowPlaying: "Wird abgespielt",
  liveLabel: "Live",
  categoriesLoading: "Kategorien werden geladen...",
  allMovies: "Alle Filme",
  searchMovies: "Filme suchen...",
  noMovies: "Keine Filme gefunden",
  categoriesLoaded: "Kategorien geladen",
  allSeries: "Alle Serien",
  searchSeries: "Serien suchen...",
  noSeries: "Keine Serien gefunden",
  allStations: "Alle Sender",
  searchStations: "Sender suchen...",
  noStations: "Keine Sender gefunden",
  settingsTitle: "Einstellungen",
  accountInfo: "Kontoinformationen",
  parentalControl: "Kindersicherung",
  changeLanguage: "Sprache ändern",
  changeLayout: "Layout ändern",
  hideLiveCategories: "Live-Kategorien ausblenden",
  hideVodCategories: "VOD-Kategorien ausblenden",
  hideSeriesCategories: "Serien-Kategorien ausblenden",
  clearHistoryChannels: "Kanal-Verlauf löschen",
  clearHistoryMovies: "Film-Verlauf löschen",
  clearHistorySeries: "Serien-Verlauf löschen",
  liveChannelSort: "Sender sortieren",
  streamFormat: "Stream-Format (HLS/TS)",
  automatic: "Automatisch",
  timeFormat: "Zeitformat",
  themes: "Themen",
  subtitleSettings: "Untertitel",
  pipSettings: "PIP-Einstellungen",
  logout: "Abmelden",
  selectLanguage: "Sprache auswählen",
  languageChanged: "Sprache geändert zu",
  chooseLayout: "Layout wählen",
  gridView: "Rasteransicht",
  gridViewDesc: "Standard-Raster-Layout",
  listView: "Listenansicht",
  listViewDesc: "Kompakte Liste mit Details",
  channelSorting: "Sender sortieren",
  defaultOrder: "Standardreihenfolge",
  nameAZ: "Name (A-Z)",
  nameZA: "Name (Z-A)",
  recentlyAdded: "Zuletzt hinzugefügt",
  sortingChanged: "Sortierung geändert zu",
  streamFormatTitle: "Stream-Format",
  formatChanged: "Format geändert zu",
  hideCategories: "Kategorien ausblenden",
  noCategoriesFound: "Keine Kategorien gefunden. Bitte Playlist verbinden.",
  parentalControlTitle: "Kindersicherung",
  setPinDesc:
    "Legen Sie eine 4-stellige PIN fest, um den Zugriff auf bestimmte Kategorien einzuschränken.",
  verifyPinDesc:
    "Geben Sie Ihre 4-stellige PIN ein, um auf die Kindersicherungseinstellungen zuzugreifen.",
  enterNewPin: "Neue PIN eingeben",
  setPin: "PIN festlegen",
  verifyPin: "PIN überprüfen",
  removePin: "PIN entfernen",
  incorrectPin: "Falsche PIN",
  pinSet: "Kindersicherungs-PIN erfolgreich gesetzt",
  pinRemoved: "PIN entfernt",
  pinVerified: "PIN überprüft",
  enterPinToAccess:
    "Geben Sie Ihre 4-stellige PIN ein, um auf diese Einstellungen zuzugreifen.",
  subtitleFontSize: "Schriftgröße",
  subtitleTextColor: "Textfarbe",
  small: "Klein",
  medium: "Mittel",
  large: "Groß",
  colorWhite: "Weiß",
  colorYellow: "Gelb",
  colorCyan: "Cyan",
  colorGreen: "Grün",
  accentColor: "Akzentfarbe",
  backgroundImage: "Hintergrundbild",
  uploadBackground: "Hintergrund hochladen",
  removeBackground: "Hintergrund entfernen",
  previewNote: "Änderungen werden sofort übernommen",
  accountInformation: "Kontoinformationen",
  refreshInfo: "Info aktualisieren",
  refreshingAccount: "Kontoinformationen werden aktualisiert...",
  accountUpdated: "Kontoinformationen aktualisiert!",
  failedToRefresh: "Aktualisierung fehlgeschlagen. Verbindung prüfen.",
  expiry: "Abl.:",
  expires: "Läuft ab",
  daysLeft: "Tage verbleibend",
  serverInfo: "Serverinformationen",
  connections: "Verbindungen",
  status: "Status",
  activeConnections: "Aktiv",
  maxConnections: "Maximale Verbindungen",
  serverTimezone: "Zeitzone",
  serverTime: "Serverzeit",
  unlimited: "Unbegrenzt",
  active: "Aktiv",
  notConnected: "Nicht verbunden",
  daysRemaining: "Tage verbleibend",
  expiresIn: "Läuft ab in",
  addPlaylist: "Playlist hinzufügen",
  xtreamCode: "Xtream-Code",
  m3uPlaylist: "M3U-Playlist",
  serverUrl: "Server-URL",
  username: "Benutzername",
  password: "Passwort",
  m3uUrl: "M3U-URL",
  playlistName: "Playlist-Name",
  connect: "Verbinden",
  connecting: "Wird verbunden...",
  fillAllFields: "Bitte alle Felder ausfüllen",
  invalidM3uUrl: "Ungültige M3U-URL. Muss mit http:// oder https:// beginnen.",
  invalidServerUrl:
    "Ungültige Server-URL. Muss mit http:// oder https:// beginnen.",
  playlistAdded: "Playlist erfolgreich hinzugefügt!",
  failedToConnect: "Verbindung fehlgeschlagen. Daten prüfen.",
  managePlaylists: "Playlists verwalten",
  noPlaylistsAdded: "Noch keine Playlists hinzugefügt.",
  addNewPlaylist: "Neue Playlist hinzufügen",
  confirmDelete: "Entfernen",
  active_playlist: "Aktiv",
  switchTo: "Wechseln",
  noPlaylistConnected: "Keine Playlist verbunden",
  loadingChannels: "Sender werden geladen...",
  loadingMovies: "Filme werden geladen...",
  loadingSeries: "Serien werden geladen...",
  watchFullScreen: "Vollbild ansehen",
  addToFavorite: "Zu Favoriten hinzufügen",
  favorited: "In Favoriten",
  programGuide: "Programmführer",
  loadingGuide: "Programm wird geladen...",
  noGuideInfo: "Keine Programminformationen verfügbar",
  noChannelsFound: "Keine Sender gefunden",
  noMoviesFound: "Keine Filme für diese Suche gefunden",
  noSeriesFound: "Keine Serien für diese Suche gefunden",
  contentUnlocked: "Kindersicherungsinhalt entsperrt",
  unlock: "Entsperren",
  verify: "Überprüfen",
  playlistSwitched: "Gewechselt zu",
  playlistRemovedMsg: "Playlist entfernt",
  loggedOutSuccess: "Erfolgreich abgemeldet",
  loadingSmall: "Laden...",
  noPlaylistLiveMsg:
    "Bitte fügen Sie eine Playlist in den Einstellungen hinzu, um Live-Sender zu sehen.",
  addPlaylistBtn: "Playlist hinzufügen",
  enablePip: "PIP aktivieren",
  watchWhileBrowsing: "Beim Surfen ansehen",
  settingsLocked: "Einstellungen derzeit gesperrt",
  timeFormatChanged: "Zeitformat geändert zu",
  autoPlaybackChanged: "Automatische Wiedergabe",
  backgroundUpdated: "Hintergrund aktualisiert",
  pinProtectedCategories: "PIN-geschützte Kategorien",
  pinProtectedCategoriesDesc: "Kategorien, die einen PIN zum Zugriff benötigen",
  disableParentalControl: "Kindersicherung deaktivieren",
  changePin: "PIN ändern",
  noPinnedCategories: "Keine Kategorien sind PIN-geschützt",
};

const it: Translations = {
  live: "In Diretta",
  movies: "Film",
  series: "Serie",
  radio: "Radio",
  home: "Home",
  settings: "Impostazioni",
  account: "Account",
  changePlaylist: "Cambia Playlist",
  reload: "Ricarica",
  openUrlFile: "Apri URL/File",
  enterStreamUrl: "Inserisci URL dello stream (HLS/MP4/TS):",
  externalStream: "Stream esterno",
  reloadingPlaylist: "Ricaricamento playlist...",
  playlistCacheCleared: "Cache svuotata!",
  failedToReloadPlaylist: "Impossibile ricaricare la playlist",
  lifetime: "A vita",
  loading: "Caricamento...",
  retry: "Riprova",
  back: "Indietro",
  cancel: "Annulla",
  close: "Chiudi",
  on: "Attivo",
  off: "Disattivo",
  enabled: "Attivato",
  disabled: "Disattivato",
  search: "Cerca",
  favorites: "Preferiti",
  all: "Tutti",
  noResults: "Nessun risultato trovato",
  allChannels: "Tutti i canali",
  searchChannels: "Cerca canali...",
  failedToLoadChannels: "Impossibile caricare i canali",
  nowPlaying: "In riproduzione",
  liveLabel: "In diretta",
  categoriesLoading: "Caricamento categorie...",
  allMovies: "Tutti i film",
  searchMovies: "Cerca film...",
  noMovies: "Nessun film trovato",
  categoriesLoaded: "categorie caricate",
  allSeries: "Tutte le serie",
  searchSeries: "Cerca serie...",
  noSeries: "Nessuna serie trovata",
  allStations: "Tutte le stazioni",
  searchStations: "Cerca stazioni...",
  noStations: "Nessuna stazione trovata",
  settingsTitle: "Impostazioni",
  accountInfo: "Info account",
  parentalControl: "Controllo parentale",
  changeLanguage: "Cambia lingua",
  changeLayout: "Cambia layout",
  hideLiveCategories: "Nascondi categorie Live",
  hideVodCategories: "Nascondi categorie VOD",
  hideSeriesCategories: "Nascondi categorie Serie",
  clearHistoryChannels: "Cancella cronologia canali",
  clearHistoryMovies: "Cancella cronologia film",
  clearHistorySeries: "Cancella cronologia serie",
  liveChannelSort: "Ordina canali",
  streamFormat: "Formato stream (HLS/TS)",
  automatic: "Automatico",
  timeFormat: "Formato ora",
  themes: "Temi",
  subtitleSettings: "Sottotitoli",
  pipSettings: "Impostazioni PIP",
  logout: "Esci",
  selectLanguage: "Seleziona lingua",
  languageChanged: "Lingua cambiata in",
  chooseLayout: "Scegli layout",
  gridView: "Griglia",
  gridViewDesc: "Layout griglia standard",
  listView: "Lista",
  listViewDesc: "Lista compatta con dettagli",
  channelSorting: "Ordine canali",
  defaultOrder: "Ordine predefinito",
  nameAZ: "Nome (A-Z)",
  nameZA: "Nome (Z-A)",
  recentlyAdded: "Aggiunto di recente",
  sortingChanged: "Ordine cambiato in",
  streamFormatTitle: "Formato stream",
  formatChanged: "Formato cambiato in",
  hideCategories: "Nascondi categorie",
  noCategoriesFound: "Nessuna categoria trovata. Connetti una playlist.",
  parentalControlTitle: "Controllo parentale",
  setPinDesc:
    "Imposta un PIN a 4 cifre per limitare l'accesso a certe categorie.",
  verifyPinDesc:
    "Inserisci il PIN a 4 cifre per accedere alle impostazioni parentali.",
  enterNewPin: "Inserisci nuovo PIN",
  setPin: "Imposta PIN",
  verifyPin: "Verifica PIN",
  removePin: "Rimuovi PIN",
  incorrectPin: "PIN errato",
  pinSet: "PIN parentale impostato con successo",
  pinRemoved: "PIN rimosso",
  pinVerified: "PIN verificato",
  enterPinToAccess:
    "Inserisci il PIN a 4 cifre per accedere a queste impostazioni.",
  subtitleFontSize: "Dimensione font",
  subtitleTextColor: "Colore testo",
  small: "Piccolo",
  medium: "Medio",
  large: "Grande",
  colorWhite: "Bianco",
  colorYellow: "Giallo",
  colorCyan: "Ciano",
  colorGreen: "Verde",
  accentColor: "Colore accento",
  backgroundImage: "Immagine di sfondo",
  uploadBackground: "Carica sfondo",
  removeBackground: "Rimuovi sfondo",
  previewNote: "Le modifiche si applicano immediatamente",
  accountInformation: "Informazioni account",
  refreshInfo: "Aggiorna info",
  refreshingAccount: "Aggiornamento info account...",
  accountUpdated: "Info account aggiornate!",
  failedToRefresh: "Aggiornamento fallito. Controlla la connessione.",
  expiry: "Scad.:",
  expires: "Scade",
  daysLeft: "giorni rimanenti",
  serverInfo: "Info server",
  connections: "Connessioni",
  status: "Stato",
  activeConnections: "Attive",
  maxConnections: "Max connessioni",
  serverTimezone: "Fuso orario",
  serverTime: "Ora server",
  unlimited: "Illimitato",
  active: "Attivo",
  notConnected: "Non connesso",
  daysRemaining: "giorni rimanenti",
  expiresIn: "Scade tra",
  addPlaylist: "Aggiungi playlist",
  xtreamCode: "Codice Xtream",
  m3uPlaylist: "Playlist M3U",
  serverUrl: "URL server",
  username: "Nome utente",
  password: "Password",
  m3uUrl: "URL M3U",
  playlistName: "Nome playlist",
  connect: "Connetti",
  connecting: "Connessione...",
  fillAllFields: "Compila tutti i campi",
  invalidM3uUrl: "URL M3U non valida. Deve iniziare con http:// o https://",
  invalidServerUrl:
    "URL server non valida. Deve iniziare con http:// o https://",
  playlistAdded: "Playlist aggiunta con successo!",
  failedToConnect: "Connessione fallita. Controlla i dati.",
  managePlaylists: "Gestisci playlist",
  noPlaylistsAdded: "Nessuna playlist aggiunta.",
  addNewPlaylist: "Aggiungi nuova playlist",
  confirmDelete: "Rimuovi",
  active_playlist: "Attivo",
  switchTo: "Cambia",
  noPlaylistConnected: "Nessuna playlist connessa",
  loadingChannels: "Caricamento canali...",
  loadingMovies: "Caricamento film...",
  loadingSeries: "Caricamento serie...",
  watchFullScreen: "Guarda a schermo intero",
  addToFavorite: "Aggiungi ai preferiti",
  favorited: "Nei preferiti",
  programGuide: "Guida ai programmi",
  loadingGuide: "Caricamento guida...",
  noGuideInfo: "Nessuna informazione guida disponibile",
  noChannelsFound: "Nessun canale trovato",
  noMoviesFound: "Nessun film trovato per questa ricerca",
  noSeriesFound: "Nessuna serie trovata per questa ricerca",
  contentUnlocked: "Contenuto parentale sbloccato",
  unlock: "Sblocca",
  verify: "Verifica",
  playlistSwitched: "Passato a",
  playlistRemovedMsg: "Playlist rimossa",
  loggedOutSuccess: "Disconnessione avvenuta",
  loadingSmall: "Caricamento...",
  noPlaylistLiveMsg:
    "Aggiungi una playlist nelle impostazioni per vedere i canali in diretta.",
  addPlaylistBtn: "Aggiungi playlist",
  enablePip: "Abilita PIP",
  watchWhileBrowsing: "Guarda mentre navighi",
  settingsLocked: "impostazioni attualmente bloccate",
  timeFormatChanged: "Formato ora cambiato in",
  autoPlaybackChanged: "Riproduzione automatica",
  backgroundUpdated: "Sfondo aggiornato",
  pinProtectedCategories: "Categorie protette da PIN",
  pinProtectedCategoriesDesc: "Categorie che richiedono un PIN per accedere",
  disableParentalControl: "Disabilita il controllo genitori",
  changePin: "Cambia PIN",
  noPinnedCategories: "Nessuna categoria è protetta da PIN",
};

const ar: Translations = {
  live: "مباشر",
  movies: "أفلام",
  series: "مسلسلات",
  radio: "راديو",
  home: "الرئيسية",
  settings: "الإعدادات",
  account: "الحساب",
  changePlaylist: "تغيير القائمة",
  reload: "تحديث",
  openUrlFile: "فتح رابط/ملف",
  enterStreamUrl: "أدخل رابط البث (HLS/MP4/TS):",
  externalStream: "بث خارجي",
  reloadingPlaylist: "جارٍ إعادة التحميل...",
  playlistCacheCleared: "تم مسح الكاش!",
  failedToReloadPlaylist: "فشل إعادة التحميل",
  lifetime: "مدى الحياة",
  loading: "جارٍ التحميل...",
  retry: "إعادة المحاولة",
  back: "رجوع",
  cancel: "إلغاء",
  close: "إغلاق",
  on: "تشغيل",
  off: "إيقاف",
  enabled: "مفعّل",
  disabled: "معطّل",
  search: "بحث",
  favorites: "المفضلة",
  all: "الكل",
  noResults: "لا توجد نتائج",
  allChannels: "جميع القنوات",
  searchChannels: "ابحث عن قنوات...",
  failedToLoadChannels: "فشل تحميل القنوات",
  nowPlaying: "يُشغَّل الآن",
  liveLabel: "مباشر",
  categoriesLoading: "جارٍ تحميل الفئات...",
  allMovies: "جميع الأفلام",
  searchMovies: "ابحث عن أفلام...",
  noMovies: "لا توجد أفلام",
  categoriesLoaded: "فئات محمّلة",
  allSeries: "جميع المسلسلات",
  searchSeries: "ابحث عن مسلسلات...",
  noSeries: "لا توجد مسلسلات",
  allStations: "جميع المحطات",
  searchStations: "ابحث عن محطات...",
  noStations: "لا توجد محطات",
  settingsTitle: "الإعدادات",
  accountInfo: "معلومات الحساب",
  parentalControl: "الرقابة الأبوية",
  changeLanguage: "تغيير اللغة",
  changeLayout: "تغيير التخطيط",
  hideLiveCategories: "إخفاء فئات البث المباشر",
  hideVodCategories: "إخفاء فئات الأفلام",
  hideSeriesCategories: "إخفاء فئات المسلسلات",
  clearHistoryChannels: "مسح سجل القنوات",
  clearHistoryMovies: "مسح سجل الأفلام",
  clearHistorySeries: "مسح سجل المسلسلات",
  liveChannelSort: "ترتيب القنوات",
  streamFormat: "صيغة البث (HLS/TS)",
  automatic: "تلقائي",
  timeFormat: "صيغة الوقت",
  themes: "السمات",
  subtitleSettings: "إعدادات الترجمة",
  pipSettings: "إعدادات PIP",
  logout: "تسجيل الخروج",
  selectLanguage: "اختر اللغة",
  languageChanged: "تم تغيير اللغة إلى",
  chooseLayout: "اختر التخطيط",
  gridView: "عرض الشبكة",
  gridViewDesc: "تخطيط شبكة ملصقات قياسي",
  listView: "عرض القائمة",
  listViewDesc: "قائمة مدمجة مع التفاصيل",
  channelSorting: "ترتيب القنوات",
  defaultOrder: "الترتيب الافتراضي",
  nameAZ: "الاسم (أ-ي)",
  nameZA: "الاسم (ي-أ)",
  recentlyAdded: "المضاف مؤخراً",
  sortingChanged: "تم تغيير الترتيب إلى",
  streamFormatTitle: "صيغة البث",
  formatChanged: "تم تغيير الصيغة إلى",
  hideCategories: "إخفاء الفئات",
  noCategoriesFound: "لا توجد فئات. الرجاء الاتصال بقائمة تشغيل.",
  parentalControlTitle: "الرقابة الأبوية",
  setPinDesc: "اضبط رمز PIN مكوناً من 4 أرقام لتقييد الوصول إلى فئات معينة.",
  verifyPinDesc:
    "أدخل رمز PIN المكون من 4 أرقام للوصول إلى إعدادات الرقابة الأبوية.",
  enterNewPin: "أدخل رمز PIN الجديد",
  setPin: "ضبط PIN",
  verifyPin: "التحقق من PIN",
  removePin: "حذف PIN",
  incorrectPin: "رمز PIN غير صحيح",
  pinSet: "تم ضبط رمز PIN بنجاح",
  pinRemoved: "تم حذف PIN",
  pinVerified: "تم التحقق من PIN",
  enterPinToAccess: "أدخل رمز PIN المكون من 4 أرقام للوصول إلى هذه الإعدادات.",
  subtitleFontSize: "حجم الخط",
  subtitleTextColor: "لون النص",
  small: "صغير",
  medium: "متوسط",
  large: "كبير",
  colorWhite: "أبيض",
  colorYellow: "أصفر",
  colorCyan: "سماوي",
  colorGreen: "أخضر",
  accentColor: "لون التمييز",
  backgroundImage: "صورة الخلفية",
  uploadBackground: "رفع خلفية",
  removeBackground: "إزالة الخلفية",
  previewNote: "التغييرات تُطبَّق فوراً",
  accountInformation: "معلومات الحساب",
  refreshInfo: "تحديث المعلومات",
  refreshingAccount: "جارٍ تحديث معلومات الحساب...",
  accountUpdated: "تم تحديث معلومات الحساب!",
  failedToRefresh: "فشل التحديث. تحقق من اتصالك.",
  expiry: "انتهاء:",
  expires: "ينتهي",
  daysLeft: "يوم متبقٍ",
  serverInfo: "معلومات الخادم",
  connections: "الاتصالات",
  status: "الحالة",
  activeConnections: "نشطة",
  maxConnections: "الحد الأقصى للاتصالات",
  serverTimezone: "المنطقة الزمنية",
  serverTime: "وقت الخادم",
  unlimited: "غير محدود",
  active: "نشط",
  notConnected: "غير متصل",
  daysRemaining: "يوم متبقٍ",
  expiresIn: "ينتهي في",
  addPlaylist: "إضافة قائمة",
  xtreamCode: "كود Xtream",
  m3uPlaylist: "قائمة M3U",
  serverUrl: "رابط الخادم",
  username: "اسم المستخدم",
  password: "كلمة المرور",
  m3uUrl: "رابط M3U",
  playlistName: "اسم القائمة",
  connect: "اتصال",
  connecting: "جارٍ الاتصال...",
  fillAllFields: "يرجى ملء جميع الحقول",
  invalidM3uUrl: "رابط M3U غير صالح. يجب أن يبدأ بـ http:// أو https://",
  invalidServerUrl: "رابط الخادم غير صالح. يجب أن يبدأ بـ http:// أو https://",
  playlistAdded: "تمت إضافة القائمة بنجاح!",
  failedToConnect: "فشل الاتصال. تحقق من بياناتك.",
  managePlaylists: "إدارة القوائم",
  noPlaylistsAdded: "لم تُضَف أي قوائم بعد.",
  addNewPlaylist: "إضافة قائمة جديدة",
  confirmDelete: "إزالة",
  active_playlist: "نشط",
  switchTo: "تبديل",
  noPlaylistConnected: "لا توجد قائمة متصلة",
  loadingChannels: "جارٍ تحميل القنوات...",
  loadingMovies: "جارٍ تحميل الأفلام...",
  loadingSeries: "جارٍ تحميل المسلسلات...",
  watchFullScreen: "مشاهدة بملء الشاشة",
  addToFavorite: "إضافة إلى المفضلة",
  favorited: "في المفضلة",
  programGuide: "دليل البرامج",
  loadingGuide: "جارٍ تحميل الدليل...",
  noGuideInfo: "لا تتوفر معلومات الدليل",
  noChannelsFound: "لم يتم العثور على قنوات",
  noMoviesFound: "لم يتم العثور على أفلام لهذا البحث",
  noSeriesFound: "لم يتم العثور على مسلسلات لهذا البحث",
  contentUnlocked: "تم إلغاء قفل المحتوى الأبوي",
  unlock: "إلغاء القفل",
  verify: "تحقق",
  playlistSwitched: "تم التبديل إلى",
  playlistRemovedMsg: "تمت إزالة القائمة",
  loggedOutSuccess: "تم تسجيل الخروج بنجاح",
  loadingSmall: "جارٍ التحميل...",
  noPlaylistLiveMsg: "يرجى إضافة قائمة في الإعدادات لمشاهدة القنوات المباشرة.",
  addPlaylistBtn: "إضافة قائمة",
  enablePip: "تفعيل PIP",
  watchWhileBrowsing: "مشاهدة أثناء التصفح",
  settingsLocked: "الإعدادات مقفلة حاليًا",
  timeFormatChanged: "تم تغيير تنسيق الوقت إلى",
  autoPlaybackChanged: "التشغيل التلقائي",
  backgroundUpdated: "تم تحديث الخلفية",
  pinProtectedCategories: "الفئات المحمية بـ PIN",
  pinProtectedCategoriesDesc: "الفئات التي تتطلب رمز PIN للوصول",
  disableParentalControl: "تعطيل الرقابة الأبوية",
  changePin: "تغيير الرمز",
  noPinnedCategories: "لا توجد فئات محمية بـ PIN",
};

const translations: Record<Lang, Translations> = { en, fr, es, de, it, ar };

export function useT(): Translations {
  const { settings } = usePlaylist();
  const lang = getLang(settings.language || "english");
  return translations[lang];
}

export function useDir(): "ltr" | "rtl" {
  const { settings } = usePlaylist();
  const lang = getLang(settings.language || "english");
  return isRTL(lang) ? "rtl" : "ltr";
}
