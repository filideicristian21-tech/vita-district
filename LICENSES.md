# Licenze — VITA DISTRICT v0.1

Codice del gioco (`src/js`, `src/*.html`, `src/style.css`, `tests/`, `tools/*.mjs`): scritto per questo prototipo.
Tutti gli asset sotto sono stati **riusati da cartelle locali di progetti precedenti sulla stessa macchina** (`/workspace/reallife`, `/workspace/royale3d`), dove fonte e licenza erano già registrate in `reallife/docs/LICENZE-ASSET.md` e `royale3d/CREDITS.md`. In questo turno non è stato scaricato niente da internet; le licenze riportate sono quelle documentate lì (non ricontrollate online oggi).

| File | Asset | Autore | Fonte | Licenza | Modifiche |
|---|---|---|---|---|---|
| vendor/three.module.min.js, vendor/jsm/* | three.js r160 | three.js authors | github.com/mrdoob/three.js | MIT (vendor/LICENSE-three.txt) | nessuna |
| assets/chars/padrone.glb | Man in Long Sleeves (giocatore, Nonno Ugo) | Quaternius | poly.pizza/m/DLptRuewTn | CC0 1.0 | capelli originali nascosti per il giocatore; colori e normali morbide a runtime |
| assets/chars/pendolare.glb | Business Man (Tonino, passante) | Quaternius | poly.pizza/m/JFrLIKqvCH | CC0 1.0 | colori a runtime |
| assets/chars/cassiera.glb | Animated Woman (Marta, passante) | Quaternius | poly.pizza/m/qJ2gsTUBHL | CC0 1.0 | colori a runtime |
| assets/chars/anziana.glb | Woman Casual (Signora Bice) | Quaternius | poly.pizza/m/jpKRgGDxhk | CC0 1.0 | colori a runtime |
| assets/chars/hoodie.glb | Hoodie Character (Rocco, passante) | Quaternius | poly.pizza/m/gKLBoRsyKe | CC0 1.0 | colori a runtime |
| assets/props/corallo.glb | Car (NormalCar1) | Quaternius | poly.pizza/u/Quaternius | CC0 1.0 | materiali rifatti (progetto reallife) |
| assets/props/sedan.glb, van.glb | Free Low Poly Vehicles Pack | RGS_Dev | rgsdev.itch.io/free-low-poly-vehicles-pack | CC0 1.0 | convertiti/materiali (progetto reallife) |
| assets/props/street_lamp_01.glb | Street Lamp 01 | Poly Haven | polyhaven.com/a/street_lamp_01 | CC0 1.0 | semplificato (gltf-transform simplify 0.3) |
| assets/props/shrub_02.glb, shrub_04.glb | Shrub 02 / 04 | Poly Haven | polyhaven.com/a/shrub_02, /a/shrub_04 | CC0 1.0 | semplificati (simplify 0.12) |
| assets/tex/asphalt_* | Asphalt025C | ambientCG | ambientcg.com/a/Asphalt025C | CC0 1.0 | 512 px |
| assets/tex/paving_* | PavingStones070 | ambientCG | ambientcg.com/a/PavingStones070 | CC0 1.0 | 512 px |
| assets/tex/grass_* | Grass001 | ambientCG | ambientcg.com/a/Grass001 | CC0 1.0 | 512 px |
| assets/tex/wood_* | Wood067 | ambientCG | ambientcg.com/a/Wood067 | CC0 1.0 | 512 px |
| assets/tex/marble_* | Marble012 | ambientCG | ambientcg.com/a/Marble012 | CC0 1.0 | 512 px |
| assets/tex/floor_bar_* | Terrazzo013 | ambientCG | ambientcg.com/view?id=Terrazzo013 | CC0 1.0 | 512 px |
| assets/tex/plaster_* | Plastered Wall 02 | Poly Haven | polyhaven.com/a/plastered_wall_02 | CC0 1.0 | 512 px |
| assets/tex/facade_* | Painted Plaster Wall | Poly Haven | polyhaven.com/a/painted_plaster_wall | CC0 1.0 | 512 px |
| assets/tex/cobble_* | Cobblestone Floor 08 | Poly Haven | polyhaven.com/a/cobblestone_floor_08 | CC0 1.0 | 512 px |
| assets/tex/stonebase_* | Large Sandstone Blocks | Poly Haven | polyhaven.com/a/large_sandstone_blocks | CC0 1.0 | 512 px |
| assets/tex/sky_kloofendal_1k.hdr | Kloofendal 48d Partly Cloudy (Pure Sky) | Greg Zaal / Poly Haven | polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | CC0 1.0 | 1K |

Generati dal codice (nessuna licenza esterna): auto guidabili Vela/Bruma/Pode e Autosalone Miraggio (v0.3, forme originali, nessun logo o marchio reale), parco, molo, faro, dialoghi; capelli/barba procedurali, insegne, palo del barbiere, panchine, fontana, edifici, finestre, mappa.
Nomi di luoghi e persone (Rione Marea, Tonino, Marta, Rocco, Bice, Ugo) inventati dagli agenti; nessun marchio reale.

## Aggiunte v0.5.0 (anteprima)

Scaricate da Poly Haven (API pubblica, autori letti dalla scheda di ogni asset), ridotte a 512–1024 px. Tutte **CC0 1.0**. Totale nuove texture: circa 600 KB.

| File | Asset | Autore | Fonte | Licenza | Modifiche |
|---|---|---|---|---|---|
| assets/tex/roof_albedo.jpg, roof_normal.jpg | Clay Roof Tiles 02 | Amal Kumar | polyhaven.com/a/clay_roof_tiles_02 | CC0 1.0 | 512 px, JPEG |
| assets/tex/sand_albedo.jpg, sand_normal.jpg | Coast Sand 01 | Rob Tuytel | polyhaven.com/a/coast_sand_01 | CC0 1.0 | 512 px, tinta più calda |
| assets/tex/facadeatlas_albedo.jpg, facadeatlas_normal.jpg | atlante 2×2: Brick Wall 02 + Plastered Wall 02 + Painted Plaster Wall (gli ultimi due già nel progetto) | Dimitrios Savva (Brick Wall 02); Poly Haven (gli altri, vedi sopra) | polyhaven.com/a/brick_wall_02 | CC0 1.0 | montati in un'unica immagine 1024 px per ridurre i draw call |

Generati dal codice nella v0.5 (nessuna licenza esterna): quartieri nuovi (Spiaggia di Ponente, Lido Conchiglia, Pineta, Piazza dei Limoni, Contrada Salina, Autolavaggio Schiuma), tetti a padiglione, persiane, insegne di negozi inventati, chiosco gelati, conchiglie, finiture delle auto (paraurti, griglia, specchietti). Marchi e nomi sono tutti inventati.

## Aggiunte v0.6.0 (anteprima)

**Nessun asset nuovo scaricato.** La v0.6 riusa solo i file già elencati sopra; tutto il nuovo è generato dal codice: fondale di sabbia con pendenza, scogli, posidonia, boe, shader del mare (colore per profondità, schiuma a riva, vista da sotto), nebbia subacquea, pose del nuoto (libero, rana, dorso, sott'acqua) calcolate sullo scheletro esistente, scocca arrotondata delle auto, cerchi a razze, pneumatici, abitacolo e linee delle porte, lampione semplificato per la distanza.

**Nota Quaternius (Guard).** Il 28/8/2026 Quaternius è passato dalla CC0 alla Quaternius Asset License (QAL) v1.0 (quaternius.com/license.html). I 6 file Quaternius di questo progetto (5 personaggi e `corallo.glb`) sono copie locali precedenti a quella data e restano registrati come CC0 1.0 (sezione 7 della QAL: gli asset già ottenuti mantengono la licenza di allora). Ogni file Quaternius scaricato **dopo** il 28/8/2026 va scritto qui come **QAL v1.0**, con data e URL, mai come CC0, e non va ridistribuito come pacchetto di soli asset. Nella v0.6 non ne è stato aggiunto nessuno.
