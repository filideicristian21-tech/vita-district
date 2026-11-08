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
