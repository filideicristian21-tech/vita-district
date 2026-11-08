// Luoghi del Rione Marea (coordinate in metri; x est, z sud→nord: +z = nord).
export const PLACES = {
  barber:  { id: 'barber', name: "Barberia «Lama d'Oro»", short: 'Barbiere', icon: '✂', x: -67, z: 14, door: { x: -68, z: 8 }, color: '#e6bb70' },
  cafe:    { id: 'cafe', name: 'Caffè Sottovento', short: 'Caffè', icon: '☕', x: -5, z: -13, door: { x: -5, z: -8 }, color: '#d9a066' },
  depot:   { id: 'depot', name: 'Consegne Lampo', short: 'Consegne', icon: '📦', x: 66, z: 6.2, door: { x: 66, z: 8 }, color: '#7fb2d9' },
  shop:    { id: 'shop', name: 'Sartoria Marea', short: 'Abiti', icon: '👕', x: 24, z: -12, door: { x: 24, z: -8 }, color: '#c9a0dc' },
  pond:    { id: 'pond', name: 'Laghetto dei Gelsi', short: 'Pesca', icon: '🎣', x: -27, z: 47, door: { x: -27, z: 41 }, color: '#6fb0c0' },
  court:   { id: 'court', name: 'Campetto del Molo', short: 'Basket', icon: '🏀', x: 27, z: 47, door: { x: 27, z: 41 }, color: '#e08a4a' },
  dealer:  { id: 'dealer', name: 'Autosalone Miraggio', short: 'Auto', icon: '🚗', x: -38, z: -91.5, door: { x: -35.6, z: -91.5 }, color: '#e0c060' },
  park:    { id: 'park', name: 'Parco del Faro', short: 'Parco', icon: '🌳', x: 0, z: -126, door: { x: 0, z: -126 }, color: '#8fc06a' },
  molo:    { id: 'molo', name: 'Molo del Faro', short: 'Molo', icon: '⚓', x: 60, z: -175, door: { x: 60, z: -175 }, color: '#7fb2d9' },
  piazza:  { id: 'piazza', name: 'Piazzetta del Pozzo', short: 'Piazzetta', icon: '⛲', x: 0, z: 21, door: { x: 0, z: 21 }, color: '#9fc58a' },
  dl_bice: { id: 'dl_bice', name: 'Signora Bice — civico 7', short: 'Bice', icon: '🏠', x: 70, z: -7.6, door: { x: 70, z: -8 }, color: '#f0a3a3', delivery: 'bice' },
  dl_lab:  { id: 'dl_lab', name: 'Laboratorio del vicolo', short: 'Laboratorio', icon: '🔧', x: -72, z: -7.6, door: { x: -72, z: -8 }, color: '#f0a3a3', delivery: 'lab' },
  dl_condo:{ id: 'dl_condo', name: 'Condominio Nord — citofono 12', short: 'Condominio', icon: '🏢', x: 0, z: 39.4, door: { x: 0, z: 40 }, color: '#f0a3a3', delivery: 'condo' },
};
export const WORLD_BOUNDS = { minX: -94, maxX: 94, minZ: -190, maxZ: 74 }; // mappa: include il molo e un po' di mare
