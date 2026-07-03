# Log E Monitoraggio Piattaforma

I log piattaforma sono il primo posto da controllare quando qualcosa fallisce in
produzione. Sono pensati per il supporto operativo: abbastanza contesto per
capire cosa e successo, senza esporre segreti.

## Log Route

La pagina log piattaforma mostra eventi applicativi visibili dagli operatori.
L'osservabilita route registra:

- Risposte non-200.
- Route handler che lanciano errori.
- Mutazioni in impersonificazione.
- Metodo e path richiesta.
- Request id.
- Identificativi tenant o prenotazione dove disponibili.
- Metadata richiesta, incluso body metadata dove disponibile.

I filtri supportano ricerca per route, reason, request id, reservation id,
reference e metadata. Usa i filtri prima di scorrere manualmente. La ricerca
nei metadata e importante per integrazioni esterne perche provider, trigger,
intervalli date ed external id vivono nei metadata.

## Metadata

I metadata sono fondamentali per salvataggi falliti. Possono mostrare la forma
sanitizzata del body in ingresso, query params, status code e ragione fallimento.
Aiutano a diagnosticare:

- 403 da sessione mancante o invalida.
- 403 da CSRF same-origin fallito.
- 400 da payload non valido.
- 404 da mismatch tenant o prenotazione.
- 409 da conflitto o regole stato.
- 500 da errore server inatteso.

Il body metadata deve essere visibile nella sezione metadata dell'admin
piattaforma quando disponibile. I segreti devono comunque essere redatti.

## Monitoraggio Integrazioni Esterne

I sync TheFork e DISH scrivono eventi operativi visibili dalla piattaforma.
Filtra i log per tenant e cerca `external_sync`, `thefork`, `dish`, un trigger
sync o un external reservation id.

Nomi evento importanti:

| Evento | Significato |
| --- | --- |
| `external_sync.started` | Un sync e iniziato. I metadata includono provider, trigger, intervallo date e opzioni. |
| `external_sync.completed` | Un sync e terminato. I metadata includono conteggi importati, aggiornati, saltati ed errori. |
| `external_sync.failed` | L'intero sync e fallito, per esempio login, API, timeout o configurazione. |
| `external_sync.reservation_failed` | Una prenotazione esterna e fallita mentre il resto del sync e continuato. |
| `external_sync.webhook_processed` | Un webhook TheFork e stato accettato e ha importato o aggiornato una prenotazione. |
| `external_sync.webhook_failed` | Un webhook TheFork e stato accettato ma l'import e fallito. |
| `external_sync.webhook_rejected` | Un webhook TheFork e stato rifiutato prima dell'import, per esempio token errato o mismatch ristorante. |
| `external_sync.webhook_ignored` | Un webhook TheFork era valido ma non era un evento create/update prenotazione supportato. |

Trigger sync esterni:

- `manual`: l'operatore ha cliccato Sync now.
- `first`: l'operatore ha cliccato First sync.
- `history60`: l'operatore ha cliccato DISH Sync last 60 days.
- `cron`: cron DISH schedulato.
- `webhook`: flusso guidato da webhook esterno, dove applicabile.
- `system`: fallback quando un sync di basso livello e stato chiamato senza
  trigger specifico.

Per incident TheFork:

1. Cerca `external_sync` e filtra per tenant.
2. Controlla `external_sync.webhook_rejected` per problemi token, body, rate
   limit o mismatch ristorante.
3. Controlla `external_sync.webhook_failed` o
   `external_sync.reservation_failed` per errori API/import.
4. Conferma che il Restaurant UUID TheFork del tenant combaci con il contesto
   ristorante TheFork.

Per incident DISH:

1. Cerca `external_sync` e `dish`, poi filtra per tenant.
2. Controlla che il cron giri ogni 15 minuti tramite
   `POST /api/platform/cron/dish-sync`.
3. Controlla `external_sync.failed` per login, parsing HTML, timeout o problemi
   connessione.
4. Usa Sync now per oggi e Sync last 60 days per il primo import o per
   recuperare import storici.

## Log Email

La pagina log email e solo piattaforma. I tenant non hanno accesso alla pagina
log email globale.

Gli operatori possono filtrare per:

- Tenant.
- Tipo email.
- Stato.
- Destinatario o testo ricerca.
- Intervallo date.

Gli stati includono sent, failed e skipped. Leggi con attenzione le ragioni
skipped: spesso sono attese quando la policy dice di non inviare.

## Monitoraggio SMTP

La salute SMTP e tenant-specific. E mostrata sulle card ristorante e puo essere
aggiornata manualmente da un operatore. I controlli SMTP schedulati devono
continuare indipendentemente dai controlli manuali. Schedula
`POST /api/platform/cron/smtp-health` ogni 6 ore.

Usa salute SMTP per identificare problemi di configurazione o connettivita. Usa
i log email per capire singoli tentativi di invio.

## Bounce Processing

Il webhook bounce registra fallimenti downstream quando un provider email o
pipeline mailbox segnala un bounce. Il reject SMTP cattura alcuni indirizzi
sbagliati subito, ma il bounce processing serve per fallimenti ritardati.

Quando dati bounce marcano una email come non raggiungibile, lo staff tenant
dovrebbe vedere un warning chiaro sulla prenotazione cosi puo chiamare l'ospite.

## Salute Globale

L'endpoint health globale riporta stato di sistema come connettivita database.
Non sostituisce i controlli SMTP tenant-specific e non dimostra che la logica di
booking pubblico sia corretta.

## Flusso Indagine Pratico

Per salvataggi piattaforma falliti:

1. Riproduci o chiedi orario e route esatti.
2. Apri log piattaforma e filtra per route o request id.
3. Controlla status code e reason.
4. Ispeziona metadata, inclusa forma body catturata.
5. Conferma se si applicavano riautenticazione o CSRF.
6. Correggi configurazione o payload sottostante.

Per email mancanti:

1. Apri log email.
2. Filtra per tenant e destinatario.
3. Controlla stato e ragione.
4. Confronta salute SMTP e policy evento.
5. Controlla bounce per fallimenti ritardati.

Per sospetto accesso cross-tenant:

1. Conferma superficie richiesta: pubblica, admin tenant o piattaforma.
2. Conferma quale tenant id e stato usato da sessione o chiave pubblica.
3. Conferma che lo store fosse tenant-scoped.
4. Escala se una query su tabelle condivise manca filtro tenant.
