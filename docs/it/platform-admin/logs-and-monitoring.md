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

I filtri supportano ricerca per route, reason, request id, reservation id e
reference. Usa i filtri prima di scorrere manualmente.

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
continuare indipendentemente dai controlli manuali.

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
