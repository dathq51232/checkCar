-- Chat Channels (group chats tied to a workspace)
CREATE TABLE IF NOT EXISTS public.chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Chat Messages
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view channels in their workspaces"
  ON public.chat_channels FOR SELECT
  USING (workspace_id IN (
    SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    UNION SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Members can create channels"
  ON public.chat_channels FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    UNION SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND role IN ('owner','admin','member')
  ));

CREATE POLICY "Members can view messages in their channels"
  ON public.chat_messages FOR SELECT
  USING (channel_id IN (
    SELECT id FROM public.chat_channels WHERE workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
      UNION SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Members can send messages"
  ON public.chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id AND channel_id IN (
    SELECT id FROM public.chat_channels WHERE workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
      UNION SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  ));

ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
