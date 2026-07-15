import type { AICaller } from '@hyday-capture/organize-engine'

/**
 * 佔位的 AICaller：不呼叫任何模型，回空陣列。
 * issue #3 的引擎還沒用到 AI；真正的 BYOK provider 由 issue #5 提供，屆時換掉這支。
 */
export const noopAI: AICaller = async () => []
