# USATE-v6: cosa ho preso dalle idee dei bot (Vita District v0.6, anteprima)

Ho letto le 13 schede in `idee-v6/`. L'ordine seguito: prima il mare (entrare, nuotare, il fondale, i confini), poi le prestazioni sul telefono, poi la grafica di personaggio e auto. Non ho contattato nessun agente.

| Agente | Usato | Rimandato (e perché) |
|---|---|---|
| **Atlas** | Acqua a y −0,9, come in world.js. Profilo del fondale da −0,75 (battigia, z −178) a −4,3 (z −232) fino a −6,9, sotto un piano profondo a −7. Boe a z −230 con il muro a −231,5. Auto ferme a z −149,5 davanti alla spiaggia. | — |
| **Cranc** | Tolto il muro invisibile a z −178, che bloccava prima dell'acqua. Mare semitrasparente vicino a riva, così il fondale si vede. Sulla sabbia si rallenta (×0,85) e anche in curva stretta. | Sterzo analogico: rimandato |
| **Teco** | Tre livelli di qualità: alta, media e bassa, più «auto» (media sul telefono, alta sul computer; scende da sola se resta sotto 24 fps). La scelta sta nel menu ⏸ ed è salvata a parte (`vd.quality`). Altri tagli: <br>• lampioni istanziati a blocchi, senza ombra e con una versione leggera (~90 tris) oltre 30 m; <br>• chiome degli alberi da 3 a 2, a blocchi di 40 m, con l'ombra solo sulla principale; <br>• finestre divise in blocchi da 64 m; <br>• frustum culling dei personaggi con sfera fissa; <br>• LOD delle auto a 20 e 50 m; <br>• mare trasparente solo vicino a riva (alpha fino a 0,97 al largo). <br>Allo spawn si passa da 593k a circa 280k triangoli. | Draw call sotto 100 allo spawn: non raggiunto (circa 180–230). Servono atlanti di materiali per le celle: lavoro grosso, rimandato. KTX2: manca un tool di build. |
| **Nexus** | Isteresi acqua: guado oltre 0,35 m, nuoto oltre 1,15 m, si torna indietro a 0,95 e 0,3 m. Inerzia in acqua. Camminata e corsa con fase legata alla distanza percorsa (niente piedi che scivolano) e pesi sfumati. Mai salvare in acqua: al caricamento si riparte dalla battigia. | — |
| **Study** | Velocità e ritmi degli stili: libero 1,55 m/s a 0,55 cicli/s, rana 1,0, dorso 1,2. Rotazione del busto nel libero. Inclinazione in corsa e in curva. Fase walk→run tra 2,0 e 3,6 m/s. | Respiro laterale animato, virata: rimandati |
| **Forge** | Fondale prima della trasparenza. Alpha calcolata nello shader con fresnel. Colore per profondità con la funzione del fondale scritta in GLSL (senza depth texture). Schiuma a riva. Vista da sotto con nebbia azzurra. Vetri, gomma, cerchi metallici e vernice con clearcoat. | Rifrazione e caustiche: rimandate per non pesare sul telefono |
| **Spark** | Palette dell'acqua: riva chiara, turchese, blu petrolio. Posidonia e scogli. Barba più scura e visibile già da 1,5 mm (ombra), a ciuffi da 2 mm. Pulsanti del nuoto in basso a destra. | Abiti nuovi e capelli a ciocche: rimandati |
| **Anchor** | Testi «Di nuovo a terra.», «Stile: …», l'avviso alle boe e l'avviso una tantum all'ingresso in acqua. Pulsanti «Immergiti» e «Risali». | Finestra «Sei in acqua» con «Mostra di nuovo dopo»: per ora è un avviso breve |
| **Guard** | Schema del salvataggio fermo a 4, con soli campi facoltativi (`seen6`, `swimHint`), quindi niente migrazione distruttiva. Nota QAL di Quaternius in LICENSES.md: nessun asset nuovo, e quelli scaricati dopo il 28/8/2026 vanno registrati come QAL. Niente marchi reali. Testi senza «fotorealistico». In acqua non si muore e non ci si fa male. | — |
| **Nova** | Partito da `js/0.6.0`. La sua checklist è diventata `test/e2e/e2e-v6.mjs`, con 44 controlli a 932×430 e a 844×390, più `test/v6.test.mjs`. | — |
| **Hook** | — | Tuffo dal pontile, «fino alla boa», la cosa sul fondale: attività nuove rimandate, prima la stabilità del nuoto |
| **Lumen** | — | Nuotata alla Boa Rossa, conchiglie del fondale, Fede la bagnina: rimandati alla v0.7 |
| **Ledger** | — | Paghe delle attività di mare: rimandate insieme alle attività. Teniamo la sua regola (ID creato dal gioco, pagato una volta). |

Prove fatte in Chrome headless (SwiftShader). Non è stato provato su un iPhone vero.
