# Tavoli e operazioni sala

I tavoli collegano disponibilita online e gestione reale della sala. Decidono
quanti coperti possono essere accettati, quali booking possono essere assegnati
e se un servizio e fisicamente realistico.

## Scopo pagina Tavoli

Usa Tavoli per mantenere il layout reale:

- Etichetta tavolo.
- Capacita posti.
- Stato attivo o inattivo.
- Binding offering.
- Comportamento unibile.

Il setup tavoli deve rispecchiare cio che lo staff puo usare davvero. Se un
tavolo e rotto, non disponibile, rimosso per evento o non usato online,
disabilitalo o cambia binding offering invece di lasciare capacita fuorviante.

## Etichette tavoli

Usa etichette che lo staff capisce:

- `1`
- `2`
- `Patio 4`
- `Bar 3`
- `Sala privata`

Evita etichette comprensibili solo a un manager. Nuovo staff deve sapere dove
portare l'ospite.

## Capacita

Capacita e il numero di ospiti che il tavolo puo sedere ragionevolmente. Non
gonfiare capacita per far sembrare migliore il calendario booking. Capacita
gonfiata porta a overbooking e suggerimenti tavolo sbagliati.

Se un tavolo a volte siede 2 e a volte 4, scegli la capacita operativa normale e
usa tavoli uniti o giudizio staff per eccezioni.

## Stato attivo

Tavoli inattivi non contribuiscono alla disponibilita. Usa inattivo per:

- Tavoli rimossi dalla sala.
- Tavoli in manutenzione.
- Tavoli stagionali fuori stagione.
- Tavoli patio con brutto tempo se non prenotabili.
- Tavoli tenuti per walk-in o VIP.

Se il cambio e solo per oggi, valuta se usare slot bloccato, servizio fermato o
nota manager invece di cambiare setup tavoli.

## Binding offering

Il binding limita un tavolo a una area o canale specifico.

Esempi:

- Tavoli patio legati a offering patio.
- Posti bar legati a offering bar.
- Tavoli sala privata legati a offering sala privata.
- Tavoli sala principale lasciati condivisi se servono l'offering default.

Se un tavolo appare nell'area sbagliata, controlla prima il binding offering.

## Tavoli unibili

I tavoli unibili permettono suggerimenti per gruppi grandi.

Marcarli unibili solo se:

- Sono fisicamente vicini.
- Lo staff puo unirli senza bloccare passaggi.
- Il tavolo combinato e accettabile per ospiti.
- Il ristorante vuole davvero usare quella combinazione.

Setup unibile sbagliato crea assegnazioni irrealistiche. Rivedilo dopo cambi di
layout.

## Modal calendario sala/giorno

Il calendario sala/giorno mostra l'intera giornata in modo visuale. Aiuta a
vedere:

- Quali tavoli sono occupati.
- Quando i tavoli girano.
- Dove ci sono sovrapposizioni.
- Quali servizi sono aperti o chiusi.
- Se un gruppo grande puo entrare piu tardi.

La linea tempo corrente e mostrata in basso per non coprire contenuti. I gap
chiusi tra servizi devono restare chiari.

## Orari continui e spezzati

I ristoranti possono avere orari continui o servizi separati.

Continuo:

```text
12:00 to 22:00
```

Spezzato:

```text
Pranzo: 12:00 to 15:00
Cena: 18:00 to 23:00
```

La vista sala/giorno deve mostrare tutta la giornata in entrambi i casi. Lo
staff deve capire che 16:00 e chiuso nell'esempio spezzato.

## Uso vista sala durante servizio

Usa la modal sala/giorno quando:

- Un ospite chiede altro orario.
- Serve piazzare un gruppo grande.
- C'e conflitto tavolo.
- Un tavolo e in ritardo.
- Host deve capire il prossimo turno.
- Manager vuole fermare o riaprire booking same-day.

## Dropdown assegnazione tavolo

Il dropdown dovrebbe mostrare informazioni sufficienti:

- Etichetta tavolo.
- Capacita.
- Hint disponibilita o conflitto.
- Informazioni tavoli uniti dove rilevanti.

Le righe devono essere centrate e leggibili in tema chiaro e scuro. I tooltip
hover devono spiegare dettagli compatti.

## Problemi comuni tavoli

### Capacita slot troppo alta

Controlla:

- Tavoli duplicati.
- Tavoli con capacita troppo alta.
- Tavoli inattivi ancora attivi.
- Tavoli legati all'offering sbagliato.
- Capacita legacy usata perche non ci sono tavoli attivi per offering.

### Staff non riesce ad assegnare un tavolo

Controlla:

- Numero ospiti supera capacita tavolo.
- Tavolo inattivo.
- Tavolo appartiene a altro offering.
- Altra prenotazione sovrapposta nella finestra durata.
- Setup tavoli uniti mancante o irrealistico.

### Booking pubblico accetta troppi ospiti

Controlla:

- Capacita tavoli attivi.
- Massimo numero ospiti.
- Durata servizio.
- Intervallo slot.
- Prenotazioni esistenti e sovrapposizioni.

### Booking pubblico rifiuta nonostante tavoli vuoti

Controlla:

- Lead time.
- Finestra booking.
- Giorno chiuso o data speciale.
- Slot bloccato.
- Servizio fermato oggi.
- Massimo numero ospiti.
- Nessuna combinazione tavoli valida.
