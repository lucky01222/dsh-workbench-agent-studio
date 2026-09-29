import { renderToolsSdk } from "./vendor/ts-types.ts";
import { renderToolsSdkPy } from "./vendor/py-types.ts";
import { createScope, scopeParentOf } from "@deepseek-ai/dsh-scope";
import { PERSONA_PREFIX_SECTION } from "@deepseek-ai/dsh-system-prompt";
import { nextSelection } from "./model-selection.mjs";
import { Definition } from "./schema.mjs";
export const inject = ["agents", "tools", "skills", "systemPrompt", "sessionProjections"];
export function apply(owner, config) {
  const definition = Definition.parse(config.definition);
  owner.on("agent/created", async ({ agent }) => {
    const scope = createScope(owner, agent);
    agent.ctx.effect(() => () => scope.dispose());
    const ctx = scope.ctx;
    if (definition.modelSelection === "unset") throw new Error("Agent has no model selected");
    const selected = definition.modelSelection === "global" ? ctx.get("agentDefaultModel")?.currentSelection() : definition;
    if (!selected?.provider || !selected?.model) throw new Error("Default model is unavailable");
    const modelState = () => ctx.sessionProjections.stateOf(agent.session, "modelSelection");
    const initial = modelState();
    if (initial && !initial.pending && !initial.lastUsed) agent.session.append("model/selection", { provider: selected.provider, model: selected.model, ...selected.reasoningEffort ? { reasoningEffort: selected.reasoningEffort } : {} });
    let assembledModel = selected;
    const allowedTools=definition.tools.map(t=>t.replace(/^openconnector\//,''));
    const inheritedNames = new Set(ctx.tools.schemas(scopeParentOf(agent)).map(tool => tool.name));
    ctx.tools.restrict({ allow: allowedTools.filter(name => inheritedNames.has(name)) });
    ctx.tools.guard((call) => !(allowedTools.includes(call.name) || (config.inheritedComposition && call.name === 'run_code')) ? "Tool is not enabled for this Agent" : call.name === "skill" && !definition.skills.includes(call.arguments?.name) ? "Skill is not enabled for this Agent" : void 0);
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
        const sdk = ctx.tools.schemas(agent).filter(tool => allowedTools.includes(tool.name)).map(tool => ({...tool, output: structuredClone(ctx.tools.get(tool.name, agent).output.schema)}));
        const language = ctx.get("ptcRuntime")?.language;
        const render = language === "typescript" ? renderToolsSdk : language === "python" ? renderToolsSdkPy : undefined;
        if (!render) throw new Error("Unsupported PTC SDK language: " + language);
        value.sections = value.sections.map(section => section.name === "tools:sdk" ? {...section, text: render(sdk)} : section);
      }
      return { ...value, tools:value.tools.filter(tool=>allowedTools.includes(tool.name)||(config.inheritedComposition&&tool.name==='run_code')), variables: { ...value.variables, provider: assembledModel.provider, model: assembledModel.model, studio_persona: definition.systemPrompt } };
    }, { prepend: true });
    ctx.on("agent/request", async (_request, next) => {
      const { reasoningEffort: _effort, ...request } = await next();
      return { ...request, provider: assembledModel.provider, model: assembledModel.model, ...assembledModel.reasoningEffort ? { reasoningEffort: assembledModel.reasoningEffort } : {} };
    }, { prepend: true });
  });
}
