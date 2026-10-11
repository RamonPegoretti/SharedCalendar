-- Item colors: each event, task or note can have its own color, picked from a
-- color wheel. Empty means the item keeps the color of whose it is (mine, the
-- partner's, or ours), as before.

alter table public.items
  add column color text check (color ~ '^#[0-9a-f]{6}$');
