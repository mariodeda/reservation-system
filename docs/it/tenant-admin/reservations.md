# Prenotazioni

La pagina Prenotazioni e lo spazio principale per il servizio live. Lo staff la
usa per controllare disponibilita, creare booking, gestire waitlist, assegnare
tavoli, aggiornare stati, inviare richieste recensione e capire la giornata sia
da vista slot sia da vista sala.

Usa questa pagina quando serve piu controllo rispetto alla dashboard.

## A cosa serve

La pagina risponde a queste domande:

- Quale data e offering sto gestendo?
- Quali servizi sono aperti?
- Quali slot sono prenotabili?
- Quanti coperti sono gia riservati?
- Perche uno slot non e disponibile?
- Quali ospiti sono attesi?
- Quali ospiti sono seduti o completati?
- Quali tavoli sono assegnati?
- C'e una lista d'attesa?
- Possiamo accettare un'altra prenotazione?

## Aree pagina

| Area | Scopo |
| --- | --- |
| Selettore data | Sceglie la data servizio. |
| Selettore offering | Sceglie area o canale prenotabile quando il ristorante ne ha piu di uno. |
| Card servizio | Riassumono stato slot e pressione capacita per servizio. |
| Slot card | Mostrano disponibilita per ogni orario prenotabile. |
| Lista prenotazioni | Mostra booking per data e offering selezionati. |
| Modal nuova prenotazione | Aggiunge booking staff, telefono o walk-in. |
| Modal sala/giorno | Mostra tutta la giornata visualmente sui tavoli. |
| Modal waitlist | Gestisce gruppi in attesa. |

Quasi tutto dipende da data e offering selezionati. Se qualcosa sembra sbagliato,
controlla prima quei due controlli.

## Selettore data

Usa il selettore data per cambiare giorno. Lo staff lo usa per:

- Preparare domani.
- Controllare un gruppo futuro.
- Rivedere una prenotazione passata.
- Aggiungere booking futuro.

Se la disponibilita non carica per una data, aggiorna una volta, poi controlla
date speciali, giorni chiusi o modifiche recenti.

## Selettore offering

Alcuni ristoranti hanno piu offering:

- Sala principale.
- Patio.
- Bar.
- Sala privata.

Se appare il selettore, scegli l'area corretta prima di leggere capacita o
assegnare tavoli. I tavoli possono essere legati a offering specifici.

## Card servizio

Le card servizio riassumono ogni servizio nella data selezionata. Un servizio e
un blocco orario come pranzo o cena.

La card aiuta a capire:

- Nome servizio.
- Orari servizio.
- Intervallo slot.
- Coperti riservati rispetto alla capacita tavoli attivi.
- Pressione capacita.
- Se il servizio e chiuso, fermato o ancora prenotabile.

Gli indicatori capacita sono pressione operativa, non garanzia che ogni gruppo
possa essere accettato. Uno slot puo essere non disponibile per dimensione
gruppo, cutoff, blocco o conflitto tavolo.

## Slot card

Le slot card rappresentano orari prenotabili. Dovrebbero mostrare:

- Orario.
- Coperti prenotati.
- Capacita totale slot.
- Stato disponibilita.
- Motivo specifico se non prenotabile.

Cliccare uno slot prenotabile dovrebbe aprire la modal nuova prenotazione con
data, servizio, offering e orario precompilati.

## Motivi di indisponibilita

| Motivo | Significato | Risposta staff |
| --- | --- | --- |
| Servizio fermato oggi | Lo staff ha fermato manualmente booking online. | Prenotazioni esistenti restano valide. Riaprire solo se sicuro. |
| Orario bloccato | Un manager ha bloccato l'orario. | Controlla blocchi o note manager. |
| Cutoff passato | Lead time non consente piu booking online. | Staff puo decidere se booking manuale e possibile. |
| Coperti insufficienti | Lo slot non contiene il gruppo richiesto. | Prova altro orario, gruppo minore o override manager. |
| Pieno | Non resta capacita significativa. | Usa waitlist o altro orario. |
| Servizio terminato | Ultimo slot piu durata e passato. | Non accettare nuovi booking salvo approvazione manuale. |
| Ristorante chiuso | Data chiusa o fuori schedule. | Controlla chiusure e date speciali. |

## Coperti spiegati

Gli slot mostrano coperti riservati su capacita tavoli per quello slot:

```text
24 / 80 coperti
```

Significa che 24 posti ospite sono gia riservati contro 80 posti tavolo attivi.
Non significa che il ristorante accetti un gruppo singolo da 80.

Il massimo numero ospiti e policy separata. Non confondere capacita totale con
massimo gruppo accettato.

## Perche i coperti appaiono in piu slot

Le prenotazioni occupano capacita per la durata effettiva tavolo. Se cena dura
90 minuti, un booking 19:00 puo influenzare 19:00, 19:30 e 20:00 in base
all'intervallo.

E previsto e previene overbooking tra turni.

## Modal nuova prenotazione

