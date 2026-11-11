# VITA DISTRICT — prototipo v0.3

Gioco web 3D (three.js/WebGL) in un piccolo quartiere inventato, il **Rione Marea**: cammini in terza persona o **guidi la tua auto**, usi la mappa, vai dal barbiere, al caffè e fai consegne. Dalla v0.3: tre auto inventate (Vela, Bruma, Pode) da comprare con crediti finti all'Autosalone Miraggio, mappa circa raddoppiata con un anello di strade, il Parco del Faro e il Lungomare, dialoghi a scelte con i personaggi. Barba e capelli crescono col tempo reale (0,40 mm al giorno), anche a gioco chiuso. Nel barbiere e nello Specchio c'è un pulsante **DEMO** che simula giorni senza aspettare.

**Gioca (v0.3 pubblicata):** https://filideicristian21-tech.github.io/vita-district/ (Safari su iPhone, meglio in orizzontale).

La v0.4 è solo un’anteprima locale: `v0.4.0.html`. Non sostituisce `v0.3.0.html`.

La v0.6 è un’anteprima su un ramo a parte (`vita-district-v060`): `v0.6.0.html`. Non sostituisce v0.3, v0.4 e v0.5 e usa lo stesso salvataggio (`vitaDistrict.v1.save`, schema 4, campi nuovi facoltativi) senza cancellare niente. Novità: alla Spiaggia di Ponente si entra in mare (guado, poi nuoto: libero, rana, dorso, sott'acqua) con un fondale di sabbia vero sotto l'acqua, boe come confine e auto fermate prima della spiaggia; corsa con fase legata ai metri percorsi; barba più visibile; auto con scocca arrotondata, vetri, cerchi e pneumatici; 3 livelli di qualità (menu ⏸ → Qualità) e meno triangoli. Test: `node --test test/*.test.mjs` e `PUPPETEER=… node test/e2e/e2e-v6.mjs http://127.0.0.1:8765/v0.6.0.html 932 430`. Non provata su un iPhone vero.

La v0.7 è un’anteprima su un ramo a parte (`vita-district-v070`): `v0.7.0.html`. Non sostituisce v0.3–v0.6. Salvataggio `vitaDistrict.v1.save` portato allo schema 5, con copia di sicurezza verificata identica all'originale: le build vecchie lo aprono in sola lettura e non lo sovrascrivono. Novità: ciclo giorno/notte (una giornata intera di gioco, giorno più notte, dura 5 minuti reali; l'orologio è salvato e avanza solo mentre si gioca) con lampioni, finestre, insegne, stelle e luna fatti con materiali emissivi, più un solo faro reale sull'auto guidata (con qualità alta; su media e bassa una pozza di luce davanti all'auto); frecce sinistra/destra e quattro frecce; case in vendita all'Immobiliare Faro & Mare, dalla Soffitta del Pozzo (la tua all'inizio) alla Villa dei Limoni; lavori con paga per giornata di gioco (barbiere da Tonino, barista da Marta, bagnino da Pina, meccanico da Gino), un turno pagato al giorno; 100.000 crediti di gioco per le partite nuove e, una volta sola, un'integrazione fino a 100.000 per i salvataggi esistenti. Crediti di gioco senza valore reale. Test: `node --test test/*.test.mjs` e `node test/e2e/e2e-v7.mjs http://127.0.0.1:8765/v0.7.0.html 932 430`. Non provata su un iPhone vero.

La v0.5 è un’anteprima su un ramo a parte (`vita-district-v050`): `v0.5.0.html`. Non sostituisce la v0.3 né la v0.4 e usa lo stesso salvataggio (`vitaDistrict.v1.save`, schema 4) senza cancellare niente. Novità: mappa più grande (spiaggia, pineta, Piazza dei Limoni, Contrada Salina, autolavaggio), grafica web più curata, conchiglie e gelateria, Rotta Sicura più tollerante, meno bug. Test: `node --test test/*.test.mjs` e, con un Chrome, `PUPPETEER=… node test/e2e/e2e-v5.mjs http://127.0.0.1:8765/v0.5.0.html 932 430` (serve un server che metta `TEST_HOOK = true` solo in locale). Non provata su un iPhone vero.

Se il telefono mostra ancora la versione precedente, apri la pagina con i file di questa build: https://filideicristian21-tech.github.io/vita-district/v0.3.0.html — il numero di versione resta visibile in alto a sinistra (`v0.3.0`). La Vela gratuita è sul Porto, davanti alla piazza; l'Autosalone Miraggio è segnato sulla mappa a sud.

## Cosa aspettarsi
- **Prototipo**, non un gioco finito, e **non Unreal Engine**.
- Grafica **low-poly, non fotorealistica**: personaggi CC0 semplici con shading ammorbidito, capelli e barba procedurali a strati.
- Testato in Chrome headless (desktop e viewport mobile emulata); **non ancora verificato su un iPhone reale**.

## Privacy
- I progressi (posizione nel quartiere, crediti finti, inventario, look, orari di crescita) restano **solo in questo browser** (`localStorage`, chiavi `vitaDistrict.*`). Cancellando i dati del sito li perdi.
- **Nessun account, nessun GPS** (la «posizione» è solo quella del personaggio nel mondo di gioco), **nessuna analytics, pubblicità o cookie di terze parti**, nessuna richiesta a servizi esterni: tutti i file sono serviti da questo sito.
- I crediti sono **finti**, senza valore reale; nessun pagamento. L'acquisto delle auto è **simulato**: solo crediti di gioco, nessun denaro reale.
- Auto, modelli e marchi sono **inventati** e generati dal codice: nessun logo o marchio reale.

## Comandi
iPhone: trascina a sinistra per camminare (fino al bordo = corsa), a destra per la visuale, tasto in basso a destra per interagire. In auto: ◀ ▶ in basso a sinistra, Frena/Accelera in basso a destra, D/R da fermi, «Scendi» e «Ricentra». PC: WASD/frecce, Shift, trascina col mouse, E, M, Esc; in auto W gas, S freno (tenuto da fermi = retromarcia), A/D sterzo, C ricentra, E scendi.

La guida è **arcade**: credibile ma volutamente semplice, non una simulazione realistica.

## Licenze
Codice del prototipo: dell'autore. three.js r160 MIT. Modelli e texture CC0 (Quaternius, Poly Haven, ambientCG, RGS_Dev): elenco completo in [LICENSES.md](LICENSES.md).
