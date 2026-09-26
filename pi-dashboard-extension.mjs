import {createLiveWriter} from './scripts/live-pi-writer.mjs';

/** Opt-in, read-only Pi lifecycle bridge. Load explicitly with `pi --extension <this file>`. */
export function createLiveExtension(pi, createWriter = createLiveWriter) {
  let writer = null;
  let timer = null;
  let state = 'idle';
  let priorPromptState = null;
  let failed = false;
  let reportedError = false;

  function report(ctx) {
    if (reportedError) return;
    reportedError = true;
    if (ctx.hasUI) ctx.ui.notify('Pi Observatory: Live-Status konnte nicht geschrieben werden; Sperre/Dateirechte prüfen.', 'warning');
  }

  async function publish(ctx, model = ctx.model, ended = false) {
    if (!writer) return;
    try {
      await writer.publish({
        state, ended,
        model: model ? {provider: model.provider, id: model.id, contextWindow: model.contextWindow} : undefined,
        tools: pi.getActiveTools(), context: ctx.getContextUsage(), mode: ctx.mode,
      });
      reportedError = false;
    } catch { report(ctx); }
  }

  pi.on('session_start', async (_event, ctx) => {
    if (timer) clearInterval(timer);
    if (writer) { await writer.close().catch(() => {}); writer = null; }
    state = ctx.isIdle() ? 'idle' : 'working';
    priorPromptState = null;
    failed = false;
    reportedError = false;
    try { writer = await createWriter(); }
    catch { report(ctx); return; }
    await publish(ctx);
    timer = setInterval(() => { void publish(ctx); }, 3000);
    timer.unref?.();
  });

  pi.on('agent_start', async (_event, ctx) => {
    state = 'working'; failed = false;
    await publish(ctx);
  });
  pi.on('ui_prompt_start', async (_event, ctx) => {
    priorPromptState = state;
    state = 'waiting';
    await publish(ctx);
  });
  pi.on('ui_prompt_end', async (_event, ctx) => {
    state = ctx.isIdle() ? 'idle' : (priorPromptState ?? 'working');
    priorPromptState = null;
    await publish(ctx);
  });
  pi.on('model_select', async (event, ctx) => { await publish(ctx, event.model); });
  pi.on('message_end', async (event, ctx) => {
    if (event.message.role === 'assistant') await publish(ctx);
  });
  pi.on('agent_before_settle', (event) => { failed = event.outcome === 'error'; });
  pi.on('agent_settled', async (_event, ctx) => {
    state = failed ? 'failed' : 'idle';
    priorPromptState = null;
    await publish(ctx);
  });
  pi.on('session_shutdown', async (_event, ctx) => {
    if (timer) { clearInterval(timer); timer = null; }
    if (!writer) return;
    state = 'idle';
    await publish(ctx, ctx.model, true);
    try { await writer.close(); } catch { report(ctx); }
    writer = null;
  });
}

export default function (pi) { createLiveExtension(pi); }
