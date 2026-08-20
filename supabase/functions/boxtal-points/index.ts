/**
 * Les points relais desservant une adresse, pour une offre donnée.
 *
 * Deux usages, et il ne faut pas les confondre : l'acheteur choisit où il
 * retire (`dest`), le vendeur choisit où il dépose (`exp`). Certains
 * transporteurs ne rendent pas la même liste selon le cas.
 *
 * Les paramètres sont ceux que Boxtal attend vraiment — plats, en français,
 * et le transporteur s'écrit « OPÉRATEUR_service ». Une notation indexée se
 * fait rejeter.
 */
import { CORS, callerId, json } from '../_shared/context.ts';
import { boxtalGet, findAll, path, pathText } from '../_shared/boxtal.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    if (!(await callerId(request))) return json({ error: 'Connexion requise.' }, 401);

    const { operator, service, zip, city, country, purpose } = await request.json();
    if (!operator || !service) return json({ error: 'Transporteur non précisé.' }, 400);
    if (!zip || !city) return json({ error: 'Adresse incomplète.' }, 400);

    const document = await boxtalGet('api/v1/listpoints', {
      'carriers[0]': `${operator}_${service}`,
      collecte: purpose === 'dropoff' ? 'exp' : 'dest',
      pays: String(country ?? 'FR').toUpperCase(),
      cp: String(zip),
      ville: String(city),
    });

    const nombre = (valeur: string | null): number | null => {
      const n = valeur ? Number(valeur.replace(',', '.')) : NaN;
      return Number.isFinite(n) && n !== 0 ? n : null;
    };

    const points = findAll(document, 'point')
      .map((point) => ({
        code: pathText(point, 'code') ?? '',
        name: pathText(point, 'name') ?? '',
        address: pathText(point, 'address') ?? '',
        zip: pathText(point, 'zipcode') ?? '',
        city: pathText(point, 'city') ?? '',
        country: pathText(point, 'country') ?? 'FR',
        // Boxtal les donne, et c'est ce qui permet de montrer une carte
        // plutôt qu'une liste d'adresses que personne ne situe.
        latitude: nombre(pathText(point, 'latitude')),
        longitude: nombre(pathText(point, 'longitude')),
        phone: pathText(point, 'phone'),
        // Les horaires, jour par jour. Un point relais fermé le lundi n'est
        // pas un détail quand on choisit où retirer son arc.
        hours: (path(point, 'schedule')?.children ?? [])
          .filter((jour) => jour.name === 'day')
          .map((jour) => ({
            weekday: Number(pathText(jour, 'weekday') ?? 0),
            openAm: pathText(jour, 'open_am'),
            closeAm: pathText(jour, 'close_am'),
            openPm: pathText(jour, 'open_pm'),
            closePm: pathText(jour, 'close_pm'),
          }))
          .filter((jour) => jour.weekday >= 1 && jour.weekday <= 7),
      }))
      .filter((point) => point.code && point.name);

    return json({ points });
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }
});
