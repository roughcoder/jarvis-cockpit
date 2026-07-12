# Unified Chat Presentation

Cockpit has two backend conversation contracts but one visual language:

- code-agent threads are adapted by `ChatView` and `MessagesTimeline`;
- Jarvis project conversations, including orchestration parents, are adapted by
  `ProjectConversationView`.

Backend adapters own transport, streaming, persistence, permissions, and event
normalisation. They must not introduce a second set of message colours,
typography, spacing, or working states.

Shared presentation primitives live under `apps/web/src/components/chat/`:

- `ChatMessagePrimitives.tsx` owns user bubbles, assistant surfaces, and working
  indicators;
- `ChatHeaderTitle.tsx` owns conversation-title typography and truncation;
- `ChatMarkdown.tsx` owns rendered message typography, links, lists, tables, and
  code blocks;
- `ChatComposer.tsx` owns the common composer surface.

When changing chat presentation, update these shared components first. Keep
provider-, Jarvis-, workspace-, and orchestration-specific controls as composed
metadata around them. A code-agent acting as an orchestrator should differ only
through its status, hierarchy, tools, and context—not through a separate chat
design.
