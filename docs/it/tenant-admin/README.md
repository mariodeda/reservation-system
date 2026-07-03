# Manuale staff admin

Questo manuale e per gli amministratori staff che usano `/admin/<slug>`.
Spiega ogni funzione tenant-side in linguaggio pratico: a cosa serve ogni
schermata, come usarla durante il servizio, cosa cambia ogni azione e cosa
controllare quando qualcosa non torna.

L'admin tenant e lo spazio operativo del ristorante. Non e un'area di
configurazione piattaforma. Lo staff gestisce operazioni quotidiane:
prenotazioni, ospiti, seating, tavoli, disponibilita, lista d'attesa, clienti,
notifiche e impostazioni locali. Gli amministratori piattaforma gestiscono
elementi sensibili come SMTP, chiavi pubbliche tenant, origini consentite,
domini, log piattaforma e policy email globale.

## Sezioni del manuale

- [Dashboard e navigazione](./dashboard-and-navigation.md)
- [Prenotazioni](./reservations.md)
- [Ciclo vita e azioni prenotazione](./reservation-lifecycle.md)
- [Disponibilita e tavoli](./availability-and-tables.md)
- [Tavoli e operazioni sala](./tables-and-floor.md)
- [Clienti, statistiche e impostazioni](./customers-analytics-settings.md)
- [Notifiche ed email](./notifications-and-email.md)
- [Playbook operativi](./operational-playbooks.md)
- [FAQ staff](./faq.md)

## Chi dovrebbe leggere questo manuale

| Ruolo | Sezioni consigliate |
| --- | --- |
| Host o front-desk | Dashboard, Prenotazioni, Ciclo vita, Notifiche, Playbook. |
| Responsabile sala | Prenotazioni, Tavoli e sala, Disponibilita, Playbook. |
| General manager | Tutte le sezioni, soprattutto Disponibilita, Clienti, Analytics, Settings e FAQ. |
| Nuovo staff admin | Inizia qui, poi leggi Dashboard, Prenotazioni e Playbook prima del servizio. |

## Modello mentale principale

Il sistema separa quattro idee che si confondono facilmente:

| Concetto | Significato |
| --- | --- |
| Prenotazione | Booking ospite con data, orario, servizio, numero ospiti, contatti, stato, note e tavolo opzionale. |
| Disponibilita | Regole che decidono quali orari possono essere prenotati online o dallo staff. |
| Capacita tavoli | Posti fisici disponibili dai tavoli attivi per un offering. |
| Policy prenotazione | Regole come minimo e massimo ospiti per una singola prenotazione. |

Esempio: un ristorante puo avere 180 posti fisici alle 19:00 ma permettere solo
20 ospiti in una singola prenotazione online. Il primo numero e capacita. Il
secondo e policy booking.

## Ritmo operativo giornaliero

### Prima del servizio

1. Apri dashboard e controlla le prenotazioni di oggi.
2. Apri Prenotazioni per data e offering corretti.
3. Controlla card servizio e slot per pressione capacita.
4. Controlla motivi di indisponibilita, servizi fermati, slot bloccati e periodi
   chiusi.
5. Apri la lista d'attesa se il ristorante prevede alta domanda.
6. Conferma assegnazioni tavoli per gruppi grandi e note speciali.
7. Se il ristorante e gia pieno o sotto organico, usa l'azione rapida per
   fermare le prenotazioni online rimanenti del servizio interessato.

### Durante il servizio

1. Guarda notifiche di nuove prenotazioni.
2. Segna ospiti arrivati come seduti e assegna tavoli.
3. Aggiungi prenotazioni telefoniche e walk-in dalla modal prenotazione.
4. Usa il calendario sala/giorno per capire il flusso tavoli.
5. Mantieni stati aggiornati: confirmed, seated, completed, cancelled, no-show.
6. Chiama l'ospite quando una prenotazione avvisa che l'email non e
   raggiungibile.

### Dopo il servizio

1. Marca come completed le prenotazioni servite.
2. Marca i no-show in modo accurato.
3. Invia richieste recensione solo per prenotazioni completate quando opportuno.
4. Controlla note clienti e analytics se serve un riepilogo servizio.
5. Annota problemi di configurazione da correggere prima del prossimo servizio.

## Cosa puo cambiare lo staff

Lo staff puo gestire dati operativi:

- Prenotazioni e stati prenotazione.
- Assegnazione tavoli.
- Walk-in e prenotazioni telefoniche.
- Voci lista d'attesa.
- Orari disponibilita.
- Durate servizi.
- Giorni chiusi e slot bloccati.
- Lead time e finestra booking.
- Policy numero ospiti.
- Tavoli e metadata tavoli.
- Clienti e note locali.
- Password staff dalle impostazioni tenant.

## Cosa non puo cambiare lo staff

Lo staff non puo gestire configurazione sensibile piattaforma:

- Credenziali SMTP.
- Policy globale email in uscita.
- Policy template conferma prenotazione.
- Policy template richiesta recensione.
- Chiave pubblica tenant.
- Origini consentite per siti marketing.
- Domini.
- Log piattaforma.
- Log email globali.

Se una di queste cose deve cambiare, chiedi a un amministratore piattaforma.

## Regole importanti da ricordare

- La sessione loggata decide l'accesso tenant. Cambiare lo slug URL non concede
  accesso a un altro ristorante.
- Prenotazioni seated e completed non possono essere modificate o eliminate.
- Le prenotazioni completed si comprimono per tenere visibile il lavoro attivo.
- Le prenotazioni create dallo staff possono gestire eccezioni operative, ma
  conflitti tavoli e regole stato restano importanti.
- I coperti slot possono contare la stessa prenotazione in piu slot vicini
  quando la durata tavolo si sovrappone. E previsto.
- Le notifiche sono alert. Segnarle lette non elimina prenotazioni.
- I warning email significano che lo staff dovrebbe chiamare l'ospite.
- Le richieste recensione sono disponibili solo dopo prenotazione completata.

## Glossario rapido

| Termine | Significato |
| --- | --- |
| Offering | Area o canale prenotabile, come sala principale, patio o bar. |
| Servizio | Finestra oraria dentro un offering, come pranzo o cena. |
| Slot | Orario prenotabile generato dentro un servizio. |
| Coperto | Un posto ospite in una prenotazione. |
| Lead time | Tempo minimo prima di uno slot entro cui gli ospiti possono ancora prenotare online. |
| Finestra booking | Quanto avanti nel futuro gli ospiti possono prenotare. |
| Durata tavolo | Quanto tempo una prenotazione occupa capacita tavolo. |
| Lista d'attesa | Gruppi in attesa quando una prenotazione non puo essere accettata. |
| No-show | Ospite che non si presenta. |
| Richiesta recensione | Email post-visita che chiede all'ospite una recensione esterna. |

## Quando chiedere supporto piattaforma

Chiedi supporto piattaforma quando:

- Conferme booking o email recensione falliscono per molti ospiti.
- Appaiono warning SMTP o email diffusi.
- Il sito pubblico non carica disponibilita.
- Lo staff non riesce a salvare per errori 403 o server ripetuti.
- Le notifiche non si aggiornano dopo refresh.
- Un tenant sembra vedere dati di un altro ristorante.
- Devono cambiare dominio, chiave pubblica, origini consentite o SMTP.
