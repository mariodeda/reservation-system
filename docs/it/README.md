# Documentazione Reservation System

Questa documentazione spiega come usare e gestire il sistema di prenotazioni
nella pratica quotidiana. E pensata per due gruppi di utenti:

- Amministratori di piattaforma, che creano e supportano i ristoranti.
- Staff del ristorante, che gestisce prenotazioni, tavoli, disponibilita,
  clienti, notifiche e servizio giornaliero.

Il sistema separa in modo netto i controlli di piattaforma dai controlli del
singolo ristorante. Gli amministratori di piattaforma gestiscono configurazioni
sensibili come domini, chiavi pubbliche, SMTP, policy email, log e
impersonificazione. Lo staff del ristorante gestisce il lavoro operativo:
prenotazioni, ospiti, assegnazione tavoli, lista d'attesa, disponibilita,
tavoli e impostazioni locali.

## Albero Documentazione

- [Panoramica Sistema](./system-overview.md)
- [API E Modello Di Sicurezza](./api-and-security.md)
- [Guida Amministratore Piattaforma](./platform-admin/README.md)
  - [Gestione Ristoranti](./platform-admin/tenant-management.md)
  - [Operazioni Email](./platform-admin/email-operations.md)
  - [Log E Monitoraggio](./platform-admin/logs-and-monitoring.md)
- [Guida Staff Ristorante](./tenant-admin/README.md)
  - [Prenotazioni](./tenant-admin/reservations.md)
  - [Disponibilita E Tavoli](./tenant-admin/availability-and-tables.md)
  - [Clienti, Statistiche E Impostazioni](./tenant-admin/customers-analytics-settings.md)
  - [Notifiche Ed Email](./tenant-admin/notifications-and-email.md)

## Superfici Del Prodotto

Il prodotto ha tre superfici principali.

| Superficie | URL | Usata Da | Scopo Principale |
| --- | --- | --- | --- |
| API pubblica prenotazioni | `/api/*` con `?tenant=<publicKey>` | Siti esterni del ristorante | Lettura disponibilita, creazione prenotazioni, lookup ospite, modifiche ospite. |
| Admin ristorante | `/admin/<slug>` | Staff del ristorante | Gestione quotidiana di prenotazioni e servizio. |
| Admin piattaforma | `/platform` | Operatori piattaforma | Setup ristoranti, configurazioni sensibili, supporto, log e monitoraggio. |

I siti marketing pubblici sono applicazioni separate. Non devono codificare a
mano policy come il numero massimo di ospiti. Devono leggerle dagli endpoint
pubblici.

## Orientamento Primo Giorno

Se sei un nuovo amministratore di piattaforma, inizia da:

1. [Panoramica Sistema](./system-overview.md), per capire tenant, offering,
   servizi, tavoli, disponibilita ed email.
2. [Gestione Ristoranti](./platform-admin/tenant-management.md), prima di creare
   o modificare un ristorante.
3. [Operazioni Email](./platform-admin/email-operations.md), prima di abilitare
   conferme prenotazione o richieste recensione.
4. [Log E Monitoraggio](./platform-admin/logs-and-monitoring.md), quando un
   ristorante segnala salvataggi falliti, risposte 403, email mancanti o
   problemi SMTP.

Se sei un nuovo amministratore staff del ristorante, inizia da:

1. [Guida Staff Ristorante](./tenant-admin/README.md), per il flusso quotidiano.
2. [Prenotazioni](./tenant-admin/reservations.md), prima di gestire servizio
   live.
3. [Disponibilita E Tavoli](./tenant-admin/availability-and-tables.md), prima di
   cambiare orari, durate, limiti ospiti o layout tavoli.
4. [Notifiche Ed Email](./tenant-admin/notifications-and-email.md), per capire
   gli alert e quando chiamare un ospite.

## Confini Di Responsabilita

Gli amministratori di piattaforma gestiscono:

- Creazione, disabilitazione ed eliminazione ristoranti.
- Chiavi pubbliche tenant e origini dei siti marketing.
- Domini e routing.
- Credenziali SMTP e identita mittente.
- Switch email e template.
- URL recensioni.
- Log piattaforma e log email.
- Impersonificazione per supporto.
- Reset password staff.

Lo staff ristorante gestisce:

- Prenotazioni del giorno e seating.
- Prenotazioni manuali, walk-in e lista d'attesa.
- Assegnazione tavoli.
- Stati ospite come seduto, completato, cancellato o no-show.
- Stop rapido prenotazioni del giorno.
- Disponibilita, durata servizi, giorni chiusi e slot bloccati.
- Ricerca clienti e statistiche.
- Cambio password locale.

Questo confine e importante per la sicurezza. Un utente staff non deve poter
cambiare credenziali SMTP, chiavi pubbliche, origini consentite o dati di un
altro ristorante.

## Domande Frequenti Di Supporto

### Perche il sito marketing non puo prenotare un gruppo che entrerebbe in sala?

La disponibilita ha due concetti diversi:

- Capacita tavoli: quanti coperti possono fisicamente essere prenotati in uno
  slot.
- Policy prenotazione: quanto puo essere grande una singola prenotazione online.

Un ristorante puo avere 180 coperti disponibili ma limitare una singola
prenotazione online a 20 ospiti. I siti marketing devono mostrare
`reservationPolicy.maxPartySize`, non dedurlo dalla capacita dello slot.

### Perche uno slot mostra posti ma rifiuta comunque una prenotazione?

Uno slot puo essere non disponibile per motivi diversi dai posti:

- Cutoff prenotazione superato.
- Servizio fermato manualmente per oggi.
- Orario bloccato.
- Ristorante chiuso in quella data.
- Numero ospiti fuori policy.
- Prenotazioni esistenti sovrapposte per la durata effettiva tavolo.
- Nessun tavolo o set di tavoli uniti valido.

### Perche una email non e stata inviata?

Controlla prima i log email di piattaforma. Una email saltata non e sempre un
errore. Cause comuni: SMTP mancante, evento email disabilitato, destinatario
mancante, URL recensione mancante o prenotazione non idonea alla richiesta
recensione.

### Perche la piattaforma mostra un 403?

403 di solito significa autenticazione fallita o validazione CSRF same-origin
fallita. Controlla rotta, sessione corrente, cookie, origin richiesta e metadata
nei log piattaforma. Per mutazioni sensibili controlla anche se serve
riautenticazione con password operatore.
