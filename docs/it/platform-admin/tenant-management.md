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
