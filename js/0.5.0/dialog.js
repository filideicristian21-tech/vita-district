// Dialoghi a scelte degli NPC (locali, zero rete). Formato fisso: saluto, 2–3 domande a pulsante, «Saluta» per chiudere.
// Testi: idee-v3/lumen.md (adattati ai nomi reali del gioco). Nessuna promessa di funzioni che non esistono.
export const DIALOGS = {
  tonino: { name: 'Tonino', role: 'barbiere · Barberia Lama d\'Oro', hello: 'Ciao! Entra, entra. Qui si esce sempre meglio di come si è entrati.', bye: 'Alla prossima. Lascia crescere, poi ci penso io.',
    qs: [['Da quanto fai il barbiere?', 'Da quando avevo le mani più piccole delle forbici. Mio padre mi faceva spazzare, io guardavo.'],
      ['Cosa mi consigli?', 'Dipende da quanto hai lasciato crescere. Siediti, guardiamo allo specchio: l\'anteprima è gratis.'],
      ['Perché lo specchio è crepato?', 'Quella crepa ha più clienti affezionati di me. Non la cambio per niente al mondo.']] },
  marta: { name: 'Marta', role: 'barista · Caffè Sottovento', hello: 'Buongiorno! Banco o da portare via?', bye: 'Ciao, torna quando hai sonno.',
    qs: [['Che differenza c\'è tra banco e asporto?', 'Al banco lo bevi subito e riparti più svelto. Da asporto te lo porti dietro e lo bevi quando vuoi.'],
      ['Perché si chiama Sottovento?', 'Perché qui il vento del porto non arriva. La schiuma resta in piedi.'],
      ['Com\'è il quartiere nuovo, giù al mare?', 'C\'è il parco del Faro e l\'autosalone. Io ci vado la domenica, a piedi: si vede tutto meglio.']] },
  rocco: { name: 'Rocco', role: 'Consegne Lampo', hello: 'Ehi! Cerchi lavoro o cerchi me? Tanto è la stessa cosa.', bye: 'Vai, vai: i pacchi non si consegnano da soli.',
    qs: [['Come funziona?', 'Scegli una delle tre consegne, prendi il pacco e segui il segnale sulla mappa. Lo consegni alla porta giusta e io ti pago.'],
      ['Posso consegnare in macchina?', 'Guidi fino a lì, accosti e scendi: il pacco lo vogliono in mano, non dal finestrino.'],
      ['E se cambio idea?', 'Annulli e basta, nessuno si offende. Il pacco torna qui.']] },
  bice: { name: 'Signora Bice', role: 'civico 7', hello: 'Oh, chi è? Ah, sei tu. Entra pure con la voce, non con le scarpe.', bye: 'Vai, vai. E saluta tua madre.',
    qs: [['Da quanto abita qui?', 'Da sempre. Ho visto il rione cambiare tre volte. Io no, io sono rimasta uguale.'],
      ['Perché le caramelle alla menta?', 'Una per chi è gentile. Le tengo in tasca da quarant\'anni.'],
      ['Che ne pensa delle macchine nuove?', 'Belle, belle. Basta che rallentino davanti al portone.']] },
  ugo: { name: 'Nonno Ugo', role: 'Piazzetta del Pozzo', hello: null, bye: 'Ciao, ragazzo. Passa quando vuoi.',
    qs: [['Perché la fontana è sempre ferma?', 'Perché si riposa. Ha lavorato più di me.'],
      ['Che facevi da giovane?', 'Il pescatore. Adesso pesco solo chiacchiere, ma abboccano di più.'],
      ['Mi dai un consiglio?', 'Non correre sempre. Ogni tanto siediti qui, guarda chi passa e impara i nomi.']] },
  saverio: { name: 'Saverio', role: 'venditore · Autosalone Miraggio', hello: 'Benvenuto al Miraggio! Guardare è gratis, sognare pure.', bye: 'A presto! Le chiavi le hai, il sorriso pure.',
    qs: [['Quale mi consigli per cominciare?', 'La Vela: piccola, gira stretta e ce l\'hai già. Quando hai qualche credito, prova la Bruma o la Pode.'],
      ['Perché costano così poco?', 'Sono crediti del rione, mica euro. Qui si paga in consegne e caffè.'],
      ['Un consiglio di guida?', 'Frena prima delle curve, non durante. E davanti ai pedoni l\'auto frena da sola: tu comunque vai piano.']] },
  gino: { name: 'Gino', role: 'meccanico · Officina Bullone Felice', hello: 'Mani sporche, cuore pulito. Che ha la tua macchina?', bye: 'Vai piano sulle Cale. I bulloni restano qui.',
    qs: [['Cosa fai qui?', 'Ascolto i motori. Mi dicono tutto prima ancora che apri il cofano.'],
      ['Mi controlli l\'auto?', 'Parcheggiala nel piazzale e stringiamo i quattro bulloni, in croce. Non è una riparazione vera: è un controllo del gioco.'],
      ['Un consiglio di guida?', 'Frena prima della curva, non dentro. La Pode te lo insegna in fretta.']] },
  lia: { name: 'Lia', role: 'corriere · Rotta Sicura', hello: 'Hai un\'auto e un po\' di tempo? Allora ho dei pacchi per te.', bye: 'Strada buona. E niente fretta: il premio è per chi non corre.',
    qs: [['Che differenza c\'è con Rocco?', 'Rocco fa il rione a piedi. Io porto i pacchi grossi fino al Belvedere, con la tua auto.'],
      ['Quale auto conviene?', 'Va bene la Vela. Non serve comprarne un\'altra, e non c\'è un premio se corri.'],
      ['Da quanto fai questo lavoro?', 'Da quando ho capito che ogni indirizzo ha una storia. Io ci arrivo senza far stridere le gomme.']] },
  nadia: { name: 'Nadia', role: 'fotografa · Belvedere delle Case', hello: 'Sorridi, o no: qui le foto vengono vere comunque.', bye: 'Tienila nel gioco, se ti piace. Fuori di qui non la mando.',
    qs: [['Cosa posso fare qui?', 'Inquadri il rione con la camera del gioco: il faro dal lungomare, o il laghetto da quassù. Nessuna fotocamera del telefono.'],
      ['Perché fai la fotografa?', 'Perché la gente cambia, i quartieri cambiano. Le foto no.'],
      ['Il posto più bello del rione?', 'Il Molo del Faro, visto da levante. Ma non dirlo a tutti, se no si riempie.']] },
  ottavio: { name: 'Ottavio', role: 'bocciofila · Il Pallino d\'Oro', hello: 'Giovane! Ci manca il quarto. Sai tirare o solo guardare?', bye: 'Bella partita, anche se il pallino è rimasto solo.',
    qs: [['Come si gioca?', 'Lanci la boccia più vicino possibile al pallino. Tre tiri, senza fretta. Chi si avvicina di più ha fatto pratica, non una scommessa.'],
      ['Da quanto giocate?', 'Teresa dice da cinquant\'anni. E che io perdo da cinquant\'anni. Oggi tiri tu.'],
      ['Conoscete Nonno Ugo?', 'Ugo? Viene il giovedì, tira due bocce e poi racconta del porto fino a sera.']] },
  // v0.5 — Contrada Salina e Colle dei Limoni (testi: idee-v5/lumen.md, adattati)
  pina: { name: 'Pina', role: 'bagnina · Lido Conchiglia', hello: 'Sole, sabbia e niente fretta. Hai visto le conchiglie sulla battigia?', bye: 'Ciao! Occhio al bagnasciuga, scivola.',
    qs: [['Cosa si fa qui?', 'Ogni giorno il mare porta cinque conchiglie sulla sabbia asciutta. Raccoglile tutte e ti do 12 crediti finti, una volta al giorno.'],
      ['Si può fare il bagno?', 'Il mare lo guardi e basta, qui. Io controllo la spiaggia dalla torretta, tu goditi l\'ombrellone.'],
      ['Perché Lido Conchiglia?', 'Perché da bambina le raccoglievo qui. Adesso le conto, e qualcuna la lascio per te.']] },
  dario: { name: 'Dario', role: 'Autolavaggio Schiuma', hello: 'Ciao! Porti la macchina sotto il portale e ci penso io. Sei crediti finti, due minuti.', bye: 'Vai piano nelle pozzanghere, eh.',
    qs: [['Cosa cambia dopo il lavaggio?', 'Solo la carrozzeria: brilla per un giorno, poi torna come prima. Non ripara niente, è vanità pura.'],
      ['Come funziona?', 'Entri piano sotto il portale, ti fermi e scendi pure dopo. Tocca «Lavaggio» quando sei dentro.'],
      ['Da quanto lavori qui?', 'Da quando il Colle aveva più biciclette che auto. Le biciclette le lavavo gratis.']] },
  assunta: { name: 'Assunta', role: 'gelataia · Gelateria Nuvola di Limone', hello: 'Ciao, tesoro! Il limone è fresco di stamattina.', bye: 'Torna col caldo, eh. Il gelato d\'inverno è per i coraggiosi.',
    qs: [['Qual è il gusto più buono?', 'Il limone, ovvio. Ma se vuoi il segreto, prendi limone e fico insieme.'],
      ['Da quanto hai la gelateria?', 'Da quando mio nonno girava col carretto. Io ho solo smesso di spingerlo.'],
      ['Cos\'è quel campanile?', 'Il campanile dei Limoni. Da qualunque strada del rione lo vedi: se ti perdi, cammina verso di lui.']] },
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// HTML del dialogo: storia delle battute + pulsanti delle domande non ancora fatte
export function dialogHTML(id, asked = [], hello) {
  const d = DIALOGS[id]; if (!d) return '';
  const lines = [`<div class="say">«${esc(hello || d.hello)}»</div>`];
  for (const i of asked) lines.push(`<div class="ask">${esc(d.qs[i][0])}</div><div class="say">«${esc(d.qs[i][1])}»</div>`);
  const btns = d.qs.map((q, i) => asked.includes(i) ? '' : `<button class="pill" data-q="${i}">${esc(q[0])}</button>`).join('');
  return `<h2>💬 ${esc(d.name)}</h2><small class="muted">${esc(d.role)}</small><div class="dlg">${lines.join('')}</div>
    <div class="opts">${btns}</div><div class="row foot"><button class="pill primary" data-bye="1">👋 Saluta</button><button class="pill" data-back="1">✕ Chiudi</button></div>`;
}
