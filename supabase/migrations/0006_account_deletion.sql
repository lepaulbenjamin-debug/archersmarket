-- Suppression du compte depuis l'application.
--
-- Exigée par Apple (règle 5.1.1 v) : une app qui permet de créer un compte doit
-- permettre de le supprimer sans passer par un support externe.
--
-- Le client n'a pas le droit de toucher à auth.users ; cette fonction s'exécute
-- avec les droits de son propriétaire et n'accepte qu'une cible, la personne
-- connectée — elle ne prend aucun paramètre, il n'y a donc rien à détourner.
-- Tout le reste part en cascade depuis auth.users → profiles : annonces,
-- photos, favoris, conversations, messages, avis, jetons de notification.
--
-- Les fichiers du bucket font exception : Supabase interdit désormais d'écrire
-- directement dans storage.objects, même en security definer. L'app les retire
-- par l'API Storage avant d'appeler cette fonction, avec les droits de la
-- personne elle-même (règle listing_photos_delete, qui n'autorise que son
-- propre dossier).

create or replace function delete_own_account() returns void
language plpgsql security definer set search_path = public as $$
declare
  victim uuid := auth.uid();
begin
  if victim is null then
    raise exception 'Aucune session active' using errcode = '28000';
  end if;

  delete from auth.users where id = victim;
end;
$$;

revoke all on function delete_own_account() from public, anon;
grant execute on function delete_own_account() to authenticated;
