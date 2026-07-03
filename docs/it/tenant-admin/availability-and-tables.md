# Disponibilita e tavoli

Disponibilita e tavoli decidono cosa gli ospiti possono prenotare e cosa lo
staff puo gestire in sicurezza. E l'area piu importante per evitare overbooking,
assegnazioni tavolo sbagliate e slot confusi.

## Cosa controlla la disponibilita

La disponibilita controlla:

- Orari servizio settimanali.
- Nomi servizio.
- Intervalli slot.
- Durata tavolo specifica servizio.
- Durata tavolo default.
- Numero minimo ospiti.
- Numero massimo ospiti.
- Finestra booking.
- Lead time.
- Giorni chiusi.
- Date speciali.
- Slot bloccati.
- Servizi fermati solo per oggi.

I tavoli controllano:

- Capacita fisica.
- Offering del tavolo.
- Stato attivo.
- Possibilita di unire tavoli.

Il calendario pubblico dipende da entrambi. Pensa alla disponibilita come
"quando si puo prenotare" e ai tavoli come "dove si puo sedere".

## Panoramica pagina disponibilita

Usa Disponibilita quando:

- Cambiano orari ristorante.
- Cambiano pranzo o cena.
- Si aggiunge o rimuove un servizio.
- Una festivita o evento privato cambia una data.
- Un orario deve essere bloccato.
- Lead time o finestra booking cambiano.
- Cambia massimo gruppo online.
- Durata tavolo differisce per servizio.

Evita cambi live durante servizio intenso salvo necessita. Possono influenzare
subito il booking pubblico.

## Servizi settimanali

I servizi settimanali definiscono finestre normali ripetute.

Ogni riga include:

| Campo | Significato |
| --- | --- |
| Nome servizio | Etichetta staff e ospite, come Pranzo o Cena. |
| Da | Primo orario del servizio. |
| A | Fine finestra servizio. |
| Ogni (min) | Intervallo slot, per esempio ogni 15 o 30 minuti. |
| Durata | Quanto le prenotazioni occupano tavoli. |
| Azioni | Modifica, duplica o rimuovi riga secondo controlli UI. |

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

Durata e quanto una prenotazione occupa capacita tavolo.

Esempio:

- Pranzo: 75 minuti.
- Cena: 120 minuti.
- Degustazione: 180 minuti.

Influenza:

- Conflitti tavoli.
- Calcoli coperti slot.
- Pressione disponibilita.
- Layout sala/giorno.
- Sicurezza slot successivi.

Durata troppo corta puo permettere overbooking. Durata troppo lunga blocca
troppa disponibilita.

## Durata default e durata servizio

| Tipo durata | Quando usata |
| --- | --- |
| Durata tavolo default | Fallback quando servizio non ha durata specifica. |
| Durata servizio | Valore preferito per quel servizio e giorno. |

Usa durata servizio quando pranzo, cena o brunch hanno tempi diversi. Mantieni
default come fallback sicuro.

## Minimo e massimo ospiti

Minimo controlla il booking piu piccolo. Massimo controlla il gruppo singolo piu
grande.

Massimo ospiti non e capacita slot. Il ristorante puo avere 80 posti ma
permettere online solo gruppi da 12 o 20.

Per gruppi oltre massimo online, staff decide se gestire manualmente secondo
policy e fattibilita tavoli.

## Finestra booking

Controlla quanto avanti nel futuro gli ospiti possono prenotare.

Esempi:

- 14 giorni: breve termine.
- 30 giorni: finestra comune.
- 90 giorni: utile per ristoranti destination o eventi.

Se gli ospiti non possono prenotare una data futura, controlla finestra booking
prima di pensare a chiusura.

## Lead time

Lead time impedisce booking troppo vicini all'orario.

Esempio: lead time 120 minuti significa che un ospite non puo prenotare 19:00
dopo le 17:00.

Protegge lo staff da booking last-minute. Lo staff puo comunque creare booking
manuale se sicuro.

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

L'azione rapida header ferma booking online per un servizio oggi. E operativa,
temporanea e visibile allo staff.

Usa quando:

- Servizio pieno inaspettatamente.
- Ristorante sotto organico.
- Meteo impatta seating.
- Cucina chiede di fermare nuovi booking online.

Non elimina prenotazioni esistenti.

## Tavoli e capacita

Quando esistono tavoli attivi per un offering, i posti tavolo guidano la
capacita slot.

Quindi:

- Tavoli attivi contano.
- Tavoli inattivi non contano.
- Tavoli bound contano solo per offering corrispondente.
- Tavoli uniti possono aiutare gruppi grandi.

La capacita deve riflettere seating reale, non obiettivo vendite.

## Capacita legacy

Se non esistono tavoli attivi per un offering, il sistema puo usare capacita
legacy del servizio. E compatibilita. Per operazioni accurate, configura tavoli
reali.

Se i coperti sembrano troppo alti o bassi, controlla se usa tavoli o legacy.

## Processo sicuro di modifica

Quando cambi disponibilita:

1. Fai il minimo cambio necessario.
2. Salva.
3. Controlla la data interessata in Prenotazioni.
4. Controlla una risposta pubblica o pagina booking se possibile.
5. Conferma che lo staff capisca il cambio.

Per grandi cambi schedule, evita picchi di booking attivo.

## Checklist setup

Prima del live:

1. Crea tavoli con etichette e capacita accurate.
2. Disabilita tavoli non disponibili.
3. Associa tavoli a offering dove serve.
4. Configura servizi settimanali.
5. Imposta durate specifiche.
6. Imposta durata default.
7. Imposta minimo e massimo ospiti.
8. Imposta lead time.
9. Imposta finestra booking.
10. Aggiungi giorni chiusi noti.
11. Aggiungi date speciali note.
12. Aggiungi slot bloccati.
13. Testa booking pubblico per giorno normale.
14. Testa booking pubblico per data speciale.
15. Crea booking staff test e assegna tavolo.

## Domande comuni

### Perche capacita e stata rimossa dalle righe servizio?

Quando i tavoli sono configurati, la capacita deve venire dai tavoli attivi.
Questo e piu accurato di un numero scritto in ogni riga servizio.

### Cambio durata tavolo o intervallo slot?

Cambia durata quando gli ospiti occupano tavoli per tempo diverso. Cambia
intervallo quando vuoi orari booking piu o meno frequenti.

### Perche cambiare durata cambia i coperti?

Durata piu lunga sovrappone prenotazioni a piu slot futuri. Durata piu corta
libera capacita prima.

### Perche non posso fermare un servizio oggi?

L'ultimo orario prenotabile puo essere gia passato dopo lead time. Non resta
niente da fermare online.

### Cosa fare per evento privato?

Se tutta la data e privata, usa giorno chiuso o data speciale. Se solo alcuni
orari, usa slot bloccati. Se e decisione same-day temporanea, usa stop oggi.
