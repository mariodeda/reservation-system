# Gestione Ristoranti Piattaforma

La gestione tenant e lo spazio principale dell'amministratore piattaforma per
setup ristoranti, supporto e configurazione sensibile. E l'unico posto dove gli
operatori devono gestire chiavi pubbliche, domini, origini consentite, SMTP,
policy email, URL recensioni, reset password staff, impersonificazione e azioni
distruttive.

## Lista Ristoranti

La home piattaforma mostra card ristorante. Ogni card riassume:

- Nome ristorante e slug.
- Stato attivo o disabilitato.
- Ultima attivita prenotazione.
- Stato salute SMTP.
- Readiness email conferma prenotazione.
- Readiness email richiesta recensione.

Usa la lista come superficie di monitoraggio. Un ristorante con SMTP fallito o
flusso email inattivo puo comunque accettare prenotazioni, ma gli ospiti
potrebbero non ricevere conferme o richieste recensione.

## Dettaglio Tenant

Il dettaglio tenant e la pagina canonica per controlli solo operatore. Sezioni
tipiche:

- Identita e stato.
- Branding e chiave pubblica tenant.
- Origini consentite API booking.
- Domini.
- Impostazioni SMTP.
- Policy flussi email.
- Template email.
- URL recensione.
- Sync one-way TheFork.
- Sync one-way DISH.
- Operazioni mock data.
- Reset password staff.
- Impersonificazione.
- Controlli disabilita ed elimina.

Quando modifichi impostazioni tenant, ricorda che salvataggi parziali devono
preservare stati disabilitati espliciti. Se un evento email e volutamente off,
salvare campi non correlati non deve riaccenderlo.

## Chiave Pubblica E Siti Marketing

I siti marketing devono chiamare le API pubbliche con:

```text
?tenant=<publicKey>
```

La chiave pubblica e configurazione client stabile. Se cambia, i siti esterni
devono essere aggiornati. Tratta la rotazione della chiave come cambiamento di
integrazione, non come modifica ordinaria.

Per la policy pubblica UI booking, i client marketing devono leggere:

```json
{
  "reservationPolicy": {
    "maxPartySize": 20
  }
}
```

Il massimo numero ospiti arriva dalla policy prenotazione tenant. Non e la
capacita dello slot. Uno slot puo avere 30 o 180 coperti disponibili mentre la
dimensione massima di una singola prenotazione online resta 20.

## Origini Consentite

Le origini consentite controllano quali siti marketing possono chiamare API
pubbliche dal browser. Aggiungi origin esatti come:

```text
https://www.example-restaurant.com
https://example-restaurant.com
```

Evita origin ampi o non correlati. Se un sito marketing fallisce con errore
CORS, confronta l'header Origin esatto del browser con le origini tenant.

## Domini

I domini sono usati per deployment same-domain e fallback host nella risoluzione
tenant. La risoluzione tramite chiave pubblica resta preferibile per siti
marketing perche esplicita e stabile.

Quando aggiungi domini:

- Conferma che il dominio appartenga al ristorante.
- Evita di assegnare lo stesso dominio a tenant diversi.
- Testa routing pubblico e admin dopo la modifica.

## SMTP E Riepilogo Flussi Email

La card piattaforma separa intenzionalmente salute SMTP da readiness flusso
email:

- Salute SMTP significa che l'app puo connettersi al server SMTP tenant.
- Readiness conferma prenotazione significa che la conferma puo davvero partire.
- Readiness richiesta recensione significa che l'email recensione puo davvero
  partire.

La readiness recensione dipende anche da URL recensione e template utilizzabile.
Se manca l'URL recensione, il flusso recensione non deve risultare attivo.

## Integrazioni Esterne Prenotazioni

Le integrazioni esterne si configurano per singolo tenant dal dettaglio tenant.
Sono import one-way nel nostro sistema: le prenotazioni importate appaiono nella
UI prenotazioni tenant, riducono la disponibilita pubblica e sono etichettate
chiaramente come esterne. Lo staff puo assegnare un tavolo locale, ma dettagli
prenotazione, stato, contatti ospite e azioni email restano controllati dalla
piattaforma esterna.

### TheFork

TheFork usa credenziali B2B API ufficiali piu un webhook tenant-specific.

Campi richiesti:

- Client ID.
- Client secret.
- Restaurant UUID.
- Toggle enabled.

