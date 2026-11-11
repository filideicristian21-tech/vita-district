# USATE-v5 — cosa ho preso dalle idee dei 14 bot (Vita District v0.5, anteprima)

Regola seguita: prima i bug, poi prestazioni sul telefono e licenze, poi grafica e mappa. Nessun agente è stato contattato.

| Agente | Usato | Rimandato (e perché) |
|---|---|---|
| **Forge** | luci più morbide (emisfera bassa, ombre strette sul telefono), nebbia legata alla distanza di vista, culling a celle | ombre a cascata: troppo pesanti per un iPhone |
| **Teco** | pixel ratio adattivo (parte da 1,25 sul telefono e sale se fa >52 fps), distanza di vista più corta sul telefono, geometrie unite per cella (80 m) | KTX2 / compressione GPU: serve un tool di build che non c'è nel repo |
| **Spark** | palette calda dei muri, persiane, insegne di negozi inventati (Forno La Mollica, Ferramenta Bullone, Farmacia del Porto…) | ridisegno dell'HUD: rischio di nuovi bug su schermi piccoli |
| **Lumen** | Signora Assunta e la gelateria, nome «Contrada Salina», dialoghi adattati | pedalò e mulino: attività nuove in più, rimandate per stabilità |
| **Atlas** | Piazza dei Limoni sull'asse nord con campanile, nuova consegna a nord (Fioraio) | — |
| **Cranc** | auto che striscia lungo i muri invece di incollarsi; Nonno Ugo solido; freno tenuto 0,5 s da fermo = retromarcia | sterzo analogico (on/off resta), audio, giorno/notte, traffico: troppo per questa versione |
| **Nexus** | cerchi di collisione dell'auto ricalcolati dopo ogni correzione; ostacoli bassi fermano l'auto; comandi rilasciati quando l'app va in background; avviso «frenata automatica» | — |
| **Ledger** | lista bocce pagate limitata a 40 **e** controllo che l'id sia nuovo (prima un id vecchio uscito dalla lista poteva ripagare) | cambio prezzi delle auto: tocca l'economia dei salvataggi, rimandato |
| **Anchor** | frasi di caricamento, schermata d'errore con «Riprova», bottone «🧭 Sono bloccato» nel menu | — |
| **Guard** | testi onesti (nessuna parola tipo fotorealistico/Unreal/AAA), TEST_HOOK spento nel codice, controllati da un test | — |
| **Nova** | la sua checklist di test è diventata `test/e2e/e2e-v5.mjs` (31 controlli) + `test/v5.test.mjs` | — |
| **Hook** | — | cartoline, casa del giocatore, tramonto: contenuti nuovi, dopo la stabilità |
| **Scout** | — | KTX2, lightmap, PMREM esplicito, AgX, CSM, SSAO: costosi o richiedono pipeline di build; da valutare su iPhone vero |
| **Study** | — | meteo e suoni: rimandati |
