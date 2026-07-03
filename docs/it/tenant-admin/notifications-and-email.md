# Notifiche Ed Email Tenant

Le notifiche tenant aiutano lo staff a vedere nuove prenotazioni mentre lavora
nell'admin. Lo stato email aiuta a capire se gli ospiti probabilmente riceveranno
conferme e richieste recensione.

## Notifiche

L'admin tenant ascolta eventi prenotazione tramite server-sent events. Nuove
prenotazioni possono produrre:

- Notifica sulla campanella.
- Toast in basso a destra.

Il popup campanella mostra notifiche recenti. `Segna tutte come lette` dovrebbe
pulire lo stato unread nella UI. Chiudere un toast con il pulsante X dovrebbe
anche segnare quella notifica come letta.

Le notifiche non sono prenotazioni. Pulire una notifica non elimina e non
cancella il booking. La prenotazione resta visibile nella lista.

## Protezione Duplicati

Il browser deduplica eventi reservation-created per reservation id, quindi la
stessa prenotazione non dovrebbe generare notifiche doppie o triple nella stessa
tab.

Se lo staff vede duplicati:

- Controlla se sono aperte piu tab browser.
- Conferma se le righe duplicate indicano la stessa prenotazione esatta.
- Aggiorna tab obsolete.
- Segnala duplicati persistenti al supporto piattaforma con orario prenotazione
  e nome ospite.

## Warning Email Prenotazione

Le card prenotazione possono mostrare warning delivery email quando l'indirizzo
ospite e noto come non raggiungibile tramite reject SMTP o bounce processing.

Lo staff dovrebbe chiamare l'ospite quando una card avvisa che l'email non e
raggiungibile. Se l'ospite fornisce email corretta, aggiorna prenotazione o
contatto cliente secondo il workflow disponibile.

## Email Conferma Prenotazione

Le conferme prenotazione sono controllate dalla configurazione piattaforma. Lo
staff non abilita o disabilita il flusso globale da admin tenant.

Se un ospite dice di non aver ricevuto conferma:

1. Controlla se la prenotazione ha email.
2. Controlla se la card mostra warning email.
3. Chiedi al supporto piattaforma di controllare log email per stato sent,
   failed o skipped.
4. Conferma che l'ospite abbia controllato spam o promozioni.

## Email Richiesta Recensione

Lo staff puo inviare una richiesta recensione solo dopo che una prenotazione e
completata. Se gia inviata, l'azione e disabilitata e mostrata come gia inviata.

Le email recensione usano URL recensione e template configurati dalla
piattaforma. Non esiste un form feedback custom in questa applicazione.

Se l'azione manca o e disabilitata, controlla:

- La prenotazione e completata.
- L'ospite ha email.
- Una richiesta recensione non e gia stata inviata.
- Policy email piattaforma e URL recensione sono configurati.

## Cosa Escalare

Contatta supporto piattaforma quando:

- Conferme prenotazione sono skipped o failed per molti ospiti.
- Pulsanti email recensione non sono disponibili su prenotazioni completate.
- Warning SMTP appaiono su molte prenotazioni.
- Le notifiche non si puliscono dopo "segna come lette".
- Nuove prenotazioni online non appaiono senza refresh.

Includi nome ristorante, data, nome ospite, orario prenotazione e testo warning
visibile. Questo da agli operatori contesto sufficiente per filtrare i log.
