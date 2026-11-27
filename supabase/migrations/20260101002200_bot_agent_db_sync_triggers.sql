-- Database-level atomic two-way synchronization between public.bots, public.ai_agents, and public.bot_responses.
-- Guarded with pg_trigger_depth() <= 1 and IS DISTINCT FROM checks so updates never recurse or do redundant work.

create or replace function public.sync_bot_welcome_default_responses()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text;
  v_keep uuid;
begin
  if new.welcome_message is distinct from old.welcome_message then
    v_text := btrim(coalesce(new.welcome_message, ''));
    if v_text = '' then
      delete from public.bot_responses
      where workspace_id = new.workspace_id
        and bot_id = new.id
        and match_type = 'welcome';
    else
      select id into v_keep
      from public.bot_responses
      where workspace_id = new.workspace_id
        and bot_id = new.id
        and match_type = 'welcome'
      order by created_at asc
      limit 1;

      if v_keep is not null then
        update public.bot_responses
        set response_text = v_text, enabled = true, priority = 1
        where id = v_keep;

        delete from public.bot_responses
        where workspace_id = new.workspace_id
          and bot_id = new.id
          and match_type = 'welcome'
          and id <> v_keep;
      else
        insert into public.bot_responses (workspace_id, bot_id, match_type, match_value, response_text, priority, enabled)
        values (new.workspace_id, new.id, 'welcome', null, v_text, 1, true);
      end if;
    end if;
  end if;

  if new.default_response is distinct from old.default_response then
    v_text := btrim(coalesce(new.default_response, ''));
    if v_text = '' then
      delete from public.bot_responses
      where workspace_id = new.workspace_id
        and bot_id = new.id
        and match_type = 'default';
    else
      v_keep := null;
      select id into v_keep
      from public.bot_responses
      where workspace_id = new.workspace_id
        and bot_id = new.id
        and match_type = 'default'
      order by created_at asc
      limit 1;

      if v_keep is not null then
        update public.bot_responses
        set response_text = v_text, enabled = true, priority = 999
        where id = v_keep;

        delete from public.bot_responses
        where workspace_id = new.workspace_id
          and bot_id = new.id
          and match_type = 'default'
          and id <> v_keep;
      else
        insert into public.bot_responses (workspace_id, bot_id, match_type, match_value, response_text, priority, enabled)
        values (new.workspace_id, new.id, 'default', null, v_text, 999, true);
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.sync_bot_to_ai_agent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.name is not distinct from old.name
     and new.description is not distinct from old.description
     and new.category is not distinct from old.category
     and new.avatar_path is not distinct from old.avatar_path
     and new.welcome_message is not distinct from old.welcome_message
     and new.default_response is not distinct from old.default_response
     and new.telegram_username is not distinct from old.telegram_username then
    return new;
  end if;

  update public.ai_agents
  set
    name = new.name,
    description = case
      when new.description is not null and char_length(btrim(new.description)) >= 1
        then left(btrim(new.description), 300)
      else description
    end,
    category = case
      when new.category is not null and char_length(btrim(new.category)) >= 2
        then left(btrim(new.category), 60)
      else category
    end,
    avatar_path = new.avatar_path,
    welcome_message = case
      when new.welcome_message is not null and btrim(new.welcome_message) <> ''
        then left(btrim(new.welcome_message), 4096)
      else null
    end,
    fallback_message = case
      when new.default_response is not null and btrim(new.default_response) <> ''
        then left(btrim(new.default_response), 4096)
      else null
    end,
    username = case
      when new.telegram_username is not null
        and new.telegram_username ~ '^[A-Za-z][A-Za-z0-9_]{3,30}[Bb][Oo][Tt]$'
        then new.telegram_username
      else username
    end
  where bot_id = new.id
    and workspace_id = new.workspace_id;

  return new;
end;
$$;

create or replace function public.sync_ai_agent_to_bot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 or new.bot_id is null then
    return new;
  end if;

  if new.name is not distinct from old.name
     and new.description is not distinct from old.description
     and new.category is not distinct from old.category
     and new.avatar_path is not distinct from old.avatar_path
     and new.welcome_message is not distinct from old.welcome_message
     and new.fallback_message is not distinct from old.fallback_message then
    return new;
  end if;

  update public.bots
  set
    name = new.name,
    description = new.description,
    category = new.category,
    avatar_path = new.avatar_path,
    welcome_message = new.welcome_message,
    default_response = new.fallback_message
  where id = new.bot_id
    and workspace_id = new.workspace_id;

  return new;
end;
$$;

drop trigger if exists bots_sync_welcome_default_responses on public.bots;
create trigger bots_sync_welcome_default_responses
  after update of welcome_message, default_response on public.bots
  for each row execute function public.sync_bot_welcome_default_responses();

drop trigger if exists bots_sync_to_ai_agent on public.bots;
create trigger bots_sync_to_ai_agent
  after update of name, description, category, avatar_path, welcome_message, default_response, telegram_username on public.bots
  for each row execute function public.sync_bot_to_ai_agent();

drop trigger if exists ai_agents_sync_to_bot on public.ai_agents;
create trigger ai_agents_sync_to_bot
  after update of name, description, category, avatar_path, welcome_message, fallback_message on public.ai_agents
  for each row execute function public.sync_ai_agent_to_bot();
