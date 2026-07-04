# API E Modello Di Sicurezza

Questa pagina spiega le superfici API e le regole di sicurezza che separano
ospiti pubblici, staff ristorante e operatori piattaforma.

## Endpoint Pubblici

Gli endpoint pubblici sono usati dai siti marketing dei ristoranti. Sono sicuri
per client browser e devono risolvere il tenant da chiave pubblica o host.

| Endpoint | Scopo |
| --- | --- |
| `GET /api/tenant?tenant=<publicKey>` | Branding pubblico e policy UI prenotazione. |
| `GET /api/availability?date=YYYY-MM-DD&tenant=<publicKey>` | Disponibilita pubblica per un giorno. |
| `GET /api/availability?month=YYYY-MM&tenant=<publicKey>` | Sommario disponibilita mensile. |
| `POST /api/reservations?tenant=<publicKey>` | Creazione prenotazione pubblica. |
| `POST /api/reservations/lookup?tenant=<publicKey>` | Lookup ospite con contatto e riferimento. |
| `PATCH /api/reservations/lookup?tenant=<publicKey>` | Modifica self-service ospite. |
| `DELETE /api/reservations/lookup?tenant=<publicKey>` | Cancellazione self-service ospite. |

Le risposte pubbliche espongono solo dati sicuri per booking. Non devono esporre
id database grezzi, impostazioni private, SMTP, log interni o dati cross-tenant.

I riferimenti prenotazione visibili all'ospite usano il riferimento esterno
generato dall'id. I siti marketing devono trattarlo come unico identificativo
visibile all'ospite.

## Policy Pubblica Tenant

I siti marketing devono leggere la policy pubblica invece di codificarla a mano.
La risposta tenant pubblica include:

```json
{
  "reservationPolicy": {
    "maxPartySize": 20
  }
}
```

Questo valore arriva dalla policy prenotazione tenant. Non deve essere dedotto
dalla capacita slot o dai coperti rimanenti. La capacita slot risponde a
"quanti coperti potrebbero entrare a questo orario"; il massimo gruppo risponde
a "quanto puo essere grande una singola prenotazione online".

## Protezione Booking Pubblico

Gli endpoint pubblici includono controlli anti-abuso:

- Limiti dimensione body richiesta.
- Campo honeypot.
- Controlli timing submit.
- Finto successo silenzioso per bot probabili.
- Rate limit a finestre fisse per IP, email e telefono.
- Massimo prenotazioni attive per contatto.
- Riconvalida disponibilita al momento della scrittura.

Le integrazioni marketing devono inviare normali dati utente e non tentare di
aggirare questi controlli. Se ricevono un rifiuto inatteso, controllare body,
timing submit, chiave tenant, origin CORS e rate limit.

## CORS

CORS e configurato per tenant. Gli endpoint pubblici rispondono solo a origin
presenti nelle origini consentite tenant. Un sito marketing deve essere aggiunto
prima che chiamate browser cross-origin funzionino.

Questo protegge un ristorante dal sito di un altro ristorante e impedisce a siti
arbitrari di usare l'API booking con il contesto browser dell'utente.

## Endpoint Admin Ristorante

Gli endpoint admin tenant sono usati da `/admin/<slug>`. Lo slug serve per
routing e branding, ma non e autorita di sicurezza. L'accesso viene dal cookie
sessione staff e da `requireAdmin(req)`.

Gruppi principali:

- `/api/admin/reservations`
- `/api/admin/reservations/[id]`
- `/api/admin/reservations/[id]/table`
- `/api/admin/reservations/[id]/feedback`
- `/api/admin/reservations/[id]/emails`
- `/api/admin/availability`
- `/api/admin/config`
- `/api/admin/tables`
- `/api/admin/waitlist`
- `/api/admin/customers`
- `/api/admin/analytics`
- `/api/admin/events`
- `/api/admin/today-booking-controls`
- `/api/admin/settings/password`

Le mutazioni admin autenticate da cookie devono passare il controllo CSRF
same-origin nel layer tenant context. Un fallimento produce 403 e deve essere
visibile nei log piattaforma con metadata sufficienti.

## Endpoint Piattaforma

Gli endpoint piattaforma sono usati da `/platform` e richiedono
`requirePlatform(req)`, tranne login/logout ed endpoint system esplicitamente
pubblici.

