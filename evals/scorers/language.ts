/*
 * Language detection by stopword ratio. It only answers "Spanish or English?" for
 * short technical text, which is all the evals need. Limits: it counts function
 * words (plus a few very common imperative verbs), so text made only of code
 * identifiers or proper nouns is inconclusive; loanwords ("deploy", "login", "tests") and
 * words shared by both languages ("a", "no") are ignored on purpose; it does not know any other language.
 */

const SPANISH = new Set(
  `el la los las un una unos unas de del al y o en con por para sin sobre entre que se su sus es
  son como más pero si lo le les este esta estos estas ese esa desde hasta cuando
  crear crea añadir añade agregar agrega implementar implementa configurar configura escribir escribe
  definir define probar prueba revisar revisa diseñar diseña validar valida documentar documenta
  actualizar actualiza verificar verifica pruebas usuario usuarios tarea tarjeta`.split(/\s+/),
);

const ENGLISH = new Set(
  `the an of to and or in on with for from by at as is are be that this these those it its into
  than then when if not
  add create implement configure write define test review design validate document update
  verify set up handle build ensure use`.split(/\s+/),
);

export type Language = "es" | "en";

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-záéíóúüñ]+/g) ?? [];
}

/** The language of `text`, or `null` when neither list clearly wins (ties, no stopwords). */
export function detectLanguage(text: string): Language | null {
  let es = 0;
  let en = 0;
  for (const word of words(text)) {
    if (SPANISH.has(word)) es += 1;
    if (ENGLISH.has(word)) en += 1;
  }
  if (es === en) return null;
  return es > en ? "es" : "en";
}
