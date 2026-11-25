-- Raise default output token budgets on primary chat/multimodal models so Playground and Telegram agents return thorough, detailed answers.
update public.ai_models
set default_max_tokens = 2048
where slug in (
  'nemotron-3-5-lightning-30b-a3b',
  'nemotron-3-5-super-vl-120b-a12b',
  'nemotron-3-5-bolt-e4b',
  'nemotron-3-nano-omni-30b-a3b-reasoning'
)
and default_max_tokens < 2048;