Usa la modal per:

- Prenotazioni telefoniche.
- Walk-in.
- Booking inseriti da staff.
- Eccezioni operative.
- Booking creati da slot selezionato.

Informazioni normalmente richieste:

- Data.
- Offering.
- Servizio.
- Orario.
- Numero ospiti.
- Nome ospite.
- Telefono o email.

Informazioni opzionali utili:

- Allergie.
- Preferenza seduta.
- Seggiolone o accessibilita.
- Occasione speciale.
- Note interne.

Ogni input deve avere label visibile. Se lo staff non capisce un campo, e un
problema di usabilita da segnalare.

## Booking staff contro booking pubblico

I booking staff possono permettere eccezioni operative che gli ospiti pubblici
non possono fare online. Questo e utile, ma lo staff deve comunque rispettare:

- Capacita fisica tavoli.
- Conflitti tavoli.
- Orari servizio.
- Qualita contatti ospite.
- Lock seated/completed.
- Policy manager.

Non usare booking staff per aggirare regolarmente regole che proteggono da
overbooking.

## Lista prenotazioni

La lista mostra booking per data e offering selezionati. Controlla:

- Orario arrivo.
- Nome ospite.
- Numero ospiti.
- Stato.
- Fonte, online o staff.
- Assegnazione tavolo.
- Note o allergie.
- Warning email.
- Azioni disponibili.

Durante servizio mantieni stati aggiornati.

## Modal sala/giorno

Apri la modal sala/giorno quando la lista non basta. Serve per domande visuali:

- Quali tavoli sono occupati ora?
- Quali tavoli girano presto?
- Dove sono le sovrapposizioni?
- Un gruppo grande entra piu tardi?
- C'e gap tra pranzo e cena?

La modal mostra l'intera giornata. La linea tempo corrente e in basso per non
coprire etichette orario. I periodi chiusi devono restare chiari.

## Modal waitlist

Usa waitlist quando c'e domanda ma un booking confermato non puo essere accettato.

Buone voci includono:

- Nome ospite.
- Numero ospiti.
- Telefono.
- Orario desiderato o range.
- Note su flessibilita.
- Urgenze o necessita speciali.

Quando si libera capacita, lo staff puo contattare l'ospite e creare o
aggiornare prenotazione.

## Azioni prenotazione

Azioni comuni:

- Assegna tavolo.
- Modifica prenotazione.
- Elimina prenotazione.
- Invia email recensione.
- Aggiorna stato.

Le azioni devono essere chiare. Se disabilitate, controlla stato e idoneita.

## Lock seated e completed

Quando una prenotazione e seated o completed:

- Modifica disabilitata.
- Eliminazione disabilitata.
- Dettagli core non devono cambiare.

Questo protegge lo storico servizio.

## Display prenotazioni completed

Le completed si comprimono:

```text
12:00
Nome ospite - 2 ospiti
Completed
```

Espandi solo se servono dettagli.

## Warning email sulle card

Se la card avvisa che email ospite non e raggiungibile:

1. Chiama l'ospite.
2. Conferma dettagli booking.
3. Chiedi email corretta.
4. Aggiorna contatti dove possibile.
5. Aggiungi nota se serve follow-up.

Non affidarti all'email finche non e corretta.

## Domande comuni

### Perche staff puo aggiungere un booking che il pubblico rifiuterebbe?

I workflow staff supportano eccezioni reali. Conflitti tavoli e lock stato
proteggono comunque il ristorante.

### Perche assegnazione tavolo sparisce dopo modifica?

Cambiando data, orario, servizio, offering, numero ospiti o durata, il tavolo
vecchio puo non essere sicuro. Il sistema puo pulirlo.

### Perche uno slot grigio e ancora visibile?

Fa parte della struttura del giorno ma non e prenotabile. La ragione dovrebbe
essere mostrata.

### Perche non ci sono azioni su una prenotazione?

Potrebbe essere completed, seated, cancelled o in stato che blocca azioni.

## Troubleshooting

### Disponibilita non carica

1. Conferma data selezionata.
2. Aggiorna pagina.
3. Conferma sessione staff valida.
4. Prova un'altra data.
5. Controlla modifiche recenti disponibilita.
6. Chiedi supporto piattaforma se persiste.

### Coperti troppo alti

1. Controlla capacita tavoli attivi.
2. Controlla binding offering.
3. Controlla tavoli duplicati.
4. Controlla sovrapposizione durata servizio.
5. Controlla stati prenotazioni attive/cancellate.

### Booking non aggiungibile

1. Leggi motivo indisponibilita.
2. Controlla numero ospiti.
3. Controlla lead time e finestra booking.
4. Controlla chiusure e blocchi.
5. Controlla tavoli.
6. Controlla se servizio fermato oggi.

### Notifica appare ma prenotazione non visibile

1. Conferma data e offering.
2. Aggiorna lista prenotazioni.
3. Controlla se appartiene ad altro offering.
4. Chiedi supporto se continua a puntare a nulla.