Gruppi principali:

- `/api/platform/tenants`
- `/api/platform/tenants/[id]`
- `/api/platform/tenants/[id]/domains`
- `/api/platform/tenants/[id]/password`
- `/api/platform/tenants/[id]/mock`
- `/api/platform/tenants/[id]/impersonation`
- `/api/platform/logs`
- `/api/platform/email-logs`
- `/api/platform/analytics`
- `/api/platform/cron/dish-sync`
- `/api/platform/cron/feedback-requests`
- `/api/platform/cron/smtp-health`
- `/api/platform/bounces`

Schedulare `/api/platform/cron/dish-sync` ogni 15 minuti con
`Authorization: Bearer $CRON_SECRET`. Sincronizza i tenant DISH attivi sulla
booking window pubblica rolling per i prossimi 14 giorni calendario, limitata
dalla booking window di ogni tenant, cosi prenotazioni esterne restano visibili
nella UI staff e nella disponibilita pubblica senza avviare backfill storici
automatici.

Schedulare `/api/platform/cron/smtp-health` ogni 6 ore con
`Authorization: Bearer $CRON_SECRET`. Gli operatori possono comunque avviare
controlli SMTP manuali dalla console piattaforma quando indagano un ristorante.

Le mutazioni sensibili richiedono riautenticazione con password operatore. Vale
per azioni distruttive e supporto privilegiato come eliminazione tenant, reset
password staff e impersonificazione.

## Endpoint Integrazioni Esterne

Le integrazioni prenotazioni esterne importano dati in un singolo tenant e non
devono mai diventare canali dati cross-tenant.

Gli URL webhook TheFork sono tenant-specific:

```text
POST /api/integrations/thefork/webhook/<tenantId>
Authorization: Bearer <token-specifico-tenant>
```

L'handler verifica tenant id dal path, token webhook tenant-specific e
Restaurant UUID TheFork nel payload o nei dati API successivi. Payload webhook
con tenant, token, identificativo ristorante, metodo o tipo evento non
supportato vengono rifiutati o ignorati e loggati come eventi `external_sync`.

DISH non ha webhook pubblico in ingresso. Viene letto da azioni manuali
controllate dalla piattaforma e dal cron `dish-sync`. Le credenziali DISH sono
tenant-scoped, testate prima dell'abilitazione, cifrate a riposo e non tornano
mai al browser.

## Sanitizzazione E Redazione

Impostazioni tenant e configurazione disponibilita devono essere sanitizzate
prima del salvataggio. La sanitizzazione preserva valori `false` espliciti in
modo che update parziali non riabilitino funzioni disattivate.

Le risposte con settings devono redigere segreti. Le password SMTP non devono
mai tornare al browser dopo il salvataggio. La UI piattaforma puo mostrare che
un segreto e configurato, ma non il segreto stesso.

## Sicurezza Impersonificazione

L'impersonificazione e una funzione di supporto. Apre l'admin tenant in una
nuova scheda e permette all'operatore di verificare o supportare workflow staff.

Regole:

- Solo operatori piattaforma possono iniziarla.
- Serve riautenticazione con password operatore.
- Tenant disabilitati non possono essere impersonati.
- Lo staff tenant non deve vedere lo stato di impersonificazione.
- Le mutazioni non-read fatte in impersonificazione sono loggate.

L'impersonificazione non deve diventare una scorciatoia attorno
all'isolamento tenant. Deve usare i normali percorsi admin tenant con stato di
impersonificazione emesso dalla piattaforma.

## Checklist Debug

Per un problema API pubblica:

- Conferma la chiave pubblica tenant.
- Conferma che l'origin marketing sia consentito.
- Conferma che l'endpoint abbia i parametri richiesti.
- Controlla disponibilita e policy separatamente.
- Controlla log piattaforma per risposte non-200.

Per un problema admin tenant:

- Conferma che la sessione staff sia valida.
- Conferma che l'origin rispetti CSRF same-origin.
- Conferma che prenotazione/tavolo/cliente appartenga al tenant sessione.
- Controlla se lo stato prenotazione blocca l'azione.

Per un problema piattaforma:

- Conferma validita sessione piattaforma.
- Conferma se serve riautenticazione.
- Controlla forma payload sanitizzato.
- Controlla metadata log piattaforma, incluso body dove presente.
