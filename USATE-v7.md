# USATE-v7: idee e revisioni dei bot usate (Vita District v0.7, anteprima)

Ho letto le 14 schede in `idee-v7/` e le 14 revisioni in `review-v7/`. Non ho contattato nessun agente. Le prove sono state fatte in Chrome headless (SwiftShader). **Non testato su iPhone reale.**

**Decisione di Cristian (11/11, 21:52):** una giornata intera di gioco (giorno + notte) dura **5 minuti reali**: 12,5 s per ogni ora di gioco. Visto che le giornate arrivano due volte più spesso, gli stipendi per giornata sono stati dimezzati. I prezzi delle case restano quelli. La villa richiede quindi lo stesso tempo reale di prima: circa 40 giornate di lavoro, cioè circa 3 ore e mezza di gioco partendo da 100.000.

## Idee (`idee-v7/`)

| Agente | Usato | Rimandato |
|---|---|---|
| Atlas | Case sulla mappa: soffitta (-34, 7,2), bilocale (6, 39,2), salina, attico e villa (-234, 99,2), con controllo delle collisioni su un lotto villa libero. | — |
| Cranc | Lo stato `sott` non resta attivo arrivando a riva. Si risale da soli sotto 1,6 m. Gli scogli sommersi non si attraversano più. FOG0 segue il giorno e la notte. | — |
| Forge | Notte fatta solo con emissivo: uniform `NIGHT`, finestre e lanterne. Stelle, luna e un solo faro per l'auto guidata. Villa a 8 mesh. | Rifrazione |
| Guard | Schema 5 con copia di sicurezza verificata. Se la copia fallisce, il gioco va in sola lettura. Bonus 100k una volta sola, con il flag accanto ai crediti. Testi onesti sui crediti di gioco. | — |
| Hook | Primo stipendio e chiavi della villa (vedi le revisioni). | Benvenuto +20 e pianta |
| Ledger | Prezzi delle case da 20k a 300k, rivendita al 70%, un turno pagato per giornata. | — |
| Lumen | Clelia dell'agenzia, Pina bagnina, Gino meccanico. | Affitti |
| Nexus | Orologio di gioco salvato, senza `Date.now` per la paga. Pulsanti delle frecce sopra il tachimetro, separati dallo sterzo. | — |
| Nova | Ordine delle priorità e checklist e2e. | — |
| Scout | Nessun asset nuovo, tutto generato dal codice. | Kenney Building Kit |
| Spark | Palette del ciclo, frecce ambra, card dell'agenzia. | — |
| Study | Fasi di luce, orari dei lavori, compiti realistici. | — |
| Teco | Nessuna luce nuova di notte, villa entro 8 draw call. | Budget 140/100/70 draw call allo spawn: non raggiunto, come in v0.6 |

## Revisioni applicate (`review-v7/`)

