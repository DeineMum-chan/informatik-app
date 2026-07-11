/*
 * config.js — globale Konfiguration des C-Klausurtrainers.
 *
 * Wird VOR quiz-engine.js geladen und gilt für ALLE Nutzer.
 *
 * disabledTopics: Liste von topicIds, die komplett deaktiviert werden.
 *   Deaktivierte Themen werden NICHT gelöscht — die Fragen bleiben in
 *   data/questions.json erhalten — erscheinen aber in keinem Modus mehr
 *   (Üben, Klausur, Fehler wiederholen) und nicht in der Statistik.
 *
 *   Wieder aktivieren: die betreffende topicId aus der Liste entfernen,
 *   committen, pushen, redeployen.
 *
 *   Aktuell deaktiviert:
 *     T-24 = "Bitweise Operatoren (&,|,^,~) & bitweise↔logisch"
 */

window.CKT_CONFIG = {
  disabledTopics: ['T-24'],
};
