/**
 * Les points relais desservant un code postal, pour un transporteur donné.
 *
 * Une offre en relais ne se réserve pas sans le point choisi : Boxtal la
 * refuse. L'acheteur doit donc pouvoir en choisir un avant de payer.
 */
import { CORS, callerId, json } from '../_shared/context.ts';
import { boxtalGet, findAll, pathText } from '../_shared/boxtal.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    if (!(await callerId(request))) return json({ error: 'Connexion requise.' }, 401);

    const { operator, zip, city, country } = await request.json();
    if (!operator) return json({ error: 'Transporteur non précisé.' }, 400);
    if (!zip || !city) return json({ error: 'Adresse incomplète.' }, 400);

    const document = await boxtalGet('api/v1/listpoints', {
      'srv_code[0]': String(operator),
      'pays[0]': String(country ?? 'FR').toUpperCase(),
      'cp[0]': String(zip),
      'ville[0]': String(city),
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
