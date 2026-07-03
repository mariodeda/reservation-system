# Guida Staff Ristorante

L'admin tenant vive su `/admin/<slug>`. E lo spazio dello staff ristorante per
il servizio quotidiano: controllare prenotazioni, sedere ospiti, assegnare
tavoli, fermare prenotazioni online quando serve, gestire lista d'attesa e
consultare clienti e statistiche.

Lo slug tenant nell'URL serve per routing e branding. Non e autorita di
sicurezza. La sessione staff loggata decide quali dati ristorante sono
disponibili.

## Aree Principali

| Area | Cosa Fa Lo Staff |
| --- | --- |
| Dashboard | Vede le prenotazioni di oggi e azioni operative rapide. |
| Prenotazioni | Gestisce calendario, slot, prenotazioni, assegnazione tavoli, modal sala/giorno, modal waitlist e azioni recensione. |
| Tavoli | Mantiene capacita sala e metadata tavoli. |
| Disponibilita | Configura orari settimanali, servizi, durate, giorni chiusi, slot bloccati, lead time, finestra booking e policy ospiti. |
| Clienti & Statistiche | Cerca clienti e consulta analytics. |
| Impostazioni | Gestisce preferenze locali e cambio password staff. |

Cliccare il logo tenant riporta alla dashboard. La navigazione header tiene le
pagine operative vicine per muoversi rapidamente durante il servizio.

## Workflow Giornaliero

Prima del servizio:

1. Apri dashboard e controlla prenotazioni di oggi.
2. Apri prenotazioni per la data servizio.
3. Controlla slot card per pressione capacita e motivi di indisponibilita.
4. Controlla lista d'attesa.
5. Conferma eventuali blocchi speciali, chiusure o servizi fermati.

Durante il servizio:

1. Segna ospiti arrivati come seduti e assegna tavoli.
2. Aggiungi walk-in o prenotazioni telefoniche dalla modal prenotazione.
3. Usa la modal sala/giorno quando serve una vista visuale dell'intera giornata.
4. Ferma prenotazioni online per un servizio se il ristorante non puo accettare
   altri ospiti oggi.
5. Guarda le notifiche per nuove prenotazioni online.

Dopo il servizio:

1. Marca come completate le prenotazioni effettivamente servite.
2. Marca no-show in modo accurato.
3. Invia richieste recensione per prenotazioni completate quando opportuno.
4. Consulta analytics e note clienti se serve.

## Cosa Lo Staff Puo E Non Puo Cambiare

Lo staff puo cambiare configurazione operativa:

- Orari disponibilita.
- Durate servizi.
- Lead time e finestra booking.
- Policy numero ospiti.
- Tavoli e metadata tavoli.
- Slot bloccati e giorni chiusi.
- Stato prenotazione e assegnazione tavolo.

Lo staff non puo cambiare configurazione piattaforma:

- Credenziali SMTP.
- Policy globale eventi email.
- Chiave pubblica tenant.
- Origini consentite.
- Domini.
- Log piattaforma.
- Log email globali.

Se una funzione email, un dominio o una integrazione sito pubblico deve cambiare,
contatta un amministratore piattaforma.

## Basi Stato Prenotazione

Stati comuni:

- Confirmed: prenotazione attiva attesa.
- Seated: ospite arrivato e seduto.
- Completed: visita finita.
- Cancelled: prenotazione cancellata.
- No-show: ospite non arrivato.

Prenotazioni sedute e completate non possono essere modificate o eliminate.
Questo protegge la storia operativa ed evita modifiche accidentali dopo che il
ristorante ha gia agito sulla prenotazione.

## Domande Frequenti Staff

### Perche non posso modificare questa prenotazione?

La prenotazione puo essere gia seated o completed. A quel punto usa stato e note
invece di modificare i dettagli core.

### Perche uno slot dice non disponibile?

La slot card dovrebbe mostrare il motivo. Motivi comuni: cutoff booking passato,
servizio fermato oggi, orario bloccato, servizio terminato, pieno o coperti
rimanenti insufficienti.

### Perche l'email ospite mostra un warning?

Il sistema puo sapere che l'indirizzo email non e raggiungibile tramite reject
SMTP o bounce. Lo staff dovrebbe chiamare l'ospite quando vede questo warning.

### Perche "Segna tutte come lette" non rimuove prenotazioni storiche?

Le notifiche sono alert, non prenotazioni. Segnarle come lette pulisce indicatori
di non letto e enfasi popup, ma non elimina prenotazioni dalla lista.
