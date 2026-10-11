import test from 'node:test'
import assert from 'node:assert/strict'
import { chatModelGroups, isChatModel } from '../packages/service/src/chat-models.mjs'

// Captured from the daily DMXAPI and DeepSeek routes (ids and display names only).
const catalog = [["dmxapi", "DMXAPI", [["qwen3.7-text-embedding", "Qwen3.7 文本向量"], ["jina-reranker-v3.5", "Jina Reranker v3.5"], ["qwen3.8-flash", "Qwen3.8 Flash"], ["gpt-6-luna", "GPT-6 Luna"], ["gemini-3.1-flash-image", "gemini-3.1-flash-image"], ["gemini-3.1-flash-lite-image", "gemini-3.1-flash-lite-image"], ["gemini-3-pro-image", "gemini-3-pro-image"], ["gemini-2.5-flash-image", "gemini-2.5-flash-image"], ["gpt-image-2.5-sunburst", "gpt-image-2.5-sunburst"], ["gpt-image-2.5-flare", "gpt-image-2.5-flare"], ["gpt-image-2", "gpt-image-2"], ["gpt-image-1.5", "gpt-image-1.5"], ["doubao-seedream-5-0-pro-260628", "doubao-seedream-5-0-pro-260628"], ["doubao-seedream-5.0-lite", "doubao-seedream-5.0-lite"], ["doubao-seedream-4-5-251128", "doubao-seedream-4-5-251128"], ["doubao-seedream-4-0-250828", "doubao-seedream-4-0-250828"], ["qwen-image-3.0-pro", "qwen-image-3.0-pro"], ["qwen-image-3.0", "qwen-image-3.0"], ["qwen-image-2.0-pro", "qwen-image-2.0-pro"], ["qwen-image-2.0", "qwen-image-2.0"], ["qwen-image-edit-plus-20260226", "qwen-image-edit-plus-20260226"], ["qwen-image-edit-max-2026-01-16", "qwen-image-edit-max-2026-01-16"], ["wan2.7-image-pro", "wan2.7-image-pro"], ["wan2.7-image", "wan2.7-image"], ["wan2.6-image", "wan2.6-image"], ["z-image-turbo", "z-image-turbo"], ["agnes-image-2.1-flash", "agnes-image-2.1-flash"], ["wan2.6-t2i", "wan2.6-t2i"], ["recraft-v4.1-pro-vector", "recraft-v4.1-pro-vector"], ["gpt-image-2.5-sunburst-cdx", "gpt-image-2.5-sunburst"], ["gpt-image-2.5-flare-cdx", "gpt-image-2.5-flare"], ["MiniMax-Hailuo-2.3", "MiniMax-Hailuo-2.3"], ["MiniMax-Hailuo-02", "MiniMax-Hailuo-02"], ["MiniMax-Hailuo-2.3-Fast", "MiniMax-Hailuo-2.3-Fast"], ["paiwo-v5.6-ttv", "paiwo-v5.6-ttv"], ["paiwo-v5.6-itv", "paiwo-v5.6-itv"], ["paiwo-v5.6-itv2", "paiwo-v5.6-itv2"], ["wan2.6-t2v", "wan2.6-t2v"], ["wan2.6-i2v", "wan2.6-i2v"], ["doubao-seedance-2-5-260628", "doubao-seedance-2-5-260628"], ["doubao-seedance-2-0-260128", "doubao-seedance-2-0-260128"], ["doubao-seedance-2-0-fast-260128", "doubao-seedance-2-0-fast-260128"], ["doubao-seedance-2-0-mini-260615", "doubao-seedance-2-0-mini-260615"], ["MiniMax-H3", "MiniMax-H3"], ["MiniMax-H3-Max", "MiniMax-H3-Max"], ["viduq3-pro", "viduq3-pro"], ["viduq2-pro", "viduq2-pro"], ["viduq2-ctv", "viduq2-ctv"], ["PixVerse-V6", "PixVerse-V6"], ["PixVerse-C1", "PixVerse-C1"], ["kling-v3", "kling-v3"], ["wan3.0-video", "wan3.0-video"], ["wan3.0-video-prime", "wan3.0-video-prime"], ["wan2.7-t2v-2026-06-12", "wan2.7-t2v-2026-06-12"], ["wan2.7-i2v-2026-04-25", "wan2.7-i2v-2026-04-25"], ["wan2.7-r2v-2026-06-12", "wan2.7-r2v-2026-06-12"], ["wan2.7-videoedit", "wan2.7-videoedit"], ["happyhorse-1.1-t2v", "happyhorse-1.1-t2v"], ["happyhorse-1.1-i2v", "happyhorse-1.1-i2v"], ["happyhorse-1.1-r2v", "happyhorse-1.1-r2v"], ["happyhorse-1.0-video-edit-15s", "happyhorse-1.0-video-edit-15s"]]], ["deepseek-official", "DeepSeek", [["deepseek-flash", "DeepSeek-V41-Flash"], ["deepseek-v4-pro", "DeepSeek-V4-Pro"]]]].map(([id, name, models]) => ({ id, name, models: models.map(([modelId, modelName]) => ({ id: modelId, name: modelName })) }))

test('the model selector keeps only chat routes from the real daily catalog', () => {
  const groups = chatModelGroups(catalog)
  assert.deepEqual(groups.map(group => [group.id, group.models.map(model => model.id)]), [
    ['dmxapi', ['qwen3.8-flash', 'gpt-6-luna']],
    ['deepseek-official', ['deepseek-flash', 'deepseek-v4-pro']],
  ])
  assert.equal(catalog.reduce((count, group) => count + group.models.length, 0), 63)
})

test('providers with only media or retrieval models disappear, and malformed rows are excluded', () => {
  assert.deepEqual(chatModelGroups([{ id: 'media', name: 'Media', models: [{ id: 'kling-v3', name: 'kling-v3' }, { id: 'x', name: '图片生成' }] }]), [])
  assert.equal(isChatModel({ id: 'qwen3-vl-plus', name: 'Qwen3 VL Plus' }), true)
  assert.equal(isChatModel({ id: 'text-embedding-3', name: 'Embedding' }), false)
  assert.equal(isChatModel({ id: 1, name: 'bad' }), false)
})
