# Clienti, Statistiche E Impostazioni Tenant

L'header tenant raggruppa Clienti e Analytics sotto `Clienti & Statistiche`.
Questo mantiene compatta la navigazione operativa dando comunque accesso a
storico ospiti e report performance.

## Navigazione Clienti & Statistiche

Desktop usa un dropdown. Mobile usa un selettore compatto. Il dropdown deve
chiudersi quando lo staff clicca fuori, cosi non copre il lavoro sulle
prenotazioni.

Usa:

- Clienti quando servono dettagli contatto o storico prenotazioni.
- Analytics quando servono riepiloghi performance e trend.

## Clienti

La pagina clienti permette ricerca per:

- Nome.
- Email.
- Telefono.

Il dettaglio cliente puo mostrare storico prenotazioni, visite future, contatti
e note operative utili. Lo staff puo usarlo per riconoscere ospiti abituali,
verificare contatti e fare follow-up quando la delivery email fallisce.

Quando una email ospite e nota come non raggiungibile, preferire follow-up
telefonico e correggere l'indirizzo se l'ospite ne fornisce uno migliore.

## Analytics

Analytics riassume performance su un periodo selezionato. Metriche tipiche:

- Prenotazioni.
- Coperti.
- Ospiti.
- Breakdown servizi.
- Indicatori lead time.
- Indicatori no-show.
- Trend clienti.

Usa analytics per rispondere a domande operative:

- Quali servizi sono piu pieni?
- Alcuni giorni sono sotto-prenotati?
- I no-show stanno aumentando?
- Gli ospiti prenotano con anticipo sufficiente?
- La capacita tavoli e allineata alla domanda?

Le analytics sono utili quanto l'accuratezza degli stati prenotazione. Lo staff
dovrebbe marcare completed, cancelled e no-show in modo coerente.

## Impostazioni

Le impostazioni tenant sono per preferenze locali e cambio password staff. I
controlli solo piattaforma non sono esposti allo staff.

Lo staff puo aspettarsi preferenze operative, ma non:

- Credenziali SMTP.
- Chiave pubblica tenant.
- Origini consentite.
- Domini.
- Policy flussi email.
- Log piattaforma.
- Log email piattaforma.

Il cambio password e disabilitato durante impersonificazione piattaforma. Se una
password staff deve essere resettata, un amministratore piattaforma deve usare
il dettaglio tenant in piattaforma.

## Buone Pratiche Dati

- Mantieni accurati telefono ed email.
- Usa note per dettagli rilevanti al servizio, non informazioni sensibili non
  correlate.
- Aggiorna stati subito dopo il servizio.
- Evita clienti duplicati quando possibile usando contatti coerenti.

Dati migliori aiutano notifiche, follow-up ospite, analytics e debug delivery
email.
