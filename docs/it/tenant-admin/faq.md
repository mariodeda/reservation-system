# FAQ staff

Questa FAQ risponde alle domande comuni dello staff in modo semplice.

## Accesso e navigazione

### Perche cambiare slug URL non mostra un altro ristorante?

L'accesso viene dalla sessione staff loggata, non dallo slug URL. Lo slug serve
solo per routing e branding.

### Come torno alla dashboard?

Clicca il logo del ristorante nell'header.

### Dov'e finito il link Dashboard?

E stato rimosso per pulire l'header. Il logo e la scorciatoia dashboard.

### Dove sono le impostazioni?

Le impostazioni sono l'icona ingranaggio vicino a Sign out.

## Prenotazioni

### Perche non posso modificare una prenotazione?

La prenotazione potrebbe essere seated o completed. Questi stati bloccano
modifica ed eliminazione per proteggere lo storico servizio.

### Devo eliminare una prenotazione cancellata?

Di solito no. Marcala cancelled. Elimina solo se creata per errore e non deve
restare nelle operazioni.

### Perche una completed si comprime?

Per tenere leggibile la lista servizio attivo. Espandi la card se servono
dettagli.

### Perche Send review email e disabilitato?

Motivi comuni:

- Prenotazione non completed.
- Email recensione gia inviata.
- Ospite senza email.
- Piattaforma ha disabilitato richieste recensione.
- URL recensione mancante.
- SMTP non pronto.

### Posso inviare email recensione a un no-show?

No. Le richieste recensione sono per prenotazioni completate e frequentate.

## Disponibilita e coperti

### Perche uno slot mostra coperti su piu orari?

Una prenotazione occupa capacita per la durata effettiva tavolo. Se una
prenotazione 19:00 dura 90 minuti, si sovrappone a slot successivi. E previsto.

### Perche il ristorante ha posti ma il booking viene rifiutato?

Possibili ragioni:

- Numero ospiti supera massimo.
- Lead time passato.
- Slot bloccato.
- Servizio fermato oggi.
- Data chiusa.
- Nessun tavolo o set unito valido.

### Differenza tra massimo ospiti e capacita?

Massimo ospiti e la prenotazione singola piu grande accettata. Capacita e quanti
coperti totali entrano in uno slot.

### Perche lo switch servizio e disabilitato?

Il servizio potrebbe aver superato l'ultimo orario prenotabile dopo lead time.

## Tavoli

### Perche non posso assegnare un tavolo che sembra vuoto?

Potrebbe confliggere con durata di altra prenotazione, appartenere a altro
offering, essere inattivo o troppo piccolo.

### Cosa sono tavoli uniti?

Combinazioni fisiche che lo staff puo mettere insieme per gruppi grandi. Devono
rispecchiare la sala reale.

### Devo cambiare capacita tavolo per una serata speciale?

Di solito no. Usa date speciali, slot bloccati, servizi fermati o note manager
salvo vero cambio fisico layout.

## Notifiche

### Mark all read elimina booking?

No. Pulisce solo stato unread notifiche.

### Perche vedo notifiche duplicate?

Possibili cause: piu tab browser o delivery eventi ripetuta. Controlla se c'e
una prenotazione reale o piu prenotazioni.

### Cosa faccio con un toast?

Usalo come alert. La prenotazione resta nella lista.

## Email

### Cosa significa warning email?

L'email ospite potrebbe non essere raggiungibile. Chiama l'ospite.

### Lo staff puo configurare SMTP?

No. SMTP e configurato dagli amministratori piattaforma.

### L'ospite non ha ricevuto conferma. Cosa faccio?

Controlla indirizzo email, chiama l'ospite se serve e chiedi al supporto
piattaforma di controllare log email.

### Sent garantisce che l'ospite ha visto l'email?

No. Sent significa che SMTP ha accettato il messaggio. Puo comunque essere
filtrato, rimbalzare dopo o essere nascosto dal client.

## Clienti e analytics

### Perche analytics sembrano sbagliate?

Dipendono da stati prenotazione accurati. Mantieni completed, cancelled e
no-show aggiornati.

### Come trovo un ospite abituale?

Usa ricerca Clienti per nome, email o telefono.

### Le note possono contenere informazioni sensibili?

No. Usa note solo per dettagli rilevanti al servizio.

## Quando escalare

Escala a supporto piattaforma quando:

- Disponibilita non carica dopo refresh.
- Molte email falliscono o vengono saltate.
- Il sito pubblico ha problemi CORS o chiave tenant.
- Lo staff vede errori 403 ripetuti.
- Le notifiche non si puliscono.
- I dati sembrano attraversare confini tenant.
- Devono cambiare SMTP, domini, chiavi pubbliche o origini consentite.
