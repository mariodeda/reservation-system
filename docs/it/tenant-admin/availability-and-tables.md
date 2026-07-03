# Disponibilita E Tavoli Tenant

Disponibilita e tavoli determinano cosa il calendario pubblico puo offrire e
cosa vede lo staff nella pagina prenotazioni. E una delle sezioni piu importanti
da capire prima di accettare prenotazioni live.

## Pagina Disponibilita

La disponibilita controlla:

- Numero minimo ospiti.
- Numero massimo ospiti.
- Finestra prenotabile.
- Lead time.
- Durata tavolo default.
- Finestre servizio settimanali.
- Override date speciali.
- Giorni chiusi.
- Slot bloccati.

Queste impostazioni lavorano insieme. Cambiare un solo valore puo influenzare
booking pubblico, slot card staff, conflitti tavoli e calendario sala/giorno.

## Servizi Settimanali

Ogni riga servizio settimanale contiene:

- Nome servizio.
- Da.
- A.
- Ogni (min).
- Durata.
- Azioni.

Gli orari usano formato 24 ore. La capacita non e piu gestita dalle righe
servizio settimanali quando esistono tavoli attivi. I posti dei tavoli attivi
guidano i coperti prenotabili.

Usa nomi servizio chiari come `Pranzo`, `Cena`, `Cena Patio` o `Bar`. Lo staff
vede questi nomi durante creazione prenotazioni e revisione disponibilita.

## Da, A E Ogni

`Da` e il primo orario slot possibile del servizio. `A` e la fine finestra
servizio. `Ogni (min)` controlla l'intervallo tra slot generati.

Esempio:

```text
Da: 12:00
A: 15:00
Ogni: 30
```

Crea slot come 12:00, 12:30, 13:00, 13:30 e cosi via secondo le regole servizio.

## Durata Tavolo

Esistono due livelli di durata:

- Durata tavolo default: fallback usato quando una riga servizio non ha durata.
- Durata servizio: override per servizio/giorno.

La durata effettiva guida:

- Finestre conflitto tavoli.
- Calcoli sovrapposizione slot.
- Coperti prenotati per slot.
- Stato disponibilita.
- Larghezza o posizionamento prenotazione nel calendario sala/giorno.

Se la cena gira tavoli in 120 minuti e il pranzo in 75, imposta queste durate
sulle righe servizio. Lascia il default come fallback sicuro.

## Pagina Tavoli

I tavoli rappresentano la capacita reale. Ogni tavolo ha:

- Etichetta.
- Capacita.
- Stato attivo.
- Binding offering opzionale.
- Metadata unibile.

Quando esistono tavoli attivi per un offering, i posti attivi guidano la
capacita slot. Se un tavolo e inattivo, non deve contribuire alla disponibilita.

Usa binding offering quando un tavolo appartiene solo a una area o canale, come
patio o bar. Lascialo non associato solo se deve stare nel pool condiviso.

## Tavoli Unibili

I tavoli unibili permettono al sistema di suggerire o assegnare combinazioni per
gruppi grandi. I metadata devono riflettere possibilita fisiche reali. Non
marcare tavoli come unibili se lo staff non puo davvero unirli durante servizio.

Per gruppi grandi, l'assegnazione puo usare un set di tavoli. I controlli
conflitto devono considerare ogni tavolo del set.

## Giorni Chiusi, Date Speciali E Slot Bloccati

Usa giorni chiusi per chiusure intere, come festivita.

Usa override date speciali quando una data specifica ha orari diversi, come
Capodanno o un evento privato.

Usa slot bloccati per chiusure mirate dentro un servizio normale, come festa
privata alle 20:00 o pausa cucina.

## Lead Time E Finestra Booking

Il lead time impedisce agli ospiti di prenotare troppo vicino al servizio. La
finestra booking controlla quanto avanti nel futuro si puo prenotare.

Per oggi, il lead time influenza anche i controlli stop rapido. Se l'ultimo
orario prenotabile del servizio e gia passato dopo aver applicato il lead time,
lo switch stop e disabilitato perche non resta nulla da fermare online.

## Fermare Prenotazioni Oggi

L'azione rapida in header permette allo staff di fermare prenotazioni online per
un servizio oggi. Usala quando il ristorante e pieno, sotto organico, ha un
evento privato o non accetta piu prenotazioni online per il servizio restante.

I servizi fermati manualmente sono visibili nei controlli e nelle slot card.
Questa visibilita evita che lo staff confonda uno stop manuale con errore
sistema.

## Checklist Setup Pratico

Prima di andare live:

1. Crea tutti i tavoli attivi con capacita corretta.
2. Disabilita tavoli che non devono contare per la capacita online.
3. Associa tavoli a offering se necessario.
4. Configura servizi settimanali per ogni giorno.
5. Imposta durate specifiche dove pranzo e cena differiscono.
6. Imposta minimo e massimo ospiti.
7. Imposta lead time e finestra booking.
8. Aggiungi chiusure note e date speciali.
9. Testa alcune date di disponibilita pubblica.
10. Crea una prenotazione staff di test e verifica assegnazione tavoli.

## Troubleshooting

Se appaiono troppi coperti disponibili:

- Controlla tavoli attivi e capacita.
- Controlla se tavoli sono duplicati tra offering.
- Controlla se tavoli inattivi sono ancora attivi.
- Controlla se un servizio usa ancora capacita legacy perche non esistono
  tavoli attivi per quell'offering.

Se prenotazioni vengono rifiutate in modo inatteso:

- Controlla max party size.
- Controlla lead time.
- Controlla slot bloccati.
- Controlla giorni chiusi e override date speciali.
- Controlla durata effettiva tavolo e prenotazioni sovrapposte.
- Controlla se esiste un tavolo o set di tavoli uniti valido.
