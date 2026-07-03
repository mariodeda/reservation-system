# Ciclo vita e azioni prenotazione

Questa pagina spiega stati prenotazione, pulsanti azione, regole di modifica,
regole eliminazione, assegnazione tavoli, email recensione e modo piu sicuro di
gestire situazioni comuni con ospiti.

## Stati prenotazione

| Stato | Significato | Azione tipica staff |
| --- | --- | --- |
| Pending | La prenotazione esiste ma puo richiedere conferma o controllo. | Confermare, contattare ospite o aggiornare dettagli. |
| Confirmed | L'ospite e atteso. | Tenere visibile per servizio e assegnare tavolo se serve. |
| Seated | Ospite arrivato e seduto. | Non modificare dettagli core. Segnare completed dopo visita. |
| Completed | Visita finita. | Conservare storico, eventualmente inviare richiesta recensione. |
| Cancelled | Prenotazione cancellata. | Nessuna azione seating. |
| No-show | Ospite non arrivato. | Marcare accuratamente per analytics e contesto futuro. |

## Perche lo stato conta

Lo stato influenza:

- Se staff puo modificare o eliminare.
- Se la prenotazione conta nelle viste operative.
- Se email recensione puo essere inviata.
- Analytics come no-show e coperti completati.
- Chiarezza staff su cosa richiede ancora attenzione.

## Modifica prenotazioni

Usa `Modifica prenotazione` quando l'ospite cambia dettagli prima di essere
seduto:

- Data.
- Orario.
- Servizio.
- Offering.
- Numero ospiti.
- Nome.
- Telefono.
- Email.
- Note o allergie.

La modifica e disabilitata quando la prenotazione e seated o completed. Questo
protegge lo storico servizio. Se un ospite seduto cambia tavolo o numero persone,
usa stato operativo e note dove disponibili invece di riscrivere il booking
originale.

## Elimina prenotazione

Usa `Elimina prenotazione` con attenzione. Eliminare rimuove la prenotazione dal
flusso operativo normale. Preferisci stati quando descrivono meglio la realta:

- Ospite cancella: usa cancelled.
- Ospite non arriva: usa no-show.
- Ospite ha mangiato: usa completed.

Elimina va riservato a errori come inserimento manuale duplicato o dati test che
non devono restare nelle operazioni.

Eliminazione e disabilitata quando la prenotazione e seated o completed.

## Assegnazione tavoli

L'assegnazione collega una prenotazione a uno o piu tavoli fisici.

Lo staff puo assegnare:

- Tavolo singolo.
- Set di tavoli uniti quando la configurazione lo permette.

Prima di assegnare, controlla:

- Il gruppo entra nel tavolo o set.
- Il tavolo e attivo.
- Il tavolo appartiene all'offering corretto o pool condiviso.
- Non c'e conflitto con altra prenotazione nella finestra durata effettiva.

Se data, orario, servizio, offering, numero ospiti o durata cambiano, la vecchia
assegnazione puo diventare non sicura. Il sistema dovrebbe rivalidare e pulire
assegnazioni non sicure.

## Tavoli uniti

I tavoli uniti devono rappresentare operazioni reali di sala. Se non possono
essere fisicamente uniti durante servizio, non devono essere marcati unibili.

Quando si usa un set unito, i conflitti considerano ogni tavolo del set. Un
conflitto su un solo tavolo rende il set non sicuro.

## Collasso prenotazioni completate

Le prenotazioni completed si comprimono per mantenere leggibile il servizio
attivo. La vista compressa mostra essenziale:

```text
12:00
Nome ospite - 2 ospiti
Completed
```

Lo staff puo espandere la card se servono dettagli.

## Azione email recensione

`Invia email recensione` e disponibile solo dopo prenotazione completed. Se la
richiesta e gia stata inviata, il pulsante e disabilitato e dovrebbe indicarlo.

L'azione puo non essere disponibile perche:

- Prenotazione non completed.
- Ospite senza email.
- Richiesta recensione gia inviata.
- Policy piattaforma disabilita richieste recensione.
- Tenant senza URL recensione.
- SMTP non disponibile.

Se lo staff pensa che l'azione dovrebbe essere disponibile, chiedere supporto
piattaforma per controllare configurazione email e log.

## Cambi ospite comuni

### Ospite chiama per cambiare orario

1. Apri prenotazione.
2. Controlla disponibilita target.
3. Modifica orario se non seated/completed.
4. Ricontrolla assegnazione tavolo dopo salvataggio.
5. Conferma il cambio all'ospite.

### Ospite cambia numero persone

1. Controlla se nuovo numero rispetta policy e capacita.
2. Modifica numero ospiti se permesso.
3. Riassegna tavolo se il vecchio non basta.
4. Aggiungi nota se il cambio impatta preparazione.

### Ospite cancella

1. Preferisci cancelled invece di delete.
2. Conserva note utili.
3. Non inviare richiesta recensione.

### Ospite arriva

1. Marca seated.
2. Assegna tavolo se manca.
3. Evita modifiche core dopo seating.

### Ospite va via

1. Marca completed.
2. Conferma che non servano altre azioni operative.
3. Invia richiesta recensione solo se appropriata e disponibile.

### Ospite non arriva

1. Marca no-show dopo il normale tempo di tolleranza del ristorante.
2. Non marcare completed.
3. Non inviare richiesta recensione.

## Regole sicurezza azioni

- Non modificare o eliminare prenotazioni seated.
- Non modificare o eliminare prenotazioni completed.
- Non inviare recensione a no-show o cancellati.
- Non usare delete per rappresentare cancellazioni normali.
- Non assegnare tavoli fisicamente impossibili.
- Non ignorare warning email; chiama l'ospite.
