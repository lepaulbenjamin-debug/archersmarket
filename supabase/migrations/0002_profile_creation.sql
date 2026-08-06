-- Deux correctifs sur la création de profil à l'inscription :
--   1. les couleurs d'avatar sont réparties, au lieu de l'orange de marque pour
--      tout le monde (les pastilles doivent se distinguer dans les listes) ;
--   2. un pseudo déjà pris ne fait plus échouer l'inscription — l'app dérive le
--      pseudo du nom, donc deux homonymes entraient en collision.

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  palette text[] := array['#1B1B1D', '#F5843C', '#58585A', '#3E5C76', '#8A5A44', '#4A4A4E'];
  colour text := palette[1 + abs(hashtext(new.id::text)) % array_length(palette, 1)];
  suffix text := substr(replace(new.id::text, '-', ''), 1, 6);
  candidate text := coalesce(
    nullif(new.raw_user_meta_data ->> 'handle', ''),
    'archer_' || suffix
  );
  display_name text := coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), 'Archer');
  town text := coalesce(new.raw_user_meta_data ->> 'city', '');
  club_name text := nullif(new.raw_user_meta_data ->> 'club', '');
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
