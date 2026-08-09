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
import { boxtalGet, findAll, pathText } from '../_shared/boxtal.ts';

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

    const points = findAll(document, 'point')
      .map((point) => ({
        code: pathText(point, 'code') ?? '',
        name: pathText(point, 'name') ?? '',
        address: pathText(point, 'address') ?? '',
        zip: pathText(point, 'zipcode') ?? '',
        city: pathText(point, 'city') ?? '',
        country: pathText(point, 'country') ?? 'FR',
      }))
      .filter((point) => point.code && point.name);

    return json({ points });
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }
});
