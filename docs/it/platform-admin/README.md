# Guida Amministratore Piattaforma

L'admin piattaforma vive su `/platform`. E pensato per operatori che creano
ristoranti, configurano impostazioni sensibili, supportano utenti staff e
indagano problemi operativi tra tenant.

L'admin piattaforma non e lo spazio quotidiano per gestire prenotazioni. Quando
un operatore deve vedere la UI staff di un tenant per supporto, deve usare
l'azione di impersonificazione dal dettaglio tenant invece di gestire dati
operativi da schermate piattaforma.

## Aree Principali

| Area | A Cosa Serve |
| --- | --- |
| Ristoranti | Card tenant, creazione tenant, stato, riepilogo salute SMTP, stato funzionalita email e accesso dettaglio. |
| Dettaglio tenant | Branding, API pubblica booking, origini, domini, SMTP, policy email, template, URL recensione, integrazioni prenotazioni esterne, reset password staff, impersonificazione, mock data e azioni distruttive. |
| Log | Errori route e eventi operativi visibili dalla piattaforma. |
| Log email | Attivita email sent, failed e skipped su tutti i tenant. |
| Docs | Questa guida operativa bilingue. |

## Responsabilita Operatore

Gli operatori piattaforma gestiscono configurazioni che impattano sicurezza,
delivery e integrazioni esterne:

- Creare ristoranti e assegnare slug stabili.
- Generare e mantenere chiavi pubbliche tenant.
- Configurare origini consentite dei siti marketing.
- Configurare domini.
- Configurare SMTP per ristorante.
- Abilitare o disabilitare flussi email.
- Mantenere template conferma prenotazione e richiesta recensione.
- Configurare URL recensioni.
- Configurare e monitorare integrazioni one-way di prenotazioni esterne come
  TheFork e DISH.
- Monitorare salute SMTP, log API e log delivery email.
- Resettare password staff quando necessario.
- Usare impersonificazione solo per supporto e debug.

Lo staff ristorante non deve configurare questi elementi. Tenerli solo in
piattaforma riduce il rischio di misconfigurazioni, esposizione credenziali ed
errori cross-tenant.

## Setup Raccomandato Nuovo Tenant

1. Crea il tenant con nome ristorante, slug e stato iniziale corretti.
2. Controlla branding e dettagli pubblici.
3. Conferma o genera la chiave pubblica tenant.
4. Aggiungi tutte le origini dei siti marketing che chiameranno l'API pubblica.
5. Configura domini se il tenant usa routing same-domain.
6. Configura SMTP ed esegui un controllo salute SMTP.
7. Configura template conferma prenotazione e richiesta recensione.
8. Configura URL recensione se le email recensione saranno abilitate.
9. Configura integrazioni esterne solo dopo che il ristorante ha fornito
   credenziali provider e identificativo ristorante corretti.
10. Abilita gli eventi email solo dopo che SMTP e template sono pronti.
11. Crea o resetta credenziali staff e condividile tramite canale sicuro.
12. Chiedi allo staff di configurare tavoli, disponibilita, servizi e policy
    prima di accettare prenotazioni live.

## Lettura Card Ristorante

Le card ristorante mostrano lo stato operativo importante senza aprire ogni
tenant:

- Stato indica se il tenant e attivo.
- Ultima prenotazione indica uso recente.
- Salute SMTP indica se l'app puo connettersi al server SMTP tenant.
- Stato conferma prenotazione indica se il flusso puo davvero inviare.
- Stato richiesta recensione indica se il flusso recensione puo davvero inviare.
- Setup sync esterno indica se TheFork o DISH sono configurati e abilitati nel
  dettaglio tenant.

Lo stato email deriva da readiness reale. Un flusso deve risultare attivo solo
quando switch email globale, switch evento specifico, SMTP, template richiesti,
requisiti destinatario e URL recensione sono soddisfatti.

## Aspettative Sicurezza

- Usa password operatore forti.
- Riautenticati quando richiesto per azioni distruttive o sensibili.
- Mantieni origini consentite strette ed esatte.
- Non mettere credenziali SMTP tenant in variabili ambiente.
- Tratta l'impersonificazione come accesso supporto privilegiato.
- Evita modifiche operative tenant salvo richiesta del ristorante o necessita
  del caso supporto.
- Controlla i log prima di indovinare quando un tenant segnala salvataggi
  falliti o 403.

Gli utenti tenant non vedono lo stato di impersonificazione, ma i log piattaforma
registrano le mutazioni fatte in impersonificazione.

## Workflow Comuni Operatore

### Un ristorante non riesce a salvare impostazioni piattaforma

1. Conferma che l'operatore sia loggato in `/platform`.
2. Controlla se l'azione richiede riautenticazione password.
3. Controlla i log piattaforma per route e metadata richiesta.
4. Conferma che il payload sia valido e non rifiutato dalla sanitizzazione.
5. Conferma che il tenant non sia disabilitato se l'operazione richiede stato
   attivo.

### Un sito marketing non riesce a chiamare le API pubbliche

1. Conferma che usi la chiave pubblica corretta in `?tenant=<publicKey>`.
2. Conferma che l'origin esatto sia tra quelli consentiti.
3. Conferma che l'endpoint pubblico risponda dal browser.
4. Controlla se il preflight CORS passa.
5. Controlla i log per risposte pubbliche non-200.

### Una email booking o recensione non arriva

1. Controlla lo stato SMTP nella card tenant.
2. Apri log email e filtra per tenant e destinatario.
3. Cerca `sent`, `failed` o `skipped`.
4. Se skipped, correggi prima la ragione di policy/configurazione.
5. Se sent ma non ricevuta, controlla spam/quarantena e bounce successivi.

### Prenotazioni esterne mancanti o non aggiornate

1. Apri dettaglio tenant e conferma che l'integrazione provider sia abilitata.
2. Per TheFork, conferma Client ID, Client secret, Restaurant UUID, URL webhook
   e token webhook tenant-specific.
3. Per DISH, conferma che il login manager funzioni ancora.
4. Esegui il sync manuale rilevante e osserva il risultato progresso.
5. Apri log piattaforma e cerca `external_sync`, nome provider o external
   reservation id.
6. Ricorda che le prenotazioni esterne sono read-only localmente tranne
   assegnazione tavolo, ma riducono comunque la disponibilita pubblica del
   tenant.
