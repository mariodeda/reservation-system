# Tavoli e operazioni sala

I tavoli collegano prenotazioni online e gestione reale della sala. Decidono
quanti ospiti possono essere accettati, quali prenotazioni possono essere
sedute e se un servizio e realistico per la sala.

## Scopo pagina Tavoli

Usa Tavoli per mantenere il layout reale:

- Etichetta tavolo.
- Posti.
- Stato attivo o inattivo.
- Zona prenotabile del tavolo.
- Comportamento unibile.

La configurazione tavoli deve rispecchiare cio che lo staff puo usare davvero. Se un
tavolo e rotto, non disponibile, rimosso per evento o non usato online,
disabilitalo o assegnalo alla zona corretta invece di lasciare posti
fuorvianti.

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
aumentarla solo per far sembrare piu libero il calendario. Capacita gonfiata
porta a overbooking e suggerimenti tavolo sbagliati.

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

## Zona prenotabile

La zona prenotabile limita un tavolo alla parte corretta del ristorante.

Esempi:

- Tavoli patio assegnati al patio.
- Posti bar assegnati al bar.
- Tavoli sala privata assegnati alla sala privata.
- Tavoli sala principale lasciati condivisi se servono la sala principale.

Se un tavolo appare nell'area sbagliata, controlla prima la sua zona
prenotabile.

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
- Manager vuole fermare o riaprire prenotazioni online dello stesso giorno.

## Dropdown assegnazione tavolo

Il dropdown dovrebbe mostrare informazioni sufficienti:

- Etichetta tavolo.
- Capacita.
- Indicazioni su disponibilita o conflitto.
- Informazioni tavoli uniti dove rilevanti.

Le righe devono essere centrate e leggibili in tema chiaro e scuro. I
suggerimenti al passaggio del mouse devono spiegare dettagli compatti.

## Problemi comuni tavoli

### Capacita slot troppo alta

Controlla:

- Tavoli duplicati.
- Tavoli con capacita troppo alta.
- Tavoli inattivi ancora attivi.
- Tavoli assegnati alla zona sbagliata.
- Vecchia capacita di riserva usata perche non ci sono tavoli attivi per una
  zona.

### Staff non riesce ad assegnare un tavolo

Controlla:

- Numero ospiti supera capacita tavolo.
- Tavolo inattivo.
- Tavolo appartiene a un'altra zona.
- Un'altra prenotazione usa il tavolo nello stesso orario.
- Setup tavoli uniti mancante o irrealistico.

### Prenotazione pubblica accetta troppi ospiti

Controlla:

- Capacita tavoli attivi.
- Massimo numero ospiti.
- Durata servizio.
- Intervallo slot.
- Prenotazioni esistenti e sovrapposizioni.

### Prenotazione pubblica rifiuta nonostante tavoli vuoti

Controlla:

- Tempo minimo prima della prenotazione.
- Finestra futura di prenotazione.
- Giorno chiuso o data speciale.
- Slot bloccato.
- Servizio fermato oggi.
- Massimo numero ospiti.
- Nessuna combinazione tavoli valida.
