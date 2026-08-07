-- Suppression du compte depuis l'application.
--
-- Exigée par Apple (règle 5.1.1 v) : une app qui permet de créer un compte doit
-- permettre de le supprimer sans passer par un support externe.
--
-- Le client n'a pas le droit de toucher à auth.users ; cette fonction s'exécute
-- avec les droits de son propriétaire et n'accepte qu'une cible, la personne
-- connectée. Tout le reste part en cascade depuis auth.users → profiles :
-- annonces, photos, favoris, conversations, messages, avis, jetons de
-- notification. Les fichiers du bucket, eux, n'ont pas de clé étrangère : ils
-- sont retirés explicitement.

create function delete_own_account() returns void
language plpgsql security definer set search_path = public as $$
declare
  victim uuid := auth.uid();
begin
  if victim is null then
    raise exception 'Aucune session active' using errcode = '28000';
  end if;

  delete from storage.objects
  where bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = victim::text;

  delete from auth.users where id = victim;
end;
$$;

revoke all on function delete_own_account() from public, anon;
grant execute on function delete_own_account() to authenticated;
