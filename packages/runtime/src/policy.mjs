import { renderToolsSdk } from "./vendor/ts-types.ts";
import { renderToolsSdkPy } from "./vendor/py-types.ts";
import { createScope, scopeParentOf, scopeOf } from "@deepseek-ai/dsh-scope";
import { PERSONA_PREFIX_SECTION } from "@deepseek-ai/dsh-system-prompt";
import { nextSelection } from "./model-selection.mjs";
import { Definition } from "./schema.mjs";
// Cordis rc.2 accepts only required names/intercept maps. Optional services are
// read through ctx.get(); a { required, optional } object would park forever on
// two nonexistent services literally named "required" and "optional".
export const inject = ["agents", "tools", "skills", "systemPrompt", "sessionProjections"];

/** Settle official per-Agent registrations regardless of listener load order. */
async function settleAgentTools(ctx, agent, signal) {
  signal?.throwIfAborted();
  // Official subagent tools reconcile all entered Agents on tools/change. The
  // Agent is entered before this event, even if its install listener is later.
  ctx.emit("tools/change");
  const excluded = new Set(), visited = new Set();
  for (const context of [ctx, agent.ctx]) {
    for (let fiber = context.fiber; fiber && !excluded.has(fiber); fiber = fiber.parent?.fiber) excluded.add(fiber);
  }
  while (true) {
    const pending = [];
    for (const runtime of ctx.registry.values()) for (const fiber of runtime.fibers) {
      if (excluded.has(fiber) || visited.has(fiber) || scopeOf(fiber.ctx) !== agent) continue;
      visited.add(fiber);
      pending.push(fiber);
    }
    if (!pending.length) return;
    await Promise.all(pending.map(fiber => fiber.await()));
    signal?.throwIfAborted();
  }
}

export function apply(owner, config) {
  const declared = Definition.parse(config.definition);
  owner.on("agent/created", async ({ agent, source, signal }) => {
    const scope = createScope(owner, agent);
    agent.ctx.effect(() => () => scope.dispose());
    const ctx = scope.ctx;
    if (declared.modelSelection === "unset") throw new Error("Agent has no model selected");
    const selected = declared.modelSelection === "global" ? ctx.get("agentDefaultModel")?.currentSelection() : declared;
    if (!selected?.provider || !selected?.model) throw new Error("Default model is unavailable");
    await settleAgentTools(ctx, agent, signal);
    const capabilityService = ctx.get("studioCapabilities");
    if (!capabilityService && declared.pluginBindings !== undefined) {
      throw Object.assign(new Error("插件能力服务不可用，请安装并启用工作室 Runtime 的能力快照服务。"), { code: "CAPABILITY_UNAVAILABLE" });
    }
    // Previously exported exact-tool presets can still use the standalone
    // policy package. New plugin bindings require the durable Host service.
    const { definition } = capabilityService ? await capabilityService.forAgent(agent, {
      definition: declared, capabilityResolution: config.capabilityResolution, source,
    }) : { definition: declared };
    signal?.throwIfAborted();
    const modelState = () => ctx.sessionProjections.stateOf(agent.session, "modelSelection");
    const initial = modelState();
    if (initial && !initial.pending && !initial.lastUsed) agent.session.append("model/selection", { provider: selected.provider, model: selected.model, ...selected.reasoningEffort ? { reasoningEffort: selected.reasoningEffort } : {} });
    let assembledModel = selected;
    const allowedTools=definition.tools.map(t=>t.replace(/^openconnector\//,''));
    const registrationOwner = name => {
      const registration = ctx.tools.registrationOf?.(name, agent);
      if (!registration) return undefined;
      // Compare only within this live session. Nested module names may be
      // identical across different owning bundles, so retain the Loader chain.
      // Cross-session restoration uses the snapshot's stable bundle identity.
      const entries = registration.entryChain?.length ? registration.entryChain : [registration];
      return JSON.stringify(entries.map(entry => [entry.moduleName, entry.entryId]));
    };
    const admittedOwners = new Map(allowedTools.map(name => [name, registrationOwner(name)]));
    const ownsAdmittedTool = name => !admittedOwners.get(name) || admittedOwners.get(name) === registrationOwner(name);
    const isAllowedTool = name => allowedTools.includes(name) && ownsAdmittedTool(name);
    const inheritedNames = new Set(ctx.tools.schemas(scopeParentOf(agent)).map(tool => tool.name));
    ctx.tools.restrict({ allow: allowedTools.filter(name => inheritedNames.has(name)) });
    ctx.tools.guard((call) => !(isAllowedTool(call.name) || (config.inheritedComposition && call.name === 'run_code')) ? "Tool is not enabled for this Agent or its owning plugin has changed" : call.name === "skill" && !definition.skills.includes(call.arguments?.name) ? "Skill is not enabled for this Agent" : void 0);
    const masked = /* @__PURE__ */ new Set();
    async function refreshSkills() {
      for (const item of await ctx.skills.list({ cwd: agent.session.header.cwd, scope: agent })) {
        if (definition.skills.includes(item.name) || masked.has(item.name)) continue;
        const skill = await ctx.skills.get(item.name, { cwd: agent.session.header.cwd, scope: agent });
        if (skill) {
          ctx.skills.register({ ...skill, invocation: { modelInvocable: false, userInvocable: false } });
          masked.add(item.name);
        }
      }
    }
    await refreshSkills();
    ctx.on("agent/pre-step", async (_input, next) => {
      await refreshSkills();
      return next();
    }, { prepend: true });
    ctx.systemPrompt.section({ name: PERSONA_PREFIX_SECTION, order: ctx.systemPrompt.getSectionOrder("DEPLOYMENT_PERSONA_PREFIX"), text: definition.promptMode === "template" ? definition.systemPrompt : "{{studio_persona}}", ...(definition.promptMode === "template" ? {} : {complete:true}) });
    ctx.on("system-prompt/assemble", async (_assembly, _context, next) => {
      const state = modelState();
      assembledModel = nextSelection(state?.pending, agent.session.requestHeader(), selected);
      const value = await next();
      if (value.sections.some(section => section.name === "tools:sdk")) {
        const sdk = ctx.tools.schemas(agent).filter(tool => isAllowedTool(tool.name)).map(tool => ({...tool, output: structuredClone(ctx.tools.get(tool.name, agent).output.schema)}));
        const language = ctx.get("ptcRuntime")?.language;
        const render = language === "typescript" ? renderToolsSdk : language === "python" ? renderToolsSdkPy : undefined;
        if (!render) throw new Error("Unsupported PTC SDK language: " + language);
        value.sections = value.sections.map(section => section.name === "tools:sdk" ? {...section, text: render(sdk)} : section);
      }
      return { ...value, tools:value.tools.filter(tool=>isAllowedTool(tool.name)||(config.inheritedComposition&&tool.name==='run_code')), variables: { ...value.variables, provider: assembledModel.provider, model: assembledModel.model, studio_persona: definition.systemPrompt } };
    }, { prepend: true });
    ctx.on("agent/request", async (_request, next) => {
      const { reasoningEffort: _effort, ...request } = await next();
      return { ...request, provider: assembledModel.provider, model: assembledModel.model, ...assembledModel.reasoningEffort ? { reasoningEffort: assembledModel.reasoningEffort } : {} };
    }, { prepend: true });
  });
}
