# Notifiche ed email

Le notifiche aiutano lo staff a reagire a nuove attivita booking. Lo stato email
aiuta a capire se gli ospiti ricevono messaggi e quando serve follow-up
telefonico.

## Tipi di notifica

L'admin tenant puo mostrare:

- Notifiche campanella nell'header.
- Toast in basso a destra.
- Warning sulle card prenotazione.

Le notifiche sono alert. Non sono i dati prenotazione stessi.

## Popup campanella

Mostra notifiche recenti.

Lo staff puo:

- Aprire campanella per rivedere notifiche.
- Usare `Segna tutte lette` per pulire stato unread.
- Cliccare notifica per attenzione operativa.

Se unread non si pulisce:

1. Clicca Segna tutte lette una volta.
2. Chiudi e riapri popup.
3. Aggiorna pagina.
4. Segnala se unread ritorna sulle stesse notifiche.

## Toast

I toast appaiono in basso a destra. Sono utili durante servizio per notare nuove
prenotazioni online senza lasciare la schermata corrente.

Cliccare X dovrebbe chiudere il toast e segnare la notifica letta. Non cancella
la prenotazione.

## Protezione duplicati

Il browser dovrebbe deduplicare eventi reservation-created per reservation id in
una singola tab. Lo staff puo comunque confondersi quando:

- Sono aperte piu tab.
- Lo stesso ospite fa piu prenotazioni reali.
- Una tab vecchia si riconnette.
- Le notifiche vengono confuse con righe prenotazione.

Nel dubbio, controlla la lista prenotazioni per data e offering selezionati.

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
3. Conferma offering selezionato.
4. Controlla connessione internet.
5. Chiedi supporto piattaforma se persiste.

## Email conferma prenotazione

Le conferme booking sono controllate da configurazione piattaforma. Lo staff non
abilita SMTP o policy conferma da admin tenant.

Se un ospite dice che conferma non e arrivata:

1. Conferma indirizzo email.
2. Controlla warning email sulla prenotazione.
3. Conferma dettagli per telefono se serve.
4. Chiedi al supporto di controllare log email.

## Allegati calendario

Le conferme booking possono includere allegato calendario. I client email lo
mostrano in modi diversi:

- Alcuni mostrano invito RSVP.
- Alcuni mostrano allegato `.ics`.
- Alcuni aggiungono evento dopo accettazione.
- Alcuni nascondono dettagli calendario in menu.

Se ospite non trova evento, conferma prima che email sia arrivata, poi chiedi di
controllare come il client mostra allegati calendario.

## Email richiesta recensione

Le richieste recensione partono dopo visita completed, automaticamente dopo il
ritardo configurato o manualmente dallo staff quando disponibile.

Staff puo inviare solo quando:

- Prenotazione completed.
- Ospite ha email.
- Richiesta non gia inviata.
- Policy piattaforma lo consente.
- Tenant ha URL recensione.
- SMTP pronto.

Non esiste form feedback custom in questa applicazione. I link puntano al sito
recensione esterno configurato da piattaforma.

## Warning email su card

Un warning significa che il sistema pensa che l'email ospite non sia
raggiungibile. Puo succedere per:

- SMTP ha rifiutato destinatario subito.
- Provider ha riportato bounce dopo.
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
| Sent | L'app ha inviato e SMTP ha accettato. Non garantisce che ospite lo abbia visto. |
| Failed | Invio fallito o bounce registrato. Staff puo dover chiamare. |
| Skipped | Il sistema non ha inviato per policy o configurazione. |

Lo staff tenant di solito non vede i log email completi. Chiedi supporto quando
serve.

## Domande email comuni

### Lo staff puo reinviare conferma booking?

Usa le azioni disponibili sulla card. Se non esiste reinvio, conferma per
telefono e chiedi supporto se il reinvio e supportato.

### Posso inviare recensione prima del completamento?

No. Le recensioni sono per visite completed.

### Perche recensione gia inviata?

Il sistema registra invii per prevenire duplicati. Se gia inviata, il pulsante
resta disabilitato.

### Nessun warning significa delivery garantita?

No. Significa solo che il sistema non ha registrato fallimenti noti.

## Quando escalare

Escala a supporto piattaforma quando:

- Molti ospiti segnalano conferme mancanti.
- Email recensione non disponibile su booking completed.
- Warning email appaiono su molte prenotazioni.
- Notifiche non si puliscono dopo refresh.
- Nuove prenotazioni online non appaiono.
- Servono cambi SMTP, template, URL recensione o policy email.