| Agente | Punti applicati | Non applicati (perché) |
|---|---|---|
| Cranc | La soffitta iniziale non si vende, quindi il pulsante «Vendi» non c'è. Un turno non comincia se le 3 ore sforano la chiusura. Nel menu c'è scritto che l'orologio scorre anche da fermi. Chi ha salvato in acqua riparte sulla battigia con x limitato tra -236 e -112. L'avviso della riva compare al massimo ogni 30 s. | — |
| Guard | G1 commit; G2 output dei test nel PR; G3 sezione v0.7 in LICENSES.md; G4 salvataggio subito dopo il bonus, con un avviso onesto se il salvataggio fallisce. | — |
| Teco | #2 SpotLight del faro solo con qualità alta decisa all'avvio; su media e bassa c'è una pozza di luce additiva davanti all'auto. #3 Di notte la mappa delle ombre si aggiorna ogni 8 fotogrammi, senza toccare `castShadow`. #4 Niente ombra per panchine, tavolini, poltrona, canneto, palla, conchiglie e bocce. | #1 Capelli e barba: `cullNPCs` nasconde già il PNG intero quando è fuori vista. #5–#6 Luci degli interni e materiali duplicati: rimandati. |
| Nexus | Il tocco del compito usa l'istante del tocco (`e.timeStamp`) e la barra si anima in rAF. Blocco di 450 ms contro il doppio tocco e tolleranza `TASK_TOL` con un nome. `copyLife` azzera giorni pagati e turni «nel futuro». L'orologio si ferma con la mappa o una conferma aperta. Avviso quando il turno di ieri è perso. Le frecce si spengono solo dopo una svolta nel loro verso. In verticale i pulsanti sono più in alto. Le quattro frecce sono salvate (`garage.car.hazard`, validato). `updateDriveUI` è in cache e i pulsanti hanno `aria-pressed`. | — |
| Forge | #1 Sole dalle 5 alle 19 e luna dalle 19 alle 5; `isNight` dalle 19 alle 5. #2 `ENV_K` per vernice lucida e auto nuove. #3 Seme delle finestre preso dalla posizione nel mondo. #4 Finestre alte della villa alzate. #5 Tetto a falde nette. #6 Vetri `#ffc98a` a 0,9 e muro emissivo a 0,25. #8 Svolta con segno. #10 Pozze di luce senza nebbia, con dissolvenza tra 60 e 140 m. | #7 Vasca profonda e #9 lente spenta: rimandate |
| Spark | Emisfera notturna `#3A4E72` con minimo 0,26. Luna `#A9BEDB` con minimo 0,5. Pozze di luce `#FFC77A` a 0,45. Cartelli emissivi di notte. Icone ☀️/🌅/🌙 secondo l'ora. Quattro frecce ambra con bordo `#FFFFFF4D` e alone. Conferma d'acquisto con pulsante primario, non rosso. Riga «Acquisto simulato». Pulsante disattivato attenuato. Bordo della casa posseduta. Caldo di alba e tramonto calcolato dall'ora. | Tinta HDR all'orizzonte, mare rosato all'alba |
| Anchor | Migliaia sempre col punto (9.500). 💰. Conferma «Comprare «X»? Prezzo … · saldo A → B cr. Ti risveglierai qui. Solo crediti di gioco». «ti restano». «Mancano X cr» sul pulsante. «Lascia il lavoro». Testi del lavoro e della busta paga. Avviso all'ingresso in auto con ⬅ ➡. Riga dei comandi nel menu. | — |
| Lumen | Nonno Ugo usa l'ora di gioco. Saluti notturni per 13 PNG. Pina corretta sul bagno. `JOB_LINES` per lavoro con orari aggiornati. L'agenzia saluta in base all'ora. L'officina si chiama «Officina Bullone Felice». | — |
| Study | Luna come da proposta. Stelle solo a sole calato (`starA`). Alba con `sm(5,5; 8)`. Sole minimo 0,15. Orari: barbiere 9–19, bagnino 9–19, meccanico 8–18. Compiti: panno caldo e schiuma, il bambino oltre le boe, 2,3 bar, espresso in 25–30 s. | Tremolio delle stelle |
| Hook | Battuta speciale del capo al primo stipendio e pannello «Le chiavi della Villa dei Limoni» (`life.firsts`). | — |
| Ledger | B1 = Cranc. B3: un salvataggio v5 senza `money` riparte da 0, non da 100.000. | B2 paghe: è una scelta di design. Poi ricalibrate per la giornata da 5 minuti decisa da Cristian. |
| Scout | LICENSES.md: titolo v0.7, percorsi reali, sezione v0.7, nota Quaternius, fonte di corallo (Cars Pack) e autori Poly Haven. | Compressione dei GLB pesanti |
| Atlas | Media: la porta della Casetta della Salina dava su un vicolo e ci si risvegliava contro un muro. Ora è sul Lungomare, `door {x:-112,8, z:-134,8}`, `face π`, posizione verificata da lui. Bassa: il cancello della villa sembrava chiuso ma si attraversava. Ora è aperto, con le ante girate contro la siepe. Bassa: il ◆ della casa spariva a ogni ricarica. Ora le case sono registrate in `places.js` e la casa principale è segnata sulla mappa. I suoi 2 FAIL e2e: il test «dormire» ora accetta 7:00 ± 0,25 h, perché con la giornata da 5 minuti l'orologio scorre durante l'attesa. Il test «freccia dopo la svolta» falliva perché in headless lento l'auto non completava la curva in 12 s: ora usa più gas e fino a 30 s. | Regola dei 120 m dai lavori per attico e villa, posto auto per casa |
| Nova | Domande aperte girate a Cristian. Lui ha deciso: giornata intera di 5 minuti. La crescita di barba e capelli resta in tempo reale. | — |
