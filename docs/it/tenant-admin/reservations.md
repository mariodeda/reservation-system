# Prenotazioni

La pagina Prenotazioni e lo spazio principale durante il servizio. Lo staff la
usa per controllare orari disponibili, creare prenotazioni, gestire lista
d'attesa, assegnare tavoli, aggiornare stati, inviare richieste recensione e
capire la giornata sia per orario sia per sala.

Usa questa pagina quando serve piu controllo rispetto alla dashboard.

## A cosa serve

La pagina risponde a queste domande:

- Quale data e zona sto gestendo?
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
| Selettore zona | Sceglie l'area prenotabile quando il ristorante ne ha piu di una. |
| Card servizio | Riassumono gli orari e mostrano quanto e pieno il servizio. |
| Slot card | Mostrano disponibilita per ogni orario prenotabile. |
| Lista prenotazioni | Mostra prenotazioni per data e zona selezionate. |
| Modal nuova prenotazione | Aggiunge prenotazioni staff, telefono o walk-in. |
| Modal sala/giorno | Mostra tutta la giornata visualmente sui tavoli. |
| Modal waitlist | Gestisce gruppi in attesa. |

Quasi tutto dipende da data e zona selezionate. Se qualcosa sembra sbagliato,
controlla prima quei due controlli.

## Selettore data

Usa il selettore data per cambiare giorno. Lo staff lo usa per:

- Preparare domani.
- Controllare un gruppo futuro.
- Rivedere una prenotazione passata.
- Aggiungere una prenotazione futura.

Se la disponibilita non carica per una data, aggiorna una volta, poi controlla
date speciali, giorni chiusi o modifiche recenti.

## Selettore zona

Alcuni ristoranti hanno piu zone prenotabili:

- Sala principale.
- Patio.
- Bar.
- Sala privata.

Se appare il selettore, scegli l'area corretta prima di leggere disponibilita o
assegnare tavoli. I tavoli possono appartenere a zone specifiche.

## Card servizio

Le card servizio riassumono ogni servizio nella data selezionata. Un servizio e
un blocco orario come pranzo o cena.

La card aiuta a capire:

- Nome servizio.
- Orari servizio.
- Intervallo slot.
- Coperti riservati rispetto ai posti dei tavoli attivi.
- Quanto e pieno il servizio.
- Se il servizio e chiuso, fermato o ancora prenotabile.

Gli indicatori mostrano quanto e pieno il servizio. Non garantiscono che ogni
gruppo possa entrare. Uno slot puo essere non disponibile per numero ospiti,
tempo minimo, blocco o conflitto tavolo.

## Slot card

Le slot card rappresentano orari prenotabili. Dovrebbero mostrare:

- Orario.
- Coperti prenotati.
- Posti totali disponibili nello slot.
- Stato disponibilita.
- Motivo specifico se non prenotabile.

Cliccare uno slot prenotabile dovrebbe aprire la modal nuova prenotazione con
data, servizio, zona e orario precompilati.

## Motivi di indisponibilita

| Motivo | Significato | Risposta staff |
| --- | --- | --- |
| Servizio fermato oggi | Lo staff ha fermato manualmente prenotazioni online. | Prenotazioni esistenti restano valide. Riaprire solo se sicuro. |
| Orario bloccato | Un manager ha bloccato l'orario. | Controlla blocchi o note manager. |
| Cutoff passato | Il tempo minimo non consente piu prenotazioni online. | Lo staff puo decidere se una prenotazione manuale e possibile. |
| Coperti insufficienti | Lo slot non contiene il gruppo richiesto. | Prova altro orario, gruppo minore o approvazione manager. |
| Pieno | Non restano abbastanza posti utili. | Usa lista d'attesa o altro orario. |
| Servizio terminato | Ultimo slot piu durata e passato. | Non accettare nuove prenotazioni salvo approvazione manuale. |
| Ristorante chiuso | Data chiusa o fuori orario. | Controlla chiusure e date speciali. |

## Coperti spiegati

Gli slot mostrano ospiti prenotati rispetto ai posti disponibili dei tavoli:

```text
24 / 80 coperti
```

Significa che 24 posti ospite sono gia riservati su 80 posti tavolo attivi.
Non significa che il ristorante accetti un gruppo singolo da 80.

Il massimo numero ospiti e una regola separata. Non confondere posti totali con
massimo gruppo accettato in una singola prenotazione.

## Perche i coperti appaiono in piu slot

Le prenotazioni tengono occupato il tavolo per la durata del servizio. Se cena
dura 90 minuti, una prenotazione alle 19:00 puo influenzare 19:00, 19:30 e
20:00 in base all'intervallo.

E previsto: evita di promettere lo stesso tavolo a due ospiti in orari
sovrapposti.

## Modal nuova prenotazione

Usa la modal per:

- Prenotazioni telefoniche.
- Walk-in.
- Prenotazioni inserite dallo staff.
- Eccezioni approvate dal manager.
- Prenotazioni create da slot selezionato.

Informazioni normalmente richieste:

- Data.
- Zona.
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

## Prenotazione staff e prenotazione online

Le prenotazioni staff possono permettere eccezioni approvate dal manager che gli
ospiti non possono fare online. Questo e utile, ma lo staff deve comunque
rispettare:

- Posti fisici dei tavoli.
- Conflitti tavoli.
- Orari servizio.
- Qualita contatti ospite.
- Blocchi seated/completed.
- Regole manager.

Non usare prenotazioni staff per aggirare regolarmente regole che proteggono da
overbooking.

## Lista prenotazioni

La lista mostra prenotazioni per data e zona selezionate. Controlla:

- Orario arrivo.
- Nome ospite.
- Numero ospiti.
- Stato.
- Fonte, online o staff.
- Assegnazione tavolo.
- Note o allergie.
- Warning email.
- Azioni disponibili.

Durante servizio mantieni stati aggiornati, cosi il prossimo collega puo fidarsi
della lista.

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

Usa lista d'attesa quando c'e domanda ma una prenotazione confermata non puo
essere accettata.

Buone voci includono:

- Nome ospite.
- Numero ospiti.
- Telefono.
- Orario desiderato o range.
- Note su flessibilita.
- Urgenze o necessita speciali.

Quando si liberano posti, lo staff puo contattare l'ospite e creare o
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
2. Conferma dettagli prenotazione.
3. Chiedi email corretta.
4. Aggiorna contatti dove possibile.
5. Aggiungi nota se serve follow-up.

Non affidarti all'email finche non e corretta.

## Domande comuni

### Perche staff puo aggiungere una prenotazione che il pubblico rifiuterebbe?

Lo staff puo gestire eccezioni reali. Conflitti tavoli e stati bloccati
proteggono comunque il ristorante da errori.

### Perche assegnazione tavolo sparisce dopo modifica?

Cambiando data, orario, servizio, zona, numero ospiti o durata, il tavolo
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
2. Controlla assegnazione zona dei tavoli.
3. Controlla tavoli duplicati.
4. Controlla sovrapposizione durata servizio.
5. Controlla stati prenotazioni attive/cancellate.

### Booking non aggiungibile

1. Leggi motivo indisponibilita.
2. Controlla numero ospiti.
3. Controlla tempo minimo e finestra futura.
4. Controlla chiusure e blocchi.
5. Controlla tavoli.
6. Controlla se servizio fermato oggi.

### Notifica appare ma prenotazione non visibile

1. Conferma data e zona.
2. Aggiorna lista prenotazioni.
3. Controlla se appartiene a un'altra zona.
4. Chiedi supporto se continua a puntare a nulla.
