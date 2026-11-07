# VITA DISTRICT — prototipo v0.1

Gioco web 3D (three.js/WebGL) in un piccolo quartiere inventato, il **Rione Marea**: cammini in terza persona, usi la mappa, vai dal barbiere, al caffè e fai consegne. Barba e capelli crescono col tempo reale (0,40 mm al giorno), anche a gioco chiuso. Nel barbiere e nello Specchio c'è un pulsante **DEMO** che simula giorni senza aspettare.

**Gioca:** https://filideicristian21-tech.github.io/vita-district/ (Safari su iPhone, meglio in orizzontale).

## Cosa aspettarsi
- **Prototipo**, non un gioco finito, e **non Unreal Engine**.
- Grafica **low-poly, non fotorealistica**: personaggi CC0 semplici con shading ammorbidito, capelli e barba procedurali a strati.
- Testato in Chrome headless (desktop e viewport mobile emulata); **non ancora verificato su un iPhone reale**.

## Privacy
- I progressi (posizione nel quartiere, crediti finti, inventario, look, orari di crescita) restano **solo in questo browser** (`localStorage`, chiavi `vitaDistrict.*`). Cancellando i dati del sito li perdi.
- **Nessun account, nessun GPS** (la «posizione» è solo quella del personaggio nel mondo di gioco), **nessuna analytics, pubblicità o cookie di terze parti**, nessuna richiesta a servizi esterni: tutti i file sono serviti da questo sito.
- I crediti sono **finti**, senza valore reale; nessun pagamento.

## Comandi
iPhone: trascina a sinistra per camminare (fino al bordo = corsa), a destra per la visuale, tasto in basso a destra per interagire. PC: WASD/frecce, Shift, trascina col mouse, E, M, Esc.

## Licenze
Codice del prototipo: dell'autore. three.js r160 MIT. Modelli e texture CC0 (Quaternius, Poly Haven, ambientCG, RGS_Dev): elenco completo in [LICENSES.md](LICENSES.md).
