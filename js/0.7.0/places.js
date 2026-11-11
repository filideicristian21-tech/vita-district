// Luoghi del Rione Marea (coordinate in metri; x est, z sud→nord: +z = nord).
import { BOUNDS, EXTRA_PLACES } from './layout.js';
import { PLACES5 } from './layout5.js';
import { HOUSES } from './life.js';
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
  ...EXTRA_PLACES,
  ...PLACES5,
  gelateria: { id: 'gelateria', name: 'Gelateria Nuvola di Limone', short: 'Gelato', icon: '🍦', x: -14, z: 138.4, door: { x: -14, z: 137 }, color: '#f2d36b' },
  dl_fioraio: { id: 'dl_fioraio', name: 'Fioraio dei Limoni — Colle', short: 'Fioraio', icon: '🌼', x: 46, z: 136, door: { x: 46, z: 132.6 }, color: '#f0a3a3', delivery: 'fioraio' },
};
export const WORLD_BOUNDS = { minX: BOUNDS.minX, maxX: BOUNDS.maxX, minZ: -236, maxZ: BOUNDS.maxZ }; // v0.6: si vede anche la zona di mare

// v0.7 (Atlas): le case sono luoghi fissi, così il ◆ della casa resta dopo una ricarica
for (const [id, h] of Object.entries(HOUSES)) PLACES['house_' + id] = { id: 'house_' + id, name: h.name, short: h.name, icon: '🏠', x: h.door.x, z: h.door.z, door: h.door, color: '#9fd3c7' };
