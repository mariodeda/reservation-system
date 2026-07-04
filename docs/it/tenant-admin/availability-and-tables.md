# Disponibilita e tavoli

Orari e tavoli decidono cosa gli ospiti possono prenotare e cosa lo staff puo
gestire in sicurezza. E l'area piu importante per evitare overbooking,
assegnazioni tavolo sbagliate e slot confusi.

## Cosa controllano gli orari

Gli orari controllano:

- Orari servizio settimanali.
- Nomi servizio.
- Intervalli slot.
- Durata tavolo specifica servizio.
- Durata tavolo default.
- Numero minimo ospiti.
- Numero massimo ospiti.
- Finestra futura di prenotazione.
- Tempo minimo prima della prenotazione.
- Giorni chiusi.
- Date speciali.
- Slot bloccati.
- Servizi fermati solo per oggi.

I tavoli controllano:

- Posti fisici.
- Zona prenotabile del tavolo.
- Stato attivo.
- Possibilita di unire tavoli.

Il calendario pubblico dipende da entrambi. Pensa agli orari come "quando si
puo prenotare" e ai tavoli come "dove si puo sedere".

## Panoramica pagina disponibilita

Usa Disponibilita quando:

- Cambiano orari ristorante.
- Cambiano pranzo o cena.
- Si aggiunge o rimuove un servizio.
- Una festivita o evento privato cambia una data.
- Un orario deve essere bloccato.
- Tempo minimo o finestra futura cambiano.
- Cambia massimo gruppo online.
- Durata tavolo diversa per servizio.

Evita cambi durante un servizio intenso salvo necessita. Possono influenzare
subito cosa gli ospiti possono prenotare online.

## Servizi settimanali

I servizi settimanali definiscono finestre normali ripetute.

Ogni riga include:

| Campo | Significato |
| --- | --- |
| Nome servizio | Etichetta staff e ospite, come Pranzo o Cena. |
| Da | Primo orario del servizio. |
| A | Fine finestra servizio. |
| Ogni (min) | Intervallo slot, per esempio ogni 15 o 30 minuti. |
| Durata | Quanto le prenotazioni tengono occupati i tavoli. |
| Azioni | Modifica, duplica o rimuovi riga secondo i controlli mostrati. |

Gli orari usano formato 24 ore. Usa nomi chiari.

## Nome servizio

Usa nomi come:

- Pranzo.
- Cena.
- Brunch.
- Pranzo Patio.
- Bar.
- Sala Privata.

Evita `Servizio 1`. Lo staff vede il nome durante gestione prenotazioni.

## Da e A

`Da` e il primo orario servizio. `A` e la fine finestra.

Esempio:

```text
Da: 12:00
A: 15:00
Ogni: 30
```

Crea slot in base a intervallo e regole servizio.

## Ogni (min)

Controlla quanto spesso appaiono slot.

Intervalli brevi danno flessibilita ma aumentano complessita. Intervalli lunghi
sono semplici ma riducono opzioni.

Scelte comuni:

- 15 minuti: flessibile, piu complesso.
- 30 minuti: equilibrio comune.
- 60 minuti: semplice, meno flessibile.

## Durata

Durata e quanto una prenotazione tiene occupato il tavolo.

Esempio:

- Pranzo: 75 minuti.
- Cena: 120 minuti.
- Degustazione: 180 minuti.

Influenza:

- Conflitti tavoli.
- Coperti mostrati nelle slot card.
- Quanto sembra pieno il servizio.
- Layout sala/giorno.
- Sicurezza slot successivi.

Durata troppo corta puo causare overbooking. Durata troppo lunga blocca troppi
orari utili.

## Durata default e durata servizio

| Tipo durata | Quando usata |
| --- | --- |
| Durata tavolo default | Valore di riserva quando un servizio non ha durata specifica. |
| Durata servizio | Valore preferito per quel servizio e giorno. |

Usa durata servizio quando pranzo, cena o brunch hanno tempi diversi. Mantieni
default come valore di riserva sicuro.

## Minimo e massimo ospiti

Minimo controlla la prenotazione piu piccola. Massimo controlla il gruppo singolo piu
grande.

Massimo ospiti non e la stessa cosa dei posti totali. Il ristorante puo avere 80 posti ma
permettere online solo gruppi da 12 o 20.

Per gruppi oltre massimo online, staff decide se gestire manualmente secondo
regole del ristorante e possibilita reale dei tavoli.

## Finestra futura

Controlla quanto avanti nel futuro gli ospiti possono prenotare.

Esempi:

- 14 giorni: breve termine.
- 30 giorni: finestra comune.
- 90 giorni: utile per ristoranti destination o eventi.