Il Restaurant UUID e obbligatorio. Non abilitare una integrazione TheFork solo
con Group UUID, perche i dati di gruppo non dimostrano rigidamente che ogni
prenotazione appartenga a un singolo tenant ristorante. La piattaforma impedisce
di abilitare lo stesso TheFork Restaurant UUID su piu tenant.

Quando salvi credenziali TheFork, la piattaforma valida la connessione API prima
di salvare l'integrazione come enabled. Se la validazione fallisce, la
configurazione precedente funzionante resta in vigore.

L'URL webhook viene generato per singolo tenant:

```text
/api/integrations/thefork/webhook/<tenantId>
```

Configura TheFork per chiamare quell'URL tenant-specific con:

```http
Authorization: Bearer <token-specifico-tenant>
```

Il webhook verifica tenant id nell'URL, token tenant-specific e Restaurant UUID
TheFork. Un webhook inviato all'URL tenant sbagliato o con ristorante diverso
viene rifiutato e loggato.

Azioni manuali:

- **Sync now** importa aggiornamenti TheFork di oggi.
- **First sync** importa prenotazioni TheFork future fino alla booking window
  tenant e salta import gia presenti.

### DISH

DISH non fornisce una API pubblica prenotazioni per questo account.
L'integrazione DISH e un sync read-only dalle pagine manager autenticate e
dipende dalla compatibilita continua dell'HTML.

Campi richiesti:

- Email DISH.
- Password DISH.
- Establishment id DISH, dal valore query `est` nell'URL del tool DISH
  Reservation.
- Toggle enabled.

Quando salvi credenziali DISH, la piattaforma testa il login prima di abilitare
l'integrazione. La password viene salvata cifrata e non torna mai al browser.
L'establishment id contestualizza le richieste alle pagine prenotazioni del
ristorante esatto mostrato da DISH. La piattaforma impedisce di abilitare la
stessa email login DISH su piu tenant, perche il flusso HTML non offre un
identificativo ristorante stabile piu forte.

Azioni manuali:

- **Sync now** importa oggi.
- **Sync last 60 days** importa gli ultimi 60 giorni calendario, incluso oggi,
  e salta import gia presenti. Usalo per il primo import e per recuperare dati
  mancanti. La piattaforma lo esegue in batch da 7 giorni per mantenere
  reattive le pagine manager DISH e la UI piattaforma.

Il sync DISH schedulato gira tramite `POST /api/platform/cron/dish-sync` ogni
15 minuti. Sincronizza oggi e domani per tutti i tenant attivi con integrazione
DISH abilitata. Non avvia automaticamente backfill storici.

### Regole Operative

Le prenotazioni esterne devono restare tenant-scoped a ogni livello:

- Le credenziali integrazione sono salvate per tenant.
- I link prenotazione esterna sono keyed per tenant id, provider ed external id.
- Gli import scrivono tramite reservation store tenant-scoped.
- La disponibilita pubblica conta coperti esterni solo per lo stesso tenant.
- Il self-service ospite non espone prenotazioni esterne.
- Conferma booking locale e azioni email recensione sono disabilitate per
  prenotazioni esterne.

Usa i log piattaforma per indagare il comportamento sync. Cerca `external_sync`,
`thefork`, `dish` o un external reservation id.

## Reset Password Staff

Il reset password staff e sensibile perche concede accesso all'admin tenant.
Richiede riautenticazione operatore. Condividi nuove credenziali tramite canale
sicuro e invita il ristorante a cambiarle dopo il primo login quando opportuno.

## Impersonificazione

Gli operatori piattaforma possono impersonare un tenant dalla pagina dettaglio.
Il pulsante apre l'admin tenant in una nuova scheda. L'impersonificazione
richiede riautenticazione con password operatore ed e bloccata per ristoranti
disabilitati.

Lo staff tenant non deve vedere lo stato di impersonificazione. I log
piattaforma registrano comunque mutazioni non-read eseguite in
impersonificazione.

Usala per supporto, per verificare cosa vede lo staff, controllare un workflow o
riprodurre un problema tenant-side. Evita modifiche operative live salvo
richiesta del ristorante o necessita del caso supporto.

## Disabilita Ed Elimina

Disabilitare un tenant serve quando il ristorante deve fermare operazioni ma i
dati devono restare disponibili. Eliminare e distruttivo e va trattato come
ultima risorsa. Le azioni distruttive richiedono conferma esplicita e
riautenticazione operatore.

Prima di disabilitare o eliminare:

- Conferma identita tenant.
- Conferma impatto sui siti booking pubblici.
- Controlla se ci sono prenotazioni attive.
- Esporta o preserva dati richiesti dal processo business.
