# Notifiche ed email

Le notifiche aiutano lo staff a reagire a nuove prenotazioni. Lo stato email
aiuta a capire se gli ospiti ricevono messaggi e quando serve richiamarli
telefonico.

Le notifiche sono salvate dal sistema, non solo nella tab browser aperta. Se lo
staff accede dopo l'arrivo di una prenotazione, le notifiche non lette vengono
caricate dal server e mostrate nella campanella. I toast live sono un aiuto in
piu mentre la pagina admin e aperta.

## Tipi di notifica

L'admin ristorante puo mostrare:

- Notifiche campanella nell'header.
- Toast in basso a destra.
- Warning sulle card prenotazione.
- Aggiornamenti da sorgenti esterne, come import TheFork o DISH.

Le notifiche sono alert. Non sono i dati prenotazione stessi.

## Popup campanella

Mostra le notifiche prenotazione non lette del tenant ristorante attualmente
loggato. Non mostra notifiche di altri ristoranti.

Lo staff puo:

- Aprire campanella per rivedere notifiche.
- Usare `Segna tutte lette` per pulire stato non letto.
- Cliccare una notifica per segnarla letta e aprire la pagina prenotazioni per
  quella data.

Lo stato letto/non letto e salvato sul server. Chiudere browser o accedere da un
altro dispositivo non dovrebbe far tornare notifiche gia segnate come lette.

Se lo stato non letto non si pulisce dopo `Segna tutte lette`:

1. Clicca Segna tutte lette una volta.
2. Chiudi e riapri popup.
3. Aggiorna pagina.
4. Segnala se lo stato non letto ritorna sulle stesse notifiche.

## Toast

I toast appaiono in basso a destra. Sono utili durante servizio per notare nuove
prenotazioni online senza lasciare la schermata corrente.

Cliccare X dovrebbe chiudere il toast e segnare la notifica letta. Non cancella
la prenotazione.

## Protezione duplicati

Il sistema crea notifiche persistenti con una chiave duplicato lato server.
Questo significa che lo stesso evento di creazione prenotazione non dovrebbe
creare notifiche non lette duplicate, anche se il browser si riconnette o un
import riprova lo stesso record.

Gli aggiornamenti da piattaforme esterne possono generare una notifica quando la
prenotazione esterna cambia data, orario, numero ospiti o altri dettagli
operativi. Queste notifiche sono intenzionali perche possono influenzare
capacita e pianificazione staff.

Lo staff puo comunque confondersi quando:

- Sono aperte piu tab.
- Lo stesso ospite fa piu prenotazioni reali.
- Una tab vecchia si riconnette.
- Le notifiche vengono confuse con righe prenotazione.
- Una piattaforma esterna invia un aggiornamento reale per una prenotazione gia
  importata.

Nel dubbio, controlla la lista prenotazioni per data e zona selezionate.

## Cosa succede al login

Quando l'admin tenant carica, l'header chiede al server le notifiche recenti non
lette. Questo copre prenotazioni arrivate mentre nessuna pagina staff era
aperta. Dopo il caricamento, una connessione live ascolta nuove notifiche
persistenti. Se la connessione live cade, l'header mostra stato di riconnessione
e riprova automaticamente.

Flusso consigliato per lo staff:

1. A inizio turno, apri la campanella e controlla le notifiche non lette.
2. Clicca le notifiche che richiedono attenzione.
3. Usa `Segna tutte lette` dopo che il team ha controllato la lista.
4. Lascia la pagina aperta durante il servizio per ricevere toast live.

## Notifiche booking esterni

Le prenotazioni esterne sincronizzate da piattaforme come TheFork e DISH usano
lo stesso sistema notifiche tenant. Restano isolate per tenant e appaiono solo
per il ristorante che ha prodotto l'import.

Queste notifiche sono utili perche possono ridurre la disponibilita dell'API
pubblica e possono creare pressione di overbooking se una piattaforma esterna
accetta piu prenotazioni del previsto. Lo staff dovrebbe controllarle insieme
alla lista prenotazioni e allo stato slot.

## Troubleshooting notifiche

### Mark all read non fa nulla

