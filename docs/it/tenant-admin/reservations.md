# Prenotazioni tenant

La pagina prenotazioni e la schermata operativa principale dello staff. Qui si
controlla disponibilita, si aggiungono prenotazioni, si assegnano tavoli, si
aggiornano stati, si gestisce lista d'attesa e si affrontano eccezioni del
giorno.

## Layout Pagina

La pagina include:

- Selettore data.
- Selettore offering quando esistono piu offering.
- Card disponibilita servizi e slot.
- Lista prenotazioni.
- Modal nuova prenotazione.
- Modal calendario sala/giorno.
- Modal lista d'attesa.

Usa prima data e offering. La maggior parte delle altre informazioni deriva da
quella selezione.

## Card Servizio E Slot

Le slot card mostrano lo stato di un orario prenotabile. Aiutano lo staff a
rispondere rapidamente:

- Lo slot e ancora prenotabile?
- Quanti coperti sono gia riservati?
- Quanta pressione c'e sul servizio?
- Perche lo slot non e disponibile?

Le slot card mostrano coperti prenotati rispetto alla capacita tavoli attivi.
Questo e coperti riservati su coperti totali prenotabili per lo slot, non la
dimensione massima di una singola prenotazione.

Motivi di indisponibilita:

- Servizio fermato oggi.
- Orario bloccato.
- Cutoff prenotazione passato.
- Coperti rimasti insufficienti.
- Pieno.
- Servizio terminato.
- Ristorante chiuso.

Quando un servizio e chiuso perche l'ultimo slot piu durata tavolo e passato,
l'icona disponibilita e nascosta e il riepilogo coperti e grigio ma ancora
leggibile.

## Come Si Calcolano I Coperti

Quando esistono tavoli attivi per un offering, i loro posti attivi guidano la
capacita slot. Le prenotazioni attive esistenti vengono conteggiate sugli slot
che si sovrappongono. La sovrapposizione usa la durata effettiva tavolo per quel
servizio e quella data.

Esempio: se la cena dura 90 minuti, una prenotazione alle 19:00 influenza gli
slot successivi che si sovrappongono a quella finestra. Per questo lo stesso
numero ospiti puo apparire nel calcolo coperti di piu slot.

E intenzionale. Evita che il ristorante accetti troppi coperti su turni
sovrapposti.

## Aprire La Modal Nuova Prenotazione

Lo staff puo aprire la modal nuova prenotazione dalle azioni pagina o cliccando
uno slot disponibile. Se aperta da uno slot, la modal dovrebbe precompilare data,
servizio e orario selezionati.

La modal raccoglie:

- Offering.
- Data.
- Servizio.
- Orario.
- Numero ospiti.
- Nome ospite.
- Telefono.
- Email.
- Note e allergie.

Gli input devono avere label visibili. Lo staff non deve indovinare quale campo
sta modificando durante il servizio.

## Prenotazioni Create Dallo Staff

Le prenotazioni create dallo staff possono bypassare alcune restrizioni del
booking pubblico per registrare prenotazioni reali, telefoniche o eccezioni
operative. Il sistema protegge comunque regole importanti:

- I conflitti tavoli devono essere rispettati.
- Prenotazioni sedute non possono essere modificate o eliminate.
- Prenotazioni completate non possono essere modificate o eliminate.
- Assegnazioni tavolo non sicure devono essere pulite quando cambiano dettagli
  core.

## Azioni Prenotazione

Le azioni possono includere:

- Assegnazione tavolo.
- Modifica prenotazione.
- Elimina prenotazione.
- Invia email recensione.

Le azioni sono mostrate inline con la selezione tavolo dove lo spazio lo
consente. I pulsanti devono avere nomi chiari.

Prenotazioni seated o completed non possono essere modificate o eliminate. Le
prenotazioni completate si comprimono visivamente e mostrano il minimo
operativo finche non vengono espanse:

```text
12:00
Nome ospite · 2 ospiti
Completata
```

Questo evita che visite concluse competano visivamente con il lavoro live.

## Assegnazione Tavoli

L'assegnazione tavoli permette un singolo tavolo o un set di tavoli uniti. I
tavoli uniti sono validi solo se la configurazione tavoli lo consente.

Il dropdown deve essere leggibile in tema chiaro e scuro. Le righe devono essere
centrate verticalmente, e i tooltip hover devono spiegare le informazioni tavolo.

Se data, orario, servizio, offering, numero ospiti o durata cambiano, l'attuale
assegnazione tavolo potrebbe non essere piu sicura. Il sistema deve rivalidare
conflitti e pulire assegnazioni non sicure.

## Calendario Sala/Giorno

Il calendario sala/giorno si apre come modal. Mostra l'intera giornata per dare
allo staff una vista del flusso servizio.

L'indicatore del tempo corrente e mostrato in basso per non sovrapporsi al testo
degli orari prenotazione. I ristoranti possono avere orari continui o finestre
separate pranzo/cena, quindi il calendario deve gestire gap chiusi senza farli
sembrare prenotabili.

Usa questa modal per rispondere a domande come:

- Quali tavoli sono occupati piu tardi?
- Dove si sovrappongono i turni?
- C'e un gap tranquillo tra servizi?
- Una prenotazione grande puo essere piazzata in sicurezza?

## Lista D'Attesa

La lista d'attesa si apre come modal dalla pagina prenotazioni. Lo staff puo
aggiungere, aggiornare e sedere voci waitlist.

Usala quando c'e domanda ma una prenotazione non puo essere accettata subito.
Quando si libera capacita, lo staff puo convertire o creare manualmente una
prenotazione dal contesto waitlist.

## Azione Richiesta Recensione

Lo staff puo inviare una richiesta recensione solo dopo che la prenotazione e
completata. Se gia inviata, l'azione e disabilitata e indica che la richiesta e
gia stata inviata.

Se l'azione non e disponibile, controlla:

- Stato prenotazione.
- Se una email recensione e gia stata inviata.
- Se l'ospite ha email.
- Se policy email piattaforma e URL recensione sono configurati.

## Troubleshooting Pagina Prenotazioni

Se la disponibilita non si carica:

1. Conferma che la data selezionata sia valida.
2. Aggiorna la pagina e verifica che la sessione tenant sia ancora attiva.
3. Controlla che la configurazione disponibilita sia valida.
4. Chiedi a un admin piattaforma di controllare i log route dell'API
   disponibilita.

Se i coperti sembrano troppo alti:

1. Conferma tavoli attivi per l'offering selezionato.
2. Conferma se i coperti prenotati appaiono in piu slot sovrapposti per la
   durata servizio.
3. Conferma durata servizio e durata default.
4. Controlla prenotazioni attive nella stessa finestra sovrapposta.

Se le notifiche si duplicano:

1. Conferma se ci sono piu tab browser aperte.
2. Controlla se lo stesso reservation id e ripetuto.
3. Aggiorna una sola tab e verifica stato unread.
4. Segnala duplicati persistenti reservation-created al supporto piattaforma.
