-- Crée un profil correct quand l'inscription vient d'Apple ou de Google.
--
-- Le formulaire maison range le nom dans « name ». Les fournisseurs tiers,
-- eux, envoient « full_name », ou le couple prénom/nom, ou parfois rien du
-- tout : Apple permet de masquer son identité, et ne transmet le nom qu'à la
-- toute première connexion.
--
-- Sans cette lecture élargie, tout nouveau venu par Google s'appellerait
-- « Archer » — et ils s'appelleraient tous pareil.

-- L'extension unaccent n'est pas garantie : on se contente d'un repli sobre.
create or replace function unaccent_fallback(source text) returns text
language sql immutable as $$
  select translate(
    source,
    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
    'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY'
  );
$$;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  palette text[] := array['#1B1B1D', '#F5843C', '#58585A', '#3E5C76', '#8A5A44', '#4A4A4E'];
  colour text := palette[1 + abs(hashtext(new.id::text)) % array_length(palette, 1)];
  suffix text := substr(replace(new.id::text, '-', ''), 1, 6);
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);

  -- Du plus explicite au plus approximatif.
  display_name text := coalesce(
    nullif(trim(meta ->> 'name'), ''),
    nullif(trim(meta ->> 'full_name'), ''),
    nullif(trim(concat_ws(' ', meta ->> 'given_name', meta ->> 'family_name')), ''),
    -- Dernier recours : la partie gauche de l'adresse, débarrassée de ses
    -- séparateurs. « jean.dupont@… » donne « Jean Dupont ».
    nullif(initcap(replace(replace(split_part(coalesce(new.email, ''), '@', 1), '.', ' '), '_', ' ')), ''),
    'Archer'
  );

  candidate text := coalesce(
    nullif(meta ->> 'handle', ''),
    nullif(
      left(regexp_replace(lower(unaccent_fallback(display_name)), '[^a-z0-9]+', '_', 'g'), 18),
      ''
    ),
    'archer_' || suffix
  );
  town text := coalesce(meta ->> 'city', '');
  club_name text := nullif(meta ->> 'club', '');
begin
  begin
    insert into profiles (id, handle, name, city, club, avatar_color)
    values (new.id, candidate, display_name, town, club_name, colour);
  exception when unique_violation then
    insert into profiles (id, handle, name, city, club, avatar_color)
    values (new.id, left(candidate, 12) || '_' || suffix, display_name, town, club_name, colour);
  end;
  return new;
end;
$$;