Se gli ospiti non possono prenotare una data futura, controlla la finestra futura
prima di pensare a chiusura.

## Tempo minimo prima della prenotazione

Il tempo minimo impedisce prenotazioni troppo vicine all'orario.

Esempio: tempo minimo 120 minuti significa che un ospite non puo prenotare 19:00
dopo le 17:00.

Protegge lo staff da prenotazioni online all'ultimo minuto. Lo staff puo
comunque creare una prenotazione manuale se e sicuro per il servizio.

## Giorni chiusi

Bloccano intere date. Usa per:

- Festivita.
- Ferie staff.
- Ristrutturazione.
- Buyout privati.
- Chiusure impreviste.

Sono piu chiari che bloccare ogni slot.

## Date speciali

Sovrascrivono gli orari normali per una data.

Usa per:

- Capodanno.
- San Valentino.
- Brunch unico.
- Evento privato con orari diversi.
- Servizio festivo diverso dal normale.

Testa sempre dopo salvataggio. Sono fonte comune di confusione perche
sovrascrivono lo schedule normale.

## Slot bloccati

Chiudono orari specifici dentro un servizio aperto.

Usa per:

- Pausa cucina.
- Evento privato a un orario.
- Hold gruppo grande.
- Manutenzione.
- Carenza staff temporanea.

Se tutta la data e chiusa, usa giorno chiuso. Se tutto il servizio e chiuso solo
oggi, usa stop rapido o data speciale in base al caso.

## Servizi fermati oggi

L'azione rapida in header ferma le prenotazioni online per un servizio di oggi.
E temporanea e visibile allo staff.

Usa quando:

- Servizio pieno inaspettatamente.
- Ristorante sotto organico.
- Meteo riduce i posti utilizzabili.
- Cucina chiede di fermare nuove prenotazioni online.

Non elimina prenotazioni esistenti.

## Tavoli e capacita

Quando esistono tavoli attivi per una zona prenotabile, i posti tavolo decidono
quanti ospiti possono entrare in ogni slot.

Quindi:

- Tavoli attivi contano.
- Tavoli inattivi non contano.
- Tavoli assegnati a una zona contano solo per quella zona.
- Tavoli uniti possono aiutare gruppi grandi.

I posti devono riflettere la sala reale, non quante prenotazioni si vorrebbero
vendere.

## Capacita vecchia di riserva

Se non esistono tavoli attivi per una zona, il sistema puo usare un vecchio
numero di capacita del servizio. Serve a mantenere funzionanti configurazioni
vecchie, ma i tavoli reali sono piu accurati.

Se i coperti sembrano troppo alti o bassi, controlla se usa tavoli reali o il
vecchio numero di riserva.

## Processo sicuro di modifica

Quando cambi disponibilita:

1. Fai il minimo cambio necessario.
2. Salva.
3. Controlla la data interessata in Prenotazioni.
4. Controlla la pagina pubblica di prenotazione se possibile.
5. Conferma che lo staff capisca il cambio.

Per grandi cambi di orario, evita momenti con molte prenotazioni in corso.

## Checklist setup

Prima del live:

1. Crea tavoli con etichette e capacita accurate.
2. Disabilita tavoli non disponibili.
3. Associa tavoli alle zone dove serve.
4. Configura servizi settimanali.
5. Imposta durate specifiche.
6. Imposta durata default.
7. Imposta minimo e massimo ospiti.
8. Imposta tempo minimo.
9. Imposta finestra futura.
10. Aggiungi giorni chiusi noti.
11. Aggiungi date speciali note.
12. Aggiungi slot bloccati.
13. Testa una prenotazione pubblica per un giorno normale.
14. Testa una prenotazione pubblica per una data speciale.
15. Crea una prenotazione staff di prova e assegna tavolo.

## Domande comuni

### Perche capacita e stata rimossa dalle righe servizio?

Quando i tavoli sono configurati, i posti devono venire dai tavoli attivi.
Questo e piu accurato di un numero scritto in ogni riga servizio.

### Cambio durata tavolo o intervallo slot?

Cambia durata quando gli ospiti occupano tavoli per tempo diverso. Cambia
intervallo quando vuoi orari di prenotazione piu o meno frequenti.

### Perche cambiare durata cambia i coperti?

Durata piu lunga tiene occupati tavoli in piu slot futuri. Durata piu corta
libera tavoli prima.

### Perche non posso fermare un servizio oggi?

L'ultimo orario prenotabile puo essere gia passato. Non resta
niente da fermare online.

### Cosa fare per evento privato?

Se tutta la data e privata, usa giorno chiuso o data speciale. Se solo alcuni
orari, usa slot bloccati. Se e decisione same-day temporanea, usa stop oggi.
