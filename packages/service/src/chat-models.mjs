// rc.2's model catalog has no output-modality or tool-calling field. Keep
// ordinary language-model routes, including vision input, and exclude explicit
// dedicated protocol/media identifiers. Same rule as dsh-workbench-shell's
// conversation menu, so Studio offers the models people can chat with.
const dedicated = /(?:^|[\s/_.:-])(?:embeddings?|embed|rerank(?:er)?)(?=$|[\s/_.:-]|\d)/i
const media = /(?:^|[\s/_.:-])(?:image|imagegen|imagen|video|flux|veo|sora|kling|wan\d*|seedream|seedance|vidu(?:q\d+)?|pixverse|paiwo|happyhorse|recraft|midjourney|dall-e|stable-diffusion|sdxl|grok-imagine|minimax[-_](?:hailuo|h3))(?=$|[\s/_.:-]|\d)/i
const dedicatedLabel = /文本向量|向量模型|嵌入模型|重排|图片生成|图像生成|生图|视频生成|生视频/

export function isChatModel(model) {
  if (!model || typeof model.id !== 'string' || typeof model.name !== 'string') return false
  return !dedicated.test(model.id) && !dedicated.test(model.name)
    && !media.test(model.id) && !dedicatedLabel.test(model.name)
}

/** Selector groups only; the LLM registry and saved definitions stay untouched. */
export function chatModelGroups(groups) {
  return groups.map(group => ({ ...group, models: group.models.filter(isChatModel) }))
    .filter(group => group.models.length > 0)
}
