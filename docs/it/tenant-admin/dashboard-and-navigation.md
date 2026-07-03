# Dashboard e navigazione

La dashboard e il punto di partenza dello staff. Serve per consapevolezza
rapida: cosa succede oggi, cosa richiede attenzione e dove andare dopo.

## Navigazione header

L'header da accesso rapido alle aree operative:

- Logo tenant: torna alla dashboard.
- Prenotazioni: apre lo spazio principale prenotazioni.
- Tavoli: apre setup tavoli e gestione capacita.
- Disponibilita: apre orari settimanali, regole booking, chiusure e blocchi.
- Clienti & Statistiche: dropdown per clienti e analytics.
- Icona impostazioni: apre impostazioni locali e cambio password staff.
- Sign out: termina la sessione staff.

Il link Dashboard non e duplicato nell'header. Usa il logo tenant per tornare
alla home.

## Dropdown Clienti & Statistiche

`Clienti & Statistiche` raggruppa due sezioni:

- Clienti: record ospite, contatti e storico prenotazioni.
- Analytics: riepiloghi performance e prenotazioni.

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

## Controlli rapidi booking

L'header puo includere una azione rapida per fermare prenotazioni online di oggi
per servizio. Usala solo per decisioni operative same-day:

- Cucina a capacita.
- Ristorante sotto organico.
- Evento privato riduce spazio.
- Meteo rende patio non disponibile.
- Un servizio e gia praticamente chiuso.

Se l'ultimo orario prenotabile e passato dopo applicazione lead time, lo switch
del servizio e disabilitato perche non ci sono slot pubblici rimanenti da
fermare.

Quando un servizio e fermato manualmente, lo staff dovrebbe vederlo chiaramente
nei controlli e nelle slot card. Cosi non si confonde "chiuso per scelta staff"
con "il sistema non carica disponibilita".

## Notifiche campanella

La campanella mostra notifiche recenti. Usala per notare nuove prenotazioni
online mentre lavori in altre aree admin.

Azioni:

- Apri campanella: rivedi notifiche recenti.
- Segna tutte lette: pulisce stato non letto.
- Clicca notifica: usala come riferimento al contesto prenotazione.

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

Fermare booking impedisce nuove prenotazioni online per oggi. Non cancella e non
nasconde prenotazioni gia esistenti.
