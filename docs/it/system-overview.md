# Panoramica Sistema

Il sistema di prenotazioni e una applicazione Next.js multi-tenant. Una sola
installazione serve molti ristoranti, e ogni ristorante e isolato come tenant. I
siti marketing dei ristoranti sono client separati che chiamano le API pubbliche
con una chiave pubblica tenant.

La regola pratica e semplice: gli ospiti pubblici vedono solo dati sicuri per la
prenotazione, lo staff vede solo il proprio ristorante, e gli amministratori di
piattaforma gestiscono setup e supporto cross-tenant senza indebolire
l'isolamento.

## Runtime E Storage

- Next.js App Router esegue pagine server e route handler API.
- Le API che usano prenotazioni, MySQL, email o store tenant girano su runtime
  Node.js.
- `src/proxy.ts` e il proxy Edge. Verifica solo cookie sessione HMAC e non deve
  importare database o moduli Node-only.
- MySQL conserva tenant, prenotazioni, tavoli, waitlist, impostazioni, log e log
  email tramite `mysql2`.
- Creazione e migrazione schema sono automatiche e idempotenti tramite
  `src/instrumentation.ts` e `src/lib/reservations/mysql-schema.ts`.
- I test usano Vitest e MySQL in memoria.

## Modello Tenant

L'identita tenant viene risolta in modo diverso in base alla superficie:

| Superficie | Autorita | Note |
| --- | --- | --- |
| API pubblica | `requireTenant(req)` | Preferisce `?tenant=<publicKey>` e poi Host. |
| API admin ristorante | `requireAdmin(req)` | Usa il tenant id dal cookie sessione staff. Lo slug URL non e autorita. |
| API piattaforma | `requirePlatform(req)` | Usa il cookie sessione piattaforma. |

Ogni accesso a dati tenant deve passare da uno store tenant-scoped, per esempio
`getStore().forTenant(tenant.id)`. Una query su tabelle condivise senza filtro
tenant e un bug di sicurezza.

## Concetti Principali

### Tenant

Un tenant e un ristorante. Possiede branding, domini, chiave pubblica, origini
consentite, impostazioni, disponibilita, tavoli, prenotazioni, clienti, SMTP,
template email e credenziali staff.

### Offering

Un offering e un canale prenotabile, come sala principale, bar, patio o sala
privata. Il supporto multi-offering e reale. L'offering primario legacy ha
sempre id `main`, e prenotazioni esistenti dipendono da questo id.

### Servizio

Un servizio e una finestra oraria dentro un offering, per esempio pranzo o cena.
Definisce inizio, fine, intervallo slot e opzionalmente durata tavolo specifica.

### Slot

Uno slot e un orario prenotabile generato dentro un servizio. La disponibilita
dello slot deriva da orari, policy, capacita, prenotazioni esistenti, lead time,
blocchi, giorni chiusi e stop servizio per oggi.

### Tavolo

I tavoli rappresentano la capacita fisica. I tavoli attivi guidano la capacita
prenotabile quando esistono per un offering. Possono essere legati a offering,
disabilitati o marcati come unibili.

### Durata Effettiva Tavolo

La durata effettiva decide per quanto tempo una prenotazione occupa capacita.
Una durata specifica del servizio sovrascrive il default globale. Il valore e
usato per conflitti tavoli, calcolo coperti sovrapposti, calendario sala/giorno
e stato slot.

### Policy Prenotazione

La policy prenotazione e configurazione pubblica sicura, come minimo e massimo
numero ospiti. Non e la stessa cosa della capacita disponibile. Un ristorante
puo avere molti coperti disponibili ma limitare una singola prenotazione online.

## Meccanismo Disponibilita

La disponibilita viene calcolata da:

- Configurazione disponibilita tenant.
- Schedules offering e servizi per la data selezionata.
- Orari settimanali, override date speciali, giorni chiusi e slot bloccati.
- Servizi fermati solo per oggi.
- Lead time e finestra prenotabile.
- Tavoli attivi per l'offering, oppure capacita legacy servizio solo se non
  esistono tavoli attivi.
- Prenotazioni attive esistenti, incluse sovrapposizioni create dalla durata
  effettiva tavolo.
- Policy numero ospiti.
- Regole conflitto tavoli, inclusi tavoli uniti dove consentito.

Il risultato non e solo un numero di posti. Ogni slot puo riportare:

- Capacita totale.
- Coperti prenotati.
- Coperti rimanenti.
- Se e prenotabile.
- Motivo specifico quando non e disponibile.

Per questo uno slot puo mostrare coperti rimanenti ma rifiutare una
prenotazione: il gruppo puo superare la policy, il cutoff puo essere passato, il
servizio puo essere fermato o non puo esistere una combinazione tavoli valida.

## Ciclo Vita Prenotazione

Gli stati prenotazione sono:

- `pending`
- `confirmed`
- `seated`
- `completed`
- `cancelled`
- `no_show`

Prenotazioni sedute o completate non possono essere modificate o eliminate dalla
UI tenant. Le prenotazioni completate si comprimono visivamente per tenere la
lista concentrata sul servizio attivo, restando espandibili se serve.

`completed` resta nei calcoli di occupazione del giorno perche l'occupazione
storica same-day puo ancora contare per disponibilita e analisi.

## Modello Email

SMTP e configurato per singolo tenant. Non esiste un account SMTP globale.

Gli amministratori piattaforma gestiscono:

- Host, porta, username, password, modalita sicura e mittente SMTP.
- Switch globale email in uscita.
- Switch conferma prenotazione.
- Switch richiesta recensione.
- Template conferma prenotazione.
- Template richiesta recensione.
- URL recensione.
- Controlli salute SMTP.

Gli invii email creano log email con stati sent, failed e skipped. Skipped e un
risultato significativo: per esempio SMTP mancante, evento disabilitato, ospite
senza email o prenotazione non idonea.

Le richieste recensione usano controlli di idempotenza e lock di invio per
evitare duplicati. Lo staff puo inviare manualmente una richiesta recensione
solo dopo che la prenotazione e completata.

## Osservabilita

Le route usano wrapper di osservabilita:

- `observePublicRoute`
- `observeAdminRoute`
- `observePlatformRoute`
- `observeSystemRoute`

Risposte non-200 e handler in errore vengono registrati nei log visibili dalla
piattaforma con metadata richiesta. Dove disponibile, il body viene catturato
come metadata per aiutare il debug senza dover riprodurre l'azione browser.

La consegna email e monitorata separatamente tramite log email. I controlli
salute SMTP sono tenant-specific e possono girare da cron o manualmente.

## Modello Mentale Per Debug

Quando qualcosa non torna, identifica prima la superficie:

- Problema booking pubblico: controlla tenant resolution, CORS, disponibilita,
  policy pubblica e controlli anti-abuso.
- Problema admin tenant: controlla tenant id sessione staff, CSRF same-origin,
  store tenant-scoped e regole prenotazione/tavoli.
- Problema piattaforma: controlla autenticazione piattaforma, requisiti
  riautenticazione, sanitizzazione, log e redazione segreti.

Poi distingui tra configurazione, policy, capacita, sicurezza o delivery. Lo
stesso sintomo puo avere cause diverse. "Email non arrivata" puo significare
skipped da policy, errore SMTP, reject immediato, bounce ritardato o filtro del
provider.
