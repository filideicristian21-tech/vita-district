# USATE v0.4

Note dei 14 file in `idee-v4/` (8 novembre 2026). Sono proposte statiche sulla v0.3 locale, non risultati di test e non ordini che sostituiscono il brief. Nessuna pubblicazione.

Area percorribile misurata a griglia da 1 m, mare escluso, impronte degli edifici escluse: v0.3 **34 442 m²**, ampliamento est **79 904 m²**, totale **114 346 m²** (×**3,32**). 79 edifici nuovi. Non è il rettangolo dei confini.

## Accettato

- **Forge.** `extrudeSide` ora ruota di −π/2: il muso del profilo (+X) va in +Z, come i fari. I vetri usano il centro della scocca, non il proprio bounding box. Il rotolamento usa `wheelR` del modello (0,29 / 0,38 / 0,335), non 0,32 fisso. Il passo usa lo spostamento dopo la collisione. In retromarcia la camera tiene il verso per un breve intervallo. Il bulbo dell’occhio è un po’ meno sporgente e la palpebra copre di più. Non è un volto nuovo.
- **Teco.** I quartieri nuovi stanno in celle da 48 m, fuse per materiale dentro la cella e scartate dal frustum. Non entrano nel `mergeStatic` unico della v0.3. Le collisioni statiche usano una griglia da 16 m; l’auto parcheggiata resta fuori dalla griglia perché si sposta. Su telefono (puntatore grossolano o lato corto sotto 500 px) il pixel ratio parte da 1, l’ombra da 1024 e la nebbia è più corta. I budget della tabella (150/110/70 draw call, iPhone) restano obiettivi, non misure di questa build.
- **Ledger.** Listino invariato: Vela 0, Bruma 90, Pode 150, partenza 120. Corriere +40 una volta, solo sotto i 36 km/h, niente timer né multa. Bocce +8 a partita di tre lanci conclusa, stesso id non ripaga. Foto 0 crediti. Vernice 15 una volta per colore, poi gratis. `catchId` non finito non paga. Un campo `money` presente ma non numerico diventa 0, non un nuovo bonus di 120.
- **Guard / Atlas.** Schema 4 solo perché album, corriere, bulloni e vernice devono sopravvivere al ricaricamento. v1, v2 e v3 tengono saldo, garage, capelli, vestiti, record e consegne. Una versione più nuova è in sola lettura. Se la copia del salvataggio illeggibile non si riesce a scrivere, non si sovrascrive l’originale. La foto salva solo `{ score }`, niente base64 e niente `getUserMedia`.
- **Lumen.** Gino (Bullone Felice), Lia (Rotta Sicura), Nadia (Belvedere), Ottavio (Il Pallino d’Oro, Teresa solo nelle battute). Tre domande ciascuno.
- **Nexus.** Controllo bulloni in ordine 1→3→2→4, avanzamento a tocchi da +30°, senza barra a tempo. Foto: distanza, direzione e un raggio di occlusione, non un minigioco di timing. Chiusura da Esci/Esc passa da `endGame` e toglie i pulsanti aggiunti. Aprire un pannello azzera anche i pedali, non solo i tasti.

## Rinviato

- Anelli LOD, billboard, coda di costruzione da 4 ms, ombra che segue il giocatore, texture compresse, overlay di statistiche nel gioco, spezzare anche la mesh unica della v0.3.
- Due materiali ruota, anelli trasversali della carrozzeria, abitacolo, battito di palpebre, riscrittura del near della camera.
- Secondo compenso corriere da 50, prestito auto, usura, IndexedDB per le immagini, esportazione sul rullino.
- Filtri della mappa, raggruppamento dei marker, Teresa come secondo modello, distretto ovest separato, navigatore su strada.
- Prova su iPhone reale. Qui: Chrome headless, SwiftShader, 932×430. `drawElements` allo spawn in piazza: circa **40** (v0.3) e **63** (v0.4) per frame di animazione. Non è il contatore `renderer.info` della nota Teco (92/131/144) e non è un iPhone.

## Quartieri in gioco

Borgo delle Officine e Giardini di Levante, a est del Rione, collegati da Via del Porto e dal Lungomare, con Via delle Cale e quattro traverse. Il prato ha un laghetto e le bocce. Il Belvedere è una terrazza alta 2,4 m. La Vela e l’autosalone non si spostano.
