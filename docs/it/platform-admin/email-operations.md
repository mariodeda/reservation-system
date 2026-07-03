# Operazioni Email Piattaforma

Le email sono di proprieta della piattaforma. Lo staff tenant puo vedere stato
email sulle prenotazioni, ma non configura SMTP, policy email globale o
template. Questo mantiene identita mittente, credenziali e delivery sotto
controllo piattaforma.

## Cosa Gestiscono Gli Operatori

Per ogni tenant, gli operatori piattaforma gestiscono:

- Host SMTP.
- Porta SMTP.
- Username SMTP.
- Password SMTP.
- Modalita sicura.
- Indirizzo e identita mittente.
- Switch globale email in uscita.
- Switch evento conferma prenotazione.
- Switch evento richiesta recensione.
- Ritardo richiesta feedback/recensione.
- Template conferma prenotazione.
- Template richiesta recensione.
- URL recensione.

Non esiste fallback SMTP globale. Se un tenant non ha SMTP, le email di quel
tenant devono essere saltate o fallire in base al percorso specifico.

## Stati Email

Log email e riepiloghi UI usano tre stati:

| Stato | Significato | Azione Operatore |
| --- | --- | --- |
| Sent | L'app ha tentato l'invio e SMTP lo ha accettato. | Di solito nessuna azione, salvo segnalazione ospite. |
| Failed | Invio SMTP fallito o bounce registrato dopo. | Ispeziona metadata errore e stato provider/SMTP. |
| Skipped | Policy o configurazione hanno soppresso l'invio. | Correggi configurazione mancante o lascia cosi se intenzionale. |

Cause comuni di skipped:

- Email globale disabilitata.
- Evento specifico disabilitato.
- SMTP non configurato.
- Destinatario mancante.
- URL recensione mancante.
- Template non pronto.
- Prenotazione non completata.
- Prenotazione no-show o cancellata.
- Richiesta recensione gia inviata.

Skipped non significa sempre sistema rotto. Spesso significa che il sistema ha
correttamente rifiutato un invio non conforme alla policy.

## Email Conferma Prenotazione

Le conferme prenotazione vengono inviate quando:

- Email tenant abilitate.
- Evento conferma prenotazione abilitato.
- SMTP configurato.
- Esiste email destinatario.
- Requisiti template soddisfatti.

La conferma include un allegato calendario. Non serve un account calendario
della piattaforma. L'evento viene generato da dati prenotazione e tenant:
identita ristorante, orario prenotazione, numero ospiti e dettagli location dove
disponibili.

Se un ospite non vede l'invito calendario, controlla prima il client email.
Alcuni client mostrano gli allegati calendario in modo diverso. Poi controlla
allegato raw, log email e se il provider SMTP ha modificato il messaggio.

## Email Richiesta Recensione

Le email recensione vengono inviate solo dopo che una prenotazione e completata
e dopo il ritardo configurato. Lo staff puo anche inviare manualmente una
richiesta da una prenotazione completata. Se gia inviata, il pulsante e
disabilitato e indica che e gia stata inviata.

Il link recensione punta all'URL recensione configurato per il tenant. Non
esiste un form feedback custom in questa applicazione. I template devono invitare
l'ospite a lasciare una recensione sul sito esterno configurato.

Gli invii recensione sono idempotenti. Il sistema deve evitare duplicati per la
stessa prenotazione, anche quando processo automatico e azione manuale avvengono
vicini.

Le richieste recensione automatiche vengono elaborate dall'endpoint cron
piattaforma `POST /api/platform/cron/feedback-requests`. Schedularlo ogni 30
minuti con `Authorization: Bearer <CRON_SECRET>`. Il caricamento delle pagine
staff non deve avviare questo sweep; legge solo lo stato prenotazioni. Il
percorso immediato su cambio stato prova ancora l'invio quando una prenotazione
viene marcata completata e il ritardo tenant e gia trascorso.

## Salute SMTP

I controlli salute SMTP verificano che l'app possa connettersi al server SMTP
tenant. Possono girare da cron o essere avviati manualmente da un operatore. I
controlli manuali non sostituiscono ne disabilitano quelli schedulati.

Schedulare l'endpoint cron SMTP `POST /api/platform/cron/smtp-health` ogni 6
ore con `Authorization: Bearer <CRON_SECRET>`.

Le card ristorante mostrano stato SMTP color-coded per identificare rapidamente
tenant che richiedono attenzione.

La salute SMTP risponde a "l'app puo connettersi a SMTP?". Non garantisce che un
destinatario specifico accetti un messaggio piu tardi.

## Reject Destinatario E Bounce

Alcuni indirizzi non validi vengono rifiutati immediatamente da SMTP. Altri sono
accettati prima e falliscono dopo come bounce. Per questo servono entrambi:

- Gestione errori SMTP immediati.
- Bounce processing dai provider downstream.

Quando l'email ospite e nota come non raggiungibile, le card prenotazione tenant
possono mostrare un warning cosi lo staff puo chiamare l'ospite.

## Troubleshooting Delivery

Quando un operatore indaga una email mancante:

1. Apri log email piattaforma.
2. Filtra per tenant, destinatario, data e tipo email.
3. Controlla se lo stato e sent, failed o skipped.
4. Per skipped, leggi la ragione e correggi configurazione se serve.
5. Per failed, ispeziona metadata SMTP o bounce.
6. Per sent, controlla spam/quarantena, regole mailbox e bounce successivi.
7. Se mancano inviti calendario, controlla se il client nasconde allegati `.ics`
   o richiede una vista invito specifica.

Non assumere che "non e in inbox" significhi che l'app non ha inviato. La
delivery email e una catena: applicazione, accettazione SMTP, provider, server
destinatario, filtri mailbox e visualizzazione client.