Prova:

1. Chiudi e riapri popup.
2. Aggiorna pagina.
3. Controlla se notifiche sono gia lette ma visibili come storico.
4. Segnala se indicatori unread restano attivi.

### Toast ritorna sempre

Prova:

1. Controlla altre tab browser.
2. Aggiorna tab attiva.
3. Conferma se la prenotazione e nuova o vecchia.
4. Segnala nome ospite, data e orario se si ripete.

### Nuove prenotazioni non appaiono

Prova:

1. Aggiorna lista prenotazioni.
2. Conferma data selezionata.
3. Conferma zona selezionata.
4. Controlla connessione internet.
5. Chiedi supporto piattaforma se persiste.

## Email conferma prenotazione

Le conferme prenotazione sono controllate dal supporto piattaforma. Lo staff non
attiva invio email o regole conferma dall'admin ristorante.

Se un ospite dice che conferma non e arrivata:

1. Conferma indirizzo email.
2. Controlla warning email sulla prenotazione.
3. Conferma dettagli per telefono se serve.
4. Chiedi al supporto di controllare log email.

## Allegati calendario

Le conferme prenotazione possono includere allegato calendario. Le app email lo
mostrano in modi diversi:

- Alcuni mostrano invito RSVP.
- Alcuni mostrano allegato `.ics`.
- Alcuni aggiungono evento dopo accettazione.
- Alcuni nascondono dettagli calendario in menu.

Se ospite non trova l'evento, conferma prima che email sia arrivata, poi chiedi
di controllare come la sua app email mostra allegati calendario.

## Email richiesta recensione

Le richieste recensione partono dopo visita completed, automaticamente dopo il
ritardo configurato o manualmente dallo staff quando disponibile.

Staff puo inviare solo quando:

- Prenotazione completed.
- Ospite ha email.
- Richiesta non gia inviata.
- Il supporto piattaforma ha abilitato le email recensione.
- Il ristorante ha un link recensione salvato.
- Invio email pronto.

Non esiste un form feedback dentro questo sistema. I link portano al sito
recensioni esterno impostato dal supporto piattaforma.

## Warning email su card

Un warning significa che il sistema pensa che l'email ospite non sia
raggiungibile. Puo succedere per:

- L'indirizzo email e stato rifiutato subito.
- Il provider email ha segnalato dopo che la consegna e fallita.
- Invio precedente fallito.

Risposta staff:

1. Chiama ospite.
2. Conferma prenotazione.
3. Chiedi email corretta.
4. Aggiorna prenotazione/cliente se possibile.
5. Aggiungi nota se serve follow-up.

## Sent, failed e skipped

I log email piattaforma usano tre stati:

| Stato | Significato per staff |
| --- | --- |
| Sent | Il messaggio e stato accettato per la consegna. Non garantisce che ospite lo abbia visto. |
| Failed | Invio fallito o consegna fallita dopo. Staff puo dover chiamare. |
| Skipped | Il sistema non ha inviato per una regola o impostazione mancante. |

Lo staff ristorante di solito non vede i log email completi. Chiedi supporto quando
serve.

## Domande email comuni

### Lo staff puo reinviare conferma prenotazione?

Usa le azioni disponibili sulla card. Se non esiste reinvio, conferma per
telefono e chiedi supporto se il reinvio e supportato.

### Posso inviare recensione prima del completamento?

No. Le recensioni sono per visite completed.

### Perche recensione gia inviata?

Il sistema registra invii per prevenire duplicati. Se gia inviata, il pulsante
resta disabilitato.

### Nessun warning significa consegna garantita?

No. Significa solo che il sistema non ha registrato fallimenti noti. L'email
puo comunque finire in spam o essere nascosta dall'app email dell'ospite.

## Quando chiedere supporto

Escala a supporto piattaforma quando:

- Molti ospiti segnalano conferme mancanti.
- Email recensione non disponibile su prenotazioni completed.
- Warning email appaiono su molte prenotazioni.
- Notifiche non si puliscono dopo refresh.
- Nuove prenotazioni online non appaiono.
- Servono cambi a invio email, template, link recensione o regole email.
