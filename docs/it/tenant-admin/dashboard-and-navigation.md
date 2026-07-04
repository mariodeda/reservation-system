# Dashboard e navigazione

La dashboard e il punto di partenza dello staff. Serve per consapevolezza
rapida: cosa succede oggi, cosa richiede attenzione e dove andare dopo.

## Navigazione header

L'header da accesso rapido alle aree operative:

- Logo ristorante: torna alla dashboard.
- Prenotazioni: apre lo spazio principale prenotazioni.
- Tavoli: apre configurazione tavoli e gestione posti.
- Disponibilita: apre orari settimanali, regole prenotazione, chiusure e blocchi.
- Clienti & Statistiche: menu per clienti e statistiche.
- Icona impostazioni: apre impostazioni locali e cambio password staff.
- Sign out: termina la sessione staff.

Il link Dashboard non e duplicato nell'header. Usa il logo ristorante per tornare
alla home.

## Dropdown Clienti & Statistiche

`Clienti & Statistiche` raggruppa due sezioni:

- Clienti: record ospite, contatti e storico prenotazioni.
- Statistiche: riepiloghi andamento e prenotazioni.

Il dropdown dovrebbe chiudersi quando lo staff clicca fuori. Se resta aperto e
copre la pagina, aggiorna il browser e segnala se il problema si ripete.

## Prenotazioni in dashboard

La dashboard si concentra sulle prenotazioni di oggi. E utile prima e durante il
servizio perche evita di scegliere una data.

Attivita tipiche:

- Vedere quanti ospiti sono attesi oggi.
- Identificare prossimi arrivi.
- Assegnare o modificare tavoli quando disponibile.
- Aggiornare stato ospite durante servizio.
- Notare warning email o alert operativi.

Se servono griglia slot completa, waitlist, calendario sala/giorno o cambio
data, passa alla pagina Prenotazioni.

## Controlli rapidi prenotazioni

L'header puo includere una azione rapida per fermare prenotazioni online di oggi
per servizio. Usala solo per decisioni operative dello stesso giorno:

- Cucina al limite.
- Ristorante sotto organico.
- Evento privato riduce spazio.
- Meteo rende patio non disponibile.
- Un servizio e gia praticamente chiuso.

Se l'ultimo orario prenotabile e gia passato, lo switch del servizio e
disabilitato perche non ci sono altri orari online da fermare.

Quando un servizio e fermato manualmente, lo staff dovrebbe vederlo chiaramente
nei controlli e nelle slot card. Cosi lo staff distingue "abbiamo fermato le
prenotazioni" da "la disponibilita non si carica".

## Notifiche campanella

La campanella mostra notifiche recenti. Usala per notare nuove prenotazioni
online mentre lavori in altre aree admin.

Azioni:

- Apri campanella: rivedi notifiche recenti.
- Segna tutte lette: pulisce stato non letto.
- Clicca notifica: vai alla data della prenotazione.

Le notifiche non sostituiscono la lista prenotazioni. Una prenotazione resta in
Prenotazioni anche dopo aver chiuso la notifica.

## Toast

I toast appaiono in basso a destra per nuovi eventi. Chiudere un toast con X
dovrebbe segnare quella notifica come letta.

Se lo stesso toast ritorna:

1. Controlla se ci sono piu tab aperte.
2. Aggiorna la tab attiva.
3. Controlla conteggio unread nella campanella.
4. Segnala nome ospite, orario e data se continua.

## Sign out

Lo staff dovrebbe fare sign out sui dispositivi condivisi a fine turno. Se il
ristorante usa un computer front-desk condiviso, includi sign out nella chiusura.

## Domande dashboard

### Perche manca il dropdown assegnazione tavolo in dashboard?

La prenotazione potrebbe non essere idonea, i tavoli potrebbero non essere
configurati o la dashboard potrebbe mostrare un set azioni compatto. Usa la
pagina Prenotazioni completa se serve piu dettaglio.

### Perche la dashboard non mostra un'altra data?

La dashboard e per oggi. Usa Prenotazioni e selettore data per date future o
passate.

### Perche un servizio fermato mostra ancora prenotazioni esistenti?

Fermare prenotazioni online impedisce nuove prenotazioni online per oggi. Non cancella e non
nasconde prenotazioni gia esistenti.
