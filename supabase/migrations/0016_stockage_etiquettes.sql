-- Les étiquettes ne sont pas publiques : on les sert par lien signé.
insert into storage.buckets (id, name, public)
values ('labels', 'labels', false)
on conflict (id) do nothing;
